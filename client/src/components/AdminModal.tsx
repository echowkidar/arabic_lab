import React, { useState, useEffect } from 'react';
import { User, MonitoringLog, Language } from '../types';
import { X, Users, KeyRound, Power, ShieldAlert, Check, RefreshCw, Eye, Volume2, Camera } from 'lucide-react';
import { fetchUsers, resetPassword, toggleUserActive, fetchAuditLogs } from '../services/api';

interface AdminModalProps {
  onClose: () => void;
  language: Language;
}

export const AdminModal: React.FC<AdminModalProps> = ({ onClose, language }) => {
  const isArabic = language === 'ar';
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<MonitoringLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Password reset state
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, a] = await Promise.all([fetchUsers(), fetchAuditLogs()]);
      setUsers(u);
      setAuditLogs(a);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (userId: string) => {
    try {
      await toggleUserActive(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isActive: !u.isActive } : u))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !newPassword) return;

    try {
      await resetPassword(resettingUser.id, newPassword);
      setFeedback(`Password reset successfully for ${resettingUser.username}`);
      setNewPassword('');
      setResettingUser(null);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      alert(err.message || 'Failed to reset password');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="glass-panel-elevated w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden relative border border-emerald-500/40 shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-emerald-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-arabic">
                {isArabic ? 'لوحة الإشراف وإدارة الطلاب' : 'Lab Administration & Compliance'}
              </h2>
              <p className="text-xs text-slate-400">
                {isArabic ? 'إدارة بيانات كبائن الطلاب، إعادة تعيين كلمات المرور، وسجل المراقبة والتدقيق' : 'Manage student cabin credentials, password resets, and surveillance audit trails'}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="btn-icon">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="px-6 py-2.5 bg-emerald-950/40 border-b border-emerald-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('users')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'users'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isArabic ? 'حسابات الكبائن (25 طالباً)' : 'Student Cabins (25 Accounts)'}
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'audit'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isArabic ? 'سجل التدقيق والمراقبة' : 'Surveillance Audit Trail'}
            </button>
          </div>

          <button onClick={loadData} className="btn-icon text-slate-400 hover:text-emerald-400" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {feedback && (
          <div className="mx-6 mt-3 px-3 py-2 bg-emerald-900/60 border border-emerald-500/50 rounded-lg text-xs text-emerald-200 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 max-h-[65vh]">
          {activeTab === 'users' ? (
            <div className="flex flex-col gap-4">
              {/* Password Reset Modal Drawer */}
              {resettingUser && (
                <form onSubmit={handleResetPassword} className="glass-card p-4 border-amber-500/50 bg-amber-950/30 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4" />
                      <span>{isArabic ? `إعادة تعيين كلمة المرور لـ ${resettingUser.name}` : `Reset Password for ${resettingUser.name}`}</span>
                    </span>
                    <button type="button" onClick={() => setResettingUser(null)} className="text-slate-400 hover:text-white text-xs">
                      {isArabic ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="password"
                      placeholder="Enter new password (min 6 chars)..."
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      className="bg-slate-900 border border-emerald-900/60 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-400 flex-1"
                    />
                    <button type="submit" className="btn-gold text-xs py-1.5 px-4">
                      {isArabic ? 'حفظ وتحديث' : 'Save & Update'}
                    </button>
                  </div>
                </form>
              )}

              {/* Users Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-emerald-900/50 text-slate-400">
                      <th className="pb-3 px-3">Cabin</th>
                      <th className="pb-3 px-3">Student Name</th>
                      <th className="pb-3 px-3">Username</th>
                      <th className="pb-3 px-3">AUP Policy</th>
                      <th className="pb-3 px-3">Status</th>
                      <th className="pb-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-900/30">
                    {users
                      .filter((u) => u.role === 'STUDENT')
                      .map((student) => (
                        <tr key={student.id} className="hover:bg-emerald-950/30">
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                            C-{String(student.cabinNumber || 0).padStart(2, '0')}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-200">
                            {student.name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">
                            {student.username}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/30">
                              ✓ Agreed
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`status-badge text-[9px] ${
                                student.isActive ? 'status-online' : 'status-disabled'
                              }`}
                            >
                              <span className="pulse-dot" />
                              <span>{student.isActive ? 'Active' : 'Disabled'}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setResettingUser(student)}
                                className="btn-outline text-[11px] py-1 px-2.5"
                                title="Reset Student Password"
                              >
                                <KeyRound className="w-3.5 h-3.5 text-yellow-400" />
                                <span>Reset Pass</span>
                              </button>
                              <button
                                onClick={() => handleToggleActive(student.id)}
                                className={`text-[11px] py-1 px-2.5 rounded-lg border font-semibold flex items-center gap-1 ${
                                  student.isActive
                                    ? 'border-red-500/40 text-red-300 hover:bg-red-950/50'
                                    : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/50'
                                }`}
                                title={student.isActive ? 'Disable Account' : 'Enable Account'}
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>{student.isActive ? 'Disable' : 'Enable'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Audit Log View */
            <div className="flex flex-col gap-3">
              <div className="bg-emerald-950/30 border border-emerald-900/50 p-3 rounded-lg flex items-center gap-3 text-xs text-slate-300">
                <ShieldAlert className="w-5 h-5 text-emerald-400 shrink-0" />
                <p>
                  {isArabic
                    ? 'يتم تسجيل كل إجراء مراقبة شاشة أو استماع صوتي تلقائياً في قاعدة البيانات لضمان الشفافية ومطابقة سياسة الجامعة.'
                    : 'Every silent monitor view, audio eavesdrop, and webcam inspection is immutably logged for university compliance.'}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-emerald-900/50 text-slate-400">
                      <th className="pb-3 px-3">Timestamp</th>
                      <th className="pb-3 px-3">Supervisor</th>
                      <th className="pb-3 px-3">Cabin Target</th>
                      <th className="pb-3 px-3">Action Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-900/30">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          {isArabic ? 'لا توجد سجلات بعد' : 'No audit entries logged yet.'}
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-emerald-950/30">
                          <td className="py-2.5 px-3 font-mono text-slate-400">
                            {new Date(log.startedAt).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-emerald-300">
                            {log.professor?.name}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-white">
                            Cabin {String(log.student?.cabinNumber || 0).padStart(2, '0')} ({log.student?.name})
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-500/30 font-mono">
                              {log.action === 'SCREEN_VIEW' && <Eye className="w-3 h-3" />}
                              {log.action === 'AUDIO_LISTEN' && <Volume2 className="w-3 h-3" />}
                              {log.action === 'WEBCAM_VIEW' && <Camera className="w-3 h-3" />}
                              <span>{log.action}</span>
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
