import React, { useState, useEffect } from 'react';
import { User, Language } from '../types';
import { Radio, Film, Users, LogOut, Globe, Monitor, Library, Inbox } from 'lucide-react';
import { APP_VERSION } from '../constants/version';
import { t } from '../i18n';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  onOpenBroadcast?: () => void;
  onOpenMedia?: () => void;
  onOpenSubmissions?: () => void;
  pendingSubmissions?: number;
  onOpenRecordings: () => void;
  onOpenAdmin?: () => void;
  recordingsCount: number;
  language: Language;
  onSelectLanguage: (lang: Language) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user, onLogout, onOpenBroadcast, onOpenMedia, onOpenSubmissions, pendingSubmissions = 0, onOpenRecordings, onOpenAdmin,
  recordingsCount, language, onSelectLanguage,
}) => {
  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';

  const [appVersion, setAppVersion] = useState<string>(APP_VERSION);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    const detected = Boolean((window as any).electronAPI?.isElectron || navigator.userAgent.toLowerCase().includes('electron'));
    setIsElectron(detected);
    const api = (window as any).electronAPI;
    if (api?.getAppVersion) api.getAppVersion().then((v: string) => v && setAppVersion(v)).catch(() => {});
  }, []);

  return (
    <header className="glass-panel-elevated mb-6 px-6 py-4 flex flex-wrap items-center justify-between gap-4 relative z-20">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center text-2xl shadow-lg border border-emerald-400/30">🏛️</div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-arabic tracking-wide text-emerald-400">
              {isArabic ? 'مختبر اللغة العربية — جامعة عليكرة' : 'Arabic Language Lab'}
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 font-mono">AMU • 25 CABINS</span>
            <span title={`Arabic Language Lab Suite v${appVersion}`}
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1.5 shadow-sm ${isElectron ? 'bg-amber-950/90 text-amber-300 border border-amber-500/60' : 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/50'}`}>
              <Monitor className="w-3 h-3" /><span>{isElectron ? `v${appVersion} • EXE` : `v${appVersion} • WEB`}</span>
            </span>
          </div>
          <p className="text-xs text-slate-300 font-sans">
            {isArabic ? 'نظام الإشراف والتواصل المباشر — جامعة عليكرة' : isUrdu ? 'علی گڑھ مسلم یونیورسٹی — عربی لینگویج لیب' : 'Aligarh Muslim University (AMU) — Dept of Arabic Language Lab'}
          </p>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-2.5">
        {user.role === 'PROFESSOR' && onOpenBroadcast && (
          <button onClick={onOpenBroadcast} className="btn-gold text-xs py-2 px-3.5" title="Broadcast screen, audio & camera to cabins">
            <Radio className="w-4 h-4 text-emerald-950 animate-pulse" /><span>{isArabic ? 'بث للفصل' : isUrdu ? 'کلاس براڈکاسٹ' : 'Class Broadcast'}</span>
          </button>
        )}

        {user.role !== 'STUDENT' && onOpenSubmissions && (
          <button onClick={onOpenSubmissions} className={`btn-outline text-xs py-2 px-3.5 relative ${pendingSubmissions > 0 ? 'text-cyan-200 border-cyan-400/70 shadow-[0_0_14px_rgba(34,211,238,0.35)]' : 'text-cyan-300 border-cyan-500/40'}`}
            title="Student voice recordings to listen to and grade">
            <Inbox className="w-4 h-4 text-cyan-400" /><span>{t(language, 'submissions')}</span>
            {pendingSubmissions > 0 && <span className="ml-1 px-1.5 bg-cyan-400 text-black text-[10px] font-bold rounded-full animate-pulse">{pendingSubmissions}</span>}
          </button>
        )}

        {user.role !== 'STUDENT' && onOpenMedia && (
          <button onClick={onOpenMedia} className="btn-outline text-xs py-2 px-3.5 text-amber-300 border-amber-500/40" title="Upload, record and share audio/video with students">
            <Library className="w-4 h-4 text-amber-400" /><span>{t(language, 'mediaLibrary')}</span>
          </button>
        )}

        {(user.role === 'PROFESSOR' || user.role === 'ADMIN') && (
          <button onClick={onOpenRecordings} className="btn-outline text-xs py-2 px-3.5 relative" title="Recorded sessions">
            <Film className="w-4 h-4 text-emerald-400" /><span>{isArabic ? 'التسجيلات' : isUrdu ? 'ریکارڈنگز' : 'Recordings'}</span>
            {recordingsCount > 0 && <span className="ml-1 px-1.5 bg-emerald-500 text-black text-[10px] font-bold rounded-full">{recordingsCount}</span>}
          </button>
        )}

        {(user.role === 'PROFESSOR' || user.role === 'ADMIN') && onOpenAdmin && (
          <button onClick={onOpenAdmin} className="btn-outline text-xs py-2 px-3.5" title="Users & audit">
            <Users className="w-4 h-4 text-emerald-400" /><span>{isArabic ? 'الإدارة' : isUrdu ? 'ایڈمن' : 'Lab Admin'}</span>
          </button>
        )}

        <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-emerald-900/60 shadow-sm">
          <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <select value={language} onChange={(e) => onSelectLanguage(e.target.value as Language)} className="bg-transparent text-xs text-emerald-300 font-semibold focus:outline-none cursor-pointer pr-1">
            <option value="en" className="bg-slate-900 text-white">English</option>
            <option value="ar" className="bg-slate-900 text-white">العربية</option>
            <option value="ur" className="bg-slate-900 text-white">اردو / Hindi</option>
          </select>
        </div>

        <div className="flex items-center gap-3 pl-3 border-l border-emerald-900/50">
          <div className="text-right">
            <div className="text-xs font-bold text-slate-200">{user.name}</div>
            <div className="text-[10px] text-emerald-400 font-mono tracking-wider">{user.role}{user.cabinNumber ? ` • CABIN ${String(user.cabinNumber).padStart(2, '0')}` : ''}</div>
          </div>
          <button onClick={onLogout} className="btn-icon text-red-400 hover:text-red-300 hover:border-red-500/40" title="Logout"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>
    </header>
  );
};
