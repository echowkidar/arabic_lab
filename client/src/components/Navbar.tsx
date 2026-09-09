import React from 'react';
import { User, Language } from '../types';
import { Radio, Film, Users, LogOut, Globe, Sparkles } from 'lucide-react';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  onOpenBroadcast?: () => void;
  onOpenRecordings: () => void;
  onOpenAdmin?: () => void;
  recordingsCount: number;
  simulationActive: boolean;
  onToggleSimulation: () => void;
  language: Language;
  onSelectLanguage: (lang: Language) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onOpenBroadcast,
  onOpenRecordings,
  onOpenAdmin,
  recordingsCount,
  simulationActive,
  onToggleSimulation,
  language,
  onSelectLanguage,
}) => {
  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';

  return (
    <header className="glass-panel-elevated mb-6 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-4 z-40">
      {/* Brand & Logo with AMU University Tag */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-800 flex items-center justify-center text-2xl shadow-lg border border-emerald-400/30">
          🏛️
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-arabic tracking-wide text-emerald-400">
              {isArabic ? 'مختبر اللغة العربية — جامعة عليكرة' : 'Arabic Language Lab'}
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 font-mono">
              AMU • 25 CABINS
            </span>
          </div>
          <p className="text-xs text-slate-300 font-sans">
            {isArabic
              ? 'نظام الإشراف والتواصل المباشر — جامعة عليكرة الإسلامية (AMU)'
              : isUrdu
              ? 'علی گڑھ مسلم یونیورسٹی (AMU) — عربی لینگویج لیب مینیجمنٹ سافٹ ویئر'
              : 'Aligarh Muslim University (AMU) — Dept of Arabic Language Lab'}
          </p>
        </div>
      </div>

      {/* Action Studio & Controls */}
      <div className="flex items-center flex-wrap gap-2.5">
        {user.role === 'PROFESSOR' && onOpenBroadcast && (
          <button
            onClick={onOpenBroadcast}
            className="btn-gold text-xs py-2 px-3.5"
            title="Broadcast screen and camera to all cabins"
          >
            <Radio className="w-4 h-4 text-emerald-950 animate-pulse" />
            <span>
              {isArabic ? 'بث للفصل كاملاً' : isUrdu ? 'پوری کلاس کو براڈکاسٹ' : 'Class Broadcast'}
            </span>
          </button>
        )}

        {(user.role === 'PROFESSOR' || user.role === 'ADMIN') && (
          <button
            onClick={onOpenRecordings}
            className="btn-outline text-xs py-2 px-3.5 relative"
            title="View recorded sessions library"
          >
            <Film className="w-4 h-4 text-emerald-400" />
            <span>
              {isArabic ? 'التسجيلات' : isUrdu ? 'ریکارڈنگز' : 'Recordings'}
            </span>
            {recordingsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-emerald-500 text-black text-[10px] font-bold rounded-full">
                {recordingsCount}
              </span>
            )}
          </button>
        )}

        {(user.role === 'PROFESSOR' || user.role === 'ADMIN') && onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="btn-outline text-xs py-2 px-3.5"
            title="Manage users and view audit logs"
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span>
              {isArabic ? 'إدارة الطلاب والتدقيق' : isUrdu ? 'ایڈمن اور آڈٹ' : 'Lab Admin'}
            </span>
          </button>
        )}

        {/* Simulation Mode Toggle (for Professor Console) */}
        {user.role === 'PROFESSOR' && (
          <button
            onClick={onToggleSimulation}
            className={`text-xs py-2 px-3.5 rounded-lg border font-semibold flex items-center gap-1.5 transition-all ${
              simulationActive
                ? 'bg-emerald-900/60 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
            title="Simulate realistic student activity, audio levels & screen activity across 25 cabins"
          >
            <Sparkles className={`w-3.5 h-3.5 ${simulationActive ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span>
              {simulationActive
                ? isArabic ? 'المحاكاة نشطة' : isUrdu ? 'محاکات فعال ہے' : 'Simulating 25 Cabins'
                : isArabic ? 'تفعيل المحاكاة' : isUrdu ? 'محاکات شروع کریں' : 'Simulate Lab'}
            </span>
          </button>
        )}

        {/* Multi-Language Dropdown Selector (English / Arabic / Urdu) */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-emerald-900/60 shadow-sm">
          <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <select
            value={language}
            onChange={(e) => onSelectLanguage(e.target.value as Language)}
            className="bg-transparent text-xs text-emerald-300 font-semibold focus:outline-none cursor-pointer pr-1"
            title="Select Display Language"
          >
            <option value="en" className="bg-slate-900 text-white">English (AMU)</option>
            <option value="ar" className="bg-slate-900 text-white">العربية (Arabic)</option>
            <option value="ur" className="bg-slate-900 text-white">اردو / Hindi</option>
          </select>
        </div>

        {/* User Profile Pill & Logout */}
        <div className="flex items-center gap-3 pl-3 border-l border-emerald-900/50">
          <div className="text-right">
            <div className="text-xs font-bold text-slate-200">{user.name}</div>
            <div className="text-[10px] text-emerald-400 font-mono tracking-wider">
              {user.role} {user.cabinNumber ? `• CABIN ${String(user.cabinNumber).padStart(2, '0')}` : ''}
            </div>
          </div>

          <button
            onClick={onLogout}
            className="btn-icon text-red-400 hover:text-red-300 hover:border-red-500/40"
            title="Logout / Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
