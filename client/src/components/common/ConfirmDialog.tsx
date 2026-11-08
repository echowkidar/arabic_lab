import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Language } from '../../types';
import { t } from '../../i18n';

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  language: Language;
  onConfirm: () => void;
  onCancel: () => void;
}

// In-app confirmation (window.confirm is suppressed inside the Electron app).
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, confirmLabel, danger, language, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
    <div className="glass-panel-elevated w-full max-w-sm p-5 border border-amber-500/40" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${danger ? 'bg-red-950 text-red-400 border border-red-500/50' : 'bg-amber-950 text-amber-300 border border-amber-500/50'}`}>
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-slate-200 leading-relaxed pt-1.5">{message}</p>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onCancel} className="btn-outline text-xs py-2 px-4" autoFocus>{t(language, 'cancel')}</button>
        <button onClick={onConfirm} className={`${danger ? 'btn-danger' : 'btn-primary'} text-xs py-2 px-4`}>{confirmLabel || t(language, 'confirm')}</button>
      </div>
    </div>
  </div>
);
