import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import api from '../services/api.ts';
import Spinner from '../components/Spinner.tsx';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError('A valid reset token is required.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/auth/reset-password', {
        token: token.trim(),
        new_password: newPassword,
        confirm_new_password: confirmNewPassword
      });
      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'Password reset successfully.');
        setTimeout(() => navigate('/login'), 1800);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#E8ECF4] dark:bg-[#111827]">
      <div className="max-w-md w-full space-y-6 bg-[#F5F7FC] dark:bg-[#1C2A40] p-8 sm:p-10 rounded-2xl shadow-xl border border-[#D4DAE7] dark:border-[#34445E]">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] rounded-xl flex items-center justify-center mx-auto border border-[#515FC5]/20 dark:border-[#818CF8]/30">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight">
            Choose New Password
          </h2>
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
            Enter your reset token and set a new account password.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-medium leading-relaxed">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!tokenFromUrl && (
            <div>
              <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
                Reset Token
              </label>
              <input
                type="text"
                required
                placeholder="Paste token from reset email"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full text-xs px-3 py-2.5 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              placeholder="Repeat new password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || Boolean(successMsg)}
            className="w-full py-2.5 px-4 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-[#515FC5]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting ? <Spinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
            {submitting ? 'Updating...' : 'Reset Password'}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-[#D4DAE7]/50 dark:border-[#34445E]">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
