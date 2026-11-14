import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Phone,
  Car,
  Bike,
  Lock,
  Save,
  ShieldCheck,
  Camera,
  Trash2,
  MailCheck,
  BadgeCheck,
  Star,
  Shield
} from 'lucide-react';
import api from '../services/api.ts';
import { Review } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';

export const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

  // Profile Form State
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [showPhoneToAccepted, setShowPhoneToAccepted] = useState(user?.show_phone_to_accepted !== 0);
  const [savingProfile, setSavingProfile] = useState(false);

  // Avatar State
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [resendingVerify, setResendingVerify] = useState(false);

  // Reviews State
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [loadingReviews, setLoadingReviews] = useState(true);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setBio(user.bio || '');
      setShowPhoneToAccepted(user.show_phone_to_accepted !== 0);
    }
  }, [user]);

  useEffect(() => {
    async function loadReviews() {
      if (!user) return;
      try {
        const res = await api.get(`/reviews/user/${user.id}`);
        if (res.data?.success) {
          setReviews(res.data.reviews || []);
          setAvgRating(res.data.avg_rating ?? null);
          setReviewCount(Number(res.data.review_count || 0));
        }
      } catch {
        // Non-fatal
      } finally {
        setLoadingReviews(false);
      }
    }
    loadReviews();
  }, [user?.id]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showToast('Only PNG, JPEG, or WebP images are supported.', 'error');
      return;
    }

    if (file.size > 512 * 1024) {
      showToast('Profile picture must be smaller than 512KB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setUploadingAvatar(true);
      try {
        const res = await api.post('/users/avatar', { avatar_url: dataUrl });
        if (res.data?.success) {
          showToast('Profile picture updated.', 'success');
          if (res.data.user) updateUser(res.data.user);
        }
      } catch (err: any) {
        showToast(err.response?.data?.message || 'Failed to upload profile picture.', 'error');
      } finally {
        setUploadingAvatar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const res = await api.delete('/users/avatar');
      if (res.data?.success) {
        showToast('Profile picture removed.', 'info');
        if (res.data.user) updateUser(res.data.user);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to remove avatar.', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleResendVerification = async () => {
    setResendingVerify(true);
    try {
      const res = await api.post('/auth/resend-verification');
      if (res.data?.already_verified) {
        showToast(res.data.message, 'success');
      } else if (res.data?.delivered) {
        showToast(res.data.message, 'success');
      } else {
        showToast(res.data?.message || 'SMTP is not configured on this server.', 'info');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Verification request failed.', 'error');
    } finally {
      setResendingVerify(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.put('/users/profile', {
        name: name.trim(),
        phone: phone.trim(),
        bio: bio.trim() || null,
        show_phone_to_accepted: showPhoneToAccepted ? 1 : 0
      });

      if (res.data?.success) {
        showToast('Profile updated.', 'success');
        if (res.data.user) {
          updateUser(res.data.user);
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Update failed.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('Minimum 6 characters required.', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await api.put('/users/password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmNewPassword
      });

      if (res.data?.success) {
        showToast('Password updated.', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Password update failed.', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Account Settings' }]}
      title="Student Settings"
      subtitle="Manage university credentials, profile photo, privacy, and reviews."
      actions={
        <Link
          to="/safety"
          className="px-3.5 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] bg-white dark:bg-[#1C2A40] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-1.5 whitespace-nowrap"
        >
          <Shield className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
          Safety Center
        </Link>
      }
    >
      <div className="max-w-4xl space-y-6">
        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-[#D4DAE7] dark:border-[#34445E]">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'profile'
                ? 'border-[#515FC5] dark:border-[#818CF8] text-[#515FC5] dark:text-[#818CF8]'
                : 'border-transparent text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
            }`}
          >
            <User className="w-4 h-4" /> Profile & Privacy
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'password'
                ? 'border-[#515FC5] dark:border-[#818CF8] text-[#515FC5] dark:text-[#818CF8]'
                : 'border-transparent text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" /> Password
          </button>
        </div>

        {activeTab === 'profile' ? (
          <div className="space-y-6">
            {/* Avatar & Verification Card */}
            <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] flex items-center justify-center font-black text-xl overflow-hidden border border-[#D4DAE7] dark:border-[#34445E] shrink-0">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    user.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-[#222B42] dark:text-[#F1F4FC]">
                      {user.name}
                    </h2>
                    {user.student_verified === 1 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#515FC5] dark:text-[#818CF8]">
                        <BadgeCheck className="w-3.5 h-3.5" />
                        Verified Student
                      </span>
                    )}
                    {user.email_verified === 1 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <MailCheck className="w-3.5 h-3.5" />
                        Email Verified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] font-mono">
                    {user.student_id} · {user.email}
                  </p>
                  {avgRating !== null && (
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 tabular-nums">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      {avgRating} average ({reviewCount} review{reviewCount === 1 ? '' : 's'})
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] border border-[#515FC5]/30 dark:border-[#818CF8]/30 hover:bg-[#DDE2FA] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
                </button>
                {user.avatar_url && (
                  <button
                    type="button"
                    disabled={uploadingAvatar}
                    onClick={handleRemoveAvatar}
                    className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-6">
              {/* Identity & Verification Status */}
              <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] uppercase tracking-wider">
                    University Credentials
                  </h2>
                  {user.email_verified !== 1 && (
                    <button
                      type="button"
                      disabled={resendingVerify}
                      onClick={handleResendVerification}
                      className="text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {resendingVerify ? 'Checking SMTP...' : 'Resend Verification Email'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E]">
                    <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                      Student ID
                    </span>
                    <p className="text-xs font-mono font-bold text-[#222B42] dark:text-[#F1F4FC] mt-0.5 tabular-nums">
                      {user.student_id}
                    </p>
                  </div>

                  <div className="p-3 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E]">
                    <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                      DIU Email
                    </span>
                    <p className="text-xs font-mono font-bold text-[#222B42] dark:text-[#F1F4FC] mt-0.5 truncate">
                      {user.email}
                    </p>
                  </div>

                  <div className="p-3 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E]">
                    <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                      Driver Status
                    </span>
                    <div className="mt-1">
                      <StatusBadge status={user.driver_status} size="sm" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Editable Contact & Bio Details */}
              <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
                <h2 className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] uppercase tracking-wider">
                  Contact & Privacy Preferences
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] text-[#222B42] dark:text-[#F1F4FC] font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full text-xs pl-9 pr-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono text-[#222B42] dark:text-[#F1F4FC] font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
                    Short Bio / Campus Department (Optional, max 300 chars)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={300}
                    placeholder="e.g. CSE Dept · Regular commuter between campus and residence"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] text-[#222B42] dark:text-[#F1F4FC]"
                  />
                </div>

                <label className="flex items-start gap-2.5 p-3.5 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPhoneToAccepted}
                    onChange={(e) => setShowPhoneToAccepted(e.target.checked)}
                    className="mt-0.5 rounded text-[#515FC5] focus:ring-[#515FC5]"
                  />
                  <div className="text-xs">
                    <p className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                      Share phone number with confirmed passengers
                    </p>
                    <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0]">
                      When disabled, accepted passengers coordinate with you through in-app ride chat instead of seeing your phone number.
                    </p>
                  </div>
                </label>
              </div>

              {/* Vehicle information */}
              <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                    Verified Vehicle Information
                  </h2>
                  {user.driver_status !== 'approved' && (
                    <Link
                      to="/become-driver"
                      className="text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline"
                    >
                      {user.driver_status === 'pending' ? 'View Application' : 'Apply as Driver'}
                    </Link>
                  )}
                </div>

                {user.vehicle_type || user.vehicle_model || user.vehicle_plate ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E]">
                      <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                        Vehicle Type
                      </span>
                      <p className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mt-0.5 flex items-center gap-1.5 capitalize">
                        {user.vehicle_type === 'bike' ? (
                          <Bike className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                        ) : (
                          <Car className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                        )}
                        {user.vehicle_type || 'N/A'}
                      </p>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E]">
                      <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                        Vehicle Model
                      </span>
                      <p className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mt-0.5">
                        {user.vehicle_model || 'N/A'}
                      </p>
                    </div>
                    <div className="p-3 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E]">
                      <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                        Registration Plate
                      </span>
                      <p className="text-xs font-mono font-bold text-[#222B42] dark:text-[#F1F4FC] mt-0.5">
                        {user.vehicle_plate || 'N/A'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                    No verified vehicle registered yet. Submit a driver application to get your vehicle approved by DIU transport administration.
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {savingProfile ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>

            {/* User Ratings & Reviews Section */}
            <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#D4DAE7]/50 dark:border-[#34445E] pb-3">
                <h2 className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] uppercase tracking-wider flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500" />
                  Ratings & Reviews Received
                </h2>
                <span className="text-xs font-mono font-bold text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                  {avgRating !== null ? `${avgRating}/5 · ${reviewCount} total` : 'No reviews yet'}
                </span>
              </div>

              {loadingReviews ? (
                <div className="py-4 flex justify-center">
                  <Spinner size="sm" />
                </div>
              ) : reviews.length === 0 ? (
                <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                  Reviews from fellow DIU students will appear here after completed rides.
                </p>
              ) : (
                <div className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
                  {reviews.map((rv) => (
                    <div key={rv.id} className="py-3 first:pt-0 last:pb-0 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                          {rv.reviewer_name || 'DIU Student'}
                        </span>
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          {rv.rating}/5 ★
                        </span>
                      </div>
                      {rv.pickup_name && rv.dest_name && (
                        <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0]">
                          {rv.pickup_name} → {rv.dest_name} ·{' '}
                          {new Date(rv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                      {rv.comment && (
                        <p className="text-[#222B42] dark:text-[#F1F4FC] leading-relaxed">{rv.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleUpdatePassword}
            className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4 max-w-xl"
          >
            <h2 className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] uppercase tracking-wider mb-2">
              Update Password
            </h2>

            <div>
              <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full text-xs px-3.5 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] text-[#222B42] dark:text-[#F1F4FC]"
              />
            </div>

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
                className="w-full text-xs px-3.5 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] text-[#222B42] dark:text-[#F1F4FC]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                placeholder="Re-enter new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full text-xs px-3.5 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] text-[#222B42] dark:text-[#F1F4FC]"
              />
            </div>

            <div className="pt-3 border-t border-[#D4DAE7]/50 dark:border-[#34445E] flex justify-end">
              <button
                type="submit"
                disabled={savingPassword}
                className="px-5 py-2.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {savingPassword ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ProfilePage;
