import React, { useState, useEffect, useRef } from 'react';
import { User, Cabin, Recording, ActiveCall, Language } from './types';
import { Navbar } from './components/Navbar';
import { CabinCard } from './components/CabinCard';
import { SilentMonitorModal } from './components/SilentMonitorModal';
import { BroadcastStudioModal } from './components/BroadcastStudioModal';
import { CallModal } from './components/CallModal';
import { RecordingsModal } from './components/RecordingsModal';
import { AdminModal } from './components/AdminModal';
import { StudentCabinView } from './components/StudentCabinView';
import { LoginView } from './components/LoginView';
import { fetchCabins, fetchRecordings, getMe } from './services/api';
import { socket, connectSocket, disconnectSocket } from './services/socket';
import { Search, Filter, Phone, PhoneCall, Check, X, Bell, Hand } from 'lucide-react';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('arabic_lab_token'));
  const [cabins, setCabins] = useState<Cabin[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [language, setLanguage] = useState<Language>('en');

  // Modals & States
  const [activeMonitorCabin, setActiveMonitorCabin] = useState<Cabin | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [recordingsOpen, setRecordingsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const [raisedHandsAlert, setRaisedHandsAlert] = useState<{ cabinNumber: number; studentName: string }[]>([]);

  // Filters
  const [filterType, setFilterType] = useState<'ALL' | 'ONLINE' | 'SPEAKING' | 'HANDS' | 'INCALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [simulationActive, setSimulationActive] = useState(false);

  // Restore session
  useEffect(() => {
    if (token) {
      getMe()
        .then((res) => {
          setUser(res.user);
          connectSocket(res.user);
        })
        .catch(() => {
          localStorage.removeItem('arabic_lab_token');
          setUser(null);
          setToken(null);
        });
    }
  }, [token]);

  // Fetch initial Cabins & Recordings
  const loadLabData = async () => {
    try {
      const [c, r] = await Promise.all([fetchCabins(), fetchRecordings()]);
      setCabins(c);
      setRecordings(r);
    } catch (err) {
      console.warn('Data load error:', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadLabData();
    }
  }, [user]);

  // Socket Event Subscriptions
  useEffect(() => {
    if (!user) return;

    // Incoming Call Receiver
    socket.on('incoming-call', (callData) => {
      setIncomingCall(callData);
    });

    socket.on('call-ended-by-peer', () => {
      setActiveCall(null);
      setIncomingCall(null);
    });

    // Hand Raised Alert for Professor
    socket.on('hand-raised', (data) => {
      setRaisedHandsAlert((prev) => {
        if (prev.some((h) => h.cabinNumber === data.cabinNumber)) return prev;
        return [...prev, data];
      });
      setCabins((prev) =>
        prev.map((c) =>
          c.cabinNumber === data.cabinNumber ? { ...c, handRaised: true } : c
        )
      );
    });

    socket.on('hand-lowered', (data) => {
      setRaisedHandsAlert((prev) => prev.filter((h) => h.cabinNumber !== data.cabinNumber));
      setCabins((prev) =>
        prev.map((c) =>
          c.cabinNumber === data.cabinNumber ? { ...c, handRaised: false } : c
        )
      );
    });

    // Cabin Status Updates
    socket.on('cabin-updated', (updatedCabin: any) => {
      setCabins((prev) =>
        prev.map((c) => (c.cabinNumber === updatedCabin.cabinNumber ? { ...c, ...updatedCabin } : c))
      );
    });

    socket.on('cabin-audio-level', (data: { cabinNumber: number; level: number }) => {
      setCabins((prev) =>
        prev.map((c) =>
          c.cabinNumber === data.cabinNumber ? { ...c, audioLevel: data.level } : c
        )
      );
    });

    return () => {
      socket.off('incoming-call');
      socket.off('call-ended-by-peer');
      socket.off('hand-raised');
      socket.off('hand-lowered');
      socket.off('cabin-updated');
      socket.off('cabin-audio-level');
    };
  }, [user]);

  // Simulated 25-Cabin Activity Loop (for realistic demo)
  useEffect(() => {
    if (!simulationActive) {
      if (user && user.role !== 'STUDENT') {
        loadLabData();
      }
      return;
    }
    if (!user || user.role === 'STUDENT') return;

    const interval = setInterval(() => {
      setCabins((prev) =>
        prev.map((c) => {
          // Keep active/online for simulation
          const isSpeakingNow = Math.random() > 0.65;
          const randomLevel = isSpeakingNow ? Math.floor(Math.random() * 70) + 20 : Math.floor(Math.random() * 12);
          return {
            ...c,
            online: true,
            status: c.inCall ? 'IN_CALL' : 'ONLINE',
            audioLevel: randomLevel,
            isWebcamActive: true,
          };
        })
      );
    }, 800);

    return () => clearInterval(interval);
  }, [simulationActive, user]);

  const handleToggleSimulation = () => {
    setSimulationActive((prev) => {
      const next = !prev;
      if (!next) {
        loadLabData();
      }
      return next;
    });
  };

  const handleLoginSuccess = (loggedInUser: User, loggedInToken: string) => {
    setUser(loggedInUser);
    setToken(loggedInToken);
    connectSocket(loggedInUser);
  };

  const handleLogout = () => {
    disconnectSocket();
    localStorage.removeItem('arabic_lab_token');
    setUser(null);
    setToken(null);
    setActiveCall(null);
    setActiveMonitorCabin(null);
  };

  // Call Handlers
  const handleStartCall = (targetCabin: Cabin | number, type: 'VIDEO' | 'AUDIO') => {
    const cabinNum = typeof targetCabin === 'number' ? targetCabin : targetCabin.cabinNumber;
    const target = cabins.find((c) => c.cabinNumber === cabinNum);

    const call: ActiveCall = {
      roomId: `room-c${cabinNum}-${Date.now()}`,
      peerSocketId: target?.socketId || 'peer-socket',
      peerName: target?.student?.name || `Cabin ${cabinNum}`,
      peerCabin: cabinNum,
      peerRole: 'STUDENT',
      callType: type,
      isCaller: true,
    };

    socket.emit('call-user-request', {
      fromRole: user?.role || 'PROFESSOR',
      fromName: user?.name || 'Professor',
      targetCabin: cabinNum,
      callType: type,
      roomId: call.roomId,
    });

    setActiveCall(call);
    if (activeMonitorCabin) setActiveMonitorCabin(null);
  };

  const handleAcceptIncomingCall = () => {
    if (!incomingCall) return;
    socket.emit('call-response', {
      accepted: true,
      callerSocketId: incomingCall.fromSocketId,
      roomId: incomingCall.roomId,
      responderName: user?.name || 'User',
      responderCabin: user?.cabinNumber || undefined,
    });

    setActiveCall({
      roomId: incomingCall.roomId,
      peerSocketId: incomingCall.fromSocketId,
      peerName: incomingCall.fromName,
      peerCabin: incomingCall.fromCabin,
      peerRole: incomingCall.fromRole,
      callType: incomingCall.callType,
      isCaller: false,
    });
    setIncomingCall(null);
  };

  const handleRejectIncomingCall = () => {
    if (!incomingCall) return;
    socket.emit('call-response', {
      accepted: false,
      callerSocketId: incomingCall.fromSocketId,
      roomId: incomingCall.roomId,
      responderName: user?.name || 'User',
    });
    setIncomingCall(null);
  };

  if (!user) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        language={language}
        onSelectLanguage={(lang) => setLanguage(lang)}
      />
    );
  }

  // Filter cabins
  const filteredCabins = cabins.filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const nameMatch = c.student?.name?.toLowerCase().includes(q);
      const cabinMatch = `cabin ${c.cabinNumber}`.includes(q) || `c-${c.cabinNumber}`.includes(q);
      if (!nameMatch && !cabinMatch) return false;
    }

    if (filterType === 'ONLINE') return c.online;
    if (filterType === 'SPEAKING') return c.audioLevel > 20;
    if (filterType === 'HANDS') return c.handRaised;
    if (filterType === 'INCALL') return c.inCall;
    return true;
  });

  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';
  const isRtl = isArabic || isUrdu;

  return (
    <div className={`min-h-screen p-4 md:p-6 pb-16 ${isRtl ? 'font-arabic' : 'font-sans'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Navigation */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        onOpenBroadcast={user.role === 'PROFESSOR' ? () => setBroadcastOpen(true) : undefined}
        onOpenRecordings={() => setRecordingsOpen(true)}
        onOpenAdmin={user.role !== 'STUDENT' ? () => setAdminOpen(true) : undefined}
        recordingsCount={recordings.length}
        simulationActive={simulationActive}
        onToggleSimulation={handleToggleSimulation}
        language={language}
        onSelectLanguage={(lang) => setLanguage(lang)}
      />

      {/* Global Hand Raised Notification Toast */}
      {raisedHandsAlert.length > 0 && user.role !== 'STUDENT' && (
        <div className="mb-6 p-3 rounded-xl bg-gradient-to-r from-amber-950 to-orange-950 border border-orange-500/60 shadow-xl flex items-center justify-between gap-4 animate-bounce">
          <div className="flex items-center gap-3">
            <Hand className="w-5 h-5 text-orange-400" />
            <div>
              <span className="text-xs font-bold text-white">
                {isArabic ? 'طلاب يطلبون الاستفسار ومساعدة الأستاذ:' : 'Students Requesting Assistance:'}
              </span>
              <div className="flex items-center gap-2 mt-1">
                {raisedHandsAlert.map((h) => (
                  <span
                    key={h.cabinNumber}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-orange-600 text-white font-bold"
                  >
                    Cabin {String(h.cabinNumber).padStart(2, '0')} ({h.studentName})
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setRaisedHandsAlert([])}
            className="btn-outline text-xs py-1 px-3 text-orange-300"
          >
            {isArabic ? 'إغلاق التنبيه' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Incoming Call Overlay Modal */}
      {incomingCall && (
        <div className="modal-backdrop">
          <div className="glass-panel-elevated p-6 max-w-md w-full text-center border-yellow-500/60 animate-pulse">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/50 flex items-center justify-center mx-auto mb-4 text-2xl">
              <PhoneCall className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-lg font-bold text-white">{incomingCall.fromName}</h3>
            <p className="text-xs text-amber-400 mt-1">
              Incoming {incomingCall.callType} Call {incomingCall.fromCabin ? `from Cabin ${incomingCall.fromCabin}` : ''}
            </p>

            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={handleAcceptIncomingCall}
                className="btn-primary py-2.5 px-6 rounded-xl flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Accept</span>
              </button>
              <button
                onClick={handleRejectIncomingCall}
                className="btn-danger py-2.5 px-6 rounded-xl flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                <span>Decline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROLE VIEW ROUTING */}
      {user.role === 'STUDENT' ? (
        /* STUDENT VIEW */
        <StudentCabinView
          user={user}
          onStartCall={(targetCabin, type) => handleStartCall(targetCabin, type)}
          language={language}
        />
      ) : (
        /* PROFESSOR / ADMIN CONSOLE: 25 CABINS SUPERVISION GRID */
        <main className="space-y-6">
          
          {/* Dashboard Summary & Filter HUD */}
          <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-4">
            
            {/* Telemetry Stats */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-lg text-emerald-400">25</span>
                <span className="text-slate-400">{isArabic ? 'إجمالي الكبائن' : 'Total Cabins'}</span>
              </div>
              <div className="h-4 w-px bg-emerald-900/60" />
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="pulse-dot" />
                <span>{cabins.filter((c) => c.online).length} {isArabic ? 'متصل' : 'Active'}</span>
              </div>
              <div className="h-4 w-px bg-emerald-900/60" />
              <div className="flex items-center gap-1.5 text-yellow-400 font-semibold">
                <span>🎙️ {cabins.filter((c) => c.audioLevel > 20).length} {isArabic ? 'يتحدثون' : 'Speaking'}</span>
              </div>
            </div>

            {/* Filter Pills & Search */}
            <div className="flex items-center flex-wrap gap-2.5">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isArabic ? 'بحث بالاسم أو رقم الكابينة...' : 'Search cabin or student...'}
                  className="pl-8 pr-3 py-1.5 bg-slate-900/90 border border-emerald-900/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 w-44"
                />
              </div>

              {/* Filter Buttons */}
              <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-emerald-900/50 text-xs">
                {(['ALL', 'ONLINE', 'SPEAKING', 'HANDS', 'INCALL'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-2.5 py-1 rounded font-semibold transition-all ${
                      filterType === type
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {type === 'ALL' && (isArabic ? 'الكل (25)' : 'All 25')}
                    {type === 'ONLINE' && (isArabic ? 'متصل' : 'Online')}
                    {type === 'SPEAKING' && (isArabic ? 'صوت نشط' : 'Speaking')}
                    {type === 'HANDS' && (isArabic ? 'أيدي مرفوعة' : 'Hands')}
                    {type === 'INCALL' && (isArabic ? 'في مكالمة' : 'In Call')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 25-Cabins Supervision Grid */}
          <section className="cabin-grid">
            {filteredCabins.map((cabin) => (
              <CabinCard
                key={cabin.cabinNumber}
                cabin={cabin}
                onMonitor={(c) => setActiveMonitorCabin(c)}
                onCall={(c, type) => handleStartCall(c, type)}
                language={language}
              />
            ))}
          </section>
        </main>
      )}

      {/* Silent Monitor Modal */}
      {activeMonitorCabin && user && (
        <SilentMonitorModal
          cabin={activeMonitorCabin}
          currentUser={user}
          onClose={() => setActiveMonitorCabin(null)}
          onNextCabin={() => {
            const nextNum = (activeMonitorCabin.cabinNumber % 25) + 1;
            const nextCabin = cabins.find((c) => c.cabinNumber === nextNum);
            if (nextCabin) setActiveMonitorCabin(nextCabin);
          }}
          onPrevCabin={() => {
            const prevNum = activeMonitorCabin.cabinNumber === 1 ? 25 : activeMonitorCabin.cabinNumber - 1;
            const prevCabin = cabins.find((c) => c.cabinNumber === prevNum);
            if (prevCabin) setActiveMonitorCabin(prevCabin);
          }}
          onStartCall={(c, type) => handleStartCall(c, type)}
          language={language}
        />
      )}

      {/* Classroom Broadcast Modal */}
      {broadcastOpen && (
        <BroadcastStudioModal
          currentUser={user || undefined}
          onClose={() => setBroadcastOpen(false)}
          language={language}
        />
      )}

      {/* 1:1 Call Modal */}
      {activeCall && user && (
        <CallModal
          call={activeCall}
          currentUser={user}
          onEndCall={() => setActiveCall(null)}
          language={language}
        />
      )}

      {/* Recordings Library Modal */}
      {recordingsOpen && (
        <RecordingsModal
          recordings={recordings}
          onClose={() => setRecordingsOpen(false)}
          onRefresh={loadLabData}
          language={language}
        />
      )}

      {/* Admin Management Modal */}
      {adminOpen && (
        <AdminModal
          onClose={() => setAdminOpen(false)}
          language={language}
        />
      )}
    </div>
  );
}

export default App;
