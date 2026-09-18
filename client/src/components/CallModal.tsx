import React, { useState, useEffect, useRef } from 'react';
import { ActiveCall, User, Language } from '../types';
import { PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, ShieldCheck } from 'lucide-react';
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
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  // Video & Stream references
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerSocketIdRef = useRef<string>(call.peerSocketId);
  const localStreamReadyRef = useRef<(() => void) | null>(null);
  const localStreamPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const offerSentRef = useRef(false);
  const acceptedRef = useRef(false);
  const callIdRef = useRef(call.roomId);

  // Keep peerSocketIdRef updated if call prop updates
  useEffect(() => {
    peerSocketIdRef.current = call.peerSocketId;
  }, [call.peerSocketId]);

  // WebRTC Setup & Negotiation
  useEffect(() => {
    let active = true;

    // Resolved when local mic/cam tracks are acquired and attached to the PC
    localStreamPromiseRef.current = new Promise<void>((resolve) => {
      localStreamReadyRef.current = resolve;
    });
    callIdRef.current = call.roomId;

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    };

    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    pc.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionStatus('connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setConnectionStatus('disconnected');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Peer Connection State:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnectionStatus('connected');
      }
    };

    // Remote Track Listener: Attach directly to remote <video>
    pc.ontrack = (event) => {
      console.log('📡 Remote media track received:', event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(console.warn);
        if (event.track.kind === 'video') {
          setHasRemoteVideo(true);
        }
      }
    };

    // ICE Candidate Generator: Relay to peer
    pc.onicecandidate = (event) => {
      if (event.candidate && peerSocketIdRef.current && peerSocketIdRef.current !== 'professors') {
        socket.emit('webrtc-signal', {
          targetSocketId: peerSocketIdRef.current,
          signal: event.candidate,
          type: 'candidate',
          streamPurpose: 'call',
          callId: callIdRef.current,
        });
      }
    };

    // Acquire physical Microphone and Webcam
    navigator.mediaDevices
      ?.getUserMedia({
        audio: true,
        video: call.callType === 'VIDEO' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      })
      .then(async (stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(console.warn);
        }

        // Add tracks to PeerConnection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Local media ready — the caller's offer creation may now proceed
        localStreamReadyRef.current?.();
      })
      .catch((err) => {
        console.warn('Physical camera/mic capture warning:', err);
        localStreamReadyRef.current?.();
      });

    // Signaling listener for incoming Offer / Answer / ICE Candidates
    const handleSignal = async (data: {
      senderSocketId: string;
      signal: any;
      type: 'offer' | 'answer' | 'candidate';
      streamPurpose: string;
      callId?: string;
    }) => {
      if (data.streamPurpose !== 'call') return;
      if (data.callId !== callIdRef.current) return; // Ignore stale signals from other calls
      peerSocketIdRef.current = data.senderSocketId;

      try {
        if (data.type === 'offer') {
          console.log('📥 Received WebRTC Offer from peer:', data.senderSocketId);
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc-signal', {
            targetSocketId: data.senderSocketId,
            signal: answer,
            type: 'answer',
            streamPurpose: 'call',
            callId: callIdRef.current,
          });
        } else if (data.type === 'answer') {
          console.log('📥 Received WebRTC Answer from peer');
          await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        } else if (data.type === 'candidate') {
          if (data.signal && data.callId === callIdRef.current) { // Ignore stale candidates
            await pc.addIceCandidate(new RTCIceCandidate(data.signal));
          }
        }
      } catch (sigErr) {
        console.warn('WebRTC signal handling error:', sigErr);
      }
    };

    socket.on('webrtc-signal', handleSignal);

    // Callee: PC created + signaling listener registered — NOW announce readiness
    if (!call.isCaller && peerSocketIdRef.current) {
      socket.emit('webrtc-ready', { callId: call.roomId, targetSocketId: peerSocketIdRef.current });
    }

    // Caller: offer only after callee's PC + listener are live
    const handleWebrtcReady = (data: { senderSocketId: string; callId: string }) => {
      if (data.callId !== callIdRef.current) return; // Ignore stale ready from other calls
      peerSocketIdRef.current = data.senderSocketId;
      maybeSendOffer();
    };
    socket.on('webrtc-ready', handleWebrtcReady);

    return () => {
      active = false;
      socket.off('webrtc-signal', handleSignal);
      socket.off('webrtc-ready', handleWebrtcReady);

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [call.callType, call.isCaller]);

  // Single offer path: guarded, acceptance- and readiness-gated
  const maybeSendOffer = async () => {
    if (!call.isCaller || offerSentRef.current) return;
    if (!acceptedRef.current) return; // Never offer before the callee accepted
    const target = peerSocketIdRef.current;
    if (!target || target === 'professors' || target === 'peer-socket') return; // No placeholder targets
    offerSentRef.current = true;
    try {
      await localStreamPromiseRef.current; // Tracks must be attached before createOffer()
      const pc = pcRef.current;
      if (!pc || pc.signalingState === 'closed') {
        offerSentRef.current = false;
        return;
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-signal', {
        targetSocketId: target,
        signal: offer,
        type: 'offer',
        streamPurpose: 'call',
        callId: callIdRef.current,
      });
    } catch (e) {
      console.error('Error creating WebRTC offer:', e);
      offerSentRef.current = false; // Controlled retry allowed on failure
    }
  };

  // Gate the offer on the callee's acceptance (fires alongside webrtc-ready,
  // whichever arrives last triggers the offer)
  useEffect(() => {
    acceptedRef.current = !!call.accepted;
    if (call.isCaller && call.accepted) {
      maybeSendOffer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.accepted]);

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

  // Toggle Camera
  const handleToggleVideo = () => {
    const nextVideoOff = !isVideoOff;
    setIsVideoOff(nextVideoOff);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = !nextVideoOff;
      });
    }
  };

  // In-Call Desktop Screen Sharing Toggle
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop Screen Share -> Switch back to webcam
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      const videoSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
      if (videoSender && camTrack) {
        videoSender.replaceTrack(camTrack).catch(console.warn);
      }
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsScreenSharing(false);
    } else {
      // Start Screen Share -> Stream Desktop Screen to peer
      try {
        let stream: MediaStream;
        if (navigator.mediaDevices.getDisplayMedia) {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        } else {
          alert('Screen sharing not supported in this browser context.');
          return;
        }

        screenStreamRef.current = stream;
        const screenTrack = stream.getVideoTracks()[0];

        const videoSender = pcRef.current?.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenTrack).catch(console.warn);
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        screenTrack.onended = () => {
          handleToggleScreenShare();
        };

        setIsScreenSharing(true);
      } catch (err) {
        console.warn('Screen share failed or cancelled:', err);
      }
    }
  };

  // Call duration counter
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
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    socket.emit('call-ended', {
      targetSocketId: peerSocketIdRef.current,
      cabinNumber: call.peerCabin || currentUser.cabinNumber,
    });
    onEndCall();
  };

  return (
    <div className="modal-backdrop z-50">
      <div className="glass-panel-elevated w-full max-w-4xl flex flex-col overflow-hidden relative border border-emerald-500/40 shadow-[0_0_60px_rgba(16,185,129,0.3)] bg-slate-950">
        
        {/* Header HUD */}
        <div className="px-6 py-4 bg-slate-950 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-900/80 border border-emerald-500/40 flex items-center justify-center text-xl shadow-md">
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
                <span className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400 animate-ping'}`} />
                <span>
                  {connectionStatus === 'connected' ? `${call.callType} ACTIVE` : 'CONNECTING...'} • {formatTime(duration)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="status-badge status-online text-xs font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Real-Time WebRTC P2P</span>
            </span>
          </div>
        </div>

        {/* Video Canvas Area */}
        <div className="relative bg-black min-h-[460px] flex items-center justify-center overflow-hidden">
          {/* Main Remote Display: Real Video Stream */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-contain ${hasRemoteVideo || call.callType === 'VIDEO' ? 'block' : 'hidden'}`}
          />

          {/* Fallback Display if audio-only or video track pending */}
          {(!hasRemoteVideo && call.callType === 'AUDIO') && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-12 text-center">
              <div className="w-24 h-24 rounded-full bg-emerald-950/80 border-2 border-emerald-400 flex items-center justify-center text-5xl mb-4 shadow-[0_0_30px_rgba(16,185,129,0.3)] animate-pulse">
                🎙️
              </div>
              <h3 className="text-xl font-bold text-white">{call.peerName}</h3>
              <p className="text-xs text-emerald-400 mt-1 font-mono">1:1 High-Fidelity Audio Dialogue Session</p>
            </div>
          )}

          {/* Local User Self-Preview Window (Picture-in-Picture bottom-right) */}
          <div className="absolute bottom-4 right-4 w-44 h-32 rounded-xl bg-slate-900/90 border border-emerald-500/60 overflow-hidden shadow-2xl flex flex-col items-center justify-center z-10">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between pointer-events-none">
              <span className="text-[9px] font-bold text-white bg-black/80 px-1.5 py-0.5 rounded truncate max-w-[90px]">
                {currentUser.name}
              </span>
              <span className={`text-[8px] font-mono px-1 rounded font-bold ${isMuted ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                {isMuted ? 'MUTED' : isScreenSharing ? 'SCREEN' : 'LIVE'}
              </span>
            </div>
          </div>
        </div>

        {/* Call Controls Toolbar */}
        <div className="px-6 py-4 bg-slate-950 border-t border-emerald-900/50 flex items-center justify-center gap-4">
          {/* Mute Button */}
          <button
            onClick={handleToggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isMuted
                ? 'bg-red-950/80 text-red-400 border border-red-500/60 shadow-lg'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'
            }`}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Video Toggle */}
          <button
            onClick={handleToggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isVideoOff
                ? 'bg-red-950/80 text-red-400 border border-red-500/60'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'
            }`}
            title={isVideoOff ? 'Enable Camera' : 'Disable Camera'}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Desktop Screen Share Toggle in Call */}
          <button
            onClick={handleToggleScreenShare}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isScreenSharing
                ? 'bg-cyan-600 text-white border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)]'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-900'
            }`}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Desktop Screen in Call'}
          >
            <Monitor className="w-5 h-5" />
          </button>

          {/* Hangup Button */}
          <button
            onClick={handleHangup}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-red-600 to-rose-700 text-white flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.6)] hover:scale-105 transition-transform"
            title="End Call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
