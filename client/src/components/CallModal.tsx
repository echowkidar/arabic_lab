import React, { useState, useEffect, useRef } from 'react';
import { ActiveCall, User, Language } from '../types';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, ShieldCheck, ArrowLeftRight } from 'lucide-react';
import { socket } from '../services/socket';
import { createPeer, closePeer, getSender, setOutgoingTrack, sendMeta, addMediaTrack, RtcMeta } from '../services/rtcEngine';
import { getMicStream, getWebcamStream, getScreenStream, getAutoScreenStream, isElectron, mixAudioTracks, stopStream, MixedAudio } from '../services/mediaCapture';
import { t } from '../i18n';

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
  const [remoteVideoOn, setRemoteVideoOn] = useState(true);
  const showRemoteVideo = hasRemoteVideo && remoteVideoOn;
  // Student desktop shown to the professor during a call (second video stream)
  const [hasRemoteScreen, setHasRemoteScreen] = useState(false);
  const [screenIsMain, setScreenIsMain] = useState(true);
  const [sendingAutoScreen, setSendingAutoScreen] = useState(false);
  const autoScreenRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const remoteScreenRef = useRef<HTMLVideoElement | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mixedRef = useRef<MixedAudio | null>(null);
  const localCompositeRef = useRef<MediaStream>(new MediaStream());

  const sessionId = `call:${call.roomId}`;
  const peerCreatedRef = useRef(false);
  const mediaReadyRef = useRef(false);
  const callRef = useRef(call);
  callRef.current = call;
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const screenSharingRef = useRef(false);

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
      } catch (e) {
        console.warn('Local media error:', e);
      }
      if (cancelled) return;
      // Only connect once our own mic/cam are attached, otherwise a fast accept
      // would create a peer with no outgoing tracks (one-way call).
      mediaReadyRef.current = true;
      maybeCreatePeer();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maybeCreatePeer = () => {
    if (peerCreatedRef.current || !mediaReadyRef.current) return;
    const c = callRef.current;
    const remote = c.peerSocketId;
    // Callee can connect immediately; caller waits until the callee accepted.
    if (!remote) return;
    if (c.isCaller && !c.accepted) return;
    peerCreatedRef.current = true;

    const composite = localCompositeRef.current;
    let meta: RtcMeta = {};
    const inbound = new Map<string, MediaStream>();
    // Route each inbound stream: the student's desktop (tagged via meta.screen)
    // goes to the screen view, everything else (camera + voice) to the main view.
    const route = (stream: MediaStream) => {
      if (meta.screen && stream.id === meta.screen) {
        if (remoteScreenRef.current && remoteScreenRef.current.srcObject !== stream) remoteScreenRef.current.srcObject = stream;
        remoteScreenRef.current?.play().catch(() => {});
        setHasRemoteScreen(meta.screenOn !== 'off' && stream.getVideoTracks().length > 0);
        return;
      }
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
        remoteVideoRef.current.srcObject = stream;
      }
      remoteVideoRef.current?.play().catch(() => {});
      if (stream.getVideoTracks().length > 0) setHasRemoteVideo(true);
    };
    createPeer({
      sessionId,
      remoteSocketId: remote,
      purpose: 'call',
      polite: !c.isCaller,
      localStream: composite,
      onTrack: (stream) => { inbound.set(stream.id, stream); route(stream); },
      // Peer tells us when it has no live video (camera off / screen share ended)
      onMeta: (m) => {
        meta = m;
        setRemoteVideoOn(m.video !== 'off');
        if (m.screenOn === 'off') setHasRemoteScreen(false);
        inbound.forEach(route);
      },
      onState: (st) => {
        if (st === 'connected') setStatus('connected');
        else if (st === 'failed' || st === 'disconnected') setStatus('disconnected');
      },
    });
    const camTrack = composite.getVideoTracks()[0];
    const micTrack = composite.getAudioTracks()[0];
    videoSenderRef.current = camTrack ? getSender(sessionId, camTrack) : null;
    audioSenderRef.current = micTrack ? getSender(sessionId, micTrack) : null;

    // Student in a call with the professor (desktop app): also send the screen
    // by default so the professor can see what the student is doing.
    if (currentUser.role === 'STUDENT' && c.peerRole === 'PROFESSOR' && isElectron()) {
      void startAutoScreen();
    }
  };

  const startAutoScreen = async () => {
    try {
      const scr = await getAutoScreenStream(false); // video only; voice stays on the mic track
      if (!mountedRef.current) { stopStream(scr); return; } // call already ended
      autoScreenRef.current = scr;
      const track = scr.getVideoTracks()[0];
      if (!track) return;
      sendMeta(sessionId, { screen: scr.id, screenOn: 'on' }); // before the renegotiation offer
      addMediaTrack(sessionId, track, scr);
      setSendingAutoScreen(true);
      track.addEventListener('ended', () => {
        sendMeta(sessionId, { screenOn: 'off' });
        setSendingAutoScreen(false);
      });
    } catch (e) {
      console.warn('Auto screen for call unavailable:', e);
    }
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      closePeer(sessionId);
      mixedRef.current?.stop();
      stopStream(micStreamRef.current);
      stopStream(camStreamRef.current);
      stopStream(screenStreamRef.current);
      stopStream(autoScreenRef.current);
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
    sendMeta(sessionId, { video: next ? 'off' : 'on' });
  };

  const stopScreenShare = () => {
    if (!screenSharingRef.current) return;
    screenSharingRef.current = false;
    stopStream(screenStreamRef.current);
    screenStreamRef.current = null;
    mixedRef.current?.stop();
    mixedRef.current = null;
    // Restore camera video (none in an audio call) + mic-only audio
    const composite = localCompositeRef.current;
    const camTrack = camStreamRef.current?.getVideoTracks()[0] || null;
    if (videoSenderRef.current) setOutgoingTrack(sessionId, videoSenderRef.current, camTrack, composite);
    const micTrack = micStreamRef.current?.getAudioTracks()[0] || null;
    if (audioSenderRef.current) setOutgoingTrack(sessionId, audioSenderRef.current, micTrack, composite);
    if (localVideoRef.current) localVideoRef.current.srcObject = composite;
    const camLive = Boolean(camTrack && camTrack.readyState === 'live' && camTrack.enabled);
    sendMeta(sessionId, { video: camLive ? 'on' : 'off' });
    setIsScreenSharing(false);
  };

  const startScreenShare = async () => {
    if (screenSharingRef.current || !peerCreatedRef.current) return;
    try {
      const screen = await getScreenStream(true); // includes system/desktop audio
      screenStreamRef.current = screen;
      screenSharingRef.current = true;
      const composite = localCompositeRef.current;
      const screenVideo = screen.getVideoTracks()[0];
      // Replace the camera, or add a video track if this is an audio-only call.
      videoSenderRef.current = setOutgoingTrack(sessionId, videoSenderRef.current, screenVideo, composite);

      // Mix mic + system audio so the other side hears both voice AND the file
      const sysAudio = screen.getAudioTracks()[0];
      const micTrack = micStreamRef.current?.getAudioTracks()[0];
      if (sysAudio) {
        const toMix = [micTrack, sysAudio].filter(Boolean) as MediaStreamTrack[];
        mixedRef.current = mixAudioTracks(toMix);
        const outAudio = mixedRef.current?.track || sysAudio;
        audioSenderRef.current = setOutgoingTrack(sessionId, audioSenderRef.current, outAudio, composite);
      }
      // Browser/OS "Stop sharing" button: always STOP (never restart) sharing.
      screenVideo.onended = () => stopScreenShare();
      sendMeta(sessionId, { video: 'on' });
      if (localVideoRef.current) localVideoRef.current.srcObject = screen;
      setIsScreenSharing(true);
    } catch (e) {
      screenSharingRef.current = false;
      console.warn('Screen share failed:', e);
    }
  };

  const handleToggleScreenShare = () => {
    if (screenSharingRef.current) stopScreenShare();
    else void startScreenShare();
  };

  const handleHangup = () => {
    socket.emit('call-ended', {
      targetSocketId: call.peerSocketId,
      cabinNumber: call.peerCabin || currentUser.cabinNumber,
      roomId: call.roomId,
    });
    onEndCall();
  };

  const mainCls = 'w-full h-full object-contain';
  const pipCls = 'absolute top-4 left-4 w-56 h-36 rounded-xl border-2 border-cyan-400/70 bg-black object-cover shadow-2xl z-20';

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
          {/* Peer camera + voice (stays mounted so audio keeps playing) */}
          <video
            ref={remoteVideoRef}
            autoPlay playsInline
            className={`${hasRemoteScreen && screenIsMain ? pipCls : mainCls} ${showRemoteVideo ? 'block' : 'hidden'}`}
          />
          {/* Student desktop (professor side) */}
          <video
            ref={remoteScreenRef}
            autoPlay playsInline muted
            className={hasRemoteScreen ? (screenIsMain ? mainCls : pipCls) : 'hidden'}
          />
          {hasRemoteScreen && (
            <button onClick={() => setScreenIsMain((v) => !v)}
              className="absolute top-4 right-4 z-30 btn-outline text-[11px] py-1.5 px-3 bg-black/70 text-cyan-200 border-cyan-400/60">
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{screenIsMain ? t(language, 'showCamera') : t(language, 'showScreen')}</span>
            </button>
          )}
          {sendingAutoScreen && (
            <div className="absolute top-4 left-4 z-30 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-200 bg-black/70 border border-cyan-500/50 px-2.5 py-1 rounded-full">
              <Monitor className="w-3.5 h-3.5" />{t(language, 'screenSharedWithProf')}
            </div>
          )}
          {(hasRemoteScreen ? !screenIsMain && !showRemoteVideo : !showRemoteVideo) && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-12 text-center">
              <div className="w-24 h-24 rounded-full bg-emerald-950/80 border-2 border-emerald-400 flex items-center justify-center text-5xl mb-4 animate-pulse">🎙️</div>
              <h3 className="text-xl font-bold text-white">{call.peerName}</h3>
              <p className="text-xs text-emerald-400 mt-1 font-mono">
                {call.callType === 'AUDIO' ? 'Audio Dialogue Session' : hasRemoteVideo ? 'Camera off' : 'Waiting for video…'}
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
          <button onClick={handleToggleScreenShare} disabled={(!isScreenSharing && status !== 'connected') || sendingAutoScreen}
            title={sendingAutoScreen ? t(language, 'screenSharedWithProf') : 'Share screen with desktop audio'}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${isScreenSharing ? 'bg-cyan-600 text-white border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)]' : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'}`}>
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
