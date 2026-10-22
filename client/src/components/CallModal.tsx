import React, { useState, useEffect, useRef } from 'react';
import { ActiveCall, User, Language } from '../types';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, ShieldCheck } from 'lucide-react';
import { socket } from '../services/socket';
import { createPeer, closePeer, replaceVideoTrack, replaceAudioTrack } from '../services/rtcEngine';
import { getMicStream, getWebcamStream, getScreenStream, mixAudioTracks, stopStream, MixedAudio } from '../services/mediaCapture';

interface CallModalProps {
  call: ActiveCall;
  currentUser: User;
  onEndCall: () => void;
  language: Language;
}

export const CallModal: React.FC<CallModalProps> = ({ call, currentUser, onEndCall, language }) => {
  const isArabic = language === 'ar';

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(call.callType === 'AUDIO');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mixedRef = useRef<MixedAudio | null>(null);
  const localCompositeRef = useRef<MediaStream>(new MediaStream());

  const sessionId = `call:${call.roomId}`;
  const peerCreatedRef = useRef(false);

  // Acquire local media once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mic = await getMicStream().catch(() => null);
        if (mic) micStreamRef.current = mic;
        if (call.callType === 'VIDEO') {
          const cam = await getWebcamStream().catch(() => null);
          if (cam) camStreamRef.current = cam;
        }
        if (cancelled) { stopStream(mic); stopStream(camStreamRef.current); return; }

        const composite = localCompositeRef.current;
        mic?.getAudioTracks().forEach((t) => composite.addTrack(t));
        camStreamRef.current?.getVideoTracks().forEach((t) => composite.addTrack(t));
        if (localVideoRef.current) localVideoRef.current.srcObject = composite;
        maybeCreatePeer();
      } catch (e) {
        console.warn('Local media error:', e);
        maybeCreatePeer();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maybeCreatePeer = () => {
    if (peerCreatedRef.current) return;
    const remote = call.peerSocketId;
    // Callee can connect immediately; caller waits until the callee accepted.
    if (!remote) return;
    if (call.isCaller && !call.accepted) return;
    peerCreatedRef.current = true;

    createPeer({
      sessionId,
      remoteSocketId: remote,
      purpose: 'call',
      polite: !call.isCaller,
      localStream: localCompositeRef.current,
      onTrack: (stream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
        }
        if (stream.getVideoTracks().length > 0) setHasRemoteVideo(true);
      },
      onState: (st) => {
        if (st === 'connected') setStatus('connected');
        else if (st === 'failed' || st === 'disconnected') setStatus('disconnected');
      },
    });
  };

  // React to acceptance / peer socket id changes (caller side)
  useEffect(() => { maybeCreatePeer(); /* eslint-disable-next-line */ }, [call.accepted, call.peerSocketId]);

  // Duration
  useEffect(() => {
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      closePeer(sessionId);
      mixedRef.current?.stop();
      stopStream(micStreamRef.current);
      stopStream(camStreamRef.current);
      stopStream(screenStreamRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  };

  const handleToggleVideo = () => {
    const next = !isVideoOff;
    setIsVideoOff(next);
    camStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      stopStream(screenStreamRef.current);
      screenStreamRef.current = null;
      mixedRef.current?.stop();
      mixedRef.current = null;
      // Restore camera video + mic-only audio
      const camTrack = camStreamRef.current?.getVideoTracks()[0] || null;
      replaceVideoTrack(sessionId, camTrack);
      const micTrack = micStreamRef.current?.getAudioTracks()[0] || null;
      replaceAudioTrack(sessionId, micTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localCompositeRef.current;
      setIsScreenSharing(false);
      return;
    }
    try {
      const screen = await getScreenStream(true); // includes system/desktop audio
      screenStreamRef.current = screen;
      const screenVideo = screen.getVideoTracks()[0];
      replaceVideoTrack(sessionId, screenVideo);

      // Mix mic + system audio so the student hears both teacher voice AND the file
      const sysAudio = screen.getAudioTracks()[0];
      const micTrack = micStreamRef.current?.getAudioTracks()[0];
      const toMix = [micTrack, sysAudio].filter(Boolean) as MediaStreamTrack[];
      if (sysAudio && toMix.length > 1) {
        mixedRef.current = mixAudioTracks(toMix);
        if (mixedRef.current) replaceAudioTrack(sessionId, mixedRef.current.track);
      }
      screenVideo.onended = () => handleToggleScreenShare();
      if (localVideoRef.current) localVideoRef.current.srcObject = screen;
      setIsScreenSharing(true);
    } catch (e) {
      console.warn('Screen share failed:', e);
    }
  };

  const handleHangup = () => {
    socket.emit('call-ended', {
      targetSocketId: call.peerSocketId,
      cabinNumber: call.peerCabin || currentUser.cabinNumber,
      roomId: call.roomId,
    });
    onEndCall();
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="modal-backdrop z-50">
      <div className="glass-panel-elevated w-full max-w-4xl flex flex-col overflow-hidden relative border border-emerald-500/40 shadow-[0_0_60px_rgba(16,185,129,0.3)] bg-slate-950">
        <div className="px-6 py-4 bg-slate-950 border-b border-emerald-900/50 flex items-center justify-between">
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
              <p className="text-xs text-emerald-400 flex items-center gap-2 font-mono">
                <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400 animate-ping'}`} />
                {status === 'connected' ? `${call.callType} ACTIVE` : status === 'disconnected' ? 'RECONNECTING…' : 'CONNECTING…'} • {fmt(duration)}
              </p>
            </div>
          </div>
          <span className="status-badge status-online text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5" /> <span>WebRTC P2P • LAN</span>
          </span>
        </div>

        <div className="relative bg-black min-h-[460px] flex items-center justify-center overflow-hidden">
          <video
            ref={remoteVideoRef}
            autoPlay playsInline
            className={`w-full h-full object-contain ${hasRemoteVideo ? 'block' : 'hidden'}`}
          />
          {!hasRemoteVideo && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-12 text-center">
              <div className="w-24 h-24 rounded-full bg-emerald-950/80 border-2 border-emerald-400 flex items-center justify-center text-5xl mb-4 animate-pulse">🎙️</div>
              <h3 className="text-xl font-bold text-white">{call.peerName}</h3>
              <p className="text-xs text-emerald-400 mt-1 font-mono">
                {call.callType === 'AUDIO' ? 'Audio Dialogue Session' : 'Waiting for video…'}
              </p>
            </div>
          )}
          <div className="absolute bottom-4 right-4 w-44 h-32 rounded-xl bg-slate-900/90 border border-emerald-500/60 overflow-hidden shadow-2xl z-10">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between pointer-events-none">
              <span className="text-[9px] font-bold text-white bg-black/80 px-1.5 py-0.5 rounded truncate max-w-[90px]">{currentUser.name}</span>
              <span className={`text-[8px] font-mono px-1 rounded font-bold ${isMuted ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                {isMuted ? 'MUTED' : isScreenSharing ? 'SCREEN' : 'LIVE'}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-950 border-t border-emerald-900/50 flex items-center justify-center gap-4">
          <button onClick={handleToggleMute} title={isMuted ? 'Unmute' : 'Mute'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-950/80 text-red-400 border border-red-500/60' : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'}`}>
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <button onClick={handleToggleVideo} disabled={isScreenSharing} title={isVideoOff ? 'Enable Camera' : 'Disable Camera'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${isVideoOff ? 'bg-red-950/80 text-red-400 border border-red-500/60' : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'}`}>
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>
          <button onClick={handleToggleScreenShare} title="Share screen with desktop audio"
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isScreenSharing ? 'bg-cyan-600 text-white border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'}`}>
            <Monitor className="w-5 h-5" />
          </button>
          <button onClick={handleHangup} title="End Call"
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-red-600 to-rose-700 text-white flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.6)] hover:scale-105 transition-transform">
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
