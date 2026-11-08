import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, RotateCcw, Trash2, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { Language } from '../../types';
import { t } from '../../i18n';
import { getMicStream, stopStream } from '../../services/mediaCapture';
import { AudioAnalyzer } from '../../services/audioAnalyzer';
import { startAudioRecording, ActiveRecording, formatDuration } from '../../services/recorder';
import { uploadStudentRecording } from '../../services/api';
import { useLearnerSession, touchLearner, getLearnerSession } from '../../services/learnerSession';
import { LearnerGate } from './LearnerGate';

const MAX_SEC = 10 * 60;

interface VoiceRecorderProps {
  language: Language;
  onSaved: () => void;
}

type Phase = 'idle' | 'recording' | 'review' | 'saving';

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ language, onSaved }) => {
  const session = useLearnerSession();
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; durationSec: number } | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [needPin, setNeedPin] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<ActiveRecording | null>(null);
  const analyzerRef = useRef<AudioAnalyzer | null>(null);
  const timerRef = useRef<number | null>(null);

  const releaseMic = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    analyzerRef.current?.stop();
    analyzerRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setLevel(0);
  };

  useEffect(() => () => {
    recRef.current?.cancel();
    releaseMic();
    if (take) URL.revokeObjectURL(take.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await getMicStream();
      streamRef.current = stream;
      const analyzer = new AudioAnalyzer();
      analyzer.start(stream, setLevel);
      analyzerRef.current = analyzer;
      recRef.current = startAudioRecording(stream);
      setElapsed(0);
      setPhase('recording');
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setElapsed(s);
        if (s >= MAX_SEC) void stop();
      }, 250);
    } catch {
      setError(t(language, 'micUnavailable'));
    }
  };

  const stop = async () => {
    const rec = recRef.current;
    recRef.current = null;
    if (!rec) return;
    const { blob, durationSec } = await rec.stop();
    releaseMic();
    if (take) URL.revokeObjectURL(take.url);
    setTake({ blob, url: URL.createObjectURL(blob), durationSec });
    setPhase('review');
  };

  const discard = () => {
    if (take) URL.revokeObjectURL(take.url);
    setTake(null);
    setTitle('');
    setPhase('idle');
  };

  const save = async () => {
    if (!take) return;
    if (!getLearnerSession()) { setNeedPin(true); return; }
    setPhase('saving');
    setError(null);
    try {
      await uploadStudentRecording(take.blob, title.trim() || `${t(language, 'voiceRecorder')} ${new Date().toLocaleString()}`, take.durationSec);
      touchLearner();
      URL.revokeObjectURL(take.url);
      setTake(null);
      setTitle('');
      setPhase('idle');
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3500);
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setPhase('review');
      if (e.code === 'PIN_EXPIRED' || e.code === 'PIN_REQUIRED') setNeedPin(true);
    }
  };

  const pct = Math.min(100, (elapsed / MAX_SEC) * 100);

  return (
    <div className="glass-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold text-white">{t(language, 'voiceRecorder')}</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{t(language, 'maxLength')}</span>
      </div>
      <p className="text-xs text-slate-400">{t(language, 'recorderHint')}</p>

      {phase === 'idle' && (
        <div className="flex flex-col items-center py-4">
          <button onClick={start} aria-label={t(language, 'startRecording')}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-rose-700 text-white flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.45)] hover:scale-105 transition-transform">
            <Mic className="w-9 h-9" />
          </button>
          <span className="mt-3 text-sm font-semibold text-slate-200">{t(language, 'startRecording')}</span>
          {savedFlash && (
            <span className="mt-3 text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{t(language, 'saved')}</span>
          )}
        </div>
      )}

      {phase === 'recording' && (
        <div className="flex flex-col items-center py-3 gap-3">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm"><span className="rec-dot" />{t(language, 'recording')}</div>
          <div className="text-4xl font-mono font-black text-white tabular-nums">{formatDuration(elapsed)}</div>
          {/* live input level */}
          <div className="flex items-end gap-1 h-10" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => {
              const h = Math.max(6, Math.min(100, level * (0.55 + ((i * 37) % 10) / 20)));
              return <div key={i} className="w-1.5 rounded-sm bg-emerald-400/90 transition-all duration-100" style={{ height: `${h}%` }} />;
            })}
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-red-500" style={{ width: `${pct}%` }} /></div>
          <button onClick={() => void stop()} className="btn-danger text-sm py-2.5 px-6"><Square className="w-4 h-4" /><span>{t(language, 'stopRecording')}</span></button>
        </div>
      )}

      {(phase === 'review' || phase === 'saving') && take && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{t(language, 'duration')}: <strong className="text-white font-mono">{formatDuration(take.durationSec)}</strong></span>
          </div>
          <audio src={take.url} controls className="w-full" />
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-400">{t(language, 'title')}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t(language, 'titlePlaceholder')}
              className="w-full bg-slate-900/90 border border-emerald-900/60 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400" />
          </label>

          {needPin && !session && (
            <LearnerGate language={language} onUnlocked={() => { setNeedPin(false); void save(); }} />
          )}

          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={phase === 'saving'} className="btn-primary text-xs py-2 px-4 disabled:opacity-50">
              {phase === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{phase === 'saving' ? t(language, 'saving') : t(language, 'save')}</span>
            </button>
            <button onClick={() => { discard(); void start(); }} disabled={phase === 'saving'} className="btn-outline text-xs py-2 px-3"><RotateCcw className="w-4 h-4" /><span>{t(language, 'reRecord')}</span></button>
            <button onClick={discard} disabled={phase === 'saving'} className="btn-outline text-xs py-2 px-3 text-red-300 border-red-500/40"><Trash2 className="w-4 h-4" /><span>{t(language, 'discard')}</span></button>
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2">{error}</div>}
    </div>
  );
};
