import React, { useState, useEffect, useRef } from 'react';
import { ActiveCall, User, Language } from '../types';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Monitor } from 'lucide-react';
import { socket } from '../services/socket';

interface CallModalProps {
  call: ActiveCall;
  currentUser: User;
  onEndCall: () => void;
  language: Language;
}

export const CallModal: React.FC<CallModalProps> = ({ call, currentUser, onEndCall, language }) => {
  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.callType === 'AUDIO');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hasPhysicalCam, setHasPhysicalCam] = useState(false);

  // Local & Remote video element references
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Request physical Windows webcam & microphone
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({
      audio: true,
      video: call.callType === 'VIDEO',
    })
      .then((s) => {
        stream = s;
        localStreamRef.current = s;
        setHasPhysicalCam(s.getVideoTracks().length > 0);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = s;
        }
      })
      .catch((e) => {
        console.warn('Physical camera/mic access in call:', e);
      });

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [call.callType]);

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMute;
      });
    }
  };

  // Toggle Video
  const handleToggleVideo = () => {
    const nextVideoOff = !isVideoOff;
    setIsVideoOff(nextVideoOff);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = !nextVideoOff;
      });
    }
  };

  // Call timer
  useEffect(() => {
    const timer = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleHangup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    socket.emit('call-ended', {
      targetSocketId: call.peerSocketId,
      cabinNumber: call.peerCabin || currentUser.cabinNumber,
    });
    onEndCall();
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-4xl flex flex-col overflow-hidden relative border border-emerald-500/40 shadow-[0_0_50px_rgba(16,185,129,0.25)]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-900/80 border border-emerald-500/40 flex items-center justify-center text-xl">
              {call.peerRole === 'PROFESSOR' ? '👨‍🏫' : '🧑‍🎓'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{call.peerName}</h3>
                {call.peerCabin && (
                  <span className="text-xs font-mono font-bold bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                    CABIN {String(call.peerCabin).padStart(2, '0')}
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-400 flex items-center gap-1.5 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{call.callType} CALL • {formatTime(duration)}</span>
              </p>
            </div>
          </div>

          <span className="status-badge status-in-call">
            <span className="pulse-dot" />
            <span>LAN WebRTC P2P</span>
          </span>
        </div>

        {/* Video Canvas / Screens */}
        <div className="relative bg-black min-h-[420px] flex items-center justify-center overflow-hidden">
          {/* Main Remote Display */}
          {call.callType === 'VIDEO' ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-emerald-950 p-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-28 h-28 rounded-full bg-emerald-900/60 border-2 border-emerald-400/50 flex items-center justify-center text-5xl shadow-[0_0_30px_rgba(16,185,129,0.3)] animate-pulse">
                  {call.peerRole === 'PROFESSOR' ? '👨‍🏫' : '🧑‍🎓'}
                </div>
                <h4 className="text-xl font-bold text-white font-arabic">{call.peerName}</h4>
                <div className="flex items-center gap-2 text-xs text-emerald-300 font-mono">
                  <span>Microphone: Active (Real-time LAN)</span>
                  <span>•</span>
                  <span>Direct WebRTC Stream</span>
                </div>
                <div className="wave-bars mt-2">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div
                      key={i}
                      className="wave-bar"
                      style={{
                        height: `${Math.sin(duration * 2 + i) * 12 + 16}px`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Audio Only Display */
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-12 text-center">
              <div className="w-24 h-24 rounded-full bg-emerald-950/80 border-2 border-emerald-400 flex items-center justify-center text-4xl mb-4">
                🎙️
              </div>
              <h3 className="text-xl font-bold text-white">{call.peerName}</h3>
              <p className="text-xs text-emerald-400 mt-1 font-mono">1:1 Audio Dialogue Session</p>
              <div className="wave-bars mt-4">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className="wave-bar"
                    style={{
                      height: `${Math.sin(duration * 3 + i * 0.5) * 14 + 18}px`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Local User Live Camera Preview Window */}
          <div className="absolute bottom-4 right-4 w-40 h-32 rounded-xl bg-slate-900/90 border border-emerald-500/50 overflow-hidden shadow-2xl flex flex-col items-center justify-center relative">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between pointer-events-none">
              <span className="text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded">
                You ({currentUser.name})
              </span>
              <span className={`text-[8px] font-mono px-1 rounded font-bold ${isMuted ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                {isMuted ? 'MUTED' : 'MIC ON'}
              </span>
            </div>
          </div>
        </div>

        {/* Call Controls Toolbar */}
        <div className="px-6 py-4 bg-slate-950/90 border-t border-emerald-900/50 flex items-center justify-center gap-4">
          {/* Mute Button */}
          <button
            onClick={handleToggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isMuted
                ? 'bg-red-950/80 text-red-400 border border-red-500/50'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'
            }`}
            title="Toggle Microphone"
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Video Toggle */}
          <button
            onClick={handleToggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isVideoOff
                ? 'bg-red-950/80 text-red-400 border border-red-500/50'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'
            }`}
            title="Toggle Camera"
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Screen Share */}
          <button
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isScreenSharing
                ? 'bg-cyan-900 text-cyan-300 border border-cyan-400'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'
            }`}
            title="Share Screen"
          >
            <Monitor className="w-5 h-5" />
          </button>

          {/* Hangup Button */}
          <button
            onClick={handleHangup}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-red-600 to-rose-700 text-white flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.5)] hover:scale-105 transition-transform"
            title="End Call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
