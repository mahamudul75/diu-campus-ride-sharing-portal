import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bike,
  Car,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ArrowRight
} from 'lucide-react';
import api from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';

export const BecomeDriverPage: React.FC = () => {
  const { user, updateUser, isApprovedDriver, isPendingDriver } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [vehicleType, setVehicleType] = useState<'bike' | 'car'>(user?.vehicle_type || 'bike');
  const [vehicleModel, setVehicleModel] = useState(user?.vehicle_model || '');
  const [vehiclePlate, setVehiclePlate] = useState(user?.vehicle_plate || '');
  const [agreedToSafety, setAgreedToSafety] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vehicleModel.trim() || !vehiclePlate.trim()) {
      setError('Please provide your vehicle model and registration plate.');
      return;
    }

    if (!agreedToSafety) {
      setError('You must agree to campus road safety guidelines.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/drivers/apply', {
        vehicle_type: vehicleType,
        vehicle_model: vehicleModel.trim(),
        vehicle_plate: vehiclePlate.trim()
      });

      if (res.data?.success) {
        showToast(res.data.message || 'Application submitted!', 'success');
        if (res.data.user) {
          updateUser(res.data.user);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit driver application.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Driver Application' }]}
      title="Driver Application"
      subtitle="Register your vehicle to offer campus rides and offset commuting costs"
    >
      <div className="space-y-6 max-w-3xl">
        {/* Live Status Card */}
        <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Application Status
            </span>
            <StatusBadge status={user?.driver_status || 'none'} />
          </div>

          {isApprovedDriver ? (
            <div className="p-4 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-teal-900 dark:text-teal-300 font-bold text-xs sm:text-sm">
                <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>You are an approved DIU Driver</span>
              </div>
              <p className="text-xs text-teal-800 dark:text-teal-300 leading-relaxed">
                Vehicle verified: {user?.vehicle_type === 'bike' ? 'Bike' : 'Car'} • {user?.vehicle_model} ({user?.vehicle_plate}).
              </p>
              <div>
                <Link
                  to="/rides/create"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
                >
                  Post a Ride <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : isPendingDriver ? (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold text-xs sm:text-sm">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Under Review</span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Your driver application is in queue for DIU transport administrator verification.
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-mono">
                Vehicle: {user?.vehicle_type?.toUpperCase()} — {user?.vehicle_model} ({user?.vehicle_plate})
              </p>
            </div>
          ) : user?.driver_status === 'rejected' ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-900 dark:text-rose-300 font-bold text-xs sm:text-sm">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>Application Rejected</span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                Please verify your vehicle plate and model details and re-apply below.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              You are currently registered as a passenger. Fill in vehicle details below to apply.
            </div>
          )}
        </div>

        {/* Driver Application Form (visible when not approved) */}
        {!isApprovedDriver && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Vehicle Information</h2>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Vehicle Type Choice */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Vehicle Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVehicleType('bike')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      vehicleType === 'bike'
                        ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-800 dark:text-teal-300 ring-2 ring-teal-500/20'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Bike className="w-5 h-5 text-teal-600 dark:text-teal-400 mb-1.5" />
                    <p className="font-bold text-xs">Motorbike</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">1 passenger seat (helmet)</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVehicleType('car')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      vehicleType === 'car'
                        ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-800 dark:text-teal-300 ring-2 ring-teal-500/20'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Car className="w-5 h-5 text-teal-600 dark:text-teal-400 mb-1.5" />
                    <p className="font-bold text-xs">Passenger Car</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">2-4 passenger seats</p>
                  </button>
                </div>
              </div>

              {/* Vehicle Model */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Brand & Model
                </label>
                <input
                  type="text"
                  required
                  placeholder={vehicleType === 'bike' ? 'Yamaha FZ-S, Honda Hornet...' : 'Toyota Axio, Aqua...'}
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>

              {/* Vehicle Number Plate */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Registration Plate Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="Dhaka Metro-HA 12-3456"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-mono font-medium"
                />
              </div>

              {/* Safety Declaration */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToSafety}
                    onChange={(e) => setAgreedToSafety(e.target.checked)}
                    className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    I agree to follow campus road safety rules, provide a helmet if riding a bike, and adhere to the student code of conduct.
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Spinner size="sm" /> : <FileText className="w-4 h-4" />}
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
};

export default BecomeDriverPage;
