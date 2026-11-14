import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Compass, Ban, FileCheck } from 'lucide-react';
import api from '../services/api.ts';
import { Ride, RideStatus } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';
import Modal from '../components/Modal.tsx';
import EmptyState from '../components/EmptyState.tsx';

interface AdminBooking {
  id: number;
  ride_id: number;
  passenger_name: string;
  passenger_student_id: string;
  driver_name: string;
  pickup_name: string;
  dest_name: string;
  departure_time: string;
  fare: number;
  status: string;
  ride_status: RideStatus;
}

export const AdminRidesPage: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'rides' | 'bookings'>('rides');

  const [rides, setRides] = useState<Ride[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Moderate modal
  const [targetRide, setTargetRide] = useState<Ride | null>(null);
  const [reason, setReason] = useState('');
  const [moderating, setModerating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ridesRes, bookingsRes] = await Promise.allSettled([
        api.get('/admin/rides', {
          params: {
            search: searchTerm.trim() || undefined,
            status: statusFilter || undefined
          }
        }),
        api.get('/admin/bookings')
      ]);

      if (ridesRes.status === 'fulfilled' && ridesRes.value.data?.success) {
        setRides(ridesRes.value.data.rides || []);
      }
      if (bookingsRes.status === 'fulfilled' && bookingsRes.value.data?.success) {
        setBookings(bookingsRes.value.data.bookings || []);
      }
    } catch (err) {
      console.warn('Admin rides load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchTerm, statusFilter]);

  const handleModerateCancel = async () => {
    if (!targetRide) return;
    setModerating(true);
    try {
      const res = await api.patch(`/admin/rides/${targetRide.id}/moderate`, {
        reason: reason.trim() || undefined
      });
      if (res.data?.success) {
        showToast(res.data.message || 'Ride cancelled.', 'success');
        setTargetRide(null);
        setReason('');
        loadData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Moderation failed.', 'error');
    } finally {
      setModerating(false);
    }
  };

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Rides & Bookings' }]}
      title="Rides & Bookings Moderation"
      subtitle="Inspect all posted campus rides and passenger booking activity."
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#E1E6F0] dark:bg-[#151F32] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] w-fit">
            <button
              onClick={() => setActiveTab('rides')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'rides'
                  ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                  : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" /> Rides ({rides.length})
            </button>
            <button
              onClick={() => setActiveTab('bookings')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'bookings'
                  ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                  : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" /> Bookings ({bookings.length})
            </button>
          </div>

          {activeTab === 'rides' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search route or driver..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs pl-8 pr-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs px-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
              >
                <option value="">All Statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="open">Open</option>
                <option value="full">Full</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : activeTab === 'rides' ? (
          rides.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No rides found"
              description="No rides matched your search or status filter."
            />
          ) : (
            <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F0F2F8] dark:bg-[#151F32] border-b border-[#D4DAE7] dark:border-[#34445E] text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">Driver</th>
                      <th className="py-3 px-4">Departure</th>
                      <th className="py-3 px-4">Seats / Fare</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Moderation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
                    {rides.map((r) => {
                      const canCancel = r.status !== 'cancelled' && r.status !== 'completed';
                      return (
                        <tr key={r.id} className="hover:bg-[#E8ECF4]/60 dark:hover:bg-[#24334B]/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-[#222B42] dark:text-[#F1F4FC]">
                            <Link to={`/rides/${r.id}`} className="hover:text-[#515FC5] dark:hover:text-[#818CF8]">
                              {r.pickup_name} → {r.dest_name}
                            </Link>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[#222B42] dark:text-[#F1F4FC]">{r.driver_name}</p>
                            <p className="text-[10px] font-mono text-[#626E86] dark:text-[#B0BCD0]">{r.driver_student_id}</p>
                          </td>
                          <td className="py-3 px-4 font-mono text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                            {new Date(r.departure_time).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-[#222B42] dark:text-[#F1F4FC]">
                            {r.seats_available}/{r.seats_total} · <span className="font-bold text-[#515FC5] dark:text-[#67D5DF]">৳{Number(r.fare).toFixed(0)}</span>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={r.status} size="sm" />
                          </td>
                          <td className="py-3 px-4 text-right">
                            {canCancel ? (
                              <button
                                onClick={() => setTargetRide(r)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <Ban className="w-3 h-3" /> Cancel Ride
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#626E86] dark:text-[#B0BCD0]">Closed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : bookings.length === 0 ? (
          <EmptyState
            icon={FileCheck}
            title="No bookings recorded"
            description="Seat booking requests across the platform will appear here."
          />
        ) : (
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F0F2F8] dark:bg-[#151F32] border-b border-[#D4DAE7] dark:border-[#34445E] text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                    <th className="py-3 px-4">Passenger</th>
                    <th className="py-3 px-4">Route</th>
                    <th className="py-3 px-4">Driver</th>
                    <th className="py-3 px-4">Fare</th>
                    <th className="py-3 px-4">Booking</th>
                    <th className="py-3 px-4">Ride Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-[#E8ECF4]/60 dark:hover:bg-[#24334B]/40 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-bold text-[#222B42] dark:text-[#F1F4FC]">{b.passenger_name}</p>
                        <p className="text-[10px] font-mono text-[#626E86] dark:text-[#B0BCD0]">{b.passenger_student_id}</p>
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#222B42] dark:text-[#F1F4FC]">
                        <Link to={`/rides/${b.ride_id}`} className="hover:text-[#515FC5] dark:hover:text-[#818CF8]">
                          {b.pickup_name} → {b.dest_name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-[#626E86] dark:text-[#B0BCD0]">{b.driver_name}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#515FC5] dark:text-[#67D5DF] font-bold">
                        ৳{Number(b.fare).toFixed(0)}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={b.status} size="sm" />
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={b.ride_status} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Moderate Cancel Ride Modal */}
      <Modal
        isOpen={Boolean(targetRide)}
        onClose={() => {
          setTargetRide(null);
          setReason('');
        }}
        title="Moderate & Cancel Ride"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Cancel ride <strong className="text-[#222B42] dark:text-[#F1F4FC]">{targetRide?.pickup_name} → {targetRide?.dest_name}</strong> by{' '}
            <strong className="text-[#222B42] dark:text-[#F1F4FC]">{targetRide?.driver_name}</strong>? All pending and accepted passengers will be notified.
          </p>
          <div>
            <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
              Moderation Reason
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Policy compliance or duplicate posting"
              maxLength={300}
              className="w-full px-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setTargetRide(null);
                setReason('');
              }}
              className="px-4 py-2 border border-[#D4DAE7] dark:border-[#34445E] rounded-xl font-bold text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer"
            >
              Keep Ride
            </button>
            <button
              onClick={handleModerateCancel}
              disabled={moderating}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold cursor-pointer"
            >
              {moderating ? 'Cancelling...' : 'Cancel Ride'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default AdminRidesPage;
