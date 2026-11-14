import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send, Info } from 'lucide-react';
import api from '../services/api.ts';
import Spinner from '../components/Spinner.tsx';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<'success' | 'info' | 'error'>('info');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setSubmitting(true);

    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      if (res.data?.success && res.data?.delivered) {
        setStatusKind('success');
        setStatusMessage(res.data.message);
      } else {
        setStatusKind('info');
        setStatusMessage(
          res.data?.message ||
            'Outbound email (SMTP) is not configured on this server. Please contact DIU Transport Administration.'
        );
      }
    } catch (err: any) {
      setStatusKind('error');
      setStatusMessage(err.response?.data?.message || 'Unable to process password reset request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#E8ECF4] dark:bg-[#111827]">
      <div className="max-w-md w-full space-y-6 bg-[#F5F7FC] dark:bg-[#1C2A40] p-8 sm:p-10 rounded-2xl shadow-xl border border-[#D4DAE7] dark:border-[#34445E]">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] rounded-xl flex items-center justify-center mx-auto border border-[#515FC5]/20 dark:border-[#818CF8]/30">
            <Mail className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight">
            Reset Password
          </h2>
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
            Enter your registered @diu.edu.bd email address to receive reset instructions.
          </p>
        </div>

        {statusMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-medium leading-relaxed flex items-start gap-2 ${
              statusKind === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : statusKind === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            }`}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{statusMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
              DIU Student Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-3 pointer-events-none" />
              <input
                type="email"
                required
                placeholder="student@diu.edu.bd"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-[#515FC5]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting ? <Spinner size="sm" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Sending...' : 'Request Reset Link'}
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

export default ForgotPasswordPage;
