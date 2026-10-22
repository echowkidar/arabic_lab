import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Repeat, X, Music } from 'lucide-react';
import { Language } from '../types';
import { mediaUrl } from '../services/api';
import { socket } from '../services/socket';

interface PracticePlayerProps {
  url: string;
  name: string;
  mode: 'student' | 'synced';
  language: Language;
  onClose: () => void;
}

// Student-side practice media player. In 'student' mode the student fully
// controls play/pause/repeat/seek locally. In 'synced' mode the professor's
// controls drive playback (teacher-led listening).
export const PracticePlayer: React.FC<PracticePlayerProps> = ({ url, name, mode, language, onClose }) => {
  const isArabic = language === 'ar';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    if (mode !== 'synced') return;
    const onControl = (data: { action: string; time?: number }) => {
      const a = audioRef.current;
      if (!a) return;
      if (data.action === 'play') { if (typeof data.time === 'number') a.currentTime = data.time; a.play().catch(() => {}); }
      else if (data.action === 'pause') a.pause();
      else if (data.action === 'seek' && typeof data.time === 'number') a.currentTime = data.time;
      else if (data.action === 'stop') { a.pause(); a.currentTime = 0; }
    };
    socket.on('media:control', onControl);
    return () => { socket.off('media:control', onControl); };
  }, [mode]);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };
  const restart = () => { const a = audioRef.current; if (!a) return; a.currentTime = 0; a.play().catch(() => {}); };
  const changeRate = () => {
    const seq = [1, 0.75, 0.5, 1.25]; const next = seq[(seq.indexOf(rate) + 1) % seq.length];
    setRate(next); if (audioRef.current) audioRef.current.playbackRate = next;
  };
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="glass-panel-elevated p-4 border-amber-500/60 bg-gradient-to-r from-amber-950/70 to-slate-950/80">
      <audio
        ref={audioRef}
        src={mediaUrl(url)}
        loop={loop}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDur((e.target as HTMLAudioElement).duration || 0)}
      />
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center justify-center shrink-0"><Music className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white truncate">{name}</div>
          <div className="text-[11px] text-amber-400 font-mono">
            {isArabic ? 'مادة الاستماع من الأستاذ' : 'Practice audio from professor'} • {mode === 'synced' ? (isArabic ? 'بقيادة الأستاذ' : 'Teacher-led') : (isArabic ? 'تحكم ذاتي' : 'Self-paced')}
          </div>
        </div>
        <button onClick={onClose} className="btn-icon text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button onClick={toggle} disabled={mode === 'synced'}
          className="w-11 h-11 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg disabled:opacity-40 hover:scale-105 transition-transform">
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button onClick={restart} disabled={mode === 'synced'} title="Repeat from start"
          className="w-9 h-9 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 flex items-center justify-center disabled:opacity-40"><RotateCcw className="w-4 h-4" /></button>
        <button onClick={() => setLoop((l) => !l)} disabled={mode === 'synced'} title="Loop"
          className={`w-9 h-9 rounded-full flex items-center justify-center border ${loop ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-emerald-950 border-emerald-500/40 text-emerald-300'} disabled:opacity-40`}><Repeat className="w-4 h-4" /></button>
        <button onClick={changeRate} disabled={mode === 'synced'} title="Playback speed"
          className="h-9 px-3 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold disabled:opacity-40">{rate}×</button>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 w-10 text-right">{fmt(cur)}</span>
          <input type="range" min={0} max={dur || 0} value={cur} disabled={mode === 'synced'}
            onChange={(e) => { const t = Number(e.target.value); setCur(t); if (audioRef.current) audioRef.current.currentTime = t; }}
            className="flex-1 accent-amber-500" />
          <span className="text-[10px] font-mono text-slate-400 w-10">{fmt(dur)}</span>
        </div>
      </div>
    </div>
  );
};
