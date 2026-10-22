import React, { useState, useEffect, useRef } from 'react';
import { Language, User } from '../types';
import { X, Radio, Monitor, Camera, CameraOff, Mic, MicOff, Users } from 'lucide-react';
import { socket } from '../services/socket';
import { createPeer, closePeer, closePeersByPurpose, replaceVideoTrack, replaceAudioTrack, addMediaTrack } from '../services/rtcEngine';
import { getMicStream, getWebcamStream, getScreenStream, mixAudioTracks, stopStream, MixedAudio } from '../services/mediaCapture';

interface BroadcastStudioModalProps {
  onClose: () => void;
  language: Language;
  currentUser?: User;
}

export const BroadcastStudioModal: React.FC<BroadcastStudioModalProps> = ({ onClose, language, currentUser }) => {
  const isArabic = language === 'ar';
  const professorName = currentUser?.name || 'Professor';

  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [shareWebcam, setShareWebcam] = useState(true);
  const [shareMic, setShareMic] = useState(true);
  const [target, setTarget] = useState<'ALL' | 'SELECTED'>('ALL');
  const [selectedCabins, setSelectedCabins] = useState<number[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mixedRef = useRef<MixedAudio | null>(null);
  const outRef = useRef<MediaStream>(new MediaStream());         // main outgoing (screen/placeholder video + audio)
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef<Map<number, string>>(new Map());        // cabinNumber -> sessionId
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

  const mySocketId = () => socket.id || '';

  // Acquire mic + webcam on mount
  useEffect(() => {
    (async () => {
      try {
        const mic = await getMicStream().catch(() => null);
        if (mic) { micStreamRef.current = mic; audioTrackRef.current = mic.getAudioTracks()[0]; outRef.current.addTrack(mic.getAudioTracks()[0]); }
        const cam = await getWebcamStream().catch(() => null);
        if (cam) { webcamStreamRef.current = cam; if (webcamVideoRef.current) webcamVideoRef.current.srcObject = cam; }
      } catch (e: any) { setError(e?.message || 'Device error'); }
    })();
    return () => {
      closePeersByPurpose('broadcast');
      stopStream(micStreamRef.current); stopStream(webcamStreamRef.current); stopStream(screenStreamRef.current);
      mixedRef.current?.stop();
    };
  }, []);

  const applyAudioToPeers = () => {
    peersRef.current.forEach((sid) => replaceAudioTrack(sid, audioTrackRef.current));
  };
  const applyVideoToPeers = (track: MediaStreamTrack | null) => {
    peersRef.current.forEach((sid) => replaceVideoTrack(sid, track));
  };

  const startScreen = async () => {
    setError(null);
    try {
      const scr = await getScreenStream(true);
      screenStreamRef.current = scr;
      const v = scr.getVideoTracks()[0];
      const sys = scr.getAudioTracks()[0];
      // put screen video into outgoing
      outRef.current.getVideoTracks().forEach((t) => outRef.current.removeTrack(t));
      outRef.current.addTrack(v);
      if (screenVideoRef.current) { screenVideoRef.current.srcObject = scr; screenVideoRef.current.play().catch(() => {}); }
      // mix mic + system audio
      const mic = micStreamRef.current?.getAudioTracks()[0];
      if (sys) {
        mixedRef.current?.stop();
        mixedRef.current = mixAudioTracks([mic, sys].filter(Boolean) as MediaStreamTrack[]);
        audioTrackRef.current = mixedRef.current?.track || mic || null;
      }
      applyVideoToPeers(v);
      applyAudioToPeers();
      v.onended = () => stopScreen();
      setIsScreenSharing(true);
    } catch (e: any) {
      setError(e?.message === 'SCREEN_CAPTURE_UNSUPPORTED' ? 'Screen capture needs the desktop app or HTTPS.' : (e?.message || 'Screen share failed'));
    }
  };
  const stopScreen = () => {
    stopStream(screenStreamRef.current); screenStreamRef.current = null;
    outRef.current.getVideoTracks().forEach((t) => outRef.current.removeTrack(t));
    mixedRef.current?.stop(); mixedRef.current = null;
    audioTrackRef.current = micStreamRef.current?.getAudioTracks()[0] || null;
    applyVideoToPeers(null);
    applyAudioToPeers();
    setIsScreenSharing(false);
  };

  // Handle students announcing readiness -> create sendonly peer + offer
  useEffect(() => {
    const onReady = (data: { cabinNumber: number; studentSocketId: string }) => {
      if (!isBroadcasting) return;
      const sessionId = `bcast:${mySocketId()}:${data.cabinNumber}`;
      closePeer(sessionId);
      createPeer({
        sessionId, remoteSocketId: data.studentSocketId, purpose: 'broadcast',
        polite: false, localStream: outRef.current,
      });
      const camTrack = shareWebcam ? webcamStreamRef.current?.getVideoTracks()[0] : undefined;
      if (camTrack) addMediaTrack(sessionId, camTrack, new MediaStream([camTrack]));
      peersRef.current.set(data.cabinNumber, sessionId);
      setViewerCount(peersRef.current.size);
    };
    socket.on('broadcast:viewer-ready', onReady);
    return () => { socket.off('broadcast:viewer-ready', onReady); };
  }, [isBroadcasting, shareWebcam]);

  const startBroadcast = () => {
    if (!shareMic) audioTrackRef.current = null;
    setIsBroadcasting(true);
    socket.emit('broadcast:start', {
      type: target,
      selectedCabins,
      options: { hasScreen: isScreenSharing, hasWebcam: shareWebcam, hasAudio: shareMic },
      title: `${professorName} — Arabic Lab Live`,
    });
  };
  const stopBroadcast = () => {
    setIsBroadcasting(false);
    socket.emit('broadcast:stop');
    closePeersByPurpose('broadcast');
    peersRef.current.clear();
    setViewerCount(0);
  };

  const toggleCabin = (n: number) => setSelectedCabins((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));

  const toggleMic = () => {
    const next = !shareMic; setShareMic(next);
    micStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
  };
  const toggleWebcam = () => {
    const next = !shareWebcam; setShareWebcam(next);
    webcamStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden relative border border-amber-500/40 shadow-[0_0_40px_rgba(229,184,66,0.2)]">
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-black flex items-center justify-center font-bold"><Radio className="w-5 h-5 animate-pulse" /></div>
            <div>
              <h2 className="text-lg font-bold text-white font-arabic">{isArabic ? 'استوديو البث المباشر' : 'Classroom Broadcast Studio'}</h2>
              <p className="text-xs text-slate-400">{isArabic ? 'بث الشاشة والصوت وصوت سطح المكتب والكاميرا' : 'Broadcast screen, voice, desktop audio & webcam over WebRTC'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isBroadcasting && <span className="status-badge status-in-call"><span className="pulse-dot bg-amber-400" /><span>ON AIR • {viewerCount} {isArabic ? 'كابينة' : 'viewers'}</span></span>}
            <button onClick={onClose} className="btn-icon"><X className="w-5 h-5 text-slate-400" /></button>
          </div>
        </div>

        <div className="px-6 py-3 bg-emerald-950/40 border-b border-emerald-900/40 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button onClick={() => (isScreenSharing ? stopScreen() : startScreen())}
              className={`btn-outline text-xs py-2 px-3 flex items-center gap-1.5 ${isScreenSharing ? 'bg-emerald-600 text-white border-emerald-400' : 'text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/40'}`}>
              <Monitor className="w-4 h-4" /><span>{isScreenSharing ? (isArabic ? 'إيقاف الشاشة' : 'Stop Screen') : (isArabic ? 'مشاركة الشاشة' : 'Share Screen')}</span>
            </button>
            <button onClick={toggleWebcam} className={`btn-outline text-xs py-2 px-3 ${shareWebcam ? 'text-yellow-300 border-yellow-500/50' : 'text-slate-500'}`}>
              {shareWebcam ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}<span>{isArabic ? 'كاميرا PiP' : 'Webcam PiP'}</span>
            </button>
            <button onClick={toggleMic} className={`btn-outline text-xs py-2 px-3 ${shareMic ? 'text-emerald-300 border-emerald-500/50' : 'text-slate-500'}`}>
              {shareMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}<span>{isArabic ? 'الميكروفون' : 'Microphone'}</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-emerald-900/40 text-xs">
              <button onClick={() => setTarget('ALL')} className={`px-3 py-1 rounded font-semibold ${target === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>{isArabic ? 'كل الكبائن' : 'All 25'}</button>
              <button onClick={() => setTarget('SELECTED')} className={`px-3 py-1 rounded font-semibold ${target === 'SELECTED' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>{isArabic ? 'محددة' : 'Selected'}</button>
            </div>
            {!isBroadcasting ? (
              <button onClick={startBroadcast} className="btn-gold text-xs py-2 px-4"><Radio className="w-4 h-4 text-black" /><span>{isArabic ? 'بدء البث' : 'Start Broadcast'}</span></button>
            ) : (
              <button onClick={stopBroadcast} className="btn-danger text-xs py-2 px-4"><span>{isArabic ? 'إنهاء البث' : 'Stop Broadcast'}</span></button>
            )}
          </div>
        </div>

        {error && <div className="px-6 py-2.5 bg-amber-950/80 border-b border-amber-500/40 text-xs text-amber-200">{error}</div>}

        {target === 'SELECTED' && (
          <div className="px-6 py-2.5 bg-black/60 border-b border-emerald-900/30 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-slate-400 flex items-center gap-1 whitespace-nowrap"><Users className="w-3.5 h-3.5" />{isArabic ? 'اختر:' : 'Select:'}</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {Array.from({ length: 25 }).map((_, i) => { const n = i + 1; const sel = selectedCabins.includes(n); return (
                <button key={n} onClick={() => toggleCabin(n)} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${sel ? 'bg-emerald-600 border-emerald-400 text-white font-bold' : 'bg-emerald-950/40 border-emerald-900/50 text-slate-400 hover:text-white'}`}>C-{String(n).padStart(2, '0')}</button>
              ); })}
            </div>
          </div>
        )}

        <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-[440px]">
          {isScreenSharing ? (
            <video ref={screenVideoRef} autoPlay playsInline muted className="w-full h-full max-h-[62vh] object-contain" />
          ) : (
            <div className="text-center p-10 text-slate-400">
              <Monitor className="w-16 h-16 mx-auto mb-3 text-emerald-700" />
              <p className="text-sm">{isArabic ? 'اضغط «مشاركة الشاشة» لبدء العرض، أو ابدأ البث بالصوت والكاميرا فقط.' : 'Click "Share Screen" to present, or start broadcasting with voice + webcam only.'}</p>
            </div>
          )}
          {shareWebcam && (
            <div className="absolute bottom-4 right-4 w-40 h-40 rounded-full overflow-hidden border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.5)] z-10">
              <video ref={webcamVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
