import React, { useState, useEffect, useRef } from 'react';
import { Language } from '../types';
import { X, Maximize2, Minimize2, Radio, Volume2, VolumeX } from 'lucide-react';
import { socket } from '../services/socket';
import { createPeer, closePeer } from '../services/rtcEngine';

interface BroadcastViewerModalProps {
  professorSocketId: string;
  cabinNumber: number;
  title: string;
  onClose: () => void;
  language: Language;
}

// Student-side live broadcast viewer. Subscribes to the professor's WebRTC
// stream (screen + voice + desktop audio, with webcam as a PiP track).
export const BroadcastViewerModal: React.FC<BroadcastViewerModalProps> = ({
  professorSocketId, cabinNumber, title, onClose, language,
}) => {
  const isArabic = language === 'ar';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [hasWebcam, setHasWebcam] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  const sessionId = `bcast:${professorSocketId}:${cabinNumber}`;

  useEffect(() => {
    createPeer({
      sessionId,
      remoteSocketId: professorSocketId,
      purpose: 'broadcast',
      polite: true,
      onTrack: (stream) => {
        const hasAudio = stream.getAudioTracks().length > 0;
        if (hasAudio) {
          if (mainVideoRef.current) {
            mainVideoRef.current.srcObject = stream;
            mainVideoRef.current.muted = isMuted;
            mainVideoRef.current.play().catch(() => {});
          }
          if (stream.getVideoTracks().length > 0) setHasVideo(true);
        } else if (stream.getVideoTracks().length > 0) {
          if (pipVideoRef.current) { pipVideoRef.current.srcObject = stream; pipVideoRef.current.play().catch(() => {}); }
          setHasWebcam(true);
        }
      },
    });
    // Tell the professor we're ready so it offers us the stream
    socket.emit('broadcast:viewer-ready', { professorSocketId, cabinNumber });

    return () => { closePeer(sessionId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorSocketId, cabinNumber]);

  useEffect(() => { if (mainVideoRef.current) mainVideoRef.current.muted = isMuted; }, [isMuted]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.().catch(() => setIsFullscreen(true));
    else document.exitFullscreen?.().catch(() => setIsFullscreen(false));
  };
  useEffect(() => {
    const h = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  return (
    <div className="modal-backdrop z-50">
      <div ref={containerRef} className={`glass-panel-elevated w-full max-w-6xl flex flex-col overflow-hidden relative border-2 border-amber-500/70 shadow-[0_0_60px_rgba(245,158,11,0.3)] bg-slate-950 ${isFullscreen ? 'w-screen h-screen max-w-none rounded-none' : 'max-h-[90vh]'}`}>
        <div className="px-6 py-3 bg-gradient-to-r from-amber-950 via-slate-950 to-emerald-950 border-b border-amber-500/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-black flex items-center justify-center font-bold"><Radio className="w-5 h-5 animate-pulse" /></div>
            <div>
              <span className="text-xs font-bold text-amber-300 font-mono tracking-wide uppercase px-2 py-0.5 rounded bg-amber-950 border border-amber-500/50">LIVE</span>
              <h3 className="text-sm font-bold text-white font-arabic truncate max-w-md inline-block ml-2 align-middle">{title}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsMuted(!isMuted)} className={`btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 ${isMuted ? 'text-red-400 border-red-500/50' : 'text-emerald-300 border-emerald-500/50'}`}>
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}<span>{isMuted ? 'Muted' : 'Audio On'}</span>
            </button>
            <button onClick={toggleFullscreen} className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5 text-slate-300">
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}<span>{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
            </button>
            <button onClick={onClose} className="btn-icon text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[480px]">
          <video ref={mainVideoRef} autoPlay playsInline className={`w-full h-full object-contain ${hasVideo ? 'block' : 'hidden'}`} />
          {!hasVideo && (
            <div className="flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <div className="w-20 h-20 rounded-2xl bg-amber-950/60 border border-amber-500/40 flex items-center justify-center text-4xl mb-4 animate-pulse">🎙️</div>
              <h4 className="text-lg font-bold text-white font-arabic">{isArabic ? 'جارٍ استقبال البث…' : 'Connecting to professor live stream…'}</h4>
              <p className="text-xs text-amber-400 mt-2 font-mono">WebRTC • LAN</p>
            </div>
          )}
          {hasWebcam && (
            <div className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden border-2 border-amber-400/80 shadow-2xl bg-slate-900 z-10">
              <video ref={pipVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute bottom-1 left-2 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[9px] text-amber-300 font-mono font-bold text-center">PROFESSOR CAM</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
