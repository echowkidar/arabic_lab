import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, Library, Upload, Mic, Square, Send, Trash2, Film, Music, Loader2, CheckCircle2, Users, Radio, Play, Pause,
  RotateCcw, Save, Eye, Share2, Monitor,
} from 'lucide-react';
import { Cabin, Language, MediaItem, MediaShare } from '../../types';
import { t } from '../../i18n';
import {
  listMediaItems, uploadMediaItem, deleteMediaItem, shareMediaItems, listMediaShares, revokeMediaShare,
} from '../../services/api';
import { getMicStream, getScreenStream, mixAudioTracks, stopStream, MixedAudio } from '../../services/mediaCapture';
import { AudioAnalyzer } from '../../services/audioAnalyzer';
import { startAudioRecording, ActiveRecording, formatDuration, formatDateTime, formatSize } from '../../services/recorder';
import { socket } from '../../services/socket';
import { SignedAudio } from '../common/SignedAudio';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface MediaLibraryModalProps {
  cabins: Cabin[];
  language: Language;
  onClose: () => void;
}

type Tab = 'library' | 'record' | 'share' | 'shared';

function fileDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    const done = (v: number) => { URL.revokeObjectURL(url); resolve(Number.isFinite(v) ? Math.round(v) : 0); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    el.src = url;
    setTimeout(() => done(0), 8000);
  });
}

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({ cabins, language, onClose }) => {
  const [tab, setTab] = useState<Tab>('library');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDel, setConfirmDel] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try { setItems(await listMediaItems()); } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { void loadItems(); }, [loadItems]);

  const showFlash = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 3000); };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => /^(audio|video)\//.test(f.type));
    if (!list.length) { setError('Only audio or video files can be uploaded.'); return; }
    setError(null);
    for (const f of list) {
      setUploading(f.name);
      try {
        const durationSec = await fileDuration(f);
        const m = await uploadMediaItem(f, { title: f.name.replace(/\.[^.]+$/, ''), durationSec, source: 'UPLOAD' });
        setSelected((s) => new Set(s).add(m.id));
      } catch (e: any) {
        setError(`${f.name}: ${e.message}`);
      }
    }
    setUploading(null);
    void loadItems();
  };

  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const removeItem = async (m: MediaItem) => {
    setConfirmDel(null);
    try {
      await deleteMediaItem(m.id);
      setSelected((s) => { const n = new Set(s); n.delete(m.id); return n; });
      if (previewId === m.id) setPreviewId(null);
      void loadItems();
    } catch (e: any) { setError(e.message); }
  };

  const tabBtn = (id: Tab, icon: React.ReactNode, label: string, badge?: number) => (
    <button onClick={() => setTab(id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${tab === id ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
      {icon}<span>{label}</span>
      {badge ? <span className="ml-0.5 px-1.5 rounded-full bg-amber-500 text-black text-[10px] font-bold">{badge}</span> : null}
    </button>
  );

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border border-amber-500/40 shadow-2xl">
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center justify-center"><Library className="w-5 h-5" /></div>
            <h2 className="text-lg font-bold text-white">{t(language, 'mediaLibrary')}</h2>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label={t(language, 'close')}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="px-6 py-2 bg-emerald-950/40 border-b border-emerald-900/40 flex flex-wrap items-center gap-1">
          {tabBtn('library', <Library className="w-4 h-4" />, t(language, 'library'), items.length)}
          {tabBtn('record', <Mic className="w-4 h-4" />, t(language, 'recordAudio'))}
          {tabBtn('share', <Send className="w-4 h-4" />, t(language, 'share'), selected.size)}
          {tabBtn('shared', <Share2 className="w-4 h-4" />, t(language, 'activeShares'))}
          {flash && <span className="ml-auto text-xs text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{flash}</span>}
        </div>

        {error && (
          <div className="mx-6 mt-3 text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2 flex justify-between gap-2">
            <span>{error}</span><button onClick={() => setError(null)} className="text-red-200"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'library' && (
            <div className="space-y-4">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); void uploadFiles(e.dataTransfer.files); }}
                className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all ${dragOver ? 'border-amber-400 bg-amber-500/10' : 'border-emerald-800 hover:border-emerald-500 bg-slate-900/40'}`}>
                {uploading ? <Loader2 className="w-7 h-7 text-amber-400 animate-spin" /> : <Upload className="w-7 h-7 text-emerald-400" />}
                <span className="text-sm font-semibold text-white">{uploading ? `${t(language, 'uploading')} ${uploading}` : t(language, 'uploadFiles')}</span>
                <span className="text-xs text-slate-400">{t(language, 'dropHere')} · MP3 · WAV · M4A · WEBM · MP4</span>
                <input type="file" accept="audio/*,video/*" multiple className="hidden" disabled={!!uploading}
                  onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ''; }} />
              </label>

              {items.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">{t(language, 'emptyLibrary')}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{selected.size} {t(language, 'selectedFiles').toLowerCase()}</span>
                    <div className="flex gap-3">
                      <button onClick={() => setSelected(new Set(items.map((i) => i.id)))} className="hover:text-white">{t(language, 'selectAll')}</button>
                      <button onClick={() => setSelected(new Set())} className="hover:text-white">{t(language, 'clear')}</button>
                      {selected.size > 0 && <button onClick={() => setTab('share')} className="btn-gold text-[11px] py-1 px-3"><Send className="w-3.5 h-3.5 text-black" />{t(language, 'share')} ({selected.size})</button>}
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {items.map((m) => {
                      const { date, time } = formatDateTime(m.createdAt);
                      const isSel = selected.has(m.id);
                      return (
                        <li key={m.id} className={`rounded-xl border p-3 transition-all ${isSel ? 'bg-emerald-900/30 border-emerald-500/60' : 'bg-slate-900/60 border-emerald-900/40'}`}>
                          <div className="flex items-center gap-3">
                            <input type="checkbox" checked={isSel} onChange={() => toggleSel(m.id)} className="w-4 h-4 accent-emerald-500" aria-label={m.title} />
                            {m.kind === 'VIDEO' ? <Film className="w-5 h-5 text-cyan-400 shrink-0" /> : <Music className="w-5 h-5 text-amber-400 shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-white font-semibold truncate">{m.title}</div>
                              <div className="flex flex-wrap gap-x-3 text-[10px] text-slate-400 font-mono">
                                <span>{date} {time}</span>
                                {m.durationSec > 0 && <span>{formatDuration(m.durationSec)}</span>}
                                <span>{formatSize(m.sizeBytes)}</span>
                                {m.source === 'PROF_RECORDING' && <span className="text-amber-300">● REC</span>}
                                {!!m._count?.shares && <span className="text-emerald-300">{t(language, 'activeShares')}: {m._count.shares}</span>}
                              </div>
                            </div>
                            <button onClick={() => setPreviewId(previewId === m.id ? null : m.id)} className="btn-icon" title={t(language, 'play')}><Eye className="w-4 h-4" /></button>
                            <button onClick={() => setConfirmDel(m)} className="btn-icon text-red-300" title={t(language, 'delete')}><Trash2 className="w-4 h-4" /></button>
                          </div>
                          {previewId === m.id && <div className="mt-3"><SignedAudio type="media" id={m.id} video={m.kind === 'VIDEO'} autoPlay /></div>}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {tab === 'record' && (
            <ProfessorRecorder language={language} onSaved={(m) => { setSelected((s) => new Set(s).add(m.id)); void loadItems(); showFlash(t(language, 'saved')); setTab('library'); }} />
          )}

          {tab === 'share' && (
            <ShareTab language={language} cabins={cabins} items={items.filter((i) => selected.has(i.id))}
              onShared={() => { showFlash(t(language, 'sharedOk')); setSelected(new Set()); void loadItems(); setTab('shared'); }}
              onPickFiles={() => setTab('library')} />
          )}

          {tab === 'shared' && <SharedTab language={language} />}
        </div>
      </div>

      {confirmDel && (
        <ConfirmDialog language={language} danger message={t(language, 'confirmDeleteMedia')} confirmLabel={t(language, 'delete')}
          onCancel={() => setConfirmDel(null)} onConfirm={() => void removeItem(confirmDel)} />
      )}
    </div>
  );
};

// ---------------- Record tab ----------------
const ProfessorRecorder: React.FC<{ language: Language; onSaved: (m: MediaItem) => void }> = ({ language, onSaved }) => {
  const [withDesktop, setWithDesktop] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'review' | 'saving'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; durationSec: number } | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const streams = useRef<MediaStream[]>([]);
  const mixed = useRef<MixedAudio | null>(null);
  const rec = useRef<ActiveRecording | null>(null);
  const analyzer = useRef<AudioAnalyzer | null>(null);
  const timer = useRef<number | null>(null);

  const release = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    analyzer.current?.stop(); analyzer.current = null;
    mixed.current?.stop(); mixed.current = null;
    streams.current.forEach(stopStream); streams.current = [];
    setLevel(0);
  };
  useEffect(() => () => { rec.current?.cancel(); release(); }, []);

  const start = async () => {
    setError(null);
    try {
      const mic = await getMicStream();
      streams.current.push(mic);
      const tracks = [...mic.getAudioTracks()];
      if (withDesktop) {
        try {
          const scr = await getScreenStream(true);
          streams.current.push(scr);
          scr.getVideoTracks().forEach((v) => v.stop());
          tracks.push(...scr.getAudioTracks());
        } catch { /* desktop audio unavailable - continue with mic */ }
      }
      let source = mic;
      if (tracks.length > 1) {
        mixed.current = mixAudioTracks(tracks);
        if (mixed.current) source = new MediaStream([mixed.current.track]);
      }
      const a = new AudioAnalyzer(); a.start(source, setLevel); analyzer.current = a;
      rec.current = startAudioRecording(source);
      setPhase('recording');
      const t0 = Date.now();
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250);
    } catch {
      setError(t(language, 'micUnavailable'));
    }
  };

  const stop = async () => {
    const r = rec.current; rec.current = null;
    if (!r) return;
    const res = await r.stop();
    release();
    setTake({ ...res, url: URL.createObjectURL(res.blob) });
    setPhase('review');
  };

  const discard = () => { if (take) URL.revokeObjectURL(take.url); setTake(null); setTitle(''); setPhase('idle'); };

  const save = async () => {
    if (!take) return;
    setPhase('saving');
    try {
      const m = await uploadMediaItem(take.blob, {
        title: title.trim() || `Professor recording ${new Date().toLocaleString()}`,
        durationSec: take.durationSec, source: 'PROF_RECORDING', filename: `prof-${Date.now()}.webm`,
      });
      URL.revokeObjectURL(take.url);
      setTake(null); setTitle(''); setPhase('idle');
      onSaved(m);
    } catch (e: any) { setError(e.message); setPhase('review'); }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-4 py-6">
          <button onClick={start} className="w-24 h-24 rounded-full bg-gradient-to-br from-red-500 to-rose-700 text-white flex items-center justify-center shadow-[0_0_35px_rgba(239,68,68,0.45)] hover:scale-105 transition-transform" aria-label={t(language, 'startRecording')}>
            <Mic className="w-10 h-10" />
          </button>
          <span className="text-sm font-semibold text-white">{t(language, 'startRecording')}</span>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={withDesktop} onChange={(e) => setWithDesktop(e.target.checked)} className="w-4 h-4 accent-emerald-500" />
            <Monitor className="w-4 h-4 text-cyan-400" />{t(language, 'includeDesktopAudio')}
          </label>
        </div>
      )}
      {phase === 'recording' && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex items-center gap-2 text-red-400 font-bold"><span className="rec-dot" />{t(language, 'recording')}</div>
          <div className="text-5xl font-mono font-black text-white tabular-nums">{formatDuration(elapsed)}</div>
          <div className="w-full max-w-sm h-3 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-red-500 transition-all duration-100" style={{ width: `${level}%` }} /></div>
          <button onClick={() => void stop()} className="btn-danger text-sm py-2.5 px-6"><Square className="w-4 h-4" />{t(language, 'stopRecording')}</button>
        </div>
      )}
      {(phase === 'review' || phase === 'saving') && take && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">{t(language, 'duration')}: <strong className="text-white font-mono">{formatDuration(take.durationSec)}</strong></div>
          <audio src={take.url} controls className="w-full" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t(language, 'title')}
            className="w-full bg-slate-900 border border-emerald-900/60 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400" />
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={phase === 'saving'} className="btn-primary text-xs py-2 px-4 disabled:opacity-50">
              {phase === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{t(language, 'saveToLibrary')}
            </button>
            <button onClick={() => { discard(); void start(); }} disabled={phase === 'saving'} className="btn-outline text-xs py-2 px-3"><RotateCcw className="w-4 h-4" />{t(language, 'reRecord')}</button>
            <button onClick={discard} disabled={phase === 'saving'} className="btn-outline text-xs py-2 px-3 text-red-300 border-red-500/40"><Trash2 className="w-4 h-4" />{t(language, 'discard')}</button>
          </div>
        </div>
      )}
      {error && <div className="text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2">{error}</div>}
    </div>
  );
};

// ---------------- Share tab ----------------
const ShareTab: React.FC<{ language: Language; cabins: Cabin[]; items: MediaItem[]; onShared: () => void; onPickFiles: () => void }> = ({ language, cabins, items, onShared, onPickFiles }) => {
  const [target, setTarget] = useState<'ALL' | 'CABINS'>('ALL');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<'student' | 'synced'>('student');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-sm text-slate-400">{t(language, 'selectFilesFirst')}</p>
        <button onClick={onPickFiles} className="btn-outline text-xs py-2 px-4"><Library className="w-4 h-4" />{t(language, 'library')}</button>
      </div>
    );
  }

  const toggle = (n: number) => setPicked((p) => { const s = new Set(p); if (s.has(n)) s.delete(n); else s.add(n); return s; });
  const onlineNums = cabins.filter((c) => c.online).map((c) => c.cabinNumber);

  const share = async () => {
    setBusy(true); setError(null);
    try { await shareMediaItems(items.map((i) => i.id), target, [...picked], mode); onShared(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const card = (active: boolean) => `flex-1 text-left p-3 rounded-xl border transition-all ${active ? 'bg-emerald-900/40 border-emerald-400' : 'bg-slate-900/60 border-emerald-900/50 hover:border-emerald-600'}`;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <section>
        <h4 className="text-xs font-bold text-slate-300 mb-2">{t(language, 'selectedFiles')} ({items.length})</h4>
        <div className="flex flex-wrap gap-2">
          {items.map((m) => (
            <span key={m.id} className="text-xs px-2.5 py-1 rounded-full bg-slate-900 border border-emerald-900/60 text-slate-200 flex items-center gap-1.5">
              {m.kind === 'VIDEO' ? <Film className="w-3.5 h-3.5 text-cyan-400" /> : <Music className="w-3.5 h-3.5 text-amber-400" />}{m.title}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-bold text-slate-300 mb-2">{t(language, 'sendTo')}</h4>
        <div className="flex gap-3">
          <button onClick={() => setTarget('ALL')} className={card(target === 'ALL')}>
            <div className="text-sm font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-emerald-400" />{t(language, 'allCabins')}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">25 · {onlineNums.length} {t(language, 'online')}</div>
          </button>
          <button onClick={() => setTarget('CABINS')} className={card(target === 'CABINS')}>
            <div className="text-sm font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" />{t(language, 'selectedCabins')}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{picked.size} / 25</div>
          </button>
        </div>
        {target === 'CABINS' && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-3 text-[11px] text-slate-400">
              <button onClick={() => setPicked(new Set(onlineNums))} className="hover:text-white">{t(language, 'online')} ({onlineNums.length})</button>
              <button onClick={() => setPicked(new Set(Array.from({ length: 25 }, (_, i) => i + 1)))} className="hover:text-white">{t(language, 'selectAll')}</button>
              <button onClick={() => setPicked(new Set())} className="hover:text-white">{t(language, 'clear')}</button>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-1.5">
              {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => {
                const c = cabins.find((x) => x.cabinNumber === n);
                const on = picked.has(n);
                return (
                  <button key={n} onClick={() => toggle(n)} title={c?.student?.name || `Cabin ${n}`}
                    className={`relative py-2 rounded-lg border text-xs font-mono font-bold transition-all ${on ? 'bg-emerald-600 border-emerald-300 text-white' : 'bg-slate-900/70 border-emerald-900/50 text-slate-400 hover:text-white'}`}>
                    C-{String(n).padStart(2, '0')}
                    <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${c?.online ? 'bg-emerald-300' : 'bg-slate-600'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section>
        <h4 className="text-xs font-bold text-slate-300 mb-2">{t(language, 'playbackControl')}</h4>
        <div className="flex gap-3">
          <button onClick={() => setMode('student')} className={card(mode === 'student')}>
            <div className="text-sm font-bold text-white">{t(language, 'selfPaced')}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{t(language, 'studentControls')}</div>
          </button>
          <button onClick={() => setMode('synced')} className={card(mode === 'synced')}>
            <div className="text-sm font-bold text-white flex items-center gap-1.5"><Radio className="w-4 h-4 text-amber-400" />{t(language, 'teacherLed')}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{t(language, 'teacherControls')}</div>
          </button>
        </div>
      </section>

      {error && <div className="text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2">{error}</div>}

      <button onClick={share} disabled={busy || (target === 'CABINS' && picked.size === 0)} className="btn-gold w-full py-3 text-sm disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 text-black" />}
        {t(language, 'shareNow')} → {target === 'ALL' ? t(language, 'allCabins') : `${picked.size} ${t(language, 'selectedCabins').toLowerCase()}`}
      </button>
    </div>
  );
};

// ---------------- Shared-now tab ----------------
const SharedTab: React.FC<{ language: Language }> = ({ language }) => {
  const [shares, setShares] = useState<MediaShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [controlId, setControlId] = useState<string | null>(null);
  const previewRef = useRef<HTMLMediaElement | null>(null);

  const load = useCallback(async () => {
    try { setShares(await listMediaShares()); } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const revoke = async (id: string) => { await revokeMediaShare(id).catch(() => {}); if (controlId === id) setControlId(null); void load(); };

  const control = (s: MediaShare, action: 'play' | 'pause' | 'stop') => {
    const p = previewRef.current;
    if (p) {
      if (action === 'play') p.play().catch(() => {});
      else if (action === 'pause') p.pause();
      else { p.pause(); p.currentTime = 0; }
    }
    socket.emit('media:control', {
      targets: s.targetType === 'ALL' ? 'ALL' : s.cabins,
      mediaId: s.mediaId,
      action,
      time: action === 'stop' ? 0 : (p?.currentTime || 0),
    });
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>;
  if (shares.length === 0) return <p className="text-xs text-slate-500 text-center py-10">{t(language, 'noShares')}</p>;

  return (
    <ul className="space-y-2.5 max-w-3xl mx-auto">
      {shares.map((s) => {
        const { date, time } = formatDateTime(s.createdAt);
        return (
          <li key={s.id} className="rounded-xl bg-slate-900/60 border border-emerald-900/40 p-3 space-y-2">
            <div className="flex items-center gap-3">
              {s.media.kind === 'VIDEO' ? <Film className="w-5 h-5 text-cyan-400 shrink-0" /> : <Music className="w-5 h-5 text-amber-400 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white font-semibold truncate">{s.media.title}</div>
                <div className="flex flex-wrap gap-x-3 text-[10px] text-slate-400">
                  <span className="font-mono">{date} {time}</span>
                  <span className="text-emerald-300">{s.targetType === 'ALL' ? t(language, 'allCabins') : s.cabins.map((n) => `C-${String(n).padStart(2, '0')}`).join(', ')}</span>
                  <span className={s.mode === 'synced' ? 'text-amber-300' : ''}>{s.mode === 'synced' ? t(language, 'teacherLed') : t(language, 'selfPaced')}</span>
                </div>
              </div>
              {s.mode === 'synced' && (
                <button onClick={() => setControlId(controlId === s.id ? null : s.id)} className={`btn-outline text-[11px] py-1 px-2.5 ${controlId === s.id ? 'text-amber-300 border-amber-500/50' : ''}`}>
                  <Radio className="w-3.5 h-3.5" />{t(language, 'playbackControl')}
                </button>
              )}
              <button onClick={() => void revoke(s.id)} className="btn-outline text-[11px] py-1 px-2.5 text-red-300 border-red-500/40"><X className="w-3.5 h-3.5" />{t(language, 'revoke')}</button>
            </div>
            {controlId === s.id && (
              <div className="rounded-lg bg-black/40 border border-amber-500/30 p-3 space-y-2">
                <SignedAudio type="media" id={s.mediaId} video={s.media.kind === 'VIDEO'} mediaRef={previewRef} />
                <div className="flex gap-2">
                  <button onClick={() => control(s, 'play')} className="btn-primary text-xs py-1.5 px-3"><Play className="w-4 h-4" />{t(language, 'play')}</button>
                  <button onClick={() => control(s, 'pause')} className="btn-outline text-xs py-1.5 px-3 text-amber-300"><Pause className="w-4 h-4" />{t(language, 'pause')}</button>
                  <button onClick={() => control(s, 'stop')} className="btn-outline text-xs py-1.5 px-3 text-red-300"><Square className="w-4 h-4" />{t(language, 'stop')}</button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};
