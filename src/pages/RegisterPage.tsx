import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Mail, Phone, Lock, Hash, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import Spinner from '../components/Spinner.tsx';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    student_id: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation rules
    const idRegex = /^\d{3}-\d{2}-\d{3}$/;
    if (!idRegex.test(formData.student_id.trim())) {
      setError('DIU Student ID must match 000-00-000 format (e.g. 211-15-401).');
      return;
    }

    if (!formData.email.trim().toLowerCase().endsWith('diu.edu.bd')) {
      setError('Registration is restricted to official DIU emails (@diu.edu.bd).');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const result = await register(formData);
    setSubmitting(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.message || 'Registration failed.');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[#E8ECF4] dark:bg-[#111827]">
      <div className="max-w-md w-full space-y-6 bg-[#F5F7FC] dark:bg-[#1C2A40] p-8 sm:p-10 rounded-2xl shadow-xl border border-[#D4DAE7] dark:border-[#34445E]">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] rounded-xl flex items-center justify-center mx-auto border border-[#515FC5]/20 dark:border-[#818CF8]/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight">Student Registration</h2>
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
            Join DIU campus ride sharing with your student email.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-medium leading-relaxed">
            {error}
          </div>
        )}

        <div className="p-3 bg-[#DDE2FA]/40 dark:bg-[#24334B]/60 border border-[#515FC5]/30 dark:border-[#818CF8]/30 text-[#344269] dark:text-[#818CF8] rounded-xl text-[11px] leading-relaxed">
          If outbound mail is configured on the server, a verification link will be sent to your DIU email. Otherwise, campus administration can verify your student badge from your profile.
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                name="name"
                required
                placeholder="Tanvir Ahmed"
                value={formData.name}
                onChange={handleChange}
                className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-medium"
              />
            </div>
          </div>

          {/* Student ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC]">Student ID</label>
              <span className="text-[10px] text-[#515FC5] dark:text-[#818CF8] font-mono">Format: 000-00-000</span>
            </div>
            <div className="relative">
              <Hash className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                name="student_id"
                required
                placeholder="211-15-401"
                value={formData.student_id}
                onChange={handleChange}
                className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">DIU Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-3 pointer-events-none" />
              <input
                type="email"
                name="email"
                required
                placeholder="student@diu.edu.bd"
                value={formData.email}
                onChange={handleChange}
                className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Phone</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-3 pointer-events-none" />
              <input
                type="tel"
                name="phone"
                required
                placeholder="01712345678"
                value={formData.phone}
                onChange={handleChange}
                className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-3 pointer-events-none" />
              <input
                type="password"
                name="password"
                required
                placeholder="Min 6 characters"
                value={formData.password}
                onChange={handleChange}
                className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Confirm Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-3 pointer-events-none" />
              <input
                type="password"
                name="confirm_password"
                required
                placeholder="Repeat password"
                value={formData.confirm_password}
                onChange={handleChange}
                className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-[#515FC5]/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {submitting ? <Spinner size="sm" /> : <ArrowRight className="w-4 h-4" />}
            {submitting ? 'Registering...' : 'Register'}
          </button>
        </form>

        <div className="text-center pt-2 border-t border-[#D4DAE7]/50 dark:border-[#34445E]">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
