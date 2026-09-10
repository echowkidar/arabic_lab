import React, { useState, useEffect, useRef } from 'react';
import { User, Language } from '../types';
import {
  Hand, Phone, Video, Mic, Volume2, BookOpen,
  CheckCircle, Radio, Users, ShieldCheck, Camera, CameraOff, RefreshCw
} from 'lucide-react';
import { socket } from '../services/socket';
import { AudioAnalyzer } from '../services/audioAnalyzer';

interface StudentCabinViewProps {
  user: User;
  onStartCall: (targetCabin: number, type: 'VIDEO' | 'AUDIO') => void;
  language: Language;
}

export const StudentCabinView: React.FC<StudentCabinViewProps> = ({
  user,
  onStartCall,
  language,
}) => {
  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';
  const cabinNumber = user.cabinNumber || 1;
  const cabinPad = String(cabinNumber).padStart(2, '0');

  // Interactive Student States
  const [handRaised, setHandRaised] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [selectedPeerCabin, setSelectedPeerCabin] = useState<number>(cabinNumber === 1 ? 2 : 1);
  const [activeExerciseTab, setActiveExerciseTab] = useState<'quran' | 'dialogue' | 'grammar'>('quran');
  const [broadcastActive, setBroadcastActive] = useState<boolean>(false);
  const [_broadcastData, setBroadcastData] = useState<any>(null);

  // Physical Windows Hardware State
  const [isHardwareActive, setIsHardwareActive] = useState(false);
  const [hardwareStream, setHardwareStream] = useState<MediaStream | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');

  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);

  // Listen to professor broadcasts and silent monitor requests
  useEffect(() => {
    socket.on('incoming-broadcast', (data) => {
      setBroadcastActive(true);
      setBroadcastData(data);
    });

    socket.on('broadcast-ended', () => {
      setBroadcastActive(false);
      setBroadcastData(null);
    });

    // Auto-respond to silent monitor from professor
    socket.on('start-silent-stream-to-prof', (data: { professorSocketId: string }) => {
      console.log('📡 Silent monitor stream requested by professor:', data.professorSocketId);
      socket.emit('webrtc-signal', {
        targetSocketId: data.professorSocketId,
        signal: { type: 'silent-stream-ready', cabinNumber },
        type: 'offer',
        streamPurpose: 'monitor',
      });
    });

    return () => {
      socket.off('incoming-broadcast');
      socket.off('broadcast-ended');
      socket.off('start-silent-stream-to-prof');
    };
  }, [cabinNumber]);

  // Fallback simulated mic fluctuation when physical hardware is not turned on
  useEffect(() => {
    if (isHardwareActive) return; // Use real physical hardware when active!

    const interval = setInterval(() => {
      const simulatedLevel = Math.floor(Math.random() * 45) + 8;
      setMicVolume(simulatedLevel);
      socket.emit('audio-level-update', {
        cabinNumber,
        level: simulatedLevel,
      });
    }, 600);

    return () => clearInterval(interval);
  }, [cabinNumber, isHardwareActive]);

  // Connect Physical Windows Webcam & Headphone Microphone
  const handleToggleHardware = async () => {
    if (isHardwareActive) {
      // Stop Hardware
      if (audioAnalyzerRef.current) {
        audioAnalyzerRef.current.stop();
        audioAnalyzerRef.current = null;
      }
      if (hardwareStream) {
        hardwareStream.getTracks().forEach((track) => track.stop());
        setHardwareStream(null);
      }
      setIsHardwareActive(false);
    } else {
      // Start Hardware
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
          video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true,
        });

        setHardwareStream(stream);
        setIsHardwareActive(true);

        if (webcamVideoRef.current) {
          webcamVideoRef.current.srcObject = stream;
        }

        // Start live audio analyzer on the real physical headset microphone
        const analyzer = new AudioAnalyzer();
        analyzer.start(stream, (volume) => {
          setMicVolume(volume);
          socket.emit('audio-level-update', {
            cabinNumber,
            level: volume,
          });
        });
        audioAnalyzerRef.current = analyzer;

        // Enumerate detected devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
        setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
      } catch (err: any) {
        console.warn('Physical device error:', err);
        alert('Could not access Windows webcam/headphone: ' + (err.message || 'Permission denied'));
      }
    }
  };

  // Effect to attach hardware stream to video element
  useEffect(() => {
    if (hardwareStream && webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = hardwareStream;
    }
  }, [hardwareStream]);

  // Raise / Lower Hand
  const handleToggleHand = () => {
    if (!handRaised) {
      setHandRaised(true);
      socket.emit('raise-hand', { cabinNumber, studentName: user.name });
    } else {
      setHandRaised(false);
      socket.emit('lower-hand', { cabinNumber });
    }
  };

  // Call Professor
  const handleCallProfessor = () => {
    socket.emit('call-user-request', {
      fromRole: 'STUDENT',
      fromName: user.name,
      fromCabin: cabinNumber,
      callType: 'VIDEO',
      roomId: `prof-call-${cabinNumber}-${Date.now()}`,
    });
    alert(
      isArabic
        ? 'تم إرسال طلب اتصال مباشر للأستاذ'
        : 'Direct call invitation sent to Professor'
    );
  };

  // Connect with Peer Cabin
  const handleConnectPeer = () => {
    onStartCall(selectedPeerCabin, 'VIDEO');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Live Classroom Broadcast Banner if active */}
      {broadcastActive && (
        <div className="glass-panel-elevated p-4 border-amber-500/70 bg-gradient-to-r from-amber-950/80 via-emerald-950/80 to-slate-950/80 flex flex-wrap items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center font-bold">
              <Radio className="w-5 h-5 animate-spin" />
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-300 font-arabic">
                {isArabic ? 'بث مباشر من الأستاذ محمد فيضان بيك (Prof. MOHD FAIZAN BEG)' : 'Live Broadcast from Prof. MOHD FAIZAN BEG'}
              </h3>
              <p className="text-xs text-slate-300">
                {isArabic ? 'الأستاذ يشارك شاشته وشرح الدرس مع جميع الكبائن' : 'Professor is sharing screen and lecture across all cabins'}
              </p>
            </div>
          </div>
          <button
            onClick={() => alert('Broadcast viewer active')}
            className="btn-gold text-xs py-2 px-4"
          >
            {isArabic ? 'مشاهدة البث المباشر' : 'Watch Live Broadcast'}
          </button>
        </div>
      )}

      {/* Student Cabin Header HUD */}
      <div className="glass-panel-elevated p-6 flex flex-wrap items-center justify-between gap-4 border-emerald-500/30">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-900 border-2 border-emerald-400 flex flex-col items-center justify-center shadow-lg">
            <span className="text-[10px] font-mono tracking-wider text-emerald-200 uppercase">Cabin</span>
            <span className="text-2xl font-black font-heading text-white">{cabinPad}</span>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white font-arabic">{user.name}</h2>
              <span className="status-badge status-online">
                <span className="pulse-dot" />
                <span>LAN ACTIVE</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Aligarh Muslim University (AMU) • Department of Arabic Language Lab
            </p>
          </div>
        </div>

        {/* Action Buttons: Raise Hand & Call Professor */}
        <div className="flex items-center gap-3">
          {/* Raise Hand Toggle */}
          <button
            onClick={handleToggleHand}
            className={`text-xs py-2.5 px-4 rounded-xl font-bold flex items-center gap-2 transition-all ${
              handRaised
                ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.5)] animate-bounce'
                : 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900'
            }`}
          >
            <Hand className="w-4 h-4" />
            <span>
              {handRaised
                ? isArabic ? 'اليد مرفوعة (انتظر رد الأستاذ)' : isUrdu ? 'ہاتھ اٹھا ہے (پروفیسر کو مطلع کیا گیا)' : 'Hand Raised (Pending)'
                : isArabic ? 'رفع اليد للاستفسار' : isUrdu ? 'ہاتھ اٹھائیں' : 'Raise Hand'}
            </span>
          </button>

          {/* Call Professor */}
          <button
            onClick={handleCallProfessor}
            className="btn-gold text-xs py-2.5 px-4"
            title="Request 1:1 Video/Audio Call with Professor"
          >
            <Phone className="w-4 h-4 text-black" />
            <span>
              {isArabic ? 'طلب محادثة الأستاذ' : isUrdu ? 'پروفیسر سے کال' : 'Call Professor'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Student Workstation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Arabic Language Exercises & Audio Lab (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Exercise Tabs */}
          <div className="glass-panel p-6">
            <div className="flex items-center justify-between border-b border-emerald-900/50 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white font-arabic">
                  {isArabic ? 'تمارين النطق والمحادثة اليومية' : 'Daily Arabic Practicum & Phonetics'}
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setActiveExerciseTab('quran')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    activeExerciseTab === 'quran'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Phonetics (التجويد)
                </button>
                <button
                  onClick={() => setActiveExerciseTab('dialogue')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    activeExerciseTab === 'dialogue'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Dialogue (الحوار)
                </button>
                <button
                  onClick={() => setActiveExerciseTab('grammar')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    activeExerciseTab === 'grammar'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Grammar (النحو)
                </button>
              </div>
            </div>

            {/* Exercise Content */}
            {activeExerciseTab === 'quran' && (
              <div className="space-y-4">
                <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-right">
                  <span className="text-[11px] font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded mb-3 inline-block font-sans">
                    تمرين مخارج الحروف — حرف الضاد والقاف
                  </span>
                  <p className="text-2xl font-quran leading-relaxed text-emerald-100 my-2">
                    « وَلَا الضَّالِّينَ • قُلْ أَعُوذُ بِرَبِّ الفَلَقِ • مِنْ شَرِّ مَا خَلَقَ »
                  </p>
                  <p className="text-xs text-slate-400 mt-2 font-sans text-left">
                    <strong>Instructions:</strong> Read the verses aloud into your headset. Keep your articulation sharp at the back of the palate.
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-emerald-900/40">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-900/60 text-emerald-400 flex items-center justify-center">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Audio Model Pronunciation</div>
                      <div className="text-[10px] text-slate-400">Master Recitation Sample (0:45)</div>
                    </div>
                  </div>
                  <button
                    onClick={() => alert('Playing pronunciation audio sample...')}
                    className="btn-outline text-xs py-1.5 px-3"
                  >
                    Play Audio Sample
                  </button>
                </div>
              </div>
            )}

            {activeExerciseTab === 'dialogue' && (
              <div className="space-y-3 text-right">
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/40">
                  <div className="text-xs font-bold text-emerald-400 mb-2 font-sans text-left">
                    Role Play: At the International Airport (في المطار الدولي)
                  </div>
                  <div className="space-y-2 text-base font-arabic">
                    <p className="text-amber-200">
                      <strong>الطالب أ:</strong> أَهْلًا وَسَهْلًا، هَلْ هَذِهِ رِحْلَةُ الرِّيَاضِ؟
                    </p>
                    <p className="text-emerald-200">
                      <strong>الطالب ب:</strong> نَعَمْ، يَرْجُو مِنْكَ التَّوَجُّهَ إِلَى البَوَّابَةِ رَقْمِ ٧.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeExerciseTab === 'grammar' && (
              <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/40 space-y-2 text-right">
                <div className="text-xs font-bold text-emerald-400 mb-2 font-sans text-left">
                  Grammar Rule: Subject & Predicate (المبتدأ والخبر)
                </div>
                <p className="text-lg font-arabic text-emerald-200">
                  « اللُّغَةُ العَرَبِيَّةُ جَمِيلَةٌ » — المبتدأ: اللغةُ (مرفوع بالضمة)، الخبر: جميلةٌ.
                </p>
              </div>
            )}
          </div>

          {/* Physical Windows Hardware Connect & Mic Telemetry */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Mic className="w-4 h-4 text-emerald-400" />
                <span>Live Headphone Microphone & Webcam Detection</span>
              </div>

              {/* Hardware Toggle Button */}
              <button
                onClick={handleToggleHardware}
                className={`text-xs py-2 px-3.5 rounded-lg font-bold flex items-center gap-2 transition-all ${
                  isHardwareActive
                    ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                    : 'bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900'
                }`}
              >
                {isHardwareActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                <span>
                  {isHardwareActive
                    ? '✓ Physical Headphone & Webcam Connected'
                    : '🔌 Connect Windows Headphone & Webcam'}
                </span>
              </button>
            </div>

            {/* Hardware Selectors when active */}
            {isHardwareActive && (
              <div className="p-3 bg-black/50 rounded-xl border border-emerald-900/50 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Detected Microphone / Headset:</label>
                  <select
                    value={selectedAudioId}
                    onChange={(e) => setSelectedAudioId(e.target.value)}
                    className="w-full bg-slate-900 border border-emerald-900/60 rounded p-1.5 text-xs text-white"
                  >
                    {audioDevices.length > 0 ? (
                      audioDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Microphone ${i + 1}`}
                        </option>
                      ))
                    ) : (
                      <option value="">Default Windows Headphone Mic</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Detected Webcam:</label>
                  <select
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    className="w-full bg-slate-900 border border-emerald-900/60 rounded p-1.5 text-xs text-white"
                  >
                    {videoDevices.length > 0 ? (
                      videoDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || `Webcam ${i + 1}`}
                        </option>
                      ))
                    ) : (
                      <option value="">Default Windows Camera</option>
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Real-time VU Meter */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
                <span className="text-[11px] font-semibold text-slate-400">
                  {isHardwareActive ? 'Physical Microphone Input Level:' : 'Simulated Voice Level:'}
                </span>
                <span className="font-mono text-emerald-400 font-bold">{micVolume}%</span>
              </div>

              <div className="grid grid-cols-20 gap-1 h-3">
                {Array.from({ length: 20 }).map((_, idx) => {
                  const threshold = (idx + 1) * 5;
                  const active = micVolume >= threshold;
                  return (
                    <div
                      key={idx}
                      className={`h-full rounded-sm transition-all duration-100 ${
                        active
                          ? idx > 15
                            ? 'bg-red-500 shadow-[0_0_6px_#ef4444]'
                            : idx > 11
                            ? 'bg-yellow-400'
                            : 'bg-emerald-400 shadow-[0_0_4px_#34d399]'
                          : 'bg-emerald-950/50'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Live Webcam Preview if hardware active */}
            {isHardwareActive && (
              <div className="flex items-center gap-4 pt-2 border-t border-emerald-900/40">
                <div className="w-28 h-20 bg-black rounded-lg overflow-hidden border border-emerald-500/40 relative shrink-0">
                  <video
                    ref={webcamVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1 right-1 bg-black/80 text-emerald-400 text-[8px] font-bold px-1 rounded">
                    LIVE
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  <div className="font-bold text-white mb-0.5">Physical Webcam Live Preview</div>
                  <p className="text-[11px] text-slate-400">
                    Your camera feed is streaming directly from Windows. Professor can view this in the circular PiP window during silent monitoring or video calls.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Peer Dialogue & AUP Status (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Peer-to-Peer Dialogue Partner */}
          <div className="glass-panel p-5 border-emerald-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white font-arabic">
                {isArabic ? 'محادثة ثنائية مع كابينة أخرى' : 'Peer Dialogue Practice'}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Connect 1:1 with another student cabin to practice Arabic dialogue drills over LAN.
            </p>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 block">
                Select Peer Cabin:
              </label>

              <select
                value={selectedPeerCabin}
                onChange={(e) => setSelectedPeerCabin(Number(e.target.value))}
                className="w-full bg-slate-900 border border-emerald-900/60 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-400"
              >
                {Array.from({ length: 25 }).map((_, i) => {
                  const num = i + 1;
                  if (num === cabinNumber) return null;
                  return (
                    <option key={num} value={num}>
                      Cabin {String(num).padStart(2, '0')}
                    </option>
                  );
                })}
              </select>

              <button
                onClick={handleConnectPeer}
                className="btn-primary w-full text-xs py-2.5"
              >
                <Video className="w-4 h-4" />
                <span>Connect to Cabin {String(selectedPeerCabin).padStart(2, '0')}</span>
              </button>
            </div>
          </div>

          {/* University AUP Policy Consent Box */}
          <div className="glass-card p-4 border-emerald-900/40">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Lab Acceptable Use Policy (AUP)</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              As part of teaching, workstations are monitored by the professor for pronunciation assessment and lab safety.
            </p>
            <div className="mt-3 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Consent Signed on First Login</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
