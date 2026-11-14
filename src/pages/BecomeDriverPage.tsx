import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bike,
  Car,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ArrowRight,
  History
} from 'lucide-react';
import api from '../services/api.ts';
import { DriverApplication } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';

export const BecomeDriverPage: React.FC = () => {
  const { user, updateUser, isApprovedDriver, isPendingDriver } = useAuth();
  const { showToast } = useToast();

  const [vehicleType, setVehicleType] = useState<'bike' | 'car'>(user?.vehicle_type || 'bike');
  const [vehicleModel, setVehicleModel] = useState(user?.vehicle_model || '');
  const [vehiclePlate, setVehiclePlate] = useState(user?.vehicle_plate || '');
  const [agreedToSafety, setAgreedToSafety] = useState(false);

  const [history, setHistory] = useState<DriverApplication[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/drivers/history');
      if (res.data?.success) {
        setHistory(res.data.applications || []);
      }
    } catch {
      // Optional history section fails gracefully if pre-migration
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

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
        fetchHistory();
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
        <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-5 sm:p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#D4DAE7]/50 dark:border-[#34445E]">
            <span className="text-xs font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider">
              Application Status
            </span>
            <StatusBadge status={user?.driver_status || 'none'} />
          </div>

          {isApprovedDriver ? (
            <div className="p-4 bg-[#DDE2FA]/40 dark:bg-[#24334B]/60 border border-[#515FC5]/30 dark:border-[#818CF8]/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-[#344269] dark:text-[#818CF8] font-bold text-xs sm:text-sm">
                <CheckCircle2 className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                <span>You are an approved DIU Driver</span>
              </div>
              <p className="text-xs text-[#222B42] dark:text-[#F1F4FC] leading-relaxed">
                Vehicle verified: {user?.vehicle_type === 'bike' ? 'Bike' : 'Car'} • {user?.vehicle_model} ({user?.vehicle_plate}).
              </p>
              <div>
                <Link
                  to="/rides/create"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white rounded-xl text-xs font-bold shadow-xs transition-all"
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
            <div className="p-3 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
              You are currently registered as a passenger. Fill in vehicle details below to apply.
            </div>
          )}
        </div>

        {/* Driver Application Form (visible when not approved) */}
        {!isApprovedDriver && (
          <form onSubmit={handleSubmit} className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-5 sm:p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-5">
            <h2 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">Vehicle Information</h2>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Vehicle Type Choice */}
              <div>
                <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-2">Vehicle Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVehicleType('bike')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      vehicleType === 'bike'
                        ? 'bg-[#DDE2FA]/70 dark:bg-[#24334B] border-[#515FC5] dark:border-[#818CF8] text-[#344269] dark:text-[#818CF8] ring-2 ring-[#515FC5]/20'
                        : 'bg-white dark:bg-[#24334B] border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#172235]'
                    }`}
                  >
                    <Bike className="w-5 h-5 text-[#515FC5] dark:text-[#818CF8] mb-1.5" />
                    <p className="font-bold text-xs">Motorbike</p>
                    <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0]">1 passenger seat (helmet)</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVehicleType('car')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      vehicleType === 'car'
                        ? 'bg-[#DDE2FA]/70 dark:bg-[#24334B] border-[#515FC5] dark:border-[#818CF8] text-[#344269] dark:text-[#818CF8] ring-2 ring-[#515FC5]/20'
                        : 'bg-white dark:bg-[#24334B] border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#172235]'
                    }`}
                  >
                    <Car className="w-5 h-5 text-[#515FC5] dark:text-[#818CF8] mb-1.5" />
                    <p className="font-bold text-xs">Passenger Car</p>
                    <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0]">2-4 passenger seats</p>
                  </button>
                </div>
              </div>

              {/* Vehicle Model */}
              <div>
                <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
                  Brand & Model
                </label>
                <input
                  type="text"
                  required
                  placeholder={vehicleType === 'bike' ? 'Yamaha FZ-S, Honda Hornet...' : 'Toyota Axio, Aqua...'}
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-medium"
                />
              </div>

              {/* Vehicle Number Plate */}
              <div>
                <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
                  Registration Plate Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="Dhaka Metro-HA 12-3456"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono font-medium"
                />
              </div>

              {/* Safety Declaration */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 p-3 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToSafety}
                    onChange={(e) => setAgreedToSafety(e.target.checked)}
                    className="mt-0.5 rounded text-[#515FC5] focus:ring-[#515FC5]"
                  />
                  <span className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
                    I agree to follow campus road safety rules, provide a helmet if riding a bike, and adhere to the student code of conduct.
                  </span>
                </label>
              </div>
            </div>

            <div className="pt-3 border-t border-[#D4DAE7]/50 dark:border-[#34445E] flex items-center justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Spinner size="sm" /> : <FileText className="w-4 h-4" />}
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}

        {/* Application History Timeline */}
        <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-5 sm:p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#D4DAE7]/50 dark:border-[#34445E] pb-3">
            <h2 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-2">
              <History className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
              Application History
            </h2>
            <span className="text-[11px] font-mono text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
              {history.length} record{history.length === 1 ? '' : 's'}
            </span>
          </div>

          {loadingHistory ? (
            <div className="py-4 flex justify-center">
              <Spinner size="sm" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
              No previous driver applications recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
              {history.map((item) => (
                <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-[#222B42] dark:text-[#F1F4FC]">
                      <span className="capitalize">{item.vehicle_type}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.vehicle_model}</span>
                      <span className="font-mono text-[#626E86] dark:text-[#B0BCD0]">({item.vehicle_plate})</span>
                    </div>
                    <StatusBadge status={item.status} size="sm" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#626E86] dark:text-[#B0BCD0]">
                    <span>
                      Submitted {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {item.reviewed_at && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          Reviewed {new Date(item.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {item.reviewer_name ? ` by ${item.reviewer_name}` : ''}
                        </span>
                      </>
                    )}
                  </div>
                  {item.admin_note && (
                    <p className="text-[11px] text-[#222B42] dark:text-[#F1F4FC] bg-white dark:bg-[#24334B] px-3 py-2 rounded-lg border border-[#D4DAE7] dark:border-[#34445E]">
                      Admin note: {item.admin_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BecomeDriverPage;
