import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, Mail, Lock, ShieldCheck, KeyRound, ArrowRight } from 'lucide-react';
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

  // Quick Account Switcher Helper for fast review/testing
  const fillCredentials = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setError(null);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-md w-full space-y-6 bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 rounded-xl flex items-center justify-center mx-auto border border-teal-100 dark:border-teal-800">
            <LogIn className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Student Sign In</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
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
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">DIU Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="email"
                required
                placeholder="student@diu.edu.bd"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Password</label>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting ? <Spinner size="sm" /> : <ArrowRight className="w-4 h-4" />}
            {submitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        {/* Quick Demo Switcher */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
            Demo Test Accounts
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => fillCredentials('tanvir.cse@diu.edu.bd', 'Password123!')}
              className="px-2 py-1.5 text-[11px] font-bold bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 rounded-xl border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer text-center"
            >
              Driver
            </button>
            <button
              type="button"
              onClick={() => fillCredentials('sadia.bba@diu.edu.bd', 'Password123!')}
              className="px-2 py-1.5 text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 rounded-xl border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer text-center"
            >
              Passenger
            </button>
            <button
              type="button"
              onClick={() => fillCredentials('admin@diu.edu.bd', 'Admin123!')}
              className="px-2 py-1.5 text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-xl border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer text-center"
            >
              Admin
            </button>
          </div>
        </div>

        <div className="text-center pt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Need an account?{' '}
            <Link to="/register" className="font-bold text-teal-600 dark:text-teal-400 hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
