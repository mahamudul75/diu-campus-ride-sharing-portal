import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import Spinner from '../components/Spinner.tsx';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error'
  );
  const [message, setMessage] = useState(
    token ? 'Verifying your DIU email address...' : 'Missing verification token.'
  );

  useEffect(() => {
    if (!token) return;
    let active = true;

    async function verify() {
      try {
        const res = await api.post('/auth/verify-email', { token });
        if (!active) return;
        if (res.data?.success) {
          setStatus('success');
          setMessage(res.data.message || 'Your DIU email has been verified!');
          await refreshUser();
        } else {
          setStatus('error');
          setMessage(res.data?.message || 'Verification failed.');
        }
      } catch (err: any) {
        if (!active) return;
        setStatus('error');
        setMessage(err.response?.data?.message || 'Invalid or expired verification token.');
      }
    }

    verify();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#E8ECF4] dark:bg-[#111827]">
      <div className="max-w-md w-full space-y-6 bg-[#F5F7FC] dark:bg-[#1C2A40] p-8 sm:p-10 rounded-2xl shadow-xl border border-[#D4DAE7] dark:border-[#34445E] text-center">
        <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center bg-[#DDE2FA]/70 dark:bg-[#24334B] border border-[#515FC5]/20 dark:border-[#818CF8]/30 text-[#515FC5] dark:text-[#818CF8]">
          {status === 'loading' ? (
            <Spinner size="md" />
          ) : status === 'success' ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-6 h-6 text-rose-500" />
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight flex items-center justify-center gap-2">
            <MailCheck className="w-5 h-5 text-[#515FC5] dark:text-[#818CF8]" />
            Email Verification
          </h2>
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            to="/dashboard"
            className="px-5 py-2.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            to="/profile"
            className="px-5 py-2.5 border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] rounded-xl hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] transition-colors"
          >
            Account Settings
          </Link>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
