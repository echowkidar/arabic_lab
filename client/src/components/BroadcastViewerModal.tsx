import React, { useState, useEffect, useRef } from 'react';
import { Language } from '../types';
import { X, Maximize2, Minimize2, Radio, Volume2, VolumeX } from 'lucide-react';
import { socket } from '../services/socket';

interface BroadcastViewerModalProps {
  broadcastData: any;
  onClose: () => void;
  language: Language;
}

export const BroadcastViewerModal: React.FC<BroadcastViewerModalProps> = ({
  broadcastData,
  onClose,
  language,
}) => {
  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [screenFrame, setScreenFrame] = useState<string | null>(null);
  const [webcamFrame, setWebcamFrame] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [audioWaiting, setAudioWaiting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pendingAudioRef = useRef<ArrayBuffer[]>([]);

  // Toggle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => setIsFullscreen(true));
      } else {
        setIsFullscreen(!isFullscreen);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => setIsFullscreen(false));
      } else {
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Unlock AudioContext on first user interaction (browser autoplay policy)
  const unlockAudio = () => {
    if (audioUnlocked) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        audioContextRef.current.resume().then(() => {
          setAudioUnlocked(true);
          setAudioWaiting(false);
          // Play any queued audio
          const queued = pendingAudioRef.current.splice(0);
          queued.forEach((buf) => {
            if (audioContextRef.current) {
              audioContextRef.current.decodeAudioData(
                buf,
                (decoded) => {
                  if (audioContextRef.current) {
                    const src = audioContextRef.current.createBufferSource();
                    src.buffer = decoded;
                    src.connect(audioContextRef.current.destination);
                    src.start(0);
                  }
                },
                () => {}
              );
            }
          });
        });
      }
    } catch (_) {}
  };

  // Listen for live broadcast frames and audio chunks from Professor
  useEffect(() => {
    const handleFrame = (data: { screenFrame?: string | null; webcamFrame?: string | null }) => {
      if (data.screenFrame) {
        setScreenFrame(data.screenFrame);
      }
      if (data.webcamFrame) {
        setWebcamFrame(data.webcamFrame);
      }
    };

    // Play incoming audio chunks via Web Audio API
    const handleAudio = (data: { audioChunk: string }) => {
      if (isMuted || !data.audioChunk) return;
      try {
        // Base64 audio chunk decode
        const binary = atob(data.audioChunk);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const buf = bytes.buffer.slice(0);

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current && AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }

        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          // Queue audio until user interacts
          pendingAudioRef.current.push(buf);
          setAudioWaiting(true);
          return;
        }

        if (audioContextRef.current && audioContextRef.current.state === 'running') {
          setAudioUnlocked(true);
          audioContextRef.current.decodeAudioData(
            buf,
            (buffer) => {
              if (audioContextRef.current) {
                const source = audioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContextRef.current.destination);
                source.start(0);
              }
            },
            () => {}
          );
        }
      } catch (e) {
        // ignore audio decode errors
      }
    };

    socket.on('incoming-broadcast-frame', handleFrame);
    socket.on('incoming-broadcast-audio', handleAudio);

    return () => {
      socket.off('incoming-broadcast-frame', handleFrame);
      socket.off('incoming-broadcast-audio', handleAudio);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [isMuted]);

  return (
    <div className="modal-backdrop z-50" onClick={unlockAudio}>
      <div
        ref={containerRef}
        className={`glass-panel-elevated w-full max-w-6xl flex flex-col overflow-hidden relative border-2 border-amber-500/70 shadow-[0_0_60px_rgba(245,158,11,0.3)] bg-slate-950 ${
          isFullscreen ? 'w-screen h-screen max-w-none rounded-none' : 'max-h-[90vh]'
        }`}
      >
        {/* Broadcast Header HUD */}
        <div className="px-6 py-3 bg-gradient-to-r from-amber-950 via-slate-950 to-emerald-950 border-b border-amber-500/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-black flex items-center justify-center font-bold shadow-md">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-300 font-mono tracking-wide uppercase px-2 py-0.5 rounded bg-amber-950 border border-amber-500/50">
                  LIVE BROADCAST
                </span>
                <h3 className="text-sm font-bold text-white font-arabic truncate max-w-md">
                  {broadcastData?.title || 'Lecture & Classroom Guidance'}
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
                {isArabic
                  ? 'بث مباشر عالي الدقة من منصة الأستاذ إلى جميع كبائن المختبر'
                  : isUrdu
                  ? 'پروفیسر کی لائیو اسکرین اور آواز'
                  : 'High-Fidelity Real-Time Lecture & Screen Demonstration'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 ${
                isMuted ? 'text-red-400 border-red-500/50' : 'text-emerald-300 border-emerald-500/50'
              }`}
              title="Toggle Audio"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{isMuted ? 'Muted' : 'Audio On'}</span>
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={handleToggleFullscreen}
              className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 text-slate-300"
              title="Toggle Fullscreen Mode"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>

            {/* Minimize / Close Viewer Button */}
            <button
              onClick={onClose}
              className="btn-icon text-slate-400 hover:text-white"
              title="Minimize Viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Broadcast Content Area */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[480px]">
          {/* Main Professor Screen Frame */}
          {screenFrame ? (
            <img
              src={screenFrame}
              alt="Professor Live Lecture Screen"
              className="w-full h-full object-contain shadow-2xl"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <div className="w-20 h-20 rounded-2xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-4xl mb-4 animate-pulse">
                🎙️
              </div>
              <h4 className="text-lg font-bold text-white font-arabic">
                {isArabic ? 'جاري استقبال البث المباشر من الأستاذ...' : 'Connecting to Professor Live Stream...'}
              </h4>
              <p className="text-xs text-amber-400 mt-2 font-mono">
                Audio & Screen Signal Active • Sub-50ms LAN Latency
              </p>
            </div>
          )}

          {/* Professor Webcam PiP in bottom-right or top-right */}
          {webcamFrame && (
            <div className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden border-2 border-amber-400/80 shadow-2xl bg-slate-900 z-10">
              <img
                src={webcamFrame}
                alt="Professor Webcam"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1 left-2 right-2 bg-black/70 px-1.5 py-0.5 rounded flex items-center justify-between text-[9px] text-amber-300 font-mono font-bold">
                <span>PROFESSOR CAM</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
            </div>
          )}

          {/* Audio Unlock Overlay — appears if browser blocked autoplay */}
          {audioWaiting && !isMuted && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 cursor-pointer"
              onClick={unlockAudio}
            >
              <div className="text-center p-6 rounded-2xl bg-slate-900/95 border border-amber-500/60 shadow-2xl max-w-xs">
                <div className="text-3xl mb-3">🔊</div>
                <h4 className="text-sm font-bold text-amber-300 mb-2">Click to Enable Professor Audio</h4>
                <p className="text-xs text-slate-400">
                  Browser requires a tap/click to start audio playback. Click anywhere to hear the professor.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
