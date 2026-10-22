import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Language } from '../types';

interface IncomingCallToastProps {
  fromName: string;
  fromCabin?: number;
  callType: 'VIDEO' | 'AUDIO';
  onAccept: () => void;
  onReject: () => void;
  language: Language;
}

// A compact corner pill so the professor's desktop/monitoring stays usable
// while a student is calling (does NOT block the screen like a modal).
export const IncomingCallToast: React.FC<IncomingCallToastProps> = ({
  fromName, fromCabin, callType, onAccept, onReject, language,
}) => {
  const isArabic = language === 'ar';
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Soft periodic ring using WebAudio (no asset dependency)
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ring = () => {
      try {
        const ctx = new Ctx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 460;
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.9);
        setTimeout(() => ctx.close().catch(() => {}), 1100);
      } catch { /* noop */ }
    };
    ring();
    ringRef.current = setInterval(ring, 2500);
    return () => { if (ringRef.current) clearInterval(ringRef.current); };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-[60] w-80 glass-panel-elevated border border-amber-500/70 shadow-[0_0_30px_rgba(245,158,11,0.35)] rounded-2xl p-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center justify-center shrink-0">
          {callType === 'VIDEO' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{fromName}</div>
          <div className="text-[11px] text-amber-400 font-mono">
            {isArabic ? 'مكالمة واردة' : 'Incoming'} {callType}
            {fromCabin ? ` • Cabin ${String(fromCabin).padStart(2, '0')}` : ''}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onAccept}
          className="btn-primary flex-1 py-2 text-xs rounded-lg flex items-center justify-center gap-1.5"
        >
          <Phone className="w-3.5 h-3.5" /> {isArabic ? 'قبول' : 'Accept'}
        </button>
        <button
          onClick={onReject}
          className="btn-danger flex-1 py-2 text-xs rounded-lg flex items-center justify-center gap-1.5"
        >
          <PhoneOff className="w-3.5 h-3.5" /> {isArabic ? 'رفض' : 'Reject'}
        </button>
      </div>
    </div>
  );
};
