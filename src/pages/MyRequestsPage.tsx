import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  Phone,
  Car,
  ShieldCheck,
  XCircle,
  Lock,
  ArrowRight,
  MessageSquare,
  Star,
  Flag,
  BadgeCheck
} from 'lucide-react';
import api from '../services/api.ts';
import { RideRequest } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Skeleton from '../components/Skeleton.tsx';
import EmptyState from '../components/EmptyState.tsx';
import Modal from '../components/Modal.tsx';
import RateUserModal from '../components/RateUserModal.tsx';
import ReportUserModal from '../components/ReportUserModal.tsx';

type BookingFilter = 'all' | 'upcoming' | 'accepted' | 'completed' | 'cancelled';

export const MyRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<BookingFilter>('all');

  // Modal confirmation state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedReqToCancel, setSelectedReqToCancel] = useState<{ id: number; wasAccepted: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Rate & Report modals
  const [rateTarget, setRateTarget] = useState<{ rideId: number; driverId: number; driverName: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<{ rideId: number; driverId: number; driverName: string } | null>(null);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/requests/mine');
      if (res.data?.success) {
        setRequests(res.data.requests || []);
      }
    } catch (err) {
      console.warn('Failed to fetch requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const openCancelModal = (requestId: number, wasAccepted: boolean) => {
    setSelectedReqToCancel({ id: requestId, wasAccepted });
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedReqToCancel) return;

    setCancelling(true);
    try {
      const res = await api.patch(`/requests/${selectedReqToCancel.id}/cancel`);
      if (res.data?.success) {
        showToast(res.data.message || 'Request cancelled.', 'info');
        setCancelModalOpen(false);
        fetchRequests();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to cancel request.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleMessageDriver = async (rideId: number) => {
    try {
      const res = await api.post('/chat/conversations', { ride_id: rideId });
      if (res.data?.success && res.data.conversation?.id) {
        navigate(`/messages?conversation=${res.data.conversation.id}`);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Unable to start chat.', 'error');
    }
  };

  const filteredRequests = requests.filter((req) => {
    if (filter === 'all') return true;
    if (filter === 'upcoming') {
      return (
        (req.status === 'pending' || req.status === 'accepted') &&
        req.ride_status !== 'completed' &&
        req.ride_status !== 'cancelled'
      );
    }
    if (filter === 'accepted') return req.status === 'accepted';
    if (filter === 'completed') return req.ride_status === 'completed';
    if (filter === 'cancelled') return req.status === 'cancelled' || req.status === 'rejected' || req.ride_status === 'cancelled';
    return true;
  });

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Bookings' }]}
      title="My Bookings"
      subtitle="Track your campus ride requests, chat with drivers, and rate completed trips"
      actions={
        <Link
          to="/search"
          className="px-3.5 py-1.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 whitespace-nowrap"
        >
          Find a Ride
        </Link>
      }
    >
      <div className="space-y-4">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#E1E6F0] dark:bg-[#151F32] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] w-fit">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'upcoming', label: 'Upcoming' },
              { key: 'accepted', label: 'Accepted' },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' }
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filter === tab.key
                  ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                  : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton type="card" count={4} />
          </div>
        ) : filteredRequests.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={requests.length === 0 ? 'No ride requests yet' : 'No matching bookings'}
            description={
              requests.length === 0
                ? "You haven't requested any campus rides."
                : 'Try selecting a different booking filter above.'
            }
            action={
              requests.length === 0 ? (
                <Link
                  to="/search"
                  className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Find a Ride
                </Link>
              ) : (
                <button
                  onClick={() => setFilter('all')}
                  className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Show All
                </button>
              )
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((req) => {
              const isAccepted = req.status === 'accepted';
              const isPending = req.status === 'pending';
              const canCancel = (isPending || isAccepted) && req.ride_status !== 'completed' && req.ride_status !== 'cancelled';
              const canMessage = isPending || isAccepted;
              const canRate = req.ride_status === 'completed' && isAccepted && !req.has_reviewed && Boolean(req.driver_id);

              return (
                <div
                  key={req.id}
                  className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-4 sm:p-5 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3 transition-all"
                >
                  {/* Header with Route and Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D4DAE7]/50 dark:border-[#34445E]">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                          {req.pickup_name} → {req.dest_name}
                        </h3>
                        <StatusBadge status={req.status} size="sm" />
                        {req.ride_status && req.ride_status !== 'open' && (
                          <StatusBadge status={req.ride_status} size="sm" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#626E86] dark:text-[#B0BCD0]">
                        <span className="inline-flex items-center gap-1 font-semibold text-[#222B42] dark:text-[#F1F4FC]">
                          Driver: {req.driver_name}
                          {req.driver_student_verified === 1 && (
                            <BadgeCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                          )}
                        </span>
                        {req.driver_avg_rating !== null && req.driver_avg_rating !== undefined && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                              {req.driver_avg_rating}★
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#515FC5] dark:text-[#67D5DF] font-bold tabular-nums">৳{req.fare}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {req.departure_time
                            ? new Date(req.departure_time).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : new Date(req.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {canMessage && (
                        <button
                          onClick={() => handleMessageDriver(req.ride_id)}
                          className="px-3 py-1.5 rounded-xl bg-[#DDE2FA]/70 hover:bg-[#DDE2FA] dark:bg-[#24334B] dark:hover:bg-[#172235] text-[#515FC5] dark:text-[#818CF8] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Chat
                        </button>
                      )}

                      {canRate && req.driver_id && (
                        <button
                          onClick={() =>
                            setRateTarget({
                              rideId: req.ride_id,
                              driverId: req.driver_id!,
                              driverName: req.driver_name || 'Driver'
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        >
                          <Star className="w-3.5 h-3.5" /> Rate Driver
                        </button>
                      )}

                      <Link
                        to={`/rides/${req.ride_id}`}
                        className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] transition-colors flex items-center gap-1 whitespace-nowrap"
                      >
                        Details <ArrowRight className="w-3 h-3" />
                      </Link>

                      {req.driver_id && (
                        <button
                          onClick={() =>
                            setReportTarget({
                              rideId: req.ride_id,
                              driverId: req.driver_id!,
                              driverName: req.driver_name || 'Driver'
                            })
                          }
                          title="Report user"
                          className="p-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canCancel && (
                        <button
                          onClick={() => openCancelModal(req.id, isAccepted)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Driver Contact Box (Rule F17 + show_phone_to_accepted Privacy) */}
                  {isAccepted ? (
                    <div className="p-3.5 bg-[#DDE2FA]/40 dark:bg-[#24334B]/60 border border-[#515FC5]/30 dark:border-[#818CF8]/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-[#344269] dark:text-[#818CF8]">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                          <span>Driver Contact Details</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[#222B42] dark:text-[#F1F4FC]">
                          <span className="flex items-center gap-1 font-bold">
                            <Phone className="w-3 h-3 text-[#515FC5] dark:text-[#818CF8]" />
                            {req.driver_phone || 'Hidden by driver (use in-app chat)'}
                          </span>
                          {req.driver_vehicle_plate && (
                            <span className="flex items-center gap-1 font-mono">
                              <Car className="w-3 h-3 text-[#626E86] dark:text-[#B0BCD0]" />
                              {req.driver_vehicle_plate}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleMessageDriver(req.ride_id)}
                        className="px-3 py-1.5 rounded-lg bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 self-start sm:self-center cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Chat Now
                      </button>
                    </div>
                  ) : isPending ? (
                    <div className="p-3 bg-[#E1E6F0]/60 dark:bg-[#151F32]/80 border border-[#D4DAE7] dark:border-[#34445E] rounded-xl flex items-center gap-2 text-xs text-[#626E86] dark:text-[#B0BCD0]">
                      <Lock className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0] shrink-0" />
                      <span>Driver contact phone will be revealed once your booking is accepted.</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Ride Request"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            {selectedReqToCancel?.wasAccepted
              ? 'Are you sure you want to cancel this confirmed booking? Your seat will be returned to the driver and available to other students.'
              : 'Are you sure you want to cancel this pending ride request?'}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setCancelModalOpen(false)}
              className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer"
            >
              Keep Request
            </button>
            <button
              onClick={handleConfirmCancel}
              disabled={cancelling}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Rate Driver Modal */}
      {rateTarget && (
        <RateUserModal
          isOpen={Boolean(rateTarget)}
          onClose={() => setRateTarget(null)}
          rideId={rateTarget.rideId}
          revieweeId={rateTarget.driverId}
          revieweeName={rateTarget.driverName}
          roleLabel="driver"
          onSuccess={fetchRequests}
        />
      )}

      {/* Report Driver Modal */}
      {reportTarget && (
        <ReportUserModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          reportedUserId={reportTarget.driverId}
          reportedUserName={reportTarget.driverName}
          rideId={reportTarget.rideId}
        />
      )}
    </DashboardLayout>
  );
};

export default MyRequestsPage;
