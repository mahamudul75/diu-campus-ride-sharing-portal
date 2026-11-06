import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Users,
  Car,
  Clock,
  Compass,
  FileCheck,
  ArrowRight
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

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Overview' }]}
      title="Admin Control"
      subtitle="University metrics, driver verifications, and account governance."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/admin/drivers"
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            Approvals ({stats?.pending_drivers || 0})
          </Link>
          <Link
            to="/admin/users"
            className="px-3.5 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            Students
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Statistics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Users */}
          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold mb-3">
              <Users className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Students
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {stats?.total_users || 0}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Registered users</p>
          </div>

          {/* Approved Drivers */}
          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold mb-3">
              <Car className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Drivers
            </p>
            <p className="text-2xl font-black text-teal-700 dark:text-teal-400 font-mono">
              {stats?.approved_drivers || 0}
            </p>
            <p className="text-[11px] text-teal-600 dark:text-teal-400">Approved student drivers</p>
          </div>

          {/* Pending Approvals */}
          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold mb-3">
              <Clock className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Pending
            </p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {stats?.pending_drivers || 0}
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400">Awaiting verification</p>
          </div>

          {/* Total Rides */}
          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold mb-3">
              <Compass className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Campus Rides
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {stats?.total_rides || 0}
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-400">Total posted journeys</p>
          </div>

          {/* Total Requests */}
          <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold mb-3">
              <FileCheck className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Requests
            </p>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {stats?.total_requests || 0}
            </p>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Seat bookings</p>
          </div>
        </div>

        {/* Operational Shortcuts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Driver Approval Queue CTA */}
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Driver Verification Queue
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {stats?.pending_drivers || 0} students waiting for verification
                  </p>
                </div>
              </div>
              <Link
                to="/admin/drivers"
                className="text-xs font-bold text-teal-700 dark:text-teal-400 hover:text-teal-800 flex items-center gap-1"
              >
                Review <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Review student IDs, vehicle models, and license plate registrations before granting driver privileges.
            </p>
          </div>

          {/* User Management CTA */}
          <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Student User Directory
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Search, inspect, and moderate accounts
                  </p>
                </div>
              </div>
              <Link
                to="/admin/users"
                className="text-xs font-bold text-teal-700 dark:text-teal-400 hover:text-teal-800 flex items-center gap-1"
              >
                Manage <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Maintain campus transport safety. Suspend violating accounts or manage permissions.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboardPage;
