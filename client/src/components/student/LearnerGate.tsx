import React, { useState } from 'react';
import { KeyRound, UserPlus, Loader2, ShieldCheck } from 'lucide-react';
import { Language } from '../../types';
import { t } from '../../i18n';
import { registerLearner, unlockLearner } from '../../services/api';
import { setLearnerSession } from '../../services/learnerSession';

interface LearnerGateProps {
  language: Language;
  compact?: boolean;
  onUnlocked?: () => void;
}

// Roll No + PIN form. Cabin PCs are shared across days, so each student's
// recordings are protected by their own PIN, not by the cabin login.
export const LearnerGate: React.FC<LearnerGateProps> = ({ language, compact, onUnlocked }) => {
  const [mode, setMode] = useState<'unlock' | 'register'>('unlock');
  const [rollNo, setRollNo] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && pin !== pin2) { setError(t(language, 'pinMismatch')); return; }
    setBusy(true);
    try {
      const d = mode === 'register' ? await registerLearner(rollNo, name, pin) : await unlockLearner(rollNo, pin);
      setLearnerSession(d.learnerToken, d.learner);
      setPin(''); setPin2('');
      onUnlocked?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full bg-slate-900/90 border border-emerald-900/60 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400';

  return (
    <form onSubmit={submit} className={`space-y-3 ${compact ? '' : 'p-4 rounded-xl bg-emerald-950/30 border border-emerald-900/50'}`} autoComplete="off">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <p className="text-xs text-slate-300">{t(language, 'enterRollPin')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-400">{t(language, 'rollNo')}</span>
          <input value={rollNo} onChange={(e) => setRollNo(e.target.value)} required maxLength={30} className={input} autoFocus />
        </label>
        {mode === 'register' && (
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">{t(language, 'fullName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={input} />
          </label>
        )}
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-400">{t(language, 'pin')}</span>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} required inputMode="numeric"
            type="password" minLength={4} maxLength={6} className={`${input} tracking-[0.4em] font-mono`} autoComplete="new-password" />
        </label>
        {mode === 'register' && (
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">{t(language, 'confirmPin')}</span>
            <input value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} required inputMode="numeric"
              type="password" minLength={4} maxLength={6} className={`${input} tracking-[0.4em] font-mono`} autoComplete="new-password" />
          </label>
        )}
      </div>

      {error && <div className="text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="submit" disabled={busy} className="btn-primary text-xs py-2 px-4 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'register' ? <UserPlus className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
          <span>{mode === 'register' ? t(language, 'register') : t(language, 'unlock')}</span>
        </button>
        <button type="button" onClick={() => { setMode(mode === 'unlock' ? 'register' : 'unlock'); setError(null); }}
          className="text-xs text-emerald-300 hover:text-emerald-100 underline underline-offset-2">
          {mode === 'unlock' ? t(language, 'newStudent') : t(language, 'haveProfile')}
        </button>
      </div>
      <p className="text-[10px] text-slate-500">{t(language, 'lockedAuto')}</p>
    </form>
  );
};
