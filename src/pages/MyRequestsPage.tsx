import React, { useEffect, useRef, useState } from 'react';
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
  BadgeCheck,
  AlertCircle,
  RotateCcw,
  Users
} from 'lucide-react';
import api from '../services/api.ts';
import { RideRequest } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Skeleton from '../components/Skeleton.tsx';
import EmptyState from '../components/EmptyState.tsx';
import Modal from '../components/Modal.tsx';
import RateUserModal from '../components/RateUserModal.tsx';
import ReportUserModal from '../components/ReportUserModal.tsx';
import { isDbFlagTrue } from '../utils/boolean.ts';

type BookingFilter = 'all' | 'upcoming' | 'accepted' | 'completed' | 'cancelled';
type BookingsViewTab = 'incoming' | 'mine';

function matchesBookingFilter(req: RideRequest, filter: BookingFilter): boolean {
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
  if (filter === 'cancelled') {
    return req.status === 'cancelled' || req.status === 'rejected' || req.ride_status === 'cancelled';
  }
  return true;
}

export const MyRequestsPage: React.FC = () => {
  const navigate = useNavigate();
  const { isApprovedDriver } = useAuth();
  const { showToast } = useToast();

  const [activeView, setActiveView] = useState<BookingsViewTab>(() => (isApprovedDriver ? 'incoming' : 'mine'));

  // Passenger's own outgoing trip bookings (/api/requests/mine)
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchSeqRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Driver's incoming passenger requests (/api/requests/incoming)
  const [incomingRequests, setIncomingRequests] = useState<RideRequest[]>([]);
  const [incomingHasMore, setIncomingHasMore] = useState(false);
  const [incomingLoadingMore, setIncomingLoadingMore] = useState(false);
  const [incomingLoading, setIncomingLoading] = useState(isApprovedDriver);
  const [incomingError, setIncomingError] = useState<string | null>(null);
  const incomingSeqRef = useRef(0);
  const incomingAbortRef = useRef<AbortController | null>(null);

  const [filter, setFilter] = useState<BookingFilter>('all');

  // Action states
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedReqToCancel, setSelectedReqToCancel] = useState<{ id: number; wasAccepted: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [openingChatRideId, setOpeningChatRideId] = useState<number | null>(null);
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null);
  const [openingPassengerChatKey, setOpeningPassengerChatKey] = useState<string | null>(null);

  // Rate & Report modals
  const [rateTarget, setRateTarget] = useState<{ rideId: number; driverId: number; driverName: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<{ rideId: number; userId: number; userName: string } | null>(null);

  useEffect(() => {
    if (!isApprovedDriver && activeView !== 'mine') {
      setActiveView('mine');
    }
  }, [isApprovedDriver, activeView]);

  const fetchRequests = async (append = false, preserveCount?: number) => {
    const seq = ++fetchSeqRef.current;
    if (!append) {
      fetchAbortRef.current?.abort();
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    if (append) {
      setLoadingMore(true);
    } else if (requests.length === 0) {
      setLoading(true);
    }
    setError(null);
    try {
      const limit = append ? 100 : Math.min(200, Math.max(100, preserveCount || 100));
      const res = await api.get('/requests/mine', {
        params: { limit, offset: append ? requests.length : 0 },
        signal: controller.signal
      });
      if (seq !== fetchSeqRef.current) return;
      if (res.data?.success) {
        const incoming: RideRequest[] = res.data.requests || [];
        if (append) {
          setRequests((prev) => {
            const seen = new Set(prev.map((q) => q.id));
            return [...prev, ...incoming.filter((q) => !seen.has(q.id))];
          });
        } else {
          setRequests(incoming);
        }
        setHasMore(Boolean(res.data.pagination?.has_more) && incoming.length > 0);
      }
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') {
        return;
      }
      if (seq === fetchSeqRef.current) {
        setError(err?.response?.data?.message || 'Unable to load your ride bookings. Please try again.');
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const fetchIncomingRequests = async (append = false, preserveCount?: number) => {
    if (!isApprovedDriver) return;
    const seq = ++incomingSeqRef.current;
    if (!append) {
      incomingAbortRef.current?.abort();
    }
    const controller = new AbortController();
    incomingAbortRef.current = controller;

    if (append) {
      setIncomingLoadingMore(true);
    } else if (incomingRequests.length === 0) {
      setIncomingLoading(true);
    }
    setIncomingError(null);
    try {
      const limit = append ? 100 : Math.min(200, Math.max(100, preserveCount || 100));
      const res = await api.get('/requests/incoming', {
        params: { limit, offset: append ? incomingRequests.length : 0 },
        signal: controller.signal
      });
      if (seq !== incomingSeqRef.current) return;
      if (res.data?.success) {
        const rows: RideRequest[] = res.data.requests || [];
        if (append) {
          setIncomingRequests((prev) => {
            const seen = new Set(prev.map((q) => q.id));
            return [...prev, ...rows.filter((q) => !seen.has(q.id))];
          });
        } else {
          setIncomingRequests(rows);
        }
        setIncomingHasMore(Boolean(res.data.pagination?.has_more) && rows.length > 0);
      }
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') {
        return;
      }
      if (seq === incomingSeqRef.current) {
        setIncomingError(err?.response?.data?.message || 'Unable to load incoming passenger requests. Please try again.');
      }
    } finally {
      if (seq === incomingSeqRef.current) {
        setIncomingLoading(false);
        setIncomingLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    if (isApprovedDriver && activeView === 'incoming') {
      fetchIncomingRequests(false);
    } else {
      fetchRequests(false);
    }
    return () => {
      fetchAbortRef.current?.abort();
      incomingAbortRef.current?.abort();
    };
  }, [isApprovedDriver, activeView]);

  useEffect(() => {
    if (isApprovedDriver && activeView === 'incoming') {
      if (filter !== 'all' && incomingHasMore && !incomingLoadingMore && incomingRequests.length < 1000) {
        fetchIncomingRequests(true);
      }
    } else if (filter !== 'all' && hasMore && !loadingMore && requests.length < 1000) {
      fetchRequests(true);
    }
  }, [
    isApprovedDriver,
    activeView,
    filter,
    hasMore,
    loadingMore,
    requests.length,
    incomingHasMore,
    incomingLoadingMore,
    incomingRequests.length
  ]);

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
        fetchRequests(false, requests.length);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to cancel request.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleAcceptIncoming = async (requestId: number) => {
    if (processingRequestId !== null) return;
    setProcessingRequestId(requestId);
    try {
      const res = await api.patch(`/requests/${requestId}/accept`);
      if (res.data?.success) {
        showToast(res.data.message || 'Request accepted!', 'success');
        fetchIncomingRequests(false, incomingRequests.length);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to accept request.', 'error');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectIncoming = async (requestId: number) => {
    if (processingRequestId !== null) return;
    setProcessingRequestId(requestId);
    try {
      const res = await api.patch(`/requests/${requestId}/reject`);
      if (res.data?.success) {
        showToast(res.data.message || 'Request rejected.', 'info');
        fetchIncomingRequests(false, incomingRequests.length);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to reject request.', 'error');
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleMessageDriver = async (rideId: number) => {
    if (openingChatRideId === rideId) return;
    setOpeningChatRideId(rideId);
    try {
      const res = await api.post('/chat/conversations', { ride_id: rideId });
      if (res.data?.success && res.data.conversation?.id) {
        navigate(`/messages?conversation=${res.data.conversation.id}`);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Unable to start chat.', 'error');
    } finally {
      setOpeningChatRideId(null);
    }
  };

  const handleMessagePassenger = async (rideId: number, passengerId: number) => {
    const chatKey = `${rideId}:${passengerId}`;
    if (openingPassengerChatKey === chatKey) return;
    setOpeningPassengerChatKey(chatKey);
    try {
      const res = await api.post('/chat/conversations', { ride_id: rideId, passenger_id: passengerId });
      if (res.data?.success && res.data.conversation?.id) {
        navigate(`/messages?conversation=${res.data.conversation.id}`);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Unable to open chat.', 'error');
    } finally {
      setOpeningPassengerChatKey(null);
    }
  };

  const filteredRequests = requests.filter((req) => matchesBookingFilter(req, filter));
  const filteredIncomingRequests = incomingRequests.filter((req) => matchesBookingFilter(req, filter));
  const pendingIncomingCount = incomingRequests.filter((req) => req.status === 'pending').length;
  const showingIncoming = isApprovedDriver && activeView === 'incoming';

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Bookings' }]}
      title="My Bookings"
      subtitle={
        isApprovedDriver
          ? 'Manage incoming passenger requests for your rides and track your own trip bookings'
          : 'Track your campus ride requests, chat with drivers, and rate completed trips'
      }
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* View Tabs (Approved Drivers Only) */}
          {isApprovedDriver && (
            <div className="flex items-center gap-1 p-1 bg-[#E1E6F0] dark:bg-[#151F32] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] w-fit">
              <button
                type="button"
                onClick={() => setActiveView('incoming')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeView === 'incoming'
                    ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                    : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
                }`}
              >
                Incoming Requests
                {pendingIncomingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 dark:bg-amber-400/20 text-amber-700 dark:text-amber-300 text-[10px] font-mono tabular-nums">
                    {pendingIncomingCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveView('mine')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  activeView === 'mine'
                    ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                    : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
                }`}
              >
                My Trip Bookings
              </button>
            </div>
          )}

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
                type="button"
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
        </div>

        {showingIncoming ? (
          <>
            {incomingError && incomingRequests.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {incomingError}
                </span>
                <button
                  type="button"
                  onClick={() => fetchIncomingRequests(false, incomingRequests.length)}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}

            {incomingLoading && incomingRequests.length === 0 ? (
              <div className="space-y-3">
                <Skeleton type="card" count={4} />
              </div>
            ) : incomingError && incomingRequests.length === 0 ? (
              <div className="p-8 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-rose-200 dark:border-rose-800 space-y-3">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                    Could not load incoming booking requests
                  </h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">{incomingError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => fetchIncomingRequests(false)}
                  className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : filteredIncomingRequests.length === 0 ? (
              <EmptyState
                icon={Users}
                title={incomingRequests.length === 0 ? 'No incoming booking requests yet' : 'No matching incoming requests'}
                description={
                  incomingRequests.length === 0
                    ? 'Passenger requests submitted for your posted rides will appear here.'
                    : 'Try selecting a different booking filter above.'
                }
                action={
                  incomingRequests.length === 0 ? (
                    <Link
                      to="/my-rides"
                      className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs"
                    >
                      Manage My Rides
                    </Link>
                  ) : (
                    <button
                      type="button"
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
                {filteredIncomingRequests.map((req) => {
                  const isAccepted = req.status === 'accepted';
                  const isPending = req.status === 'pending';
                  const canMessage = isPending || isAccepted;
                  const canRespond =
                    isPending && req.ride_status !== 'completed' && req.ride_status !== 'cancelled';
                  const chatKey = `${req.ride_id}:${req.passenger_id}`;

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
                              Passenger: {req.passenger_name || 'DIU Student'}
                              {isDbFlagTrue(req.passenger_student_verified) && (
                                <BadgeCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                              )}
                            </span>
                            {req.passenger_student_id && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">{req.passenger_student_id}</span>
                              </>
                            )}
                            {req.passenger_avg_rating !== null && req.passenger_avg_rating !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                                  {req.passenger_avg_rating}★
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[#515FC5] dark:text-[#67D5DF] font-bold tabular-nums">
                              ৳{req.fare}
                            </span>
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
                              type="button"
                              disabled={openingPassengerChatKey === chatKey}
                              onClick={() => handleMessagePassenger(req.ride_id, req.passenger_id)}
                              className="px-3 py-1.5 rounded-xl bg-[#DDE2FA]/70 hover:bg-[#DDE2FA] dark:bg-[#24334B] dark:hover:bg-[#172235] text-[#515FC5] dark:text-[#818CF8] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> Chat
                            </button>
                          )}

                          {canRespond && (
                            <>
                              <button
                                type="button"
                                disabled={processingRequestId === req.id}
                                onClick={() => handleRejectIncoming(req.id)}
                                className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                disabled={req.seats_available === 0 || processingRequestId === req.id}
                                onClick={() => handleAcceptIncoming(req.id)}
                                className="px-3.5 py-1.5 rounded-xl bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                              >
                                {processingRequestId === req.id ? 'Processing...' : 'Accept'}
                              </button>
                            </>
                          )}

                          <Link
                            to={`/rides/${req.ride_id}`}
                            className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            Details <ArrowRight className="w-3 h-3" />
                          </Link>

                          {req.passenger_id && (
                            <button
                              type="button"
                              onClick={() =>
                                setReportTarget({
                                  rideId: req.ride_id,
                                  userId: req.passenger_id,
                                  userName: req.passenger_name || 'Passenger'
                                })
                              }
                              title="Report passenger"
                              className="p-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 cursor-pointer"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Passenger Contact Box (Accepted-only Privacy Rule) */}
                      {isAccepted ? (
                        <div className="p-3.5 bg-[#DDE2FA]/40 dark:bg-[#24334B]/60 border border-[#515FC5]/30 dark:border-[#818CF8]/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-bold text-[#344269] dark:text-[#818CF8]">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                              <span>Passenger Contact Details</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[#222B42] dark:text-[#F1F4FC]">
                              <span className="flex items-center gap-1 font-bold">
                                <Phone className="w-3 h-3 text-[#515FC5] dark:text-[#818CF8]" />
                                {req.passenger_phone || 'Hidden by passenger (use in-app chat)'}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={openingPassengerChatKey === chatKey}
                            onClick={() => handleMessagePassenger(req.ride_id, req.passenger_id)}
                            className="px-3 py-1.5 rounded-lg bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 self-start sm:self-center cursor-pointer disabled:opacity-50"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Chat Now
                          </button>
                        </div>
                      ) : isPending ? (
                        <div className="p-3 bg-[#E1E6F0]/60 dark:bg-[#151F32]/80 border border-[#D4DAE7] dark:border-[#34445E] rounded-xl flex items-center gap-2 text-xs text-[#626E86] dark:text-[#B0BCD0]">
                          <Lock className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0] shrink-0" />
                          <span>Passenger contact phone will be revealed once you accept this booking request.</span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {incomingHasMore && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => fetchIncomingRequests(true)}
                      disabled={incomingLoadingMore}
                      className="px-4 py-2 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] bg-[#F5F7FC] dark:bg-[#1C2A40] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] text-xs font-bold text-[#515FC5] dark:text-[#818CF8] cursor-pointer disabled:opacity-50"
                    >
                      {incomingLoadingMore ? 'Loading...' : 'Load More Requests'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {error && requests.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </span>
                <button
                  type="button"
                  onClick={() => fetchRequests(false, requests.length)}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}

            {loading && requests.length === 0 ? (
              <div className="space-y-3">
                <Skeleton type="card" count={4} />
              </div>
            ) : error && requests.length === 0 ? (
              <div className="p-8 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-rose-200 dark:border-rose-800 space-y-3">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">Could not load your bookings</h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => fetchRequests(false)}
                  className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry
                </button>
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
                      type="button"
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
                              {isDbFlagTrue(req.driver_student_verified) && (
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
                              type="button"
                              disabled={openingChatRideId === req.ride_id}
                              onClick={() => handleMessageDriver(req.ride_id)}
                              className="px-3 py-1.5 rounded-xl bg-[#DDE2FA]/70 hover:bg-[#DDE2FA] dark:bg-[#24334B] dark:hover:bg-[#172235] text-[#515FC5] dark:text-[#818CF8] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap disabled:opacity-50"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> Chat
                            </button>
                          )}

                          {canRate && req.driver_id && (
                            <button
                              type="button"
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
                              type="button"
                              onClick={() =>
                                setReportTarget({
                                  rideId: req.ride_id,
                                  userId: req.driver_id!,
                                  userName: req.driver_name || 'Driver'
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
                              type="button"
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
                            type="button"
                            disabled={openingChatRideId === req.ride_id}
                            onClick={() => handleMessageDriver(req.ride_id)}
                            className="px-3 py-1.5 rounded-lg bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 self-start sm:self-center cursor-pointer disabled:opacity-50"
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
                {hasMore && (
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => fetchRequests(true)}
                      disabled={loadingMore}
                      className="px-4 py-2 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] bg-[#F5F7FC] dark:bg-[#1C2A40] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] text-xs font-bold text-[#515FC5] dark:text-[#818CF8] cursor-pointer disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading...' : 'Load More Bookings'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Ride Request"
        preventClose={cancelling}
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            {selectedReqToCancel?.wasAccepted
              ? 'Are you sure you want to cancel this confirmed booking? Your seat will be returned to the driver and available to other students.'
              : 'Are you sure you want to cancel this pending ride request?'}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={cancelling}
              onClick={() => setCancelModalOpen(false)}
              className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Keep Request
            </button>
            <button
              type="button"
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
          onSuccess={() => fetchRequests(false, requests.length)}
        />
      )}

      {/* Report User Modal */}
      {reportTarget && (
        <ReportUserModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          reportedUserId={reportTarget.userId}
          reportedUserName={reportTarget.userName}
          rideId={reportTarget.rideId}
        />
      )}
    </DashboardLayout>
  );
};

export default MyRequestsPage;
