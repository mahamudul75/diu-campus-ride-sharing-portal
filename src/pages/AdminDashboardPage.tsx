import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Users,
  Car,
  Clock,
  Compass,
  FileCheck,
  ArrowRight,
  Star,
  BadgeCheck
} from 'lucide-react';
import api from '../services/api.ts';
import { AdminStats } from '../types/index.ts';
import DashboardLayout from '../components/DashboardLayout.tsx';
import Spinner from '../components/Spinner.tsx';

export const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await api.get('/admin/stats');
        if (res.data?.success) {
          setStats(res.data.stats);
        }
      } catch (err) {
        console.warn('Failed to load admin stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <DashboardLayout
        breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Overview' }]}
        title="Admin Control"
        subtitle="Loading campus statistics..."
      >
        <div className="py-24 flex justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  const totalRides = stats?.total_rides || 0;
  const bikePct = totalRides > 0 ? Math.round(((stats?.bike_rides || 0) / totalRides) * 100) : 0;
  const carPct = totalRides > 0 ? Math.round(((stats?.car_rides || 0) / totalRides) * 100) : 0;

  const totalReqs = stats?.total_requests || 0;
  const acceptedPct = totalReqs > 0 ? Math.round(((stats?.accepted_requests || 0) / totalReqs) * 100) : 0;

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Overview' }]}
      title="Admin Control"
      subtitle="University metrics, driver verifications, ride moderation, and safety governance."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/drivers"
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 whitespace-nowrap"
          >
            <Clock className="w-3.5 h-3.5" />
            Approvals ({stats?.pending_drivers || 0})
          </Link>
          <Link
            to="/admin/reports"
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Reports ({stats?.pending_reports || 0})
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Primary KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] flex items-center justify-center mb-3 border border-[#D4DAE7] dark:border-[#34445E]">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider">
              Students
            </p>
            <p className="text-2xl font-black text-[#222B42] dark:text-[#F1F4FC] font-mono tabular-nums">
              {stats?.total_users || 0}
            </p>
            <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
              {stats?.verified_students || 0} verified badges
            </p>
          </div>

          <div className="p-5 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] flex items-center justify-center mb-3 border border-[#515FC5]/20 dark:border-[#818CF8]/30">
              <Car className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider">
              Approved Drivers
            </p>
            <p className="text-2xl font-black text-[#515FC5] dark:text-[#818CF8] font-mono tabular-nums">
              {stats?.approved_drivers || 0}
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 tabular-nums">
              {stats?.pending_drivers || 0} awaiting review
            </p>
          </div>

          <div className="p-5 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center mb-3 border border-blue-200 dark:border-blue-800">
              <Compass className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider">
              Total Rides
            </p>
            <p className="text-2xl font-black text-[#222B42] dark:text-[#F1F4FC] font-mono tabular-nums">
              {stats?.total_rides || 0}
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 tabular-nums">
              {stats?.active_rides || 0} active · {stats?.completed_rides || 0} completed
            </p>
          </div>

          <div className="p-5 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 flex items-center justify-center mb-3 border border-rose-200 dark:border-rose-800">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider">
              Safety Reports
            </p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums">
              {stats?.pending_reports || 0}
            </p>
            <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
              {stats?.total_reports || 0} total filed
            </p>
          </div>
        </div>

        {/* Analytics Breakdown Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#D4DAE7]/50 dark:border-[#34445E] pb-3">
              <h3 className="font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">
                Ride Completion & Fleet Split
              </h3>
              <span className="text-xs font-mono font-bold text-[#515FC5] dark:text-[#818CF8] tabular-nums">
                {stats?.ride_completion_rate || 0}% completion
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between font-medium text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                  <span>Motorbike Rides ({stats?.bike_rides || 0})</span>
                  <span className="font-mono">{bikePct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white dark:bg-[#24334B] overflow-hidden border border-[#D4DAE7]/50 dark:border-[#34445E]">
                  <div className="h-full bg-[#515FC5] dark:bg-[#818CF8] rounded-full" style={{ width: `${bikePct}%` }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between font-medium text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                  <span>Passenger Car Rides ({stats?.car_rides || 0})</span>
                  <span className="font-mono">{carPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white dark:bg-[#24334B] overflow-hidden border border-[#D4DAE7]/50 dark:border-[#34445E]">
                  <div className="h-full bg-[#8175D5] dark:bg-[#A78BFA] rounded-full" style={{ width: `${carPct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#D4DAE7]/50 dark:border-[#34445E] text-center">
                <div>
                  <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] uppercase font-bold block">Active</span>
                  <span className="font-mono font-bold text-[#222B42] dark:text-[#F1F4FC] tabular-nums">
                    {stats?.active_rides || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] uppercase font-bold block">Completed</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {stats?.completed_rides || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] uppercase font-bold block">Cancelled</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                    {stats?.cancelled_rides || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#D4DAE7]/50 dark:border-[#34445E] pb-3">
              <h3 className="font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">
                Booking & Trust Metrics
              </h3>
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {stats?.total_requests || 0} requests
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between font-medium text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                  <span>Accepted Bookings ({stats?.accepted_requests || 0})</span>
                  <span className="font-mono">{acceptedPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white dark:bg-[#24334B] overflow-hidden border border-[#D4DAE7]/50 dark:border-[#34445E]">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${acceptedPct}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#D4DAE7]/50 dark:border-[#34445E] text-center">
                <div>
                  <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] uppercase font-bold block">Pending Req</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    {stats?.pending_requests || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] uppercase font-bold block">Rejected</span>
                  <span className="font-mono font-bold text-[#222B42] dark:text-[#F1F4FC] tabular-nums">
                    {stats?.rejected_requests || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] uppercase font-bold block">Cancelled</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                    {stats?.cancelled_requests || 0}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] uppercase font-bold block">Reviews</span>
                  <span className="font-mono font-bold text-amber-500 tabular-nums inline-flex items-center gap-0.5 justify-center">
                    <Star className="w-3 h-3 fill-amber-400" />
                    {stats?.total_reviews || 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Operational Shortcuts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center border border-amber-200 dark:border-amber-800">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">
                    Driver Verification Queue
                  </h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                    {stats?.pending_drivers || 0} students waiting for verification
                  </p>
                </div>
              </div>
              <Link
                to="/admin/drivers"
                className="text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                Review <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
              Review student IDs, vehicle models, and license plate registrations before granting driver privileges.
            </p>
          </div>

          <div className="p-6 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] flex items-center justify-center border border-[#D4DAE7] dark:border-[#34445E]">
                  <BadgeCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">
                    Student User Directory
                  </h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                    Search, verify student badges, and moderate accounts
                  </p>
                </div>
              </div>
              <Link
                to="/admin/users"
                className="text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                Manage <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
              Assign official student verification badges or suspend accounts violating campus rules.
            </p>
          </div>

          <div className="p-6 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center border border-blue-200 dark:border-blue-800">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">
                    Rides & Bookings Moderation
                  </h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                    Inspect all posted trips and passenger bookings
                  </p>
                </div>
              </div>
              <Link
                to="/admin/rides"
                className="text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                Inspect <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
              Monitor active trips across campus routes and cancel non-compliant postings with automatic passenger notice.
            </p>
          </div>

          <div className="p-6 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 flex items-center justify-center border border-rose-200 dark:border-rose-800">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">
                    Safety Reports Queue
                  </h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                    {stats?.pending_reports || 0} open safety reports
                  </p>
                </div>
              </div>
              <Link
                to="/admin/reports"
                className="text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline flex items-center gap-1 whitespace-nowrap"
              >
                Open Queue <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
              Investigate student incident reports, record resolution notes, and suspend unsafe accounts.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboardPage;
