import React, { useState, useEffect, useRef } from 'react';
import { Cabin, User, Language } from '../types';
import { X, Eye, Camera, CameraOff, Volume2, VolumeX, Disc, CheckCircle, ChevronLeft, ChevronRight, Video, Maximize2, Minimize2 } from 'lucide-react';
import { renderOfflineWorkstation } from '../services/screenSimulators';
import { uploadRecording, logAudit } from '../services/api';
import { socket } from '../services/socket';
import { createPeer, closePeer, RtcMeta } from '../services/rtcEngine';

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
  cabin, onClose, onNextCabin, onPrevCabin, onStartCall, currentUser, language,
}) => {
  const isArabic = language === 'ar';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamInRef = useRef<MediaStream | null>(null);

  const [isWebcamActive, setIsWebcamActive] = useState(true);
  const [isAudioListening, setIsAudioListening] = useState(true);
  const [hasLiveVideo, setHasLiveVideo] = useState(false);
  const [hasWebcam, setHasWebcam] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveScreenData, setLiveScreenData] = useState<string | null>(cabin.screenData || null);
  const [isCabinOnline, setIsCabinOnline] = useState<boolean>(cabin.online ?? false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'saved'>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const isAudioListeningRef = useRef(isAudioListening);
  isAudioListeningRef.current = isAudioListening;

  // Subscribe to the cabin's live A/V over WebRTC
  useEffect(() => {
    setHasLiveVideo(false);
    setHasWebcam(false);
    // Unique per open, so late signals from a previous session can't leak in.
    const sessionId = `monitor:${cabin.cabinNumber}:${socket.id}:${Date.now()}`;
    let meta: RtcMeta = {};
    const inbound = new Map<string, MediaStream>();

    const showMain = (stream: MediaStream) => {
      screenStreamInRef.current = stream;
      if (mainVideoRef.current && mainVideoRef.current.srcObject !== stream) {
        mainVideoRef.current.srcObject = stream;
        mainVideoRef.current.muted = !isAudioListeningRef.current;
      }
      mainVideoRef.current?.play().catch(() => {});
      if (stream.getVideoTracks().length > 0) setHasLiveVideo(true);
    };
    const showCam = (stream: MediaStream) => {
      if (pipVideoRef.current && pipVideoRef.current.srcObject !== stream) pipVideoRef.current.srcObject = stream;
      pipVideoRef.current?.play().catch(() => {});
      setHasWebcam(true);
    };
    // The student tells us which stream id is the webcam; without that hint,
    // fall back to "the stream carrying audio is the main one".
    const route = (stream: MediaStream) => {
      const isCam = meta.cam ? stream.id === meta.cam
        : meta.main ? stream.id !== meta.main
        : stream.getAudioTracks().length === 0;
      if (isCam) showCam(stream); else showMain(stream);
    };

    createPeer({
      sessionId,
      remoteSocketId: cabin.socketId || '',
      purpose: 'monitor',
      polite: true,
      onMeta: (m) => { meta = m; inbound.forEach(route); },
      onTrack: (stream) => { inbound.set(stream.id, stream); route(stream); },
    });
    logAudit(cabin.cabinNumber, 'SCREEN_VIEW').catch(() => {});
    socket.emit('monitor:request', { cabinNumber: cabin.cabinNumber, sessionId });

    return () => {
      socket.emit('monitor:stop', { cabinNumber: cabin.cabinNumber, sessionId });
      closePeer(sessionId);
      screenStreamInRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabin.cabinNumber, cabin.socketId]);

  // Keep thumbnail/presence fresh as fallback before live video connects
  useEffect(() => {
    const onScreen = (d: { cabinNumber: number; screenData: string }) => { if (d.cabinNumber === cabin.cabinNumber) { setLiveScreenData(d.screenData); setIsCabinOnline(true); } };
    const onUpdated = (u: any) => { if (u.cabinNumber === cabin.cabinNumber) setIsCabinOnline(Boolean(u.online)); };
    socket.on('cabin-screen-update', onScreen);
    socket.on('cabin-updated', onUpdated);
    return () => { socket.off('cabin-screen-update', onScreen); socket.off('cabin-updated', onUpdated); };
  }, [cabin.cabinNumber]);

  // Audio listen toggle
  useEffect(() => { if (mainVideoRef.current) mainVideoRef.current.muted = !isAudioListening; }, [isAudioListening]);

  // Offline canvas fallback
  useEffect(() => {
    if (hasLiveVideo || liveScreenData) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let active = true; let animId = 0;
    const render = () => {
      if (!active) return;
      renderOfflineWorkstation(ctx, canvas.width, canvas.height, cabin.cabinNumber, cabin.student?.name || `Student ${cabin.cabinNumber}`, isArabic);
      animId = requestAnimationFrame(render);
    };
    render();
    return () => { active = false; cancelAnimationFrame(animId); };
  }, [hasLiveVideo, liveScreenData, cabin.cabinNumber, cabin.student?.name, isArabic]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) modalRef.current?.requestFullscreen?.().catch(() => setIsFullscreen(true));
    else document.exitFullscreen?.().catch(() => setIsFullscreen(false));
  };
  useEffect(() => {
    const h = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const toggleWebcam = () => {
    const next = !isWebcamActive;
    setIsWebcamActive(next);
    if (next) logAudit(cabin.cabinNumber, 'WEBCAM_VIEW').catch(() => {});
  };

  // Recording: capture the REAL inbound live stream (video + audio)
  const startRecording = () => {
    const stream = screenStreamInRef.current;
    if (!stream || stream.getTracks().length === 0) { console.warn('No live stream to record yet'); return; }
    try {
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm' });
      recordedChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data); };
      mr.onstop = async () => { await saveRecording(new Blob(recordedChunksRef.current, { type: 'video/webm' })); };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setIsRecording(true); setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => setRecordingSeconds((p) => p + 1), 1000);
    } catch (e) { console.error('Recording failed:', e); }
  };
  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    setIsRecording(false);
  };
  const saveRecording = async (blob: Blob) => {
    try {
      setUploadStatus('uploading');
      const fd = new FormData();
      const pad = String(cabin.cabinNumber).padStart(2, '0');
      fd.append('video', blob, `cabin_${pad}_rec_${Date.now()}.webm`);
      fd.append('title', `Cabin ${pad} (${cabin.student?.name || 'Student'}) - Monitor Recording`);
      fd.append('durationSec', String(recordingSeconds));
      fd.append('cabinNumber', String(cabin.cabinNumber));
      if (cabin.student?.id) fd.append('studentId', cabin.student.id);
      await uploadRecording(fd);
      setUploadStatus('saved'); setTimeout(() => setUploadStatus('idle'), 4000);
    } catch (e) { console.error('Upload failed:', e); setUploadStatus('idle'); }
  };

  const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const pad = String(cabin.cabinNumber).padStart(2, '0');

  return (
    <div className="modal-backdrop">
      <div ref={modalRef} className={`glass-panel-elevated w-full flex flex-col overflow-hidden relative border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.15)] ${isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen max-w-none rounded-none' : 'max-w-6xl max-h-[92vh]'}`}>
        <div className="px-6 py-3.5 bg-slate-950/80 border-b border-emerald-900/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-500/40 flex items-center justify-center"><Eye className="w-4 h-4" /></div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-sm text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">CABIN {pad}</span>
                <h2 className="text-base font-bold text-white">{cabin.student?.name}</h2>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 mt-0.5">
                <span className="pulse-dot bg-cyan-400" />
                <span>{hasLiveVideo ? (isArabic ? 'بث مباشر (WebRTC)' : 'Live A/V (WebRTC)') : (isArabic ? 'جارٍ الاتصال…' : 'Connecting live…')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-950/40 p-1 rounded-lg border border-emerald-900/50">
            <button onClick={onPrevCabin} disabled={!onPrevCabin} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-mono font-bold text-emerald-300 px-2">{cabin.cabinNumber} / 25</span>
            <button onClick={onNextCabin} disabled={!onNextCabin} className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => (isRecording ? stopRecording() : startRecording())}
              className={`text-xs py-2 px-3.5 rounded-lg font-bold flex items-center gap-2 ${isRecording ? 'bg-red-600 text-white shadow-[0_0_16px_rgba(239,68,68,0.6)] animate-pulse' : 'bg-red-950/70 border border-red-500/40 text-red-300 hover:bg-red-900/70'}`}>
              <Disc className={`w-4 h-4 ${isRecording ? 'animate-spin' : ''}`} /><span>{isRecording ? `REC ${fmt(recordingSeconds)}` : (isArabic ? 'تسجيل' : 'Record')}</span>
            </button>
            {uploadStatus === 'saved' && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle className="w-4 h-4" />{isArabic ? 'حُفظ' : 'Saved!'}</span>}
            <button onClick={toggleWebcam} className={`btn-outline text-xs py-2 px-3 ${isWebcamActive ? 'border-cyan-500/60 text-cyan-300 bg-cyan-950/40' : 'text-slate-400'}`}>
              {isWebcamActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}<span>{isArabic ? 'الكاميرا' : 'Webcam'}</span>
            </button>
            <button onClick={() => setIsAudioListening(!isAudioListening)} className={`btn-outline text-xs py-2 px-3 ${isAudioListening ? 'text-emerald-300' : 'text-slate-500'}`}>
              {isAudioListening ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}<span>{isAudioListening ? (isArabic ? 'استماع' : 'Listening') : (isArabic ? 'صامت' : 'Muted')}</span>
            </button>
            <button onClick={() => onStartCall(cabin, 'VIDEO')} className="btn-gold text-xs py-2 px-3"><Video className="w-4 h-4 text-black" /><span>{isArabic ? 'مكالمة' : '1:1 Call'}</span></button>
            <button onClick={toggleFullscreen} className="btn-outline text-xs py-2 px-3 text-slate-300">{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}</button>
            <button onClick={onClose} className="btn-icon text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[500px]">
          {/* Live WebRTC video */}
          <video ref={mainVideoRef} autoPlay playsInline className={`w-full h-full object-contain ${hasLiveVideo ? 'block' : 'hidden'} ${isFullscreen ? 'max-h-screen' : 'max-h-[75vh]'}`} />
          {/* Fallback: last thumbnail or offline canvas */}
          {!hasLiveVideo && (liveScreenData && isCabinOnline ? (
            <img src={liveScreenData} alt={`Cabin ${pad}`} className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : 'max-h-[75vh]'}`} />
          ) : (
            <canvas ref={canvasRef} width={1920} height={1080} className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : 'max-h-[75vh]'}`} />
          ))}

          {/* Webcam PiP */}
          {/* Always mounted (hidden when toggled off) so the stream stays attached */}
          <div className={`absolute top-6 left-6 w-40 h-40 rounded-full overflow-hidden border-2 border-cyan-400/80 shadow-2xl bg-slate-900 z-10 ${isWebcamActive ? 'block' : 'hidden'}`}>
            <video ref={pipVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${hasWebcam ? 'block' : 'hidden'}`} />
            {!hasWebcam && (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-2">
                <div className="text-3xl mb-1 animate-pulse">👤</div>
                <div className="text-[9px] text-slate-400 uppercase tracking-widest">CABIN {pad} CAM</div>
              </div>
            )}
          </div>

          <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-emerald-900/40 text-xs text-slate-300 pointer-events-none">
            <span className="flex items-center gap-1.5 text-emerald-400 font-bold font-mono"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />{hasLiveVideo ? 'LIVE WEBRTC • SCREEN + DESKTOP AUDIO' : 'CONNECTING • LAN'}</span>
            <span>Audio: {isAudioListening ? 'On' : 'Muted'} • Webcam: {isWebcamActive ? (hasWebcam ? 'Live' : 'Waiting') : 'Hidden'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
