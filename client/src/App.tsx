import React, { useState, useEffect, useRef } from 'react';
import { User, Cabin, Recording, ActiveCall, Language } from './types';
import { Navbar } from './components/Navbar';
import { CabinCard } from './components/CabinCard';
import { SilentMonitorModal } from './components/SilentMonitorModal';
import { BroadcastStudioModal } from './components/BroadcastStudioModal';
import { CallModal } from './components/CallModal';
import { IncomingCallToast } from './components/IncomingCallToast';
import { MediaLibraryModal } from './components/professor/MediaLibraryModal';
import { SubmissionsModal } from './components/professor/SubmissionsModal';
import { t } from './i18n';
import { RecordingsModal } from './components/RecordingsModal';
import { AdminModal } from './components/AdminModal';
import { StudentCabinView } from './components/StudentCabinView';
import { LoginView } from './components/LoginView';
import { fetchCabins, fetchRecordings, getMe, listSubmissions } from './services/api';
import { StudentRecording } from './types';
import { socket, connectSocket, disconnectSocket } from './services/socket';
import { Search, PhoneCall, Hand } from 'lucide-react';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('arabic_lab_token'));
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [language, setLanguage] = useState<Language>('en');

  const [activeMonitorCabin, setActiveMonitorCabin] = useState<Cabin | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [submissionsOpen, setSubmissionsOpen] = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState(0);
  const [submissionToast, setSubmissionToast] = useState<StudentRecording | null>(null);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  activeCallRef.current = activeCall;
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const showCallNotice = (msg: string) => {
    setCallNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setCallNotice(null), 5000);
  };

  // Outgoing call that nobody answers: stop ringing after 45s.
  useEffect(() => {
    if (!activeCall || !activeCall.isCaller || activeCall.accepted) return;
    const roomId = activeCall.roomId;
    const t = window.setTimeout(() => {
      if (activeCallRef.current?.roomId !== roomId || activeCallRef.current.accepted) return;
      socket.emit('call-ended', { roomId });
      setActiveCall(null);
      showCallNotice('No answer.');
    }, 45000);
    return () => clearTimeout(t);
  }, [activeCall?.roomId, activeCall?.accepted]);
  const [raisedHandsAlert, setRaisedHandsAlert] = useState<{ cabinNumber: number; studentName: string }[]>([]);

  const [filterType, setFilterType] = useState<'ALL' | 'ONLINE' | 'SPEAKING' | 'HANDS' | 'INCALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (token) {
      getMe()
        .then((res) => { setUser(res.user); connectSocket(res.user); })
        .catch(() => { localStorage.removeItem('arabic_lab_token'); setUser(null); setToken(null); });
    }
  }, [token]);

  const loadLabData = async () => {
    try {
      const [c, r] = await Promise.all([
        fetchCabins(),
        user && user.role !== 'STUDENT' ? fetchRecordings() : Promise.resolve([] as Recording[]),
      ]);
      setCabins(c);
      setRecordings(r);
    } catch (err) {
      console.warn('Data load error:', err);
    }
  };

  useEffect(() => { if (user) loadLabData(); /* eslint-disable-next-line */ }, [user]);

  // Pending student submissions (badge on the professor's navbar)
  const refreshPending = async () => {
    if (!user || user.role === 'STUDENT') return;
    try { setPendingSubmissions((await listSubmissions('PENDING')).length); } catch { /* noop */ }
  };
  useEffect(() => {
    if (!user || user.role === 'STUDENT') return;
    void refreshPending();
    const onNew = (d: { recording: StudentRecording }) => {
      setPendingSubmissions((n) => n + 1);
      setSubmissionToast(d.recording);
      playChime();
      window.setTimeout(() => setSubmissionToast((cur) => (cur?.id === d.recording.id ? null : cur)), 8000);
    };
    const onRemoved = () => { void refreshPending(); };
    socket.on('submission:new', onNew);
    socket.on('submission:removed', onRemoved);
    return () => { socket.off('submission:new', onNew); socket.off('submission:removed', onRemoved); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const playChime = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.5);
      setTimeout(() => ctx.close().catch(() => {}), 700);
    } catch { /* noop */ }
  };

  // Tell the current peer we're leaving (used before switching to another call).
  const endCurrentCall = () => {
    const cur = activeCallRef.current;
    if (!cur) return;
    socket.emit('call-ended', {
      targetSocketId: cur.peerSocketId,
      cabinNumber: cur.peerCabin || user?.cabinNumber || undefined,
      roomId: cur.roomId,
    });
  };

  const acceptCall = (callData: any) => {
    if (activeCallRef.current && activeCallRef.current.roomId !== callData.roomId) endCurrentCall();
    socket.emit('call-response', {
      accepted: true,
      callerSocketId: callData.fromSocketId,
      roomId: callData.roomId,
      responderName: user?.name || 'User',
      responderCabin: user?.cabinNumber || undefined,
    });
    setActiveCall({
      roomId: callData.roomId,
      peerSocketId: callData.fromSocketId,
      peerName: callData.fromName,
      peerCabin: callData.fromCabin,
      peerRole: callData.fromRole,
      callType: callData.callType,
      isCaller: false,
    });
    setIncomingCall(null);
  };

  useEffect(() => {
    if (!user) return;

    socket.on('incoming-call', (callData) => {
      // Student receiving a PROFESSOR call -> auto-accept (no clicking needed).
      if (user.role === 'STUDENT' && callData.fromRole === 'PROFESSOR') {
        acceptCall(callData);
        return;
      }
      // Everyone else -> small non-intrusive toast (desktop stays usable).
      setIncomingCall(callData);
      playChime();
    });

    socket.on('call-response-received', (data: { accepted: boolean; responderSocketId: string; roomId: string; responderName: string; reason?: string }) => {
      if (data.accepted) {
        setActiveCall((prev) => (prev && prev.roomId === data.roomId ? { ...prev, peerSocketId: data.responderSocketId, accepted: true } : prev));
      } else {
        if (activeCallRef.current?.roomId === data.roomId) {
          showCallNotice(data.reason === 'UNAVAILABLE'
            ? 'Call could not connect — the other side is offline or unavailable.'
            : 'Call was declined.');
        }
        setActiveCall((prev) => (prev && prev.roomId === data.roomId ? null : prev));
      }
    });

    socket.on('call-ended-by-peer', (data: { roomId?: string }) => {
      setActiveCall((prev) => {
        if (!prev) return null;
        if (data?.roomId && prev.roomId !== data.roomId) return prev; // not our call
        return null;
      });
      setIncomingCall((prev: any) => (prev && data?.roomId && prev.roomId !== data.roomId ? prev : null));
    });

    // Caller hung up before we answered, or another professor already took it.
    socket.on('call-dismiss', (data: { roomId: string }) => {
      setIncomingCall((prev: any) => (prev && prev.roomId === data?.roomId ? null : prev));
    });

    socket.on('hand-raised', (data) => {
      const n = Number(data.cabinNumber);
      playChime();
      setRaisedHandsAlert((prev) => (prev.some((h) => Number(h.cabinNumber) === n) ? prev : [...prev, { ...data, cabinNumber: n }]));
      setCabins((prev) => prev.map((c) => (Number(c.cabinNumber) === n ? { ...c, handRaised: true } : c)));
    });

    socket.on('hand-lowered', (data) => {
      const n = Number(data.cabinNumber);
      setRaisedHandsAlert((prev) => prev.filter((h) => Number(h.cabinNumber) !== n));
      setCabins((prev) => prev.map((c) => (Number(c.cabinNumber) === n ? { ...c, handRaised: false } : c)));
    });

    socket.on('cabin-snapshot', (snapshot: Record<number, any>) => {
      setCabins((prev) => prev.map((c) => {
        const live = snapshot[c.cabinNumber];
        if (!live) return c;
        const isOnline = Boolean(live.online);
        return {
          ...c, online: isOnline,
          status: !c.student?.isActive ? 'DISABLED' : isOnline ? (live.inCall ? 'IN_CALL' : 'ONLINE') : 'OFFLINE',
          socketId: live.socketId, audioLevel: live.audioLevel || 0,
          inCall: Boolean(live.inCall), handRaised: Boolean(live.handRaised),
          screenData: live.screenData || c.screenData,
          isScreenShared: Boolean(live.isScreenShared), isWebcamActive: Boolean(live.isWebcamActive),
        };
      }));
    });

    socket.on('cabin-updated', (u: any) => {
      setCabins((prev) => prev.map((c) => {
        if (c.cabinNumber !== u.cabinNumber) return c;
        const isOnline = Boolean(u.online);
        return {
          ...c, ...u, online: isOnline,
          screenData: isOnline ? (u.screenData || c.screenData) : null,
          status: !c.student?.isActive ? 'DISABLED' : isOnline ? (u.inCall ? 'IN_CALL' : 'ONLINE') : 'OFFLINE',
        };
      }));
    });

    socket.on('cabin-audio-level', (data: { cabinNumber: number; level: number }) => {
      setCabins((prev) => prev.map((c) => (c.cabinNumber === data.cabinNumber ? { ...c, audioLevel: data.level, online: true, status: c.inCall ? 'IN_CALL' : 'ONLINE' } : c)));
    });

    socket.on('cabin-screen-update', (data: { cabinNumber: number; screenData: string }) => {
      setCabins((prev) => prev.map((c) => (c.cabinNumber === data.cabinNumber ? { ...c, screenData: data.screenData, isScreenShared: true, online: true, status: c.inCall ? 'IN_CALL' : 'ONLINE' } : c)));
    });

    return () => {
      socket.off('incoming-call'); socket.off('call-response-received'); socket.off('call-ended-by-peer'); socket.off('call-dismiss');
      socket.off('hand-raised'); socket.off('hand-lowered'); socket.off('cabin-snapshot');
      socket.off('cabin-updated'); socket.off('cabin-audio-level'); socket.off('cabin-screen-update');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleLoginSuccess = (u: User, t: string) => { setUser(u); setToken(t); connectSocket(u); };
  const handleLogout = () => { endCurrentCall(); disconnectSocket(); localStorage.removeItem('arabic_lab_token'); setUser(null); setToken(null); setActiveCall(null); setActiveMonitorCabin(null); };

  const handleStartCall = (target: Cabin | number | 'PROFESSOR', type: 'VIDEO' | 'AUDIO') => {
    endCurrentCall();
    if (target === 'PROFESSOR') {
      const roomId = `prof-call-${user?.cabinNumber || 1}-${Date.now()}`;
      setActiveCall({ roomId, peerSocketId: '', peerName: 'Professor', peerRole: 'PROFESSOR', callType: type, isCaller: true });
      socket.emit('call-user-request', { fromRole: 'STUDENT', fromName: user?.name || `Cabin ${user?.cabinNumber || 1}`, fromCabin: user?.cabinNumber || 1, callType: type, roomId });
      return;
    }
    const cabinNum = typeof target === 'number' ? target : target.cabinNumber;
    const targetCabin = cabins.find((c) => c.cabinNumber === cabinNum);
    const roomId = `room-c${cabinNum}-${Date.now()}`;
    setActiveCall({ roomId, peerSocketId: targetCabin?.socketId || '', peerName: targetCabin?.student?.name || `Cabin ${cabinNum}`, peerCabin: cabinNum, peerRole: 'STUDENT', callType: type, isCaller: true });
    socket.emit('call-user-request', { fromRole: user?.role || 'PROFESSOR', fromName: user?.name || 'Professor', targetCabin: cabinNum, targetSocketId: targetCabin?.socketId, callType: type, roomId });
    if (activeMonitorCabin) setActiveMonitorCabin(null);
  };

  const rejectIncoming = () => {
    if (!incomingCall) return;
    socket.emit('call-response', { accepted: false, callerSocketId: incomingCall.fromSocketId, roomId: incomingCall.roomId, responderName: user?.name || 'User' });
    setIncomingCall(null);
  };

  if (!user) {
    return <LoginView onLoginSuccess={handleLoginSuccess} language={language} onSelectLanguage={setLanguage} />;
  }

  const filteredCabins = cabins.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(c.student?.name?.toLowerCase().includes(q) || `cabin ${c.cabinNumber}`.includes(q) || `c-${c.cabinNumber}`.includes(q))) return false;
    }
    if (filterType === 'ONLINE') return c.online;
    if (filterType === 'SPEAKING') return c.audioLevel > 20;
    if (filterType === 'HANDS') return c.handRaised;
    if (filterType === 'INCALL') return c.inCall;
    return true;
  });

  const isArabic = language === 'ar';
  const isRtl = isArabic || language === 'ur';

  return (
    <div className={`min-h-screen p-4 md:p-6 pb-16 ${isRtl ? 'font-arabic' : 'font-sans'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <Navbar
        user={user} onLogout={handleLogout}
        onOpenBroadcast={user.role === 'PROFESSOR' ? () => setBroadcastOpen(true) : undefined}
        onOpenMedia={user.role !== 'STUDENT' ? () => setMediaOpen(true) : undefined}
        onOpenSubmissions={user.role !== 'STUDENT' ? () => { setSubmissionsOpen(true); setSubmissionToast(null); } : undefined}
        pendingSubmissions={pendingSubmissions}
        onOpenRecordings={() => setRecordingsOpen(true)}
        onOpenAdmin={user.role !== 'STUDENT' ? () => setAdminOpen(true) : undefined}
        recordingsCount={recordings.length}
        language={language} onSelectLanguage={setLanguage}
      />

      {raisedHandsAlert.length > 0 && user.role !== 'STUDENT' && (
        <div className="mb-6 p-3 rounded-xl bg-gradient-to-r from-amber-950 to-orange-950 border border-orange-500/60 shadow-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Hand className="w-5 h-5 text-orange-400" />
            <div>
              <span className="text-xs font-bold text-white">{isArabic ? 'طلاب يطلبون المساعدة:' : 'Students Requesting Assistance:'}</span>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {raisedHandsAlert.map((h) => (
                  <button key={h.cabinNumber} onClick={() => { const c = cabins.find((x) => x.cabinNumber === h.cabinNumber); if (c) handleStartCall(c, 'VIDEO'); }}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-orange-600 text-white font-bold hover:bg-orange-500">
                    Cabin {String(h.cabinNumber).padStart(2, '0')} ({h.studentName})
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={() => setRaisedHandsAlert([])} className="btn-outline text-xs py-1 px-3 text-orange-300">{isArabic ? 'إغلاق' : 'Dismiss'}</button>
        </div>
      )}

      {incomingCall && (
        <IncomingCallToast
          fromName={incomingCall.fromName}
          fromCabin={incomingCall.fromCabin}
          callType={incomingCall.callType}
          onAccept={() => acceptCall(incomingCall)}
          onReject={rejectIncoming}
          language={language}
        />
      )}

      {submissionToast && !submissionsOpen && (
        <button onClick={() => { setSubmissionsOpen(true); setSubmissionToast(null); }}
          className="fixed top-5 right-5 z-[70] w-80 text-left glass-panel-elevated border border-cyan-400/70 shadow-[0_0_30px_rgba(34,211,238,0.3)] rounded-2xl p-4 hover:border-cyan-300 transition-all">
          <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wide">{t(language, 'newSubmission')}</div>
          <div className="text-sm font-bold text-white mt-1 truncate">
            {submissionToast.cabinNumber ? `${t(language, 'cabin')} ${String(submissionToast.cabinNumber).padStart(2, '0')} · ` : ''}{submissionToast.learner?.name}
          </div>
          <div className="text-[11px] text-slate-400 truncate">{t(language, 'rollNo')} {submissionToast.learner?.rollNo} · {submissionToast.title}</div>
        </button>
      )}

      {callNotice && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-xl bg-slate-900/95 border border-amber-500/60 text-xs text-amber-200 shadow-xl">
          {callNotice}
        </div>
      )}

      {user.role === 'STUDENT' ? (
        <StudentCabinView user={user} onStartCall={(t, ty) => handleStartCall(t, ty)} language={language} />
      ) : (
        <main className="space-y-6">
          <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2"><span className="font-heading font-black text-lg text-emerald-400">25</span><span className="text-slate-400">{isArabic ? 'إجمالي الكبائن' : 'Total Cabins'}</span></div>
              <div className="h-4 w-px bg-emerald-900/60" />
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold"><span className="pulse-dot" /><span>{cabins.filter((c) => c.online).length} {isArabic ? 'متصل' : 'Active'}</span></div>
              <div className="h-4 w-px bg-emerald-900/60" />
              <div className="flex items-center gap-1.5 text-yellow-400 font-semibold"><span>🎙️ {cabins.filter((c) => c.audioLevel > 20).length} {isArabic ? 'يتحدثون' : 'Speaking'}</span></div>
            </div>
            <div className="flex items-center flex-wrap gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isArabic ? 'بحث...' : 'Search cabin or student...'}
                  className="pl-8 pr-3 py-1.5 bg-slate-900/90 border border-emerald-900/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 w-44" />
              </div>
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-emerald-900/50 text-xs">
                {(['ALL', 'ONLINE', 'SPEAKING', 'HANDS', 'INCALL'] as const).map((t) => (
                  <button key={t} onClick={() => setFilterType(t)}
                    className={`px-2.5 py-1 rounded font-semibold transition-all ${filterType === t ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
                    {t === 'ALL' ? (isArabic ? 'الكل' : 'All 25') : t === 'ONLINE' ? (isArabic ? 'متصل' : 'Online') : t === 'SPEAKING' ? (isArabic ? 'صوت' : 'Speaking') : t === 'HANDS' ? (isArabic ? 'أيدي' : 'Hands') : (isArabic ? 'مكالمة' : 'In Call')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section className="cabin-grid">
            {filteredCabins.map((cabin) => (
              <CabinCard key={cabin.cabinNumber} cabin={cabin} onMonitor={(c) => setActiveMonitorCabin(c)} onCall={(c, type) => handleStartCall(c, type)} language={language} />
            ))}
          </section>
        </main>
      )}

      {activeMonitorCabin && user && (
        <SilentMonitorModal
          cabin={cabins.find((c) => c.cabinNumber === activeMonitorCabin.cabinNumber) || activeMonitorCabin}
          currentUser={user}
          onClose={() => setActiveMonitorCabin(null)}
          onNextCabin={() => { const n = (activeMonitorCabin.cabinNumber % 25) + 1; setActiveMonitorCabin(cabins.find((c) => c.cabinNumber === n) || { ...activeMonitorCabin, cabinNumber: n }); }}
          onPrevCabin={() => { const n = activeMonitorCabin.cabinNumber === 1 ? 25 : activeMonitorCabin.cabinNumber - 1; setActiveMonitorCabin(cabins.find((c) => c.cabinNumber === n) || { ...activeMonitorCabin, cabinNumber: n }); }}
          onStartCall={(c, type) => handleStartCall(c, type)}
          language={language}
        />
      )}

      {broadcastOpen && <BroadcastStudioModal currentUser={user || undefined} onClose={() => setBroadcastOpen(false)} language={language} />}
      {mediaOpen && <MediaLibraryModal cabins={cabins} onClose={() => setMediaOpen(false)} language={language} />}
      {submissionsOpen && <SubmissionsModal onClose={() => { setSubmissionsOpen(false); void refreshPending(); }} language={language} />}
      {/* key: a new call always gets a fresh CallModal (new media + peer) */}
      {activeCall && user && <CallModal key={activeCall.roomId} call={activeCall} currentUser={user} onEndCall={() => setActiveCall(null)} language={language} />}
      {recordingsOpen && <RecordingsModal recordings={recordings} onClose={() => setRecordingsOpen(false)} onRefresh={loadLabData} language={language} />}
      {adminOpen && <AdminModal onClose={() => setAdminOpen(false)} language={language} />}
    </div>
  );
}

export default App;
