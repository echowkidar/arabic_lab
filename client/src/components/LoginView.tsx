import React, { useState } from 'react';
import { User, Language } from '../types';
import { login, SERVER_URL } from '../services/api';
import { Lock, User as UserIcon, ArrowRight, Sparkles, Globe, Download } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: User, token: string) => void;
  language: Language;
  onSelectLanguage: (lang: Language) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, language, onSelectLanguage }) => {
  const isArabic = language === 'ar';
  const isUrdu = language === 'ur';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await login(username, password, consent);
      localStorage.setItem('arabic_lab_token', data.token);
      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSelect = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-radial-glow relative overflow-hidden">
      
      {/* Arabic Decorative Watermark */}
      <div className="absolute -bottom-10 -right-10 text-[16rem] font-amiri font-bold text-emerald-950/20 select-none pointer-events-none">
        AMU
      </div>

      <div className="glass-panel-elevated w-full max-w-lg p-8 relative border border-emerald-500/40 shadow-[0_0_60px_rgba(16,185,129,0.18)]">
        
        {/* Top bar with Language Switcher */}
        <div className="flex items-center justify-between mb-6 pb-3 border-b border-emerald-900/40">
          <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-500/30">
            AMU • ALIGARH MUSLIM UNIVERSITY
          </span>

          <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1 rounded-lg border border-emerald-900/60 text-xs">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={language}
              onChange={(e) => onSelectLanguage(e.target.value as Language)}
              className="bg-transparent text-xs text-emerald-300 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="en" className="bg-slate-900 text-white">English</option>
              <option value="ar" className="bg-slate-900 text-white">العربية</option>
              <option value="ur" className="bg-slate-900 text-white">اردو / Hindi</option>
            </select>
          </div>
        </div>

        {/* Emblem & Title */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-800 border-2 border-emerald-400 flex items-center justify-center text-3xl mx-auto mb-3 shadow-[0_0_25px_rgba(16,185,129,0.4)]">
            🏛️
          </div>
          <h1 className="text-2xl font-bold font-arabic text-emerald-300">
            {isArabic ? 'مختبر اللغة العربية — جامعة عليكرة' : 'Arabic Language Lab'}
          </h1>
          <h2 className="text-sm font-bold tracking-wider uppercase text-slate-300 font-heading mt-1">
            Department of Arabic — AMU Lab Suite
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            {isArabic
              ? 'بوابة تسجيل الدخول لمنظومة الإشراف والتعليم المباشر'
              : isUrdu
              ? 'علی گڑھ مسلم یونیورسٹی — لیب مانیٹرنگ اور لائیو سیشن پورٹل'
              : 'Classroom Supervision & High-Fidelity LAN Audio-Visual Media'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-lg bg-red-950/70 border border-red-500/50 text-xs text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isArabic ? 'اسم المستخدم / رقم الكابينة' : isUrdu ? 'یوزر نیم / کیبن نمبر' : 'Username / Cabin ID'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <UserIcon className="w-4 h-4 text-emerald-400" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="off"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900/90 border border-emerald-900/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                placeholder="e.g. professor, cabin01, admin"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isArabic ? 'كلمة المرور' : isUrdu ? 'پاس ورڈ' : 'Password'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4 text-emerald-400" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-900/90 border border-emerald-900/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Acceptable Use Policy (AUP) Checkbox (Per Architecture Sec 0) */}
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/50">
            <label className="flex items-start gap-2.5 cursor-pointer text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 rounded border-emerald-500 text-emerald-500 focus:ring-emerald-400 bg-slate-900"
              />
              <div className="leading-tight">
                <span className="font-semibold text-emerald-300">Acceptable Use Policy (AUP):</span>{' '}
                {isArabic
                  ? 'أوافق على سياسة المختبر وأعلم أن شاشات وتدفقات الصوت تخضع للإشراف التعليمي بواسطة الأستاذ.'
                  : isUrdu
                  ? 'میں لیب پالیسی کو تسلیم کرتا ہوں کہ سیشن کے دوران اسکرین اور ہیڈ فون کی آواز کا تعلیمی جائزہ لیا جا سکتا ہے۔'
                  : 'I acknowledge that lab computers and audio streams are supervised by the professor as part of the language teaching process.'}
              </div>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-xs font-bold rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          >
            <span>
              {loading
                ? isArabic ? 'جاري التحقق...' : 'Authenticating...'
                : isArabic ? 'دخول المختبر' : isUrdu ? 'لاگ ان کریں' : 'Sign In to Lab'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Credentials Bar */}
        <div className="mt-6 pt-5 border-t border-emerald-900/50 text-center">
          <div className="text-[11px] font-semibold text-slate-400 flex items-center justify-center gap-1 mb-2.5">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Quick Login Presets (Click to Auto-fill):</span>
          </div>

          <div className="flex items-center justify-center flex-wrap gap-2">
            <button
              onClick={() => handleQuickSelect('professor', 'Prof@Lab2026')}
              className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 hover:bg-emerald-900"
            >
              👨‍🏫 Professor
            </button>

            <button
              onClick={() => handleQuickSelect('cabin01', 'Student@Lab2026')}
              className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 hover:bg-emerald-900"
            >
              🧑‍🎓 Cabin 01
            </button>

            <button
              onClick={() => handleQuickSelect('cabin03', 'Student@Lab2026')}
              className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-mono text-emerald-300 hover:bg-emerald-900"
            >
              🧑‍🎓 Cabin 03
            </button>

            <button
              onClick={() => handleQuickSelect('admin', 'Admin@Lab2026')}
              className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-mono text-yellow-300 hover:bg-emerald-900"
            >
              ⚙️ Admin
            </button>
          </div>

          {/* Lab Technician Setup Download */}
          <div className="mt-3.5 pt-2.5 border-t border-emerald-900/40">
            <a
              href={`${SERVER_URL}/api/download/cabin-setup`}
              download="Setup-ArabicLab-Cabin.bat"
              className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-200 bg-emerald-950/80 hover:bg-emerald-900/80 px-3 py-1 rounded-lg border border-emerald-500/30 transition-all font-mono"
              title="Download 1-Click setup script for Student Cabin PCs on LAN"
            >
              <Download className="w-3 h-3 text-emerald-400" />
              <span>
                {isArabic
                  ? 'تحميل ملف تثبيت كابينة الطالب (Setup)'
                  : 'Lab Tech: Download 1-Click Cabin Client Setup'}
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
