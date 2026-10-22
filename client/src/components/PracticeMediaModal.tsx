import React, { useState, useEffect, useRef } from 'react';
import { Cabin, Language } from '../types';
import { X, Upload, Music, Send, Trash2, Play, Pause, Square, Users } from 'lucide-react';
import { listPracticeMedia, uploadPracticeMedia, deletePracticeMedia, mediaUrl, PracticeMedia } from '../services/api';
import { socket } from '../services/socket';

interface PracticeMediaModalProps {
  cabins: Cabin[];
  onClose: () => void;
  language: Language;
}

// Professor pushes an audio/video drill to students. In "student" mode each
// student controls their own play/pause/repeat; in "synced" mode the professor
// drives playback for everyone.
export const PracticeMediaModal: React.FC<PracticeMediaModalProps> = ({ cabins, onClose, language }) => {
  const isArabic = language === 'ar';
  const [library, setLibrary] = useState<PracticeMedia[]>([]);
  const [selected, setSelected] = useState<PracticeMedia | null>(null);
  const [mode, setMode] = useState<'student' | 'synced'>('student');
  const [target, setTarget] = useState<'ALL' | 'SELECTED'>('ALL');
  const [selectedCabins, setSelectedCabins] = useState<number[]>([]);
  const [pushed, setPushed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const refresh = () => listPracticeMedia().then(setLibrary).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const targets = () => (target === 'ALL' ? 'ALL' : selectedCabins) as 'ALL' | number[];

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('media', file);
      const m = await uploadPracticeMedia(fd);
      await refresh();
      setSelected(m);
    } catch { /* noop */ } finally { setUploading(false); }
  };

  const push = () => {
    if (!selected) return;
    socket.emit('media:push', { targets: targets(), url: selected.url, name: selected.name, mode });
    setPushed(true);
    setTimeout(() => setPushed(false), 2500);
  };
  const control = (action: 'play' | 'pause' | 'stop') => {
    const t = previewRef.current;
    socket.emit('media:control', { targets: targets(), action, time: t?.currentTime || 0 });
    if (t) { if (action === 'play') t.play().catch(() => {}); else if (action === 'pause') t.pause(); else { t.pause(); t.currentTime = 0; } }
  };
  const clear = () => socket.emit('media:clear', { targets: targets() });
  const remove = async (name: string) => { await deletePracticeMedia(name).catch(() => {}); refresh(); if (selected && selected.url.endsWith(name)) setSelected(null); };

  const toggleCabin = (n: number) => setSelectedCabins((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-amber-500/40">
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center justify-center"><Music className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold text-white">{isArabic ? 'مادة الاستماع والتدريب' : 'Practice Media'}</h2>
              <p className="text-xs text-slate-400">{isArabic ? 'أرسل ملف صوت للطلاب للتدريب على النطق' : 'Push an audio drill students can play / pause / repeat'}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="flex items-center gap-3">
            <label className="btn-primary text-xs py-2 px-4 cursor-pointer flex items-center gap-2">
              <Upload className="w-4 h-4" /><span>{uploading ? (isArabic ? 'جارٍ الرفع…' : 'Uploading…') : (isArabic ? 'رفع ملف صوت/فيديو' : 'Upload audio / video')}</span>
              <input type="file" accept="audio/*,video/*" className="hidden" onChange={onUpload} disabled={uploading} />
            </label>
            <span className="text-xs text-slate-400">{isArabic ? 'أو اختر من المكتبة أدناه' : 'or pick from library below'}</span>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {library.length === 0 && <p className="text-xs text-slate-500">{isArabic ? 'لا توجد ملفات بعد' : 'No media uploaded yet.'}</p>}
            {library.map((m) => (
              <div key={m.url} className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border ${selected?.url === m.url ? 'bg-emerald-950/60 border-emerald-500/50' : 'bg-slate-900/60 border-emerald-900/40'}`}>
                <button onClick={() => setSelected(m)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                  <Music className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-white truncate">{m.name}</span>
                </button>
                <button onClick={() => remove(m.url.split('/').pop() || '')} className="text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          {selected && (
            <div className="p-3 rounded-xl bg-black/40 border border-emerald-900/40 space-y-3">
              <audio ref={previewRef} src={mediaUrl(selected.url)} controls className="w-full h-9" />
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-emerald-900/40 text-xs">
                  <button onClick={() => setMode('student')} className={`px-3 py-1 rounded font-semibold ${mode === 'student' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>{isArabic ? 'تحكم الطالب' : 'Student-paced'}</button>
                  <button onClick={() => setMode('synced')} className={`px-3 py-1 rounded font-semibold ${mode === 'synced' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>{isArabic ? 'بقيادة الأستاذ' : 'Teacher-led'}</button>
                </div>
                <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-emerald-900/40 text-xs">
                  <button onClick={() => setTarget('ALL')} className={`px-3 py-1 rounded font-semibold ${target === 'ALL' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>{isArabic ? 'الكل' : 'All'}</button>
                  <button onClick={() => setTarget('SELECTED')} className={`px-3 py-1 rounded font-semibold ${target === 'SELECTED' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>{isArabic ? 'محددة' : 'Selected'}</button>
                </div>
              </div>

              {target === 'SELECTED' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-400 flex items-center gap-1"><Users className="w-3.5 h-3.5" /></span>
                  {cabins.filter((c) => c.online).map((c) => { const sel = selectedCabins.includes(c.cabinNumber); return (
                    <button key={c.cabinNumber} onClick={() => toggleCabin(c.cabinNumber)} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${sel ? 'bg-emerald-600 border-emerald-400 text-white font-bold' : 'bg-emerald-950/40 border-emerald-900/50 text-slate-400'}`}>C-{String(c.cabinNumber).padStart(2, '0')}</button>
                  ); })}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button onClick={push} className="btn-gold text-xs py-2 px-4"><Send className="w-4 h-4 text-black" /><span>{pushed ? (isArabic ? 'تم الإرسال ✓' : 'Sent ✓') : (isArabic ? 'إرسال للطلاب' : 'Send to students')}</span></button>
                {mode === 'synced' && (
                  <>
                    <button onClick={() => control('play')} className="btn-outline text-xs py-2 px-3 text-emerald-300"><Play className="w-4 h-4" /></button>
                    <button onClick={() => control('pause')} className="btn-outline text-xs py-2 px-3 text-amber-300"><Pause className="w-4 h-4" /></button>
                    <button onClick={() => control('stop')} className="btn-outline text-xs py-2 px-3 text-red-300"><Square className="w-4 h-4" /></button>
                  </>
                )}
                <button onClick={clear} className="btn-outline text-xs py-2 px-3 text-slate-400 ml-auto">{isArabic ? 'إزالة من الطلاب' : 'Clear'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
