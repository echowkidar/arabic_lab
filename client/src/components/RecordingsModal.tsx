import React, { useState } from 'react';
import { Recording, Language } from '../types';
import { X, Film, Play, Trash2, Download, Clock, HardDrive, User, Calendar } from 'lucide-react';
import { deleteRecording } from '../services/api';

interface RecordingsModalProps {
  recordings: Recording[];
  onClose: () => void;
  onRefresh: () => void;
  language: Language;
}

export const RecordingsModal: React.FC<RecordingsModalProps> = ({
  recordings,
  onClose,
  onRefresh,
  language,
}) => {
  const isArabic = language === 'ar';
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(
    recordings.length > 0 ? recordings[0] : null
  );

  const handleDelete = async (id: string) => {
    if (confirm(isArabic ? 'هل تريد حذف هذا التسجيل بالتأكيد؟' : 'Are you sure you want to delete this recording?')) {
      try {
        await deleteRecording(id);
        if (selectedRecording?.id === id) {
          setSelectedRecording(null);
        }
        onRefresh();
      } catch (e) {
        console.error('Delete error:', e);
      }
    }
  };

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden relative border border-emerald-500/40">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-arabic">
                {isArabic ? 'مكتبة تسجيلات المختبر' : 'Lab Recordings Library'}
              </h2>
              <p className="text-xs text-slate-400">
                {recordings.length} {isArabic ? 'تسجيلات مخزنة محلياً (MinIO / Local Storage)' : 'recorded sessions stored locally'}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="btn-icon">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Body: Split View (Player + List) */}
        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
          {/* Video Player Area */}
          <div className="md:col-span-7 bg-black p-4 flex flex-col justify-center border-b md:border-b-0 md:border-r border-emerald-900/40">
            {selectedRecording ? (
              <div className="flex flex-col gap-3">
                <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden border border-emerald-900/60 relative flex items-center justify-center">
                  <video
                    src={`http://localhost:5000${selectedRecording.filePath}`}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="glass-card p-3">
                  <h3 className="text-sm font-bold text-emerald-300 truncate">
                    {selectedRecording.title}
                  </h3>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{formatSecs(selectedRecording.durationSec)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <HardDrive className="w-3.5 h-3.5 text-yellow-400" />
                      <span>{formatSize(selectedRecording.sizeBytes)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="truncate">
                        {selectedRecording.student?.name || 'General'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-emerald-900/40">
                    <a
                      href={`http://localhost:5000${selectedRecording.filePath}`}
                      download
                      className="btn-outline text-xs py-1.5 px-3"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{isArabic ? 'تحميل الفيديو' : 'Download Video'}</span>
                    </a>
                    <button
                      onClick={() => handleDelete(selectedRecording.id)}
                      className="btn-danger text-xs py-1.5 px-3"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isArabic ? 'حذف' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500">
                <Film className="w-12 h-12 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {isArabic ? 'اختر تسجيلاً من القائمة للمشاهدة' : 'Select a recording to preview'}
                </p>
              </div>
            )}
          </div>

          {/* Recordings List */}
          <div className="md:col-span-5 bg-slate-950/60 p-4 overflow-y-auto max-h-[65vh] flex flex-col gap-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              {isArabic ? 'جلسات المراقبة والمكالمات' : 'Recorded Lab Sessions'}
            </h4>

            {recordings.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                {isArabic ? 'لا توجد تسجيلات بعد. اضغط زر التسجيل أثناء مراقبة أي كابينة.' : 'No recordings saved yet. Click the record button while monitoring any cabin.'}
              </div>
            ) : (
              recordings.map((rec) => {
                const isSelected = selectedRecording?.id === rec.id;
                return (
                  <div
                    key={rec.id}
                    onClick={() => setSelectedRecording(rec)}
                    className={`glass-card p-2.5 cursor-pointer flex items-center justify-between gap-3 border transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/60 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                        : 'border-emerald-900/30 hover:border-emerald-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-9 h-9 rounded-lg bg-emerald-950 flex items-center justify-center text-emerald-400 shrink-0">
                        <Play className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold text-white truncate">{rec.title}</div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>{formatSecs(rec.durationSec)}</span>
                          <span>•</span>
                          <span>{formatSize(rec.sizeBytes)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(rec.id);
                      }}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded"
                      title="Delete recording"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
