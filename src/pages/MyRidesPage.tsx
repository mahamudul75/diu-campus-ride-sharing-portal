import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Compass,
  PlusCircle,
  Calendar,
  Clock,
  Users,
  Edit,
  XCircle,
  CheckCircle,
  MessageSquare,
  Play,
  BadgeCheck,
  Star,
  Flag,
  Ban
} from 'lucide-react';
import api from '../services/api.ts';
import { Ride, RideRequest } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Skeleton from '../components/Skeleton.tsx';
import EmptyState from '../components/EmptyState.tsx';
import Modal from '../components/Modal.tsx';
import RateUserModal from '../components/RateUserModal.tsx';
import ReportUserModal from '../components/ReportUserModal.tsx';

function toLocalDateTimeInputValue(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const MyRidesPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  // Requests Modal State
  const [activeRideForRequests, setActiveRideForRequests] = useState<Ride | null>(null);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [reviewedPassengerIds, setReviewedPassengerIds] = useState<Set<number>>(new Set());
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Edit Ride Modal State (full fields supported by PUT /api/rides/:id)
  const [editingRide, setEditingRide] = useState<Ride | null>(null);
  const [editPickupName, setEditPickupName] = useState('');
  const [editDestName, setEditDestName] = useState('');
  const [editDepartureLocal, setEditDepartureLocal] = useState('');
  const [editSeatsTotal, setEditSeatsTotal] = useState('1');
  const [editVehicleType, setEditVehicleType] = useState<'bike' | 'car'>('bike');
  const [editFare, setEditFare] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Cancel Ride Modal State
  const [cancelRideId, setCancelRideId] = useState<number | null>(null);
  const [cancellingRide, setCancellingRide] = useState(false);

  // Safety & Rating Modals
  const [rateTarget, setRateTarget] = useState<{ rideId: number; passengerId: number; passengerName: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<{ rideId: number; userId: number; userName: string } | null>(null);

  const fetchMyRides = async (): Promise<Ride[]> => {
    try {
      const res = await api.get('/rides/mine');
      if (res.data?.success) {
        const nextRides: Ride[] = res.data.rides || [];
        setRides(nextRides);
        setActiveRideForRequests((curr) =>
          curr ? nextRides.find((r) => r.id === curr.id) || curr : null
        );
        return nextRides;
      }
    } catch (err) {
      console.warn('Failed to fetch my rides:', err);
    } finally {
      setLoading(false);
    }
    return [];
  };

  useEffect(() => {
    fetchMyRides();
  }, []);

  const openRequestsModal = async (ride: Ride) => {
    setActiveRideForRequests(ride);
    setLoadingRequests(true);
    try {
      const [reqRes, revRes] = await Promise.allSettled([
        api.get(`/rides/${ride.id}/requests`),
        api.get(`/reviews/ride/${ride.id}`)
      ]);
      if (reqRes.status === 'fulfilled' && reqRes.value.data?.success) {
        setRequests(reqRes.value.data.requests || []);
      }
      if (revRes.status === 'fulfilled' && revRes.value.data?.success) {
        const eligible = revRes.value.data.eligible_targets || [];
        const reviewedSet = new Set<number>(
          eligible.filter((t: any) => t.already_reviewed).map((t: any) => Number(t.user_id))
        );
        setReviewedPassengerIds(reviewedSet);
      }
    } catch (err) {
      console.warn('Failed to load ride requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleAcceptRequest = async (requestId: number) => {
    try {
      const res = await api.patch(`/requests/${requestId}/accept`);
      if (res.data?.success) {
        showToast(res.data.message || 'Request accepted!', 'success');
        const updatedRides = await fetchMyRides();
        if (activeRideForRequests) {
          const updatedRide = updatedRides.find((r) => r.id === activeRideForRequests.id) || activeRideForRequests;
          openRequestsModal(updatedRide);
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to accept request.', 'error');
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    try {
      const res = await api.patch(`/requests/${requestId}/reject`);
      if (res.data?.success) {
        showToast(res.data.message || 'Request rejected.', 'info');
        const updatedRides = await fetchMyRides();
        if (activeRideForRequests) {
          const updatedRide = updatedRides.find((r) => r.id === activeRideForRequests.id) || activeRideForRequests;
          openRequestsModal(updatedRide);
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to reject request.', 'error');
    }
  };

  const handleMessagePassenger = async (rideId: number, passengerId: number) => {
    try {
      const res = await api.post('/chat/conversations', { ride_id: rideId, passenger_id: passengerId });
      if (res.data?.success && res.data.conversation?.id) {
        navigate(`/messages?conversation=${res.data.conversation.id}`);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Unable to open chat.', 'error');
    }
  };

  const handleBlockPassenger = async (passengerId: number) => {
    try {
      const res = await api.post('/safety/blocks', { blocked_id: passengerId });
      if (res.data?.success) {
        showToast(res.data.message || 'Passenger blocked.', 'info');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to block user.', 'error');
    }
  };

  const handleConfirmCancelRide = async () => {
    if (!cancelRideId) return;

    setCancellingRide(true);
    try {
      const res = await api.patch(`/rides/${cancelRideId}/cancel`);
      if (res.data?.success) {
        showToast(res.data.message || 'Ride cancelled.', 'info');
        setCancelRideId(null);
        fetchMyRides();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to cancel ride.', 'error');
    } finally {
      setCancellingRide(false);
    }
  };

  const handleStatusChange = async (rideId: number, status: 'open' | 'in_progress' | 'completed') => {
    try {
      const res = await api.patch(`/rides/${rideId}/status`, { status });
      if (res.data?.success) {
        showToast(res.data.message || 'Ride status updated.', 'success');
        fetchMyRides();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update ride status.', 'error');
    }
  };

  const openEditModal = (ride: Ride) => {
    setEditingRide(ride);
    setEditPickupName(ride.pickup_name);
    setEditDestName(ride.dest_name);
    setEditDepartureLocal(toLocalDateTimeInputValue(ride.departure_time));
    setEditSeatsTotal(String(ride.seats_total));
    setEditVehicleType(ride.vehicle_type);
    setEditFare(String(ride.fare));
    setEditNote(ride.note || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRide) return;

    const parsedDep = editDepartureLocal ? new Date(editDepartureLocal) : null;
    if (!parsedDep || isNaN(parsedDep.getTime())) {
      showToast('Please select a valid departure date and time.', 'error');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await api.put(`/rides/${editingRide.id}`, {
        pickup_name: editPickupName.trim(),
        dest_name: editDestName.trim(),
        departure_time: parsedDep.toISOString(),
        seats_total: Number(editSeatsTotal),
        vehicle_type: editVehicleType,
        fare: Number(editFare),
        note: editNote.trim() || null
      });
      if (res.data?.success) {
        showToast('Ride details updated.', 'success');
        setEditingRide(null);
        fetchMyRides();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update ride.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'My Rides' }]}
      title="My Posted Rides"
      subtitle="Manage your offered campus rides, trip status, and passengers"
      actions={
        <Link
          to="/rides/create"
          className="px-3.5 py-1.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Post Ride
        </Link>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton type="card" count={3} />
          </div>
        ) : rides.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No rides posted"
            description="You haven't posted any campus rides yet."
            action={
              <Link
                to="/rides/create"
                className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Post a Ride
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {rides.map((ride) => {
              const depDate = new Date(ride.departure_time);
              const isEditable = ride.status === 'scheduled' || ride.status === 'open' || ride.status === 'full';
              const canStart = ride.status === 'scheduled' || ride.status === 'open' || ride.status === 'full';
              const canComplete = ride.status === 'open' || ride.status === 'full' || ride.status === 'in_progress';
              const canCancel = isEditable || ride.status === 'in_progress';

              return (
                <div
                  key={ride.id}
                  className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-4 sm:p-5 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all"
                >
                  {/* Route Information */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        to={`/rides/${ride.id}`}
                        className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC] hover:text-[#515FC5] dark:hover:text-[#818CF8] transition-colors"
                      >
                        {ride.pickup_name} → {ride.dest_name}
                      </Link>
                      <StatusBadge status={ride.status} size="sm" />
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#626E86] dark:text-[#B0BCD0]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#626E86] dark:text-[#B0BCD0]" />
                        {depDate.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1 font-mono tabular-nums">
                        <Clock className="w-3 h-3 text-[#626E86] dark:text-[#B0BCD0]" />
                        {depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[#515FC5] dark:text-[#67D5DF] font-bold tabular-nums">
                        ৳{Number(ride.fare).toFixed(0)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1 font-semibold text-[#222B42] dark:text-[#F1F4FC] tabular-nums">
                        <Users className="w-3 h-3 text-[#626E86] dark:text-[#B0BCD0]" />
                        {ride.seats_available} / {ride.seats_total} seats left
                      </span>
                      {ride.distance_km !== undefined && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{ride.distance_km} km</span>
                        </>
                      )}
                    </div>

                    {ride.note && (
                      <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] italic">"{ride.note}"</p>
                    )}
                  </div>

                  {/* Driver Controls & Request Badge */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#D4DAE7]/50 dark:border-[#34445E]">
                    <button
                      onClick={() => openRequestsModal(ride)}
                      className="px-3 py-1.5 rounded-xl bg-[#DDE2FA]/70 hover:bg-[#DDE2FA] dark:bg-[#24334B] dark:hover:bg-[#172235] text-[#515FC5] dark:text-[#818CF8] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap border border-[#515FC5]/20 dark:border-[#818CF8]/30"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                      Passengers
                      <span className="px-1.5 py-0.2 bg-[#515FC5] dark:bg-[#818CF8] text-white rounded-full text-[10px] font-mono tabular-nums">
                        {ride.pending_requests_count || 0}
                      </span>
                    </button>

                    {ride.status === 'scheduled' && (
                      <button
                        onClick={() => handleStatusChange(ride.id, 'open')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Mark Open
                      </button>
                    )}

                    {isEditable && (
                      <button
                        onClick={() => openEditModal(ride)}
                        className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}

                    {canStart && (
                      <button
                        onClick={() => handleStatusChange(ride.id, 'in_progress')}
                        className="px-3 py-1.5 rounded-xl bg-[#DDE2FA]/60 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] hover:bg-[#DDE2FA] text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Start Trip
                      </button>
                    )}

                    {canComplete && (
                      <button
                        onClick={() => handleStatusChange(ride.id, 'completed')}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Complete
                      </button>
                    )}

                    {canCancel && (
                      <button
                        onClick={() => setCancelRideId(ride.id)}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Incoming Requests Modal */}
      <Modal
        isOpen={Boolean(activeRideForRequests)}
        onClose={() => setActiveRideForRequests(null)}
        title={`Passengers & Requests (${activeRideForRequests?.seats_available || 0} seats left)`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {loadingRequests ? (
            <div className="py-6 flex justify-center">
              <Skeleton type="card" count={2} />
            </div>
          ) : requests.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#626E86] dark:text-[#B0BCD0]">
              No booking requests for this ride yet.
            </div>
          ) : (
            <div className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E] max-h-96 overflow-y-auto space-y-3">
              {requests.map((req) => {
                const isCompletedRide = activeRideForRequests?.status === 'completed';
                const canMessage = req.status === 'pending' || req.status === 'accepted';
                const canRate =
                  isCompletedRide &&
                  req.status === 'accepted' &&
                  !reviewedPassengerIds.has(req.passenger_id);

                return (
                  <div
                    key={req.id}
                    className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                          {req.passenger_name}
                        </span>
                        {req.passenger_student_verified === 1 && (
                          <BadgeCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                        )}
                        {req.passenger_avg_rating !== null && req.passenger_avg_rating !== undefined && (
                          <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                            {req.passenger_avg_rating}★ ({req.passenger_review_count || 0})
                          </span>
                        )}
                        <StatusBadge status={req.status} size="sm" />
                      </div>
                      <div className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] font-mono">
                        ID: {req.passenger_student_id}
                        {req.passenger_phone ? ` · Phone: ${req.passenger_phone}` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {canMessage && activeRideForRequests && (
                        <button
                          onClick={() => handleMessagePassenger(activeRideForRequests.id, req.passenger_id)}
                          className="px-2.5 py-1 rounded-lg bg-[#E8ECF4] dark:bg-[#24334B] hover:bg-[#DDE2FA]/40 dark:hover:bg-[#172235] text-[#222B42] dark:text-[#F1F4FC] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <MessageSquare className="w-3 h-3" /> Chat
                        </button>
                      )}

                      {canRate && activeRideForRequests && (
                        <button
                          onClick={() =>
                            setRateTarget({
                              rideId: activeRideForRequests.id,
                              passengerId: req.passenger_id,
                              passengerName: req.passenger_name || 'Passenger'
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Star className="w-3 h-3" /> Rate
                        </button>
                      )}

                      {req.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleRejectRequest(req.id)}
                            className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition-colors cursor-pointer"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleAcceptRequest(req.id)}
                            disabled={activeRideForRequests?.seats_available === 0}
                            className="px-3 py-1 rounded-lg bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                          >
                            Accept
                          </button>
                        </>
                      )}

                      {activeRideForRequests && (
                        <>
                          <button
                            onClick={() =>
                              setReportTarget({
                                rideId: activeRideForRequests.id,
                                userId: req.passenger_id,
                                userName: req.passenger_name || 'Passenger'
                              })
                            }
                            title="Report passenger"
                            className="p-1.5 rounded-lg text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 cursor-pointer"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleBlockPassenger(req.passenger_id)}
                            title="Block passenger"
                            className="p-1.5 rounded-lg text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Full Edit Ride Modal */}
      <Modal
        isOpen={Boolean(editingRide)}
        onClose={() => setEditingRide(null)}
        title="Edit Ride Details"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Pickup Name</label>
              <input
                type="text"
                required
                minLength={2}
                value={editPickupName}
                onChange={(e) => setEditPickupName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
              />
            </div>

            <div>
              <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Destination Name</label>
              <input
                type="text"
                required
                minLength={2}
                value={editDestName}
                onChange={(e) => setEditDestName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Departure Date & Time</label>
              <input
                type="datetime-local"
                required
                value={editDepartureLocal}
                onChange={(e) => setEditDepartureLocal(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Vehicle Type</label>
              <select
                value={editVehicleType}
                onChange={(e) => setEditVehicleType(e.target.value as 'bike' | 'car')}
                className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
              >
                <option value="bike">Motorbike</option>
                <option value="car">Passenger Car</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Fare (৳)</label>
              <input
                type="number"
                required
                min="0"
                max="50000"
                value={editFare}
                onChange={(e) => setEditFare(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Total Seats (1–8)</label>
              <input
                type="number"
                required
                min="1"
                max="8"
                value={editSeatsTotal}
                onChange={(e) => setEditSeatsTotal(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Optional Note</label>
            <textarea
              rows={3}
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              className="w-full p-3 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D4DAE7] dark:border-[#34445E]">
            <button
              type="button"
              onClick={() => setEditingRide(null)}
              className="px-3.5 py-2 border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] rounded-xl hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Ride Confirmation Modal */}
      <Modal
        isOpen={Boolean(cancelRideId)}
        onClose={() => setCancelRideId(null)}
        title="Cancel Ride"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
            Are you sure you want to cancel this ride? All accepted passengers will be notified and seats released.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setCancelRideId(null)}
              className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer"
            >
              Keep Ride
            </button>
            <button
              onClick={handleConfirmCancelRide}
              disabled={cancellingRide}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancellingRide ? 'Cancelling...' : 'Cancel Ride'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Rate Passenger Modal */}
      {rateTarget && (
        <RateUserModal
          isOpen={Boolean(rateTarget)}
          onClose={() => setRateTarget(null)}
          rideId={rateTarget.rideId}
          revieweeId={rateTarget.passengerId}
          revieweeName={rateTarget.passengerName}
          roleLabel="passenger"
          onSuccess={() => {
            if (activeRideForRequests) openRequestsModal(activeRideForRequests);
          }}
        />
      )}

      {/* Report Passenger Modal */}
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

export default MyRidesPage;
