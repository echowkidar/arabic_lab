import React, { useState, useEffect, useRef } from 'react';
import { Cabin, User, Language } from '../types';
import {
  X, Eye, Camera, CameraOff, Volume2, VolumeX, Disc,
  CheckCircle, ChevronLeft, ChevronRight, Video, ShieldAlert, Download
} from 'lucide-react';
import { renderMockWorkstation, renderOfflineWorkstation } from '../services/screenSimulators';
import { uploadRecording, logAudit } from '../services/api';
import { socket } from '../services/socket';

interface SilentMonitorModalProps {
  cabin: Cabin;
  onClose: () => void;
  onNextCabin?: () => void;
  onPrevCabin?: () => void;
  onStartCall: (cabin: Cabin, type: 'VIDEO' | 'AUDIO') => void;
  currentUser: User;
  language: Language;
}

export const SilentMonitorModal: React.FC<SilentMonitorModalProps> = ({
  cabin,
  onClose,
  onNextCabin,
  onPrevCabin,
  onStartCall,
  currentUser,
  language,
}) => {
  const isArabic = language === 'ar';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // States
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(cabin.isWebcamActive ?? true);
  const [isAudioListening, setIsAudioListening] = useState(true);
  const [listenVolume, setListenVolume] = useState(80);
  const [pipPosition, setPipPosition] = useState({ x: 30, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, initialX: 0, initialY: 0 });

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'saved'>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // Log compliance audit on open
  useEffect(() => {
    logAudit(cabin.cabinNumber, 'SCREEN_VIEW').catch(() => {});
    socket.emit('request-silent-monitor', { cabinNumber: cabin.cabinNumber });

    return () => {
      socket.emit('stop-silent-monitor', { cabinNumber: cabin.cabinNumber });
    };
  }, [cabin.cabinNumber]);

  // Animate screen canvas
  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = Date.now();
    let animId: number;

    const render = () => {
      if (!active) return;
      const elapsed = (Date.now() - startTime) / 1000;
      if (cabin.online) {
        renderMockWorkstation(
          ctx,
          canvas.width,
          canvas.height,
          cabin.cabinNumber,
          cabin.student?.name || `Student ${cabin.cabinNumber}`,
          elapsed,
          cabin.audioLevel > 15
        );
      } else {
        renderOfflineWorkstation(
          ctx,
          canvas.width,
          canvas.height,
          cabin.cabinNumber,
          cabin.student?.name || `Student ${cabin.cabinNumber}`,
          isArabic
        );
      }
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [cabin.cabinNumber, cabin.student?.name, cabin.audioLevel, cabin.online, isArabic]);

  // Toggle Webcam
  const handleToggleWebcam = () => {
    const nextState = !isWebcamActive;
    setIsWebcamActive(nextState);
    socket.emit('toggle-student-webcam', {
      cabinNumber: cabin.cabinNumber,
      enabled: nextState,
    });
    if (nextState) {
      logAudit(cabin.cabinNumber, 'WEBCAM_VIEW').catch(() => {});
    }
  };

  // PiP Dragging Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: pipPosition.x,
      initialY: pipPosition.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setPipPosition({
        x: Math.max(10, Math.min(window.innerWidth - 200, dragStartRef.current.initialX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 200, dragStartRef.current.initialY + dy)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Recording Logic
  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop Recording
      stopRecording();
    } else {
      // Start Recording
      startRecording();
    }
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const stream = canvas.captureStream(30);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });

      recordedChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        await saveRecordingToServer(blob);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);
  };

  const saveRecordingToServer = async (blob: Blob) => {
    try {
      setUploadStatus('uploading');
      const formData = new FormData();
      const cabinPad = String(cabin.cabinNumber).padStart(2, '0');
      const title = `Cabin ${cabinPad} (${cabin.student?.name || 'Student'}) - Silent Monitor Recording`;
      formData.append('video', blob, `cabin_${cabinPad}_rec_${Date.now()}.webm`);
      formData.append('title', title);
      formData.append('durationSec', String(recordingSeconds));
      formData.append('cabinNumber', String(cabin.cabinNumber));
      if (cabin.student?.id) formData.append('studentId', cabin.student.id);

      await uploadRecording(formData);
      setUploadStatus('saved');
      setTimeout(() => setUploadStatus('idle'), 4000);
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadStatus('idle');
    }
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const cabinPad = String(cabin.cabinNumber).padStart(2, '0');

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden relative border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
        
        {/* Top Monitor Bar */}
        <div className="px-6 py-3.5 bg-slate-950/80 border-b border-emerald-900/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-500/40 flex items-center justify-center">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-sm text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                  CABIN {cabinPad}
                </span>
                <h2 className="text-base font-bold text-white">{cabin.student?.name}</h2>
                <span className="text-xs text-slate-400 font-mono">(@{cabin.student?.username})</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 mt-0.5">
                <span className="pulse-dot bg-cyan-400" />
                <span>{isArabic ? 'جلسة مراقبة صامتة (بدون تنبيه الطالب)' : 'Silent Monitor Session (Zero Student Alerts)'}</span>
              </div>
            </div>
          </div>

          {/* Quick Cabin Navigator */}
          <div className="flex items-center gap-1.5 bg-emerald-950/40 p-1 rounded-lg border border-emerald-900/50">
            <button
              onClick={onPrevCabin}
              disabled={!onPrevCabin}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-emerald-900/40"
              title="Previous Cabin"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold text-emerald-300 px-2">
              {cabin.cabinNumber} / 25
            </span>
            <button
              onClick={onNextCabin}
              disabled={!onNextCabin}
              className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-emerald-900/40"
              title="Next Cabin"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Universal Record & Audio Controls */}
          <div className="flex items-center gap-2">
            {/* Record Button */}
            <button
              onClick={handleToggleRecording}
              className={`text-xs py-2 px-3.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                isRecording
                  ? 'bg-red-600 text-white shadow-[0_0_16px_rgba(239,68,68,0.6)] animate-pulse'
                  : 'bg-red-950/70 border border-red-500/40 text-red-300 hover:bg-red-900/70'
              }`}
            >
              <Disc className={`w-4 h-4 ${isRecording ? 'animate-spin' : ''}`} />
              <span>
                {isRecording ? `REC ${formatTime(recordingSeconds)}` : (isArabic ? 'تسجيل الجلسة' : 'Record Session')}
              </span>
            </button>

            {uploadStatus === 'saved' && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                <span>{isArabic ? 'تم حفظ التسجيل' : 'Saved!'}</span>
              </span>
            )}

            {/* Webcam PiP Toggle */}
            <button
              onClick={handleToggleWebcam}
              className={`btn-outline text-xs py-2 px-3 ${
                isWebcamActive ? 'border-cyan-500/60 text-cyan-300 bg-cyan-950/40' : 'text-slate-400'
              }`}
              title="Toggle Student Webcam PiP Overlay"
            >
              {isWebcamActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
              <span>{isArabic ? 'الكاميرا' : 'Webcam'}</span>
            </button>

            {/* Listen Audio Mute/Unmute */}
            <button
              onClick={() => setIsAudioListening(!isAudioListening)}
              className={`btn-outline text-xs py-2 px-3 ${
                isAudioListening ? 'text-emerald-300' : 'text-slate-500'
              }`}
              title="Listen to student microphone"
            >
              {isAudioListening ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span>{isAudioListening ? (isArabic ? 'الاستماع نشط' : 'Listening') : (isArabic ? 'كتم الصوت' : 'Muted')}</span>
            </button>

            {/* Direct Call Button */}
            <button
              onClick={() => onStartCall(cabin, 'VIDEO')}
              className="btn-gold text-xs py-2 px-3"
              title="Switch to 1:1 Video Call with this student"
            >
              <Video className="w-4 h-4 text-black" />
              <span>{isArabic ? 'بدء مكالمة' : '1:1 Call'}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="btn-icon text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Monitor Display Area */}
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[500px]">
          {/* Real-time screen canvas */}
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full max-h-[75vh] object-contain"
          />

          {/* Draggable Circular PiP Webcam Overlay */}
          {isWebcamActive && (
            <div
              onMouseDown={handleMouseDown}
              style={{ top: `${pipPosition.y}px`, left: `${pipPosition.x}px` }}
              className="pip-webcam-overlay select-none"
              title="Moveable Student Webcam PiP (Drag to move)"
            >
              <div className="w-full h-full relative bg-slate-900 flex items-center justify-center">
                {/* Simulated / Real Webcam Video */}
                <div className="w-full h-full bg-gradient-to-t from-emerald-950 to-slate-900 flex flex-col items-center justify-center p-2 text-center">
                  <div className="text-3xl mb-1">👤</div>
                  <div className="text-[10px] font-bold text-emerald-300 truncate max-w-[100px]">
                    {cabin.student?.name}
                  </div>
                  <div className="text-[8px] text-slate-400 uppercase tracking-widest">
                    CABIN {cabinPad} CAM
                  </div>
                </div>
                {/* PiP Active Indicator */}
                <div className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
              </div>
            </div>
          )}

          {/* Floating HUD info at bottom */}
          <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-emerald-900/40 text-xs text-slate-300 pointer-events-none">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                1080p @ 60fps • Sub-15ms LAN
              </span>
              <span className="text-slate-500">|</span>
              <span>Audio: {isAudioListening ? `${cabin.audioLevel}% (Active)` : 'Muted'}</span>
            </div>

            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <span>PiP Webcam: {isWebcamActive ? 'Active (Draggable)' : 'Disabled'}</span>
              <span>AUP Policy: Consent Acknowledged</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
