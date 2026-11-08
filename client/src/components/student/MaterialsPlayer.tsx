import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Library, Play, Pause, Square, SkipBack, SkipForward, Repeat1, ListMusic, Film, Music, Loader2, Radio } from 'lucide-react';
import { Language, SharedMaterial } from '../../types';
import { t } from '../../i18n';
import { listMySharedMedia, getPlaybackUrl } from '../../services/api';
import { formatDuration } from '../../services/recorder';
import { socket } from '../../services/socket';

interface MaterialsPlayerProps {
  language: Language;
  onNewMaterial?: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25];

export const MaterialsPlayer: React.FC<MaterialsPlayerProps> = ({ language, onNewMaterial }) => {
  const [items, setItems] = useState<SharedMaterial[]>([]);
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [repeatOne, setRepeatOne] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const autoPlayNext = useRef(false);
  const pendingControl = useRef<{ action: string; time?: number } | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const loadedOnce = useRef(false);

  const current = items[index] || null;
  const teacherLed = current?.mode === 'synced';
  const currentIdRef = useRef<string | null>(null);
  currentIdRef.current = current?.media.id ?? null;
  const onNewRef = useRef(onNewMaterial);
  onNewRef.current = onNewMaterial;

  const load = useCallback(async () => {
    try {
      const list = await listMySharedMedia();
      const fresh = list.some((i) => !knownIds.current.has(i.media.id));
      // no toast for what was already there when the page opened
      if (fresh && loadedOnce.current) onNewRef.current?.();
      loadedOnce.current = true;
      knownIds.current = new Set(list.map((i) => i.media.id));
      // keep the current file selected if it is still shared
      const keep = list.findIndex((i) => i.media.id === currentIdRef.current);
      setItems(list);
      setIndex(keep >= 0 ? keep : 0);
    } catch { /* offline - keep the last list */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Professor shared/removed something, or we reconnected after being offline.
  useEffect(() => {
    const refresh = () => { void load(); };
    socket.on('media:shares-updated', refresh);
    socket.on('connect', refresh);
    return () => { socket.off('media:shares-updated', refresh); socket.off('connect', refresh); };
  }, [load]);

  // Signed URL for the selected file
  useEffect(() => {
    if (!current) { setUrl(null); return; }
    let alive = true;
    setLoadingUrl(true);
    setCur(0); setDur(0); setPlaying(false);
    getPlaybackUrl('media', current.media.id)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(null); })
      .finally(() => { if (alive) setLoadingUrl(false); });
    return () => { alive = false; };
  }, [current?.media.id]);

  const applyControl = (action: string, time?: number) => {
    const m = mediaRef.current;
    if (!m) { pendingControl.current = { action, time }; return; }
    if (typeof time === 'number' && Number.isFinite(time)) m.currentTime = time;
    if (action === 'play') m.play().catch(() => {});
    else if (action === 'pause') m.pause();
    else if (action === 'stop') { m.pause(); m.currentTime = 0; }
  };

  // Teacher-led playback commands from the professor
  useEffect(() => {
    const onControl = (d: { mediaId: string; action: string; time?: number }) => {
      const i = items.findIndex((x) => x.media.id === d.mediaId);
      if (i < 0) return;
      if (i !== index) { pendingControl.current = { action: d.action, time: d.time }; setIndex(i); return; }
      applyControl(d.action, d.time);
    };
    socket.on('media:control', onControl);
    return () => { socket.off('media:control', onControl); };
  }, [items, index]);

  const onLoaded = () => {
    const m = mediaRef.current;
    if (!m) return;
    setDur(m.duration || current?.media.durationSec || 0);
    m.playbackRate = rate;
    if (pendingControl.current) {
      const p = pendingControl.current;
      pendingControl.current = null;
      applyControl(p.action, p.time);
    } else if (autoPlayNext.current) {
      autoPlayNext.current = false;
      m.play().catch(() => {});
    }
  };

  const onEnded = () => {
    if (teacherLed) return;
    if (repeatOne) { const m = mediaRef.current; if (m) { m.currentTime = 0; m.play().catch(() => {}); } return; }
    if (continuous && index < items.length - 1) { autoPlayNext.current = true; setIndex(index + 1); }
  };

  const toggle = () => {
    const m = mediaRef.current; if (!m) return;
    if (m.paused) m.play().catch(() => {}); else m.pause();
  };
  const stop = () => { const m = mediaRef.current; if (!m) return; m.pause(); m.currentTime = 0; };
  const go = (i: number) => { if (i < 0 || i >= items.length) return; autoPlayNext.current = playing; setIndex(i); };
  const changeRate = (r: number) => { setRate(r); if (mediaRef.current) mediaRef.current.playbackRate = r; };

  const isVideo = current?.media.kind === 'VIDEO';
  const ctl = 'w-10 h-10 rounded-full flex items-center justify-center border transition-all disabled:opacity-35 disabled:cursor-not-allowed';

  return (
    <div className="glass-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Library className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-white">{t(language, 'labMaterials')}</h3>
          {items.length > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full bg-amber-500 text-black">{items.length}</span>}
        </div>
        {current && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${teacherLed ? 'bg-amber-950 text-amber-300 border-amber-500/50' : 'bg-emerald-950 text-emerald-300 border-emerald-500/40'}`}>
            {teacherLed && <Radio className="w-3 h-3" />}{teacherLed ? t(language, 'teacherLed') : t(language, 'selfPaced')}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">{t(language, 'noMaterials')}</p>
      ) : (
        <>
          {/* Player */}
          <div className="rounded-xl bg-black/50 border border-emerald-900/40 p-3 space-y-3">
            <div className="text-sm font-semibold text-white truncate flex items-center gap-2">
              {isVideo ? <Film className="w-4 h-4 text-cyan-400 shrink-0" /> : <Music className="w-4 h-4 text-amber-400 shrink-0" />}
              {current?.media.title}
            </div>
            {loadingUrl && <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
            {url && (
              <video
                key={url}
                ref={mediaRef}
                src={url}
                playsInline
                preload="metadata"
                className={isVideo ? 'w-full max-h-72 rounded-lg bg-black' : 'hidden'}
                onLoadedMetadata={onLoaded}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setCur((e.target as HTMLVideoElement).currentTime)}
                onEnded={onEnded}
              />
            )}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-400 w-11 text-right">{formatDuration(cur)}</span>
              <input type="range" min={0} max={dur || 0} step={0.1} value={Math.min(cur, dur || 0)} disabled={teacherLed}
                onChange={(e) => { const v = Number(e.target.value); setCur(v); if (mediaRef.current) mediaRef.current.currentTime = v; }}
                className="flex-1 accent-amber-500" aria-label="Seek" />
              <span className="text-[10px] font-mono text-slate-400 w-11">{formatDuration(dur)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button onClick={() => go(index - 1)} disabled={teacherLed || index === 0} className={`${ctl} bg-emerald-950 border-emerald-500/40 text-emerald-300`} title={t(language, 'previous')}><SkipBack className="w-4 h-4" /></button>
              <button onClick={toggle} disabled={teacherLed || !url} className="w-12 h-12 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg disabled:opacity-35 hover:scale-105 transition-transform" title={playing ? t(language, 'pause') : t(language, 'play')}>
                {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button onClick={stop} disabled={teacherLed || !url} className={`${ctl} bg-emerald-950 border-emerald-500/40 text-emerald-300`} title={t(language, 'stop')}><Square className="w-4 h-4" /></button>
              <button onClick={() => go(index + 1)} disabled={teacherLed || index >= items.length - 1} className={`${ctl} bg-emerald-950 border-emerald-500/40 text-emerald-300`} title={t(language, 'next')}><SkipForward className="w-4 h-4" /></button>
              <span className="w-px h-6 bg-emerald-900/60 mx-1" />
              <button onClick={() => setRepeatOne((v) => !v)} disabled={teacherLed} className={`${ctl} ${repeatOne ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-emerald-950 border-emerald-500/40 text-emerald-300'}`} title={t(language, 'repeatOne')} aria-pressed={repeatOne}><Repeat1 className="w-4 h-4" /></button>
              <button onClick={() => setContinuous((v) => !v)} disabled={teacherLed} className={`${ctl} ${continuous ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-emerald-950 border-emerald-500/40 text-emerald-300'}`} title={t(language, 'continuous')} aria-pressed={continuous}><ListMusic className="w-4 h-4" /></button>
              <select value={rate} onChange={(e) => changeRate(Number(e.target.value))} disabled={teacherLed} title={t(language, 'speed')}
                className="h-10 px-2 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold disabled:opacity-35">
                {SPEEDS.map((s) => <option key={s} value={s} className="bg-slate-900">{s}×</option>)}
              </select>
            </div>
            <div className="flex justify-center gap-4 text-[10px] text-slate-500">
              <span>{t(language, 'repeatOne')}: <strong className={repeatOne ? 'text-emerald-300' : ''}>{repeatOne ? 'ON' : 'OFF'}</strong></span>
              <span>{t(language, 'continuous')}: <strong className={continuous ? 'text-emerald-300' : ''}>{continuous ? 'ON' : 'OFF'}</strong></span>
            </div>
          </div>

          {/* Playlist */}
          <ol className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {items.map((it, i) => (
              <li key={it.shareId}>
                <button onClick={() => !teacherLed && go(i)} disabled={teacherLed && i !== index}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${i === index ? 'bg-amber-500/15 border-amber-500/60' : 'bg-slate-900/60 border-emerald-900/40 hover:border-emerald-500/50'}`}>
                  <span className="text-[10px] font-mono text-slate-500 w-5">{i + 1}</span>
                  {it.media.kind === 'VIDEO' ? <Film className="w-4 h-4 text-cyan-400 shrink-0" /> : <Music className="w-4 h-4 text-amber-400 shrink-0" />}
                  <span className="text-xs text-white truncate flex-1">{it.media.title}</span>
                  {it.media.durationSec > 0 && <span className="text-[10px] font-mono text-slate-400">{formatDuration(it.media.durationSec)}</span>}
                  {i === index && playing && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
};
