import React, { useState, useEffect, useRef } from 'react';
import { Language, User } from '../types';
import {
  X,
  Radio,
  Monitor,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Users,
  AlertTriangle,
  ScreenShare,
  Disc,
  Settings2,
  ChevronDown,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { socket } from '../services/socket';

interface BroadcastStudioModalProps {
  onClose: () => void;
  language: Language;
  currentUser?: User;
}

export const BroadcastStudioModal: React.FC<BroadcastStudioModalProps> = ({
  onClose,
  language,
  currentUser,
}) => {
  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';

  const professorName = currentUser?.name || 'Prof. MOHD FAIZAN BEG';

  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [shareWebcamPiP, setShareWebcamPiP] = useState(true);
  const [shareMic, setShareMic] = useState(true);
  const [broadcastTarget, setBroadcastTarget] = useState<'ALL' | 'SELECTED'>('ALL');
  const [selectedCabins, setSelectedCabins] = useState<number[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [pipPos, setPipPos] = useState({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, pipX: 0, pipY: 0 });

  const [screenError, setScreenError] = useState<string | null>(null);
  const [hasWebcam, setHasWebcam] = useState(false);
  const [screenImageSrc, setScreenImageSrc] = useState<string | null>(null);

  // AV Devices State (Mic, Webcam & Audio Source Selection)
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(() => {
    return localStorage.getItem('arabic_lab_selected_mic') || '';
  });
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    return localStorage.getItem('arabic_lab_selected_camera') || '';
  });
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [micLiveLevel, setMicLiveLevel] = useState(0);

  // Video and Audio refs
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const frameCaptureIntervalRef = useRef<number | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);

  // Toggle cabin selection
  const toggleCabin = (num: number) => {
    if (selectedCabins.includes(num)) {
      setSelectedCabins(selectedCabins.filter((c) => c !== num));
    } else {
      setSelectedCabins([...selectedCabins, num]);
    }
  };

  // Physical Screen Share
  const stopScreenShare = () => {
    if (frameCaptureIntervalRef.current) {
      clearInterval(frameCaptureIntervalRef.current);
      frameCaptureIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    setScreenImageSrc(null);
    setIsScreenSharing(false);
  };

  const startScreenShare = async () => {
    setScreenError(null);
    try {
      let stream: MediaStream | null = null;

      // 1. Native Electron Screen Capture
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.getDesktopSources) {
        try {
          const sources = await electronAPI.getDesktopSources({
            types: ['screen'],
            thumbnailSize: { width: 1920, height: 1080 },
          });

          if (sources && sources.length > 0) {
            // Priority A: Try getUserMedia with chromeMediaSourceId
            if (navigator.mediaDevices && (navigator.mediaDevices as any).getUserMedia) {
              try {
                stream = await (navigator.mediaDevices as any).getUserMedia({
                  audio: false,
                  video: {
                    mandatory: {
                      chromeMediaSource: 'desktop',
                      chromeMediaSourceId: sources[0].id,
                      minWidth: 1280,
                      maxWidth: 1920,
                      minHeight: 720,
                      maxHeight: 1080,
                    },
                  },
                });
              } catch (gumErr) {
                console.warn('Native getUserMedia chromeMediaSource failed, trying Canvas streamer:', gumErr);
              }
            }

            // Priority B: Live Physical Canvas Streamer (bypasses all browser security restrictions)
            if (!stream) {
              const canvas = document.createElement('canvas');
              canvas.width = 1920;
              canvas.height = 1080;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                stream = canvas.captureStream(25);

                const renderFrame = async () => {
                  try {
                    const freshSources = await electronAPI.getDesktopSources({
                      types: ['screen'],
                      thumbnailSize: { width: 1920, height: 1080 },
                    });
                    if (freshSources && freshSources.length > 0 && freshSources[0].thumbnail) {
                      setScreenImageSrc(freshSources[0].thumbnail);
                      const img = new Image();
                      img.onload = () => {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                      };
                      img.src = freshSources[0].thumbnail;
                    }
                  } catch (e) {
                    // silent
                  }
                };

                // Immediate first frame
                renderFrame();
                // 100ms interval = smooth live physical desktop mirror
                frameCaptureIntervalRef.current = window.setInterval(renderFrame, 100);
              }
            }
          }
        } catch (elErr) {
          console.warn('Electron desktop sources retrieval failed:', elErr);
        }
      }

      // 2. Standard Web Browser getDisplayMedia fallback
      if (!stream) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          if (typeof window !== 'undefined' && !window.isSecureContext) {
            throw new Error(
              `Physical screen capture over plain HTTP LAN (${window.location.hostname}) requires either the Native Desktop App (ArabicLab.exe) or enabling "chrome://flags/#unsafely-treat-insecure-origin-as-secure" in Chrome.`
            );
          } else {
            throw new Error('Screen sharing is not supported by your current browser.');
          }
        }

        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'monitor',
          },
          audio: shareMic,
        });
      }

      if (stream) {
        screenStreamRef.current = stream;
        setIsScreenSharing(true);

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
          screenVideoRef.current.play().catch(console.warn);
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            stopScreenShare();
          };
        }
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        console.log('Screen capture dismissed by user');
      } else {
        console.error('Screen sharing error:', err);
        setScreenError(err.message || 'Failed to start screen capture');
      }
    }
  };

  // Ensure video element receives stream when isScreenSharing becomes true
  useEffect(() => {
    if (isScreenSharing && screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
      screenVideoRef.current.play().catch(console.warn);
    }
  }, [isScreenSharing]);

  const handleToggleScreenShare = () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  // Enumerate AV devices (Microphones & Webcams)
  const refreshDevices = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        tempStream.getTracks().forEach((t) => t.stop());
      } catch (_) {
        try {
          const tempAudio = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempAudio.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput');
      const cams = devices.filter((d) => d.kind === 'videoinput');

      setAudioInputDevices(mics);
      setVideoInputDevices(cams);

      if (mics.length > 0 && !selectedMicId) {
        setSelectedMicId(mics[0].deviceId);
      }
      if (cams.length > 0 && !selectedCameraId) {
        setSelectedCameraId(cams[0].deviceId);
      }
    } catch (e) {
      console.warn('Device enumeration error:', e);
    }
  };

  useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, []);

  // Physical Webcam for PiP (supporting selectedCameraId)
  useEffect(() => {
    let activeStream: MediaStream | null = null;
    if (shareWebcamPiP && navigator.mediaDevices?.getUserMedia) {
      const constraints: MediaStreamConstraints = {
        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
        audio: false,
      };

      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((s) => {
          activeStream = s;
          webcamStreamRef.current = s;
          setHasWebcam(true);
          if (pipVideoRef.current) {
            pipVideoRef.current.srcObject = s;
            pipVideoRef.current.play().catch(console.warn);
          }
        })
        .catch((e) => {
          console.log('Webcam with exact deviceId failed, fallback to default:', e);
          navigator.mediaDevices
            .getUserMedia({ video: true, audio: false })
            .then((s) => {
              activeStream = s;
              webcamStreamRef.current = s;
              setHasWebcam(true);
              if (pipVideoRef.current) {
                pipVideoRef.current.srcObject = s;
                pipVideoRef.current.play().catch(console.warn);
              }
            })
            .catch(() => setHasWebcam(false));
        });
    } else {
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
        webcamStreamRef.current = null;
      }
      setHasWebcam(false);
    }

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [shareWebcamPiP, selectedCameraId]);

  // Physical Microphone & Live Input Level Meter (supporting selectedMicId)
  useEffect(() => {
    let activeMic: MediaStream | null = null;
    if (shareMic && navigator.mediaDevices?.getUserMedia) {
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
        video: false,
      };

      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((s) => {
          activeMic = s;
          micStreamRef.current = s;

          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const audioCtx = new AudioCtx();
              audioContextRef.current = audioCtx;
              const source = audioCtx.createMediaStreamSource(s);
              const analyser = audioCtx.createAnalyser();
              analyser.fftSize = 64;
              source.connect(analyser);
              analyserRef.current = analyser;

              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              const checkLevel = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                setMicLiveLevel(Math.min(100, Math.round((avg / 128) * 100)));
                animFrameRef.current = requestAnimationFrame(checkLevel);
              };
              checkLevel();
            }
          } catch (audioErr) {
            console.warn('Audio analyser error:', audioErr);
          }
        })
        .catch((e) => {
          console.warn('Microphone capture failed:', e);
        });
    } else {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      setMicLiveLevel(0);
    }

    return () => {
      if (activeMic) {
        activeMic.getTracks().forEach((t) => t.stop());
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [shareMic, selectedMicId]);

  // Clean up streams on unmount
  useEffect(() => {
    return () => {
      if (frameCaptureIntervalRef.current) {
        clearInterval(frameCaptureIntervalRef.current);
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Start Broadcast
  const handleStartBroadcast = () => {
    setIsBroadcasting(true);
    socket.emit('broadcast-start', {
      type: broadcastTarget,
      selectedCabins,
      hasScreenShare: isScreenSharing,
      hasWebcamPiP: shareWebcamPiP,
      hasAudio: shareMic,
      title: `${professorName} — Arabic Lab Broadcast`,
    });
  };

  const handleStopBroadcast = () => {
    setIsBroadcasting(false);
    socket.emit('broadcast-stop');
    if (isRecording) {
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  // PiP Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, pipX: pipPos.x, pipY: pipPos.y };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPipPos({
        x: Math.max(10, Math.min(window.innerWidth - 200, dragStart.current.pipX + (e.clientX - dragStart.current.x))),
        y: Math.max(10, Math.min(window.innerHeight - 200, dragStart.current.pipY + (e.clientY - dragStart.current.y))),
      });
    };
    const onMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  // Presentation Canvas (when physical screen is not actively shared)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let start = Date.now();

    const render = () => {
      const elapsed = (Date.now() - start) / 1000;
      const w = canvas.width;
      const h = canvas.height;

      // Dark background with emerald tone
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#04130d');
      grad.addColorStop(1, '#020604');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Slide presentation header card
      ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.fillRect(40, 35, w - 80, 85);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 35, w - 80, 85);

      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 28px "Cairo", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('شرح قواعد اللغة العربية — الأستاذ محمد فيضان بيك', w / 2, 75);

      ctx.fillStyle = '#6ee7b7';
      ctx.font = 'bold 15px "Inter", "Segoe UI", sans-serif';
      ctx.fillText(`${professorName} • DEPARTMENT OF ARABIC — AMU`, w / 2, 104);

      // Slide content
      ctx.fillStyle = '#f1f7f4';
      ctx.font = '22px "Amiri", "Cairo", serif';
      ctx.textAlign = 'right';
      const arabicRules = [
        '١. الجملة الاسمية تبدأ بالمبتدأ والخبر، وكلاهما مرفوع في الأصل.',
        '٢. الجملة الفعلية تتكون من فعل وفاعل ومفعول به عند التعدي.',
        '٣. علامات الإعراب الأصلية: الضمة للرفع، الفتحة للنصب، الكسرة للجر.',
        '٤. الحوار والمحادثة المباشرة مع الطلاب عبر منظومة الصوت عالية الدقة.',
      ];
      arabicRules.forEach((rule, idx) => {
        // Bullet dot
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(w - 60, 185 + idx * 55, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f1f7f4';
        ctx.fillText(rule, w - 80, 192 + idx * 55);
      });

      // Animated wave at bottom
      ctx.fillStyle = '#10b981';
      for (let i = 0; i < 48; i++) {
        const barH = Math.sin(elapsed * 3 + i * 0.25) * 20 + 24;
        ctx.fillRect(80 + i * 16, h - 65, 8, -barH);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [professorName]);

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden relative border border-gold-500/40 shadow-[0_0_40px_rgba(229,184,66,0.2)]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-black flex items-center justify-center font-bold shadow-lg">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-arabic">
                  {isArabic ? 'استوديو البث المباشر للفصل' : 'Classroom Broadcast Studio'}
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/30">
                  {professorName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isArabic
                  ? 'بث الشاشة الحقيقية والصوت وصورة الكاميرا إلى كبائن الطلاب'
                  : 'Broadcast professor live screen, voice & PiP webcam across all 25 cabins'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isBroadcasting && (
              <span className="status-badge status-in-call">
                <span className="pulse-dot bg-amber-400" />
                <span>{isArabic ? 'البث مباشر الآن' : 'ON AIR LIVE'}</span>
              </span>
            )}

            <button onClick={onClose} className="btn-icon">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Studio Controls Bar */}
        <div className="px-6 py-3 bg-emerald-950/40 border-b border-emerald-900/40 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* Screen Share Button */}
            <button
              onClick={handleToggleScreenShare}
              className={`btn-outline text-xs py-2 px-3 transition-all flex items-center gap-1.5 ${
                isScreenSharing
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                  : 'text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/40'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>
                {isScreenSharing
                  ? isArabic ? 'إيقاف مشاركة الشاشة' : 'Stop Screen Share'
                  : isArabic ? 'مشاركة الشاشة الحقيقية' : 'Share Screen'}
              </span>
            </button>

            {/* PiP Camera Button */}
            <button
              onClick={() => setShareWebcamPiP(!shareWebcamPiP)}
              className={`btn-outline text-xs py-2 px-3 ${
                shareWebcamPiP ? 'text-yellow-300 border-yellow-500/50' : 'text-slate-500'
              }`}
            >
              {shareWebcamPiP ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
              <span>{isArabic ? 'كاميرا PiP دائرية' : 'Circular PiP Cam'}</span>
            </button>

            {/* Microphone Button */}
            <button
              onClick={() => setShareMic(!shareMic)}
              className={`btn-outline text-xs py-2 px-3 ${
                shareMic ? 'text-emerald-300 border-emerald-500/50' : 'text-slate-500'
              }`}
            >
              {shareMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span>{isArabic ? 'الميكروفون' : 'Microphone'}</span>
            </button>

            {/* AV Hardware Settings Selector Button */}
            <button
              onClick={() => setShowDeviceSettings(!showDeviceSettings)}
              className={`btn-outline text-xs py-2 px-3 flex items-center gap-1.5 transition-all ${
                showDeviceSettings
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'text-slate-400 border-slate-700/80 hover:text-white hover:border-slate-500'
              }`}
              title="Select Microphone, Webcam, or Audio Input Devices"
            >
              <Settings2 className="w-4 h-4 text-amber-400" />
              <span>{isArabic ? 'إعدادات الأجهزة (AV)' : 'AV Devices'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDeviceSettings ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Target selection */}
            <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-emerald-900/40 text-xs">
              <button
                onClick={() => setBroadcastTarget('ALL')}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  broadcastTarget === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                {isArabic ? 'كل الـ 25 كابينة' : 'All 25 Cabins'}
              </button>
              <button
                onClick={() => setBroadcastTarget('SELECTED')}
                className={`px-3 py-1 rounded font-semibold transition-all ${
                  broadcastTarget === 'SELECTED' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                {isArabic ? 'كبائن محددة' : 'Selected Cabins'}
              </button>
            </div>

            {/* Broadcast action button */}
            {!isBroadcasting ? (
              <button onClick={handleStartBroadcast} className="btn-gold text-xs py-2 px-4">
                <Radio className="w-4 h-4 text-black" />
                <span>{isArabic ? 'بدء البث للجميع' : 'Start Broadcast'}</span>
              </button>
            ) : (
              <button onClick={handleStopBroadcast} className="btn-danger text-xs py-2 px-4">
                <span>{isArabic ? 'إنهاء البث' : 'Stop Broadcast'}</span>
              </button>
            )}
          </div>
        </div>

        {/* AV Hardware Settings Drawer (Microphone & Webcam Source Selector) */}
        {showDeviceSettings && (
          <div className="px-6 py-4 bg-slate-950/95 border-b border-amber-500/40 backdrop-blur-xl animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-900/40">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-amber-300 font-mono uppercase tracking-wider">
                  {isArabic ? 'إعدادات أجهزة الصوت والكاميرا (AV Devices)' : 'Audio & Video Hardware Selector'}
                </h4>
              </div>
              <button
                onClick={refreshDevices}
                className="text-[11px] font-mono text-emerald-400 hover:text-emerald-200 flex items-center gap-1 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-500/30 transition-all hover:bg-emerald-900/60"
                title="Rescan connected USB mics & webcams"
              >
                <RefreshCw className="w-3 h-3 animate-spin-hover" />
                <span>{isArabic ? 'إعادة فحص الأجهزة' : 'Re-scan Devices'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Microphone Source Selector */}
              <div className="space-y-1.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/20">
                <label className="text-xs font-bold text-emerald-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isArabic ? 'مصدر الميكروفون / الصوت:' : 'Microphone / Audio Source:'}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {audioInputDevices.length} {isArabic ? 'أجهزة مكتشفة' : 'found'}
                  </span>
                </label>
                <select
                  value={selectedMicId}
                  onChange={(e) => {
                    setSelectedMicId(e.target.value);
                    localStorage.setItem('arabic_lab_selected_mic', e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                >
                  {audioInputDevices.length === 0 ? (
                    <option value="">Default System Microphone</option>
                  ) : (
                    audioInputDevices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Microphone ${idx + 1} (${d.deviceId.slice(0, 8)}...)`}
                      </option>
                    ))
                  )}
                </select>

                {/* Live Mic Level Test Meter */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Live Mic Input Level:</span>
                    <span className={micLiveLevel > 10 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                      {micLiveLevel}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 rounded-full ${
                        micLiveLevel > 70
                          ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500'
                          : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.max(2, micLiveLevel)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 2. Webcam Video Source Selector */}
              <div className="space-y-1.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/20">
                <label className="text-xs font-bold text-amber-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isArabic ? 'كاميرا الفيديو (PiP Webcam):' : 'Webcam / Video Source:'}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {videoInputDevices.length} {isArabic ? 'كاميرات مكتشفة' : 'found'}
                  </span>
                </label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    localStorage.setItem('arabic_lab_selected_camera', e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                >
                  {videoInputDevices.length === 0 ? (
                    <option value="">Default Integrated Camera</option>
                  ) : (
                    videoInputDevices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Camera ${idx + 1} (${d.deviceId.slice(0, 8)}...)`}
                      </option>
                    ))
                  )}
                </select>

                <p className="text-[10px] text-slate-400 pt-1 leading-relaxed">
                  {isArabic
                    ? 'يمكن اختيار كاميرا USB الخارجية أو الكاميرا الافتراضية لعرض صورة الأستاذ.'
                    : 'Select external USB camera or virtual cam for professor PiP video feed.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Notice for Insecure Origin / HTTPS */}
        {screenError && (
          <div className="px-6 py-2.5 bg-amber-950/80 border-b border-amber-500/40 flex items-start gap-3 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-amber-300">
                Notice: Screen Sharing over LAN requires Secure Context (HTTPS or Chrome flag)
              </p>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">{screenError}</p>
            </div>
            <button
              onClick={() => setScreenError(null)}
              className="text-amber-400 hover:text-white text-xs ml-auto font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Target Cabins Selector if Selected */}
        {broadcastTarget === 'SELECTED' && (
          <div className="px-6 py-2.5 bg-black/60 border-b border-emerald-900/30 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-400 flex items-center gap-1 whitespace-nowrap">
              <Users className="w-3.5 h-3.5" />
              <span>{isArabic ? 'اختر الكبائن:' : 'Select Cabins:'}</span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {Array.from({ length: 25 }).map((_, i) => {
                const num = i + 1;
                const isSelected = selectedCabins.includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => toggleCabin(num)}
                    className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                      isSelected
                        ? 'bg-emerald-600 border-emerald-400 text-white font-bold'
                        : 'bg-emerald-950/40 border-emerald-900/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    C-{String(num).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Presentation Preview & PiP Container */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[460px]">
          
          {/* Active Screen Video Stream */}
          {isScreenSharing ? (
            <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
              {screenImageSrc ? (
                <img
                  src={screenImageSrc}
                  alt="Live Desktop Screen"
                  className="w-full h-full max-h-[65vh] object-contain shadow-2xl pointer-events-none select-none"
                />
              ) : (
                <video
                  ref={screenVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full max-h-[65vh] object-contain shadow-2xl"
                />
              )}
              {/* Screen Stream Status Badge */}
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-emerald-950/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-emerald-500/40 text-xs text-emerald-300 font-mono shadow-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-bold">LIVE SCREEN SHARING ACTIVE</span>
              </div>
              {/* Stop Sharing Button Overlay */}
              <button
                onClick={stopScreenShare}
                className="absolute top-4 right-4 bg-red-600/90 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg border border-red-400/50 flex items-center gap-1.5 transition-all"
              >
                <X className="w-3.5 h-3.5" />
                <span>Stop Sharing</span>
              </button>
            </div>
          ) : (
            /* Slide Lecture Board Fallback when screen is not yet shared */
            <div className="relative w-full h-full flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={1280}
                height={720}
                className="w-full h-full max-h-[65vh] object-contain"
              />

              {/* Big Screen Share Button Overlay on Canvas */}
              <div className="absolute top-4 right-4">
                <button
                  onClick={handleToggleScreenShare}
                  className="btn-primary py-2 px-3.5 text-xs font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  <ScreenShare className="w-4 h-4 text-emerald-200" />
                  <span>{isArabic ? 'بدء مشاركة الشاشة الحقيقية' : 'Share Real Screen / Window'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Draggable Circular PiP Professor Webcam */}
          {shareWebcamPiP && (
            <div
              onMouseDown={handleMouseDown}
              style={{ top: `${pipPos.y}px`, left: `${pipPos.x}px` }}
              className="pip-webcam-overlay select-none cursor-move z-20"
              title="Professor Circular Webcam PiP (Drag anywhere on screen)"
            >
              {hasWebcam ? (
                <div className="w-full h-full relative rounded-full overflow-hidden border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.5)]">
                  <video
                    ref={pipVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover rounded-full"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-slate-950/80 text-center py-0.5">
                    <div className="text-[9px] font-bold text-amber-300 truncate px-1 font-mono">
                      {professorName}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full rounded-full border-2 border-amber-400 bg-gradient-to-tr from-amber-950 to-emerald-950 flex flex-col items-center justify-center p-2 text-center shadow-[0_0_25px_rgba(251,191,36,0.5)]">
                  <div className="text-2xl mb-0.5">👨‍🏫</div>
                  <div className="text-[10px] font-bold text-amber-300 leading-tight truncate max-w-full px-1">
                    {professorName}
                  </div>
                  <div className="text-[7px] text-emerald-400 font-mono tracking-widest mt-0.5">
                    PROFESSOR PiP
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom Stream Status Overlay */}
          <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-emerald-900/50 text-xs text-slate-300 z-10">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isBroadcasting ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              <span className="font-semibold text-amber-300">
                {isBroadcasting
                  ? isArabic
                    ? `جاري البث المباشر لـ (${broadcastTarget === 'ALL' ? '25 كابينة' : `${selectedCabins.length} كبائن`})`
                    : `Broadcasting Live to ${broadcastTarget === 'ALL' ? 'All 25 Cabins' : `${selectedCabins.length} Selected Cabins`}`
                  : isArabic
                  ? 'جاهز للبث (وضع الاستعداد)'
                  : 'Broadcast Ready (Standby)'}
              </span>
            </div>
            <div className="text-slate-400 text-[11px] flex items-center gap-3">
              <span>
                Screen:{' '}
                <strong className={isScreenSharing ? 'text-emerald-400' : 'text-slate-400'}>
                  {isScreenSharing ? 'Physical Screen Active' : 'Lecture Slide Board'}
                </strong>
              </span>
              <span>•</span>
              <span>
                PiP:{' '}
                <strong className="text-yellow-400">
                  {shareWebcamPiP ? (hasWebcam ? 'Live Camera' : 'Avatar Mode') : 'Disabled'}
                </strong>
              </span>
              <span>•</span>
              <span className="font-mono text-emerald-400">AMU LAN SFU</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
