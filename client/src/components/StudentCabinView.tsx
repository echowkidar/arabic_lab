import React, { useState, useEffect, useRef } from 'react';
import { User, Language } from '../types';
import { Hand, Phone, Video, Mic, BookOpen, Users, ShieldCheck, Camera, CameraOff } from 'lucide-react';
import { socket } from '../services/socket';
import { AudioAnalyzer } from '../services/audioAnalyzer';
import { BroadcastViewerModal } from './BroadcastViewerModal';
import { PracticePlayer } from './PracticePlayer';
import { getMicStream, getWebcamStream, getScreenStream, mixAudioTracks, stopStream, isElectron, MixedAudio } from '../services/mediaCapture';
import { createPeer, closePeer, addMediaTrack } from '../services/rtcEngine';

interface StudentCabinViewProps {
  user: User;
  onStartCall: (targetCabin: number | 'PROFESSOR', type: 'VIDEO' | 'AUDIO') => void;
  language: Language;
}

export const StudentCabinView: React.FC<StudentCabinViewProps> = ({ user, onStartCall, language }) => {
  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';
  const cabinNumber = user.cabinNumber || 1;
  const cabinPad = String(cabinNumber).padStart(2, '0');

  const [handRaised, setHandRaised] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [selectedPeerCabin, setSelectedPeerCabin] = useState<number>(cabinNumber === 1 ? 2 : 1);
  const [activeExerciseTab, setActiveExerciseTab] = useState<'quran' | 'dialogue' | 'grammar'>('quran');
  const [hardwareOk, setHardwareOk] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  const [broadcast, setBroadcast] = useState<{ professorSocketId: string; title: string } | null>(null);
  const [practice, setPractice] = useState<{ url: string; name: string; mode: 'student' | 'synced' } | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const mixedRef = useRef<MixedAudio | null>(null);
  const analyzerRef = useRef<AudioAnalyzer | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const watchersRef = useRef<Set<string>>(new Set()); // active monitor sessionIds

  // 1) Auto-acquire mic + webcam on mount (no manual click needed)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mic = await getMicStream().catch(() => null);
        if (mic && !cancelled) {
          micStreamRef.current = mic;
          const analyzer = new AudioAnalyzer();
          analyzer.start(mic, (vol) => {
            setMicVolume(vol);
            socket.emit('audio-level-update', { level: vol });
          });
          analyzerRef.current = analyzer;
        }
        const cam = await getWebcamStream().catch(() => null);
        if (cam && !cancelled) {
          webcamStreamRef.current = cam;
          if (webcamVideoRef.current) webcamVideoRef.current.srcObject = cam;
          socket.emit('webcam-active', { active: true });
        }
        if (!cancelled && (mic || cam)) { setHardwareOk(true); setHardwareError(null); }
        if (!mic && !cam && !cancelled) setHardwareError('Microphone/Webcam not accessible.');
      } catch (e: any) {
        if (!cancelled) setHardwareError(e?.message || 'Device access failed');
      }
    })();
    return () => {
      cancelled = true;
      analyzerRef.current?.stop();
      stopStream(micStreamRef.current);
      stopStream(webcamStreamRef.current);
      stopStream(screenStreamRef.current);
      mixedRef.current?.stop();
    };
  }, []);

  // 2) Lightweight grid thumbnail (~every 2s) via Electron desktopCapturer
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.getDesktopSources) return;
    let stop = false;
    let busy = false;
    const tick = async () => {
      if (stop || busy) return;
      busy = true;
      try {
        const sources = await api.getDesktopSources({ types: ['screen'], thumbnailSize: { width: 480, height: 270 } });
        if (sources?.[0]?.thumbnail) socket.emit('cabin-screen-frame', { screenData: sources[0].thumbnail });
      } catch { /* noop */ } finally { busy = false; }
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => { stop = true; clearInterval(timer); };
  }, []);

  // 3) Live A/V publish to a professor when monitoring starts
  useEffect(() => {
    const ensureScreen = async (): Promise<MediaStream | null> => {
      if (screenStreamRef.current) return screenStreamRef.current;
      try {
        const scr = await getScreenStream(true); // screen video + system/desktop audio
        screenStreamRef.current = scr;
        return scr;
      } catch {
        return null; // kiosk/browser without silent capture -> publish mic+cam only
      }
    };

    const onMonitorStart = async (data: { professorSocketId: string; sessionId: string }) => {
      const { professorSocketId, sessionId } = data;
      const scr = await ensureScreen();
      const micTrack = micStreamRef.current?.getAudioTracks()[0] || null;
      const sysAudio = scr?.getAudioTracks()[0] || null;

      // Mixed audio = teacher can hear mic + whatever plays on the desktop
      let audioTrack: MediaStreamTrack | null = micTrack;
      if (sysAudio) {
        const toMix = [micTrack, sysAudio].filter(Boolean) as MediaStreamTrack[];
        if (toMix.length > 0) {
          if (!mixedRef.current) mixedRef.current = mixAudioTracks(toMix);
          audioTrack = mixedRef.current?.track || micTrack;
        }
      }

      const mainStream = new MediaStream();
      const screenVideo = scr?.getVideoTracks()[0];
      if (screenVideo) mainStream.addTrack(screenVideo);
      if (audioTrack) mainStream.addTrack(audioTrack);

      createPeer({
        sessionId, remoteSocketId: professorSocketId, purpose: 'monitor',
        polite: false, localStream: mainStream,
      });
      // Second video track = webcam (professor shows it as PiP)
      const camTrack = webcamStreamRef.current?.getVideoTracks()[0];
      if (camTrack) addMediaTrack(sessionId, camTrack, new MediaStream([camTrack]));

      watchersRef.current.add(sessionId);
    };

    const onMonitorStop = (data: { sessionId: string }) => {
      closePeer(data.sessionId);
      watchersRef.current.delete(data.sessionId);
      if (watchersRef.current.size === 0) {
        stopStream(screenStreamRef.current);
        screenStreamRef.current = null;
        mixedRef.current?.stop();
        mixedRef.current = null;
      }
    };

    socket.on('monitor:start', onMonitorStart);
    socket.on('monitor:stop', onMonitorStop);
    return () => { socket.off('monitor:start', onMonitorStart); socket.off('monitor:stop', onMonitorStop); };
  }, []);

  // 4) Broadcast + practice media events
  useEffect(() => {
    const onBroadcast = (data: { professorSocketId: string; title: string }) => setBroadcast(data);
    const onBroadcastEnd = () => setBroadcast(null);
    const onMediaPush = (data: { url: string; name: string; mode: 'student' | 'synced' }) => setPractice(data);
    const onMediaClear = () => setPractice(null);
    socket.on('broadcast:incoming', onBroadcast);
    socket.on('broadcast:ended', onBroadcastEnd);
    socket.on('media:push', onMediaPush);
    socket.on('media:clear', onMediaClear);
    return () => {
      socket.off('broadcast:incoming', onBroadcast);
      socket.off('broadcast:ended', onBroadcastEnd);
      socket.off('media:push', onMediaPush);
      socket.off('media:clear', onMediaClear);
    };
  }, []);

  const toggleHand = () => {
    if (!handRaised) { setHandRaised(true); socket.emit('raise-hand', { studentName: user.name }); }
    else { setHandRaised(false); socket.emit('lower-hand', {}); }
  };

  const retryHardware = async () => {
    setHardwareError(null);
    try {
      if (!micStreamRef.current) {
        const mic = await getMicStream();
        micStreamRef.current = mic;
        const analyzer = new AudioAnalyzer();
        analyzer.start(mic, (vol) => { setMicVolume(vol); socket.emit('audio-level-update', { level: vol }); });
        analyzerRef.current = analyzer;
      }
      if (!webcamStreamRef.current) {
        const cam = await getWebcamStream();
        webcamStreamRef.current = cam;
        if (webcamVideoRef.current) webcamVideoRef.current.srcObject = cam;
        socket.emit('webcam-active', { active: true });
      }
      setHardwareOk(true);
    } catch (e: any) {
      setHardwareError(e?.message || 'Still cannot access devices');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {broadcast && (
        <div className="glass-panel-elevated p-4 border-amber-500/70 bg-gradient-to-r from-amber-950/80 to-slate-950/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center font-bold"><Video className="w-5 h-5" /></div>
            <div>
              <h3 className="text-base font-bold text-amber-300">{isArabic ? 'بث مباشر من الأستاذ' : 'Live Broadcast from Professor'}</h3>
              <p className="text-xs text-slate-300">{broadcast.title}</p>
            </div>
          </div>
        </div>
      )}

      {practice && (
        <PracticePlayer url={practice.url} name={practice.name} mode={practice.mode} language={language} onClose={() => setPractice(null)} />
      )}

      <div className="glass-panel-elevated p-6 flex flex-wrap items-center justify-between gap-4 border-emerald-500/30">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-900 border-2 border-emerald-400 flex flex-col items-center justify-center shadow-lg">
            <span className="text-[10px] font-mono tracking-wider text-emerald-200 uppercase">Cabin</span>
            <span className="text-2xl font-black font-heading text-white">{cabinPad}</span>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white font-arabic">{user.name}</h2>
              <span className="status-badge status-online"><span className="pulse-dot" /><span>LAN ACTIVE</span></span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Aligarh Muslim University (AMU) • Department of Arabic Language Lab</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleHand}
            className={`text-xs py-2.5 px-4 rounded-xl font-bold flex items-center gap-2 transition-all ${handRaised ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.5)]' : 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900'}`}>
            <Hand className="w-4 h-4" />
            <span>{handRaised ? (isArabic ? 'اليد مرفوعة' : isUrdu ? 'ہاتھ اٹھا ہے' : 'Hand Raised') : (isArabic ? 'رفع اليد' : isUrdu ? 'ہاتھ اٹھائیں' : 'Raise Hand')}</span>
          </button>
          <button onClick={() => onStartCall('PROFESSOR', 'VIDEO')} className="btn-gold text-xs py-2.5 px-4" title="Call Professor (video)">
            <Phone className="w-4 h-4 text-black" /><span>{isArabic ? 'اتصال بالأستاذ' : isUrdu ? 'پروفیسر سے کال' : 'Call Professor'}</span>
          </button>
          <button onClick={() => onStartCall('PROFESSOR', 'AUDIO')} className="btn-outline text-xs py-2.5 px-3" title="Audio-only call">
            <Mic className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between border-b border-emerald-900/50 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white font-arabic">{isArabic ? 'تمارين النطق والمحادثة' : 'Daily Arabic Practicum'}</h3>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {(['quran', 'dialogue', 'grammar'] as const).map((t) => (
                  <button key={t} onClick={() => setActiveExerciseTab(t)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${activeExerciseTab === t ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                    {t === 'quran' ? 'Phonetics' : t === 'dialogue' ? 'Dialogue' : 'Grammar'}
                  </button>
                ))}
              </div>
            </div>
            {activeExerciseTab === 'quran' && (
              <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-right">
                <span className="text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded mb-3 inline-block font-sans">تمرين مخارج الحروف</span>
                <p className="text-2xl font-quran leading-relaxed text-emerald-100 my-2">« وَلَا الضَّالِّينَ • قُلْ أَعُوذُ بِرَبِّ الفَلَقِ »</p>
                <p className="text-xs text-slate-400 mt-2 font-sans text-left"><strong>Instructions:</strong> Read aloud into your headset. When the professor sends a practice audio, it appears above with play / pause / repeat controls.</p>
              </div>
            )}
            {activeExerciseTab === 'dialogue' && (
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/40 text-right space-y-2 text-base font-arabic">
                <p className="text-amber-200"><strong>الطالب أ:</strong> أَهْلًا وَسَهْلًا، هَلْ هَذِهِ رِحْلَةُ الرِّيَاضِ؟</p>
                <p className="text-emerald-200"><strong>الطالب ب:</strong> نَعَمْ، تَوَجَّهْ إِلَى البَوَّابَةِ رَقْمِ ٧.</p>
              </div>
            )}
            {activeExerciseTab === 'grammar' && (
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/40 text-right">
                <p className="text-lg font-arabic text-emerald-200">« اللُّغَةُ العَرَبِيَّةُ جَمِيلَةٌ » — المبتدأ: اللغةُ، الخبر: جميلةٌ.</p>
              </div>
            )}
          </div>

          <div className="glass-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200"><Mic className="w-4 h-4 text-emerald-400" /><span>Headset Microphone & Webcam</span></div>
              <span className={`text-xs py-2 px-3.5 rounded-lg font-bold flex items-center gap-2 ${hardwareOk ? 'bg-emerald-600 text-white' : 'bg-red-950/70 border border-red-500/40 text-red-300'}`}>
                {hardwareOk ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                <span>{hardwareOk ? 'Mic & Webcam Connected' : 'Devices Not Ready'}</span>
              </span>
            </div>
            {hardwareError && (
              <div className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg p-2 flex items-center justify-between gap-2">
                <span>{hardwareError}</span>
                <button onClick={retryHardware} className="btn-outline text-[11px] py-1 px-2 text-red-200">Retry</button>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
                <span className="text-[11px] font-semibold text-slate-400">Live Microphone Level:</span>
                <span className="font-mono text-emerald-400 font-bold">{micVolume}%</span>
              </div>
              <div className="grid grid-cols-20 gap-1 h-3">
                {Array.from({ length: 20 }).map((_, idx) => {
                  const active = micVolume >= (idx + 1) * 5;
                  return <div key={idx} className={`h-full rounded-sm transition-all duration-100 ${active ? (idx > 15 ? 'bg-red-500' : idx > 11 ? 'bg-yellow-400' : 'bg-emerald-400') : 'bg-emerald-950/50'}`} />;
                })}
              </div>
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-emerald-900/40">
              <div className="w-28 h-20 bg-black rounded-lg overflow-hidden border border-emerald-500/40 relative shrink-0">
                <video ref={webcamVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <span className="absolute bottom-1 right-1 bg-black/80 text-emerald-400 text-[8px] font-bold px-1 rounded">LIVE</span>
              </div>
              <p className="text-[11px] text-slate-400">Your mic, webcam and desktop (with sound) are available to the professor for supervised teaching, per the lab Acceptable Use Policy you accepted at login.</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-5 border-emerald-500/20">
            <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-emerald-400" /><h3 className="text-sm font-bold text-white font-arabic">{isArabic ? 'محادثة مع كابينة أخرى' : 'Peer Dialogue Practice'}</h3></div>
            <p className="text-xs text-slate-400 mb-4">Connect 1:1 with another cabin to practice Arabic dialogue over LAN.</p>
            <div className="space-y-3">
              <select value={selectedPeerCabin} onChange={(e) => setSelectedPeerCabin(Number(e.target.value))}
                className="w-full bg-slate-900 border border-emerald-900/60 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400">
                {Array.from({ length: 25 }).map((_, i) => { const n = i + 1; if (n === cabinNumber) return null; return <option key={n} value={n}>Cabin {String(n).padStart(2, '0')}</option>; })}
              </select>
              <button onClick={() => onStartCall(selectedPeerCabin, 'VIDEO')} className="btn-primary w-full text-xs py-2.5">
                <Video className="w-4 h-4" /><span>Connect to Cabin {String(selectedPeerCabin).padStart(2, '0')}</span>
              </button>
            </div>
          </div>
          <div className="glass-card p-4 border-emerald-900/40">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 mb-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /><span>Lab Acceptable Use Policy</span></div>
            <p className="text-[11px] text-slate-400 leading-relaxed">Workstations are supervised by the professor for pronunciation assessment and lab safety, as acknowledged at login.</p>
          </div>
        </div>
      </div>

      {broadcast && (
        <BroadcastViewerModal
          professorSocketId={broadcast.professorSocketId}
          cabinNumber={cabinNumber}
          title={broadcast.title}
          onClose={() => setBroadcast(null)}
          language={language}
        />
      )}
    </div>
  );
};
