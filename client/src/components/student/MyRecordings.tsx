import React, { useCallback, useEffect, useState } from 'react';
import { FolderLock, Lock, Unlock, Play, Send, Trash2, Loader2, RefreshCw, Award, CalendarDays, Clock, Timer } from 'lucide-react';
import { Language, StudentRecording } from '../../types';
import { t } from '../../i18n';
import { listMyRecordings, submitRecording, deleteMyRecording } from '../../services/api';
import { useLearnerSession, lockLearner, touchLearner } from '../../services/learnerSession';
import { formatDuration, formatDateTime } from '../../services/recorder';
import { socket } from '../../services/socket';
import { LearnerGate } from './LearnerGate';
import { SignedAudio } from '../common/SignedAudio';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface MyRecordingsProps {
  language: Language;
  refreshKey: number;
}

export const StatusChip: React.FC<{ rec: StudentRecording; language: Language }> = ({ rec, language }) => {
  if (rec.status === 'GRADED') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/50">
        <Award className="w-3 h-3" />{t(language, 'graded')} · {rec.marks}/{rec.maxMarks}
      </span>
    );
  }
  if (rec.status === 'SUBMITTED') {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/50">{t(language, 'submitted')}</span>;
  }
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 border border-slate-500/40">{t(language, 'draft')}</span>;
};

export const MyRecordings: React.FC<MyRecordingsProps> = ({ language, refreshKey }) => {
  const session = useLearnerSession();
  const [items, setItems] = useState<StudentRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StudentRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) { setItems([]); return; }
    setLoading(true);
    try {
      setItems(await listMyRecordings());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  // Professor graded / locked / deleted one of the files from this cabin.
  useEffect(() => {
    const refresh = () => { if (session) void load(); };
    socket.on('recording:updated', refresh);
    socket.on('recording:removed', refresh);
    return () => { socket.off('recording:updated', refresh); socket.off('recording:removed', refresh); };
  }, [session, load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    touchLearner();
    try { await fn(); await load(); } catch (e: any) { setError(e.message); } finally { setBusyId(null); }
  };

  return (
    <div className="glass-panel p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FolderLock className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold text-white">{t(language, 'myRecordings')}</h3>
        </div>
        {session && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 hidden sm:inline">{t(language, 'signedInAs')} <strong className="text-emerald-300">{session.learner.name}</strong> · {session.learner.rollNo}</span>
            <button onClick={() => void load()} className="btn-icon" title="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button onClick={lockLearner} className="btn-outline text-[11px] py-1 px-2.5"><Lock className="w-3.5 h-3.5" /><span>{t(language, 'lock')}</span></button>
          </div>
        )}
      </div>

      {!session ? (
        <LearnerGate language={language} />
      ) : (
        <>
          {error && <div className="text-xs text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2">{error}</div>}
          {items.length === 0 && !loading && <p className="text-xs text-slate-500 py-4 text-center">{t(language, 'noRecordings')}</p>}
          <ul className="space-y-2.5 max-h-[28rem] overflow-y-auto pr-1">
            {items.map((r) => {
              const { date, time } = formatDateTime(r.recordedAt);
              return (
                <li key={r.id} className="rounded-xl bg-slate-900/70 border border-emerald-900/40 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{r.title}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{date}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{time}</span>
                        <span className="flex items-center gap-1"><Timer className="w-3 h-3" />{formatDuration(r.durationSec)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusChip rec={r} language={language} />
                      <span className={`text-[10px] flex items-center gap-1 ${r.locked ? 'text-amber-300' : 'text-slate-500'}`}>
                        {r.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}{r.locked ? t(language, 'locked') : t(language, 'unlocked')}
                      </span>
                    </div>
                  </div>

                  {r.status === 'GRADED' && r.remark && (
                    <div className="text-xs text-amber-100 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                      <strong className="text-amber-300">{t(language, 'remark')}:</strong> {r.remark}
                    </div>
                  )}

                  {playingId === r.id && <SignedAudio type="student" id={r.id} autoPlay />}

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => { touchLearner(); setPlayingId(playingId === r.id ? null : r.id); }} className="btn-outline text-[11px] py-1 px-2.5">
                      <Play className="w-3.5 h-3.5" /><span>{playingId === r.id ? t(language, 'close') : t(language, 'play')}</span>
                    </button>
                    {r.status === 'DRAFT' && (
                      <button onClick={() => act(r.id, () => submitRecording(r.id))} disabled={busyId === r.id} className="btn-gold text-[11px] py-1 px-2.5 disabled:opacity-50">
                        {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-black" />}<span>{t(language, 'submit')}</span>
                      </button>
                    )}
                    <button onClick={() => setConfirmDelete(r)} disabled={r.locked || busyId === r.id}
                      title={r.locked ? t(language, 'lockedReason') : t(language, 'delete')}
                      className="btn-outline text-[11px] py-1 px-2.5 text-red-300 border-red-500/40 disabled:opacity-40 disabled:cursor-not-allowed">
                      <Trash2 className="w-3.5 h-3.5" /><span>{t(language, 'delete')}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          language={language}
          danger
          message={t(language, 'confirmDeleteRec')}
          confirmLabel={t(language, 'delete')}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { const r = confirmDelete; setConfirmDelete(null); if (playingId === r.id) setPlayingId(null); void act(r.id, () => deleteMyRecording(r.id)); }}
        />
      )}
    </div>
  );
};
