import React, { useState } from 'react';
import {
  User,
  Phone,
  Mail,
  Hash,
  Car,
  Bike,
  Lock,
  Save,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import api from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';

export const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');

  // Profile Form State
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [vehicleType, setVehicleType] = useState<'bike' | 'car'>(user?.vehicle_type || 'bike');
  const [vehicleModel, setVehicleModel] = useState(user?.vehicle_model || '');
  const [vehiclePlate, setVehiclePlate] = useState(user?.vehicle_plate || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.put('/users/profile', {
        name: name.trim(),
        phone: phone.trim(),
        vehicle_type: vehicleType,
        vehicle_model: vehicleModel.trim() || null,
        vehicle_plate: vehiclePlate.trim() || null
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
      subtitle="Manage university credentials, contact details, and vehicle information."
    >
      <div className="max-w-4xl space-y-6">
        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'profile'
                ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <User className="w-4 h-4" /> Profile & Vehicle
          </button>
          <button
            onClick={() => setActiveTab('password')}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'password'
                ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Lock className="w-4 h-4" /> Password
          </button>
        </div>

        {activeTab === 'profile' ? (
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            {/* Identity info (read-only verified fields) */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Verified Credentials
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                    Student ID
                  </span>
                  <p className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {user.student_id}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                    DIU Email
                  </span>
                  <p className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                    {user.email}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                    Driver Status
                  </span>
                  <div className="mt-1">
                    <StatusBadge status={user.driver_status} size="sm" />
                  </div>
                </div>
              </div>
            </div>

            {/* Editable contact details */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Contact Details
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-mono text-slate-800 dark:text-slate-100 font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle information */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                Vehicle Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Vehicle Type
                  </label>
                  <div className="grid grid-cols-2 gap-3 max-w-xs">
                    <button
                      type="button"
                      onClick={() => setVehicleType('bike')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        vehicleType === 'bike'
                          ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-800 dark:text-teal-200'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Bike className="w-3.5 h-3.5" /> Motorbike
                    </button>
                    <button
                      type="button"
                      onClick={() => setVehicleType('car')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                        vehicleType === 'car'
                          ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-800 dark:text-teal-200'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Car className="w-3.5 h-3.5" /> Car
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle Model
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Yamaha FZ-S, Toyota Aqua"
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      className="w-full text-xs px-3.5 py-2 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Registration Plate
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dhaka Metro-HA 12-3456"
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value)}
                      className="w-full text-xs px-3.5 py-2 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-mono text-slate-800 dark:text-slate-100 font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingProfile ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={handleUpdatePassword}
            className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4 max-w-xl"
          >
            <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
              Update Password
            </h2>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full text-xs px-3.5 py-2 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full text-xs px-3.5 py-2 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                placeholder="Re-enter new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full text-xs px-3.5 py-2 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={savingPassword}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
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
