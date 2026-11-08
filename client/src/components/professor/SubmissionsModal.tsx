import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Inbox, Search, Lock, Unlock, Trash2, Save, Loader2, Award, CalendarDays, Clock, Timer, CheckCircle2, RefreshCw } from 'lucide-react';
import { Language, StudentRecording } from '../../types';
import { t } from '../../i18n';
import { listSubmissions, gradeRecording, setRecordingLock, deleteSubmission } from '../../services/api';
import { formatDuration, formatDateTime } from '../../services/recorder';
import { socket } from '../../services/socket';
import { SignedAudio } from '../common/SignedAudio';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { StatusChip } from '../student/MyRecordings';

interface SubmissionsModalProps {
  language: Language;
  onClose: () => void;
}

type Filter = 'PENDING' | 'GRADED' | 'ALL';

export const SubmissionsModal: React.FC<SubmissionsModalProps> = ({ language, onClose }) => {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [items, setItems] = useState<StudentRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marks, setMarks] = useState('');
  const [maxMarks, setMaxMarks] = useState('10');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const playerRef = useRef<HTMLMediaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await listSubmissions(filter)); setError(null); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const refresh = () => { void load(); };
    socket.on('submission:new', refresh);
    socket.on('submission:removed', refresh);
    return () => { socket.off('submission:new', refresh); socket.off('submission:removed', refresh); };
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      r.learner?.name.toLowerCase().includes(q)
      || r.learner?.rollNo.toLowerCase().includes(q)
      || r.title.toLowerCase().includes(q)
      || (r.cabinNumber != null && [`cabin ${r.cabinNumber}`, `c-${String(r.cabinNumber).padStart(2, '0')}`, String(r.cabinNumber), String(r.cabinNumber).padStart(2, '0')].includes(q)));
  }, [items, query]);

  const selected = items.find((r) => r.id === selectedId) || null;

  // Load the grade form whenever another submission is picked
  useEffect(() => {
    if (!selected) return;
    setMarks(selected.marks != null ? String(selected.marks) : '');
    setMaxMarks(String(selected.maxMarks || 10));
    setRemark(selected.remark || '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Keyboard: ↑/↓ move between submissions, Space play/pause (outside inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = visible.findIndex((r) => r.id === selectedId);
        const n = e.key === 'ArrowDown' ? Math.min(visible.length - 1, i + 1) : Math.max(0, i - 1);
        if (visible[n]) setSelectedId(visible[n].id);
      } else if (e.key === ' ' && playerRef.current) {
        e.preventDefault();
        const p = playerRef.current;
        if (p.paused) p.play().catch(() => {}); else p.pause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selectedId, onClose]);

  const replace = (r: StudentRecording) => setItems((prev) => prev.map((x) => (x.id === r.id ? r : x)));

  const saveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const r = await gradeRecording(selected.id, Number(marks), Number(maxMarks) || 10, remark);
      replace(r);
      setFlash(`${r.learner?.name || ''} · ${r.marks}/${r.maxMarks} — ${t(language, 'gradeSaved')}`);
      setTimeout(() => setFlash(null), 4000);
      // jump to the next pending submission for fast grading
      if (filter === 'PENDING') {
        const i = visible.findIndex((x) => x.id === r.id);
        const nextPending = visible.slice(i + 1).find((x) => x.status === 'SUBMITTED');
        void load();
        setSelectedId(nextPending ? nextPending.id : r.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleLock = async () => {
    if (!selected) return;
    try { replace(await setRecordingLock(selected.id, !selected.locked)); }
    catch (e: any) { setError(e.message); }
  };

  const remove = async () => {
    if (!selected) return;
    setConfirmDelete(false);
    try { await deleteSubmission(selected.id); setSelectedId(null); void load(); }
    catch (e: any) { setError(e.message); }
  };

  const pendingCount = items.filter((r) => r.status === 'SUBMITTED').length;
  const tab = (f: Filter, label: string) => (
    <button onClick={() => { setFilter(f); setSelectedId(null); }}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>{label}</button>
  );

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-emerald-500/40 shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 text-cyan-300 border border-cyan-500/40 flex items-center justify-center"><Inbox className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-white">{t(language, 'submissions')}</h2>
              <p className="text-xs text-slate-400">↑ ↓ · Space ▶ · Esc</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label={t(language, 'close')}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-2.5 bg-emerald-950/40 border-b border-emerald-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-emerald-900/50">
            {tab('PENDING', `${t(language, 'pending')}${filter === 'PENDING' && pendingCount ? ` (${pendingCount})` : ''}`)}
            {tab('GRADED', t(language, 'graded'))}
            {tab('ALL', t(language, 'all'))}
          </div>
          <div className="flex items-center gap-2">
            {flash && <span className="text-xs text-emerald-300 flex items-center gap-1 mr-2" role="status"><CheckCircle2 className="w-4 h-4" />{flash}</span>}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(language, 'searchStudent')}
                className="pl-8 pr-3 py-1.5 bg-slate-900/90 border border-emerald-900/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 w-64" />
            </div>
            <button onClick={() => void load()} className="btn-icon" title="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 min-h-0">
          {/* List */}
          <ul className="md:col-span-2 overflow-y-auto border-r border-emerald-900/40 divide-y divide-emerald-900/30">
            {visible.length === 0 && !loading && <li className="p-8 text-center text-xs text-slate-500">{t(language, 'noSubmissions')}</li>}
            {visible.map((r) => {
              const { date, time } = formatDateTime(r.submittedAt || r.recordedAt);
              const active = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button onClick={() => setSelectedId(r.id)} className={`w-full text-left px-4 py-3 transition-all ${active ? 'bg-emerald-900/40 border-l-4 border-emerald-400' : 'hover:bg-emerald-950/40 border-l-4 border-transparent'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white truncate">{r.learner?.name}</span>
                      <StatusChip rec={r} language={language} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                      <span className="font-mono text-emerald-300">{r.learner?.rollNo}</span>
                      {r.cabinNumber && <span className="font-mono">· C-{String(r.cabinNumber).padStart(2, '0')}</span>}
                      {r.locked && <Lock className="w-3 h-3 text-amber-300" />}
                    </div>
                    <div className="text-xs text-slate-300 truncate mt-1">{r.title}</div>
                    <div className="flex gap-3 mt-1 text-[10px] text-slate-500 font-mono">
                      <span>{date} {time}</span><span>{formatDuration(r.durationSec)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Detail */}
          <div className="md:col-span-3 overflow-y-auto p-6">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 gap-3">
                <Inbox className="w-12 h-12 text-emerald-900" />
                <p className="text-sm">{t(language, 'selectSubmission')}</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-bold text-white">{selected.learner?.name}</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/30">{t(language, 'rollNo')} {selected.learner?.rollNo}</span>
                    {selected.cabinNumber && <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-600/50">{t(language, 'cabin')} {String(selected.cabinNumber).padStart(2, '0')}</span>}
                  </div>
                  <p className="text-sm text-slate-300 mt-1">{selected.title}</p>
                  <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{formatDateTime(selected.recordedAt).date}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDateTime(selected.recordedAt).time}</span>
                    <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{formatDuration(selected.durationSec)}</span>
                  </div>
                </div>

                <div className="rounded-xl bg-black/40 border border-emerald-900/40 p-3">
                  <SignedAudio key={selected.id} type="student" id={selected.id} mediaRef={playerRef} />
                </div>

                <form onSubmit={saveGrade} className="rounded-xl bg-emerald-950/30 border border-emerald-900/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-amber-300"><Award className="w-4 h-4" />{t(language, 'marks')}</div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={Number(maxMarks) || 10} step={0.5} value={marks} onChange={(e) => setMarks(e.target.value)} required
                      className="w-24 bg-slate-900 border border-emerald-900/60 rounded-lg px-3 py-2 text-lg font-bold text-white text-center focus:outline-none focus:border-emerald-400" aria-label={t(language, 'marks')} />
                    <span className="text-sm text-slate-400">{t(language, 'outOf')}</span>
                    <input type="number" min={1} max={100} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)}
                      className="w-20 bg-slate-900 border border-emerald-900/60 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-emerald-400" aria-label="Max marks" />
                  </div>
                  <textarea value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={500} rows={2} placeholder={t(language, 'remarkPlaceholder')}
                    className="w-full bg-slate-900 border border-emerald-900/60 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400" />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="submit" disabled={saving} className="btn-gold text-xs py-2 px-4 disabled:opacity-50">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-black" />}
                      <span>{selected.status === 'GRADED' ? t(language, 'updateGrade') : t(language, 'saveGrade')}</span>
                    </button>
                  </div>
                </form>

                <div className="flex flex-wrap gap-2">
                  <button onClick={toggleLock} className={`btn-outline text-xs py-2 px-3 ${selected.locked ? 'text-amber-300 border-amber-500/50' : ''}`}>
                    {selected.locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    <span>{selected.locked ? t(language, 'unlockForStudent') : t(language, 'lockForStudent')}</span>
                  </button>
                  <button onClick={() => setConfirmDelete(true)} className="btn-outline text-xs py-2 px-3 text-red-300 border-red-500/40">
                    <Trash2 className="w-4 h-4" /><span>{t(language, 'delete')}</span>
                  </button>
                </div>

                {error && <div className="text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2">{error}</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog language={language} danger message={t(language, 'confirmDeleteRec')} confirmLabel={t(language, 'delete')}
          onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
      )}
    </div>
  );
};
