import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import Spinner from '../components/Spinner.tsx';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const redirectPath = queryParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);

    if (result.success) {
      navigate(redirectPath);
    } else {
      setError(result.message || 'Login failed.');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#E8ECF4] dark:bg-[#111827]">
      <div className="max-w-md w-full space-y-6 bg-[#F5F7FC] dark:bg-[#1C2A40] p-8 sm:p-10 rounded-2xl shadow-xl border border-[#D4DAE7] dark:border-[#34445E]">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] rounded-xl flex items-center justify-center mx-auto border border-[#515FC5]/20 dark:border-[#818CF8]/30">
            <LogIn className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight">Student Sign In</h2>
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
            Use your DIU student credentials to sign in.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-medium leading-relaxed">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">DIU Email</label>
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

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC]">Password</label>
              <Link
                to="/forgot-password"
                className="text-[11px] font-semibold text-[#515FC5] dark:text-[#818CF8] hover:underline whitespace-nowrap"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-3 pointer-events-none" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-[#515FC5]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting ? <Spinner size="sm" /> : <ArrowRight className="w-4 h-4" />}
            {submitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-[#D4DAE7]/50 dark:border-[#34445E]">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
            Need an account?{' '}
            <Link to="/register" className="font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
