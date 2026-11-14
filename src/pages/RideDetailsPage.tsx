import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  Bike,
  Car,
  ShieldCheck,
  Phone,
  Mail,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowLeft,
  XCircle,
  MessageSquare,
  Star,
  Flag,
  Ban,
  BadgeCheck,
  Route
} from 'lucide-react';
import api from '../services/api.ts';
import { Ride, RideRequest, Review, EligibleReviewTarget } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import MapView from '../components/MapView.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';
import Modal from '../components/Modal.tsx';
import Breadcrumb from '../components/Breadcrumb.tsx';
import RateUserModal from '../components/RateUserModal.tsx';
import ReportUserModal from '../components/ReportUserModal.tsx';

export const RideDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [ride, setRide] = useState<Ride | null>(null);
  const [userRequest, setUserRequest] = useState<RideRequest | null>(null);
  const [isDriver, setIsDriver] = useState(false);
  const [isBlockedPair, setIsBlockedPair] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [eligibleTargets, setEligibleTargets] = useState<EligibleReviewTarget[]>([]);

  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [blockingDriver, setBlockingDriver] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [rateTarget, setRateTarget] = useState<EligibleReviewTarget | null>(null);

  const fetchRideDetails = async () => {
    try {
      const [rideRes, revRes] = await Promise.allSettled([
        api.get(`/rides/${id}`),
        api.get(`/reviews/ride/${id}`)
      ]);

      if (rideRes.status === 'fulfilled' && rideRes.value.data?.success) {
        setRide(rideRes.value.data.ride);
        setUserRequest(rideRes.value.data.userRequest || null);
        setIsDriver(Boolean(rideRes.value.data.isDriver));
        setIsBlockedPair(Boolean(rideRes.value.data.isBlockedPair));
      }
      if (revRes.status === 'fulfilled' && revRes.value.data?.success) {
        setReviews(revRes.value.data.reviews || []);
        setEligibleTargets(revRes.value.data.eligible_targets || []);
      }
    } catch (err: any) {
      console.warn('Ride details error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRideDetails();
  }, [id, user]);

  const handleBookRequest = async () => {
    if (!user) {
      navigate(`/login?redirect=/rides/${id}`);
      return;
    }

    setRequesting(true);
    try {
      const res = await api.post(`/rides/${id}/requests`);
      if (res.data?.success) {
        showToast(res.data.message || 'Ride requested.', 'success');
        setShowConfirmModal(false);
        fetchRideDetails();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Request failed.';
      showToast(msg, 'error');
    } finally {
      setRequesting(false);
    }
  };

  const handleCancelMyRequest = async () => {
    if (!userRequest) return;
    try {
      const res = await api.patch(`/requests/${userRequest.id}/cancel`);
      if (res.data?.success) {
        showToast(res.data.message || 'Booking cancelled.', 'info');
        setShowCancelModal(false);
        fetchRideDetails();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Cancellation failed.', 'error');
    }
  };

  const handleMessageDriver = async () => {
    if (!ride) return;
    setOpeningChat(true);
    try {
      const res = await api.post('/chat/conversations', { ride_id: ride.id });
      if (res.data?.success && res.data.conversation?.id) {
        navigate(`/messages?conversation=${res.data.conversation.id}`);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Unable to start chat.', 'error');
    } finally {
      setOpeningChat(false);
    }
  };

  const handleBlockDriver = async () => {
    if (!ride) return;
    setBlockingDriver(true);
    try {
      const res = await api.post('/safety/blocks', { blocked_id: ride.driver_id });
      if (res.data?.success) {
        showToast(res.data.message || 'User blocked.', 'info');
        fetchRideDetails();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to block user.', 'error');
    } finally {
      setBlockingDriver(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-sm">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Ride Not Found</h2>
        <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] mb-5">
          This ride may have departed or was cancelled.
        </p>
        <Link
          to="/search"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#515FC5] dark:bg-[#818CF8] text-white dark:text-[#111827] rounded-xl text-xs font-bold hover:bg-[#434FA8]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Search
        </Link>
      </div>
    );
  }

  const depDate = new Date(ride.departure_time);
  const formattedDate = depDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  const formattedTime = depDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const isBike = ride.vehicle_type === 'bike';
  const isExpired = depDate.getTime() <= Date.now();
  const isAccepted = userRequest?.status === 'accepted';
  const isPending = userRequest?.status === 'pending';
  const isBookableStatus = ride.status === 'open' || ride.status === 'scheduled';
  const canRequest =
    !isDriver &&
    !isBlockedPair &&
    isBookableStatus &&
    ride.seats_available > 0 &&
    !isExpired &&
    !isAccepted &&
    !isPending;

  const canMessageDriver = Boolean(user && !isDriver && !isBlockedPair && (isPending || isAccepted));
  const pendingRateDriver = eligibleTargets.find((t) => t.role === 'driver' && !t.already_reviewed);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Breadcrumb
          items={[
            { label: 'Find a Ride', path: '/search' },
            { label: `${ride.pickup_name} to ${ride.dest_name}` }
          ]}
        />
        <Link
          to="/search"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#626E86] dark:text-[#B0BCD0] hover:text-[#515FC5] dark:hover:text-[#818CF8] transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Search
        </Link>
      </div>

      {isBlockedPair && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-2xl flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2 font-semibold">
            <Ban className="w-4 h-4 shrink-0" />
            <span>Messaging and booking are restricted because one of you has blocked the other.</span>
          </div>
          <Link to="/safety" className="font-bold underline whitespace-nowrap">
            Manage Blocks
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Route, Map, and Driver Info */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Route Card */}
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 sm:p-8 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D4DAE7] dark:border-[#34445E]">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-[#515FC5] dark:text-[#818CF8] uppercase tracking-wider mb-1">
                  <span>Campus Trip</span>
                  {ride.distance_km !== undefined && (
                    <span className="font-mono text-[#626E86] dark:text-[#B0BCD0] normal-case tabular-nums">
                      · {ride.distance_km} km
                      {ride.estimated_minutes ? ` (~${ride.estimated_minutes} min est.)` : ''}
                    </span>
                  )}
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight">
                  {ride.pickup_name} → {ride.dest_name}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={ride.status} />
                <span className="text-2xl font-black text-[#515FC5] dark:text-[#67D5DF] font-mono tabular-nums">
                  ৳{Number(ride.fare).toFixed(0)}
                </span>
              </div>
            </div>

            {/* Interactive Map */}
            <MapView
              pickupLat={ride.pickup_lat}
              pickupLng={ride.pickup_lng}
              pickupName={ride.pickup_name}
              destLat={ride.dest_lat}
              destLng={ride.dest_lng}
              destName={ride.dest_name}
              height="520px"
            />

            {/* Route Details Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 bg-[#FFFFFF] dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] space-y-1">
                <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                  Date
                </span>
                <p className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC]">{formattedDate}</p>
              </div>

              <div className="p-3.5 bg-[#FFFFFF] dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] space-y-1">
                <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                  Departure
                </span>
                <p className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] font-mono tabular-nums">{formattedTime}</p>
              </div>

              <div className="p-3.5 bg-[#FFFFFF] dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] space-y-1">
                <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                  Distance / Est.
                </span>
                <p className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] font-mono tabular-nums flex items-center gap-1">
                  <Route className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                  {ride.distance_km !== undefined ? `${ride.distance_km} km` : 'Campus'}
                </p>
              </div>

              <div className="p-3.5 bg-[#FFFFFF] dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] space-y-1">
                <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                  Seats / Vehicle
                </span>
                <p className="text-xs font-bold text-[#515FC5] dark:text-[#818CF8] font-mono tabular-nums flex items-center gap-1.5 capitalize">
                  {isBike ? (
                    <Bike className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                  ) : (
                    <Car className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                  )}
                  {ride.seats_available}/{ride.seats_total} left
                </p>
              </div>
            </div>

            {/* Driver Notes */}
            {ride.note && (
              <div className="p-4 bg-[#DDE2FA]/60 dark:bg-[#818CF8]/15 rounded-xl border border-[#515FC5]/20 dark:border-[#818CF8]/30 space-y-1">
                <span className="text-[10px] font-bold text-[#515FC5] dark:text-[#818CF8] uppercase tracking-wider block">
                  Driver Notes
                </span>
                <p className="text-xs text-[#222B42] dark:text-[#F1F4FC] leading-relaxed italic">
                  "{ride.note}"
                </p>
              </div>
            )}
          </div>

          {/* Ride Reviews Section */}
          {reviews.length > 0 && (
            <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
              <h2 className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] uppercase tracking-wider flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500" />
                Trip Reviews ({reviews.length})
              </h2>
              <div className="divide-y divide-[#D4DAE7] dark:divide-[#34445E]">
                {reviews.map((rv) => (
                  <div key={rv.id} className="py-3 first:pt-0 last:pb-0 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                        {rv.reviewer_name} → {rv.reviewee_name}
                      </span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {rv.rating}/5 ★
                      </span>
                    </div>
                    {rv.comment && (
                      <p className="text-[#626E86] dark:text-[#B0BCD0]">{rv.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Driver Profile & Booking Action */}
        <div className="lg:col-span-4 space-y-6">
          {/* Booking Action Card */}
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-5">
            <h3 className="font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">Ride Reservation</h3>

            {isDriver ? (
              <div className="p-4 bg-[#FFFFFF] dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs text-[#626E86] dark:text-[#B0BCD0] space-y-3">
                <p className="font-semibold text-[#222B42] dark:text-[#F1F4FC]">
                  You are the driver of this ride.
                </p>
                <Link
                  to="/my-rides"
                  className="block w-full py-2.5 text-center bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] font-bold rounded-xl shadow-xs transition-colors"
                >
                  Manage Ride
                </Link>
              </div>
            ) : userRequest ? (
              <div className="space-y-3">
                <div
                  className={`p-4 rounded-xl border ${
                    isAccepted
                      ? 'bg-[#DDE2FA] dark:bg-[#818CF8]/15 border-[#515FC5]/30 dark:border-[#818CF8]/30 text-[#222B42] dark:text-[#F1F4FC]'
                      : isPending
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                      : 'bg-[#FFFFFF] dark:bg-[#24334B] border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isAccepted ? (
                      <CheckCircle2 className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="font-bold text-xs">
                      {isAccepted
                        ? 'Booking Confirmed'
                        : isPending
                        ? 'Request Pending'
                        : `Status: ${userRequest.status}`}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-80 leading-relaxed">
                    {isAccepted
                      ? 'Your seat is confirmed. Coordinate via in-app chat or driver contact below.'
                      : isPending
                      ? 'Awaiting driver approval. You can message the driver about pickup details.'
                      : 'This booking request is inactive.'}
                  </p>
                </div>

                {canMessageDriver && (
                  <button
                    onClick={handleMessageDriver}
                    disabled={openingChat}
                    className="w-full py-2.5 px-4 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4" />
                    {openingChat ? 'Opening Chat...' : 'Message Driver'}
                  </button>
                )}

                {pendingRateDriver && (
                  <button
                    onClick={() => setRateTarget(pendingRateDriver)}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Star className="w-4 h-4" /> Rate Driver
                  </button>
                )}

                {(isPending || isAccepted) && ride.status !== 'completed' && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="w-full py-2.5 px-4 bg-[#FFFFFF] dark:bg-[#24334B] hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Cancel Booking
                  </button>
                )}

                {!isPending && !isAccepted && canRequest && (
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    className="w-full py-3 px-4 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Request Seat Again
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-[#626E86] dark:text-[#B0BCD0]">
                  <span>Fare Per Seat</span>
                  <span className="font-bold text-[#222B42] dark:text-[#F1F4FC] font-mono text-base tabular-nums">
                    ৳{Number(ride.fare).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#626E86] dark:text-[#B0BCD0]">
                  <span>Seats Left</span>
                  <span className="font-bold text-[#515FC5] dark:text-[#818CF8] font-mono tabular-nums">
                    {ride.seats_available}
                  </span>
                </div>

                {canRequest ? (
                  <button
                    onClick={() => {
                      if (!user) {
                        navigate(`/login?redirect=/rides/${id}`);
                      } else {
                        setShowConfirmModal(true);
                      }
                    }}
                    className="w-full py-3 px-4 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Request Seat
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full py-3 px-4 bg-[#E1E6F0] dark:bg-[#24334B] text-[#626E86] dark:text-[#B0BCD0] font-bold text-xs rounded-xl cursor-not-allowed"
                  >
                    {isBlockedPair
                      ? 'Unavailable (Blocked)'
                      : isExpired
                      ? 'Ride Departed'
                      : ride.status === 'full' || ride.seats_available === 0
                      ? 'Ride Full'
                      : `Ride ${ride.status}`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Driver Contact & Vehicle Profile (F17 Privacy Enforced) */}
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#DDE2FA] dark:bg-[#818CF8]/20 text-[#515FC5] dark:text-[#818CF8] flex items-center justify-center font-bold text-sm border border-[#515FC5]/20 dark:border-[#818CF8]/30 overflow-hidden shrink-0">
                {ride.driver_avatar_url ? (
                  <img
                    src={ride.driver_avatar_url}
                    alt={ride.driver_name || 'Driver'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  ride.driver_name?.charAt(0) || 'D'
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-[#222B42] dark:text-[#F1F4FC] text-sm truncate">
                    {ride.driver_name}
                  </h4>
                  {ride.driver_student_verified === 1 && (
                    <BadgeCheck className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8] shrink-0" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#626E86] dark:text-[#B0BCD0]">
                  <span className="text-[#515FC5] dark:text-[#818CF8] font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Approved Driver
                  </span>
                  {ride.driver_avg_rating !== null && ride.driver_avg_rating !== undefined && (
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                      · {ride.driver_avg_rating}★ ({ride.driver_review_count || 0})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#D4DAE7] dark:border-[#34445E] space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
                  Vehicle Model
                </span>
                <p className="font-semibold text-[#222B42] dark:text-[#F1F4FC]">
                  {ride.driver_vehicle_model || (isBike ? 'Motorbike' : 'Passenger Car')}
                </p>
              </div>

              {/* Contact Information (Rule F17 + show_phone_to_accepted Privacy Rule) */}
              {isAccepted || isDriver ? (
                <div className="p-3.5 bg-[#DDE2FA]/70 dark:bg-[#818CF8]/15 border border-[#515FC5]/20 dark:border-[#818CF8]/30 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-[#222B42] dark:text-[#F1F4FC] font-bold">
                    <Phone className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                    <span>
                      Phone: {ride.driver_phone ? ride.driver_phone : 'Hidden by user (use in-app chat)'}
                    </span>
                  </div>
                  {ride.driver_vehicle_plate && (
                    <div className="flex items-center gap-2 text-[#626E86] dark:text-[#B0BCD0]">
                      <Car className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0]" />
                      <span>Plate: {ride.driver_vehicle_plate}</span>
                    </div>
                  )}
                  {ride.driver_email && (
                    <div className="flex items-center gap-2 text-[#626E86] dark:text-[#B0BCD0]">
                      <Mail className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0]" />
                      <span className="font-mono truncate">{ride.driver_email}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-[#FFFFFF] dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl space-y-1.5 text-[#626E86] dark:text-[#B0BCD0]">
                  <div className="flex items-center gap-1.5 text-[#222B42] dark:text-[#F1F4FC] font-semibold text-xs">
                    <Lock className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0]" />
                    <span>Contact Protected</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Driver contact details are revealed only after booking confirmation.
                  </p>
                </div>
              )}

              {/* Safety Controls for Logged-in Passengers */}
              {user && !isDriver && (
                <div className="pt-2 border-t border-[#D4DAE7] dark:border-[#34445E] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Flag className="w-3 h-3" /> Report Driver
                  </button>
                  {!isBlockedPair && (
                    <button
                      type="button"
                      disabled={blockingDriver}
                      onClick={handleBlockDriver}
                      className="text-[11px] font-semibold text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Ban className="w-3 h-3" /> {blockingDriver ? 'Blocking...' : 'Block User'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm Ride Request"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Request 1 seat from <strong>{ride.pickup_name}</strong> to{' '}
            <strong>{ride.dest_name}</strong> for{' '}
            <strong className="text-[#515FC5] dark:text-[#818CF8] font-mono">৳{ride.fare}</strong>?
          </p>
          <div className="p-3 bg-[#DDE2FA] dark:bg-[#818CF8]/15 border border-[#515FC5]/20 dark:border-[#818CF8]/30 rounded-xl text-[11px] text-[#222B42] dark:text-[#F1F4FC]">
            Once accepted, coordinate pickup directly with your fellow DIU student.
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="px-4 py-2 border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] rounded-xl hover:bg-[#E1E6F0] dark:hover:bg-[#24334B]"
            >
              Cancel
            </button>
            <button
              onClick={handleBookRequest}
              disabled={requesting}
              className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5"
            >
              {requesting ? <Spinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
              {requesting ? 'Requesting...' : 'Confirm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Cancellation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Booking"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Are you sure you want to cancel your seat request for this trip?
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCancelModal(false)}
              className="px-4 py-2 border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] rounded-xl hover:bg-[#E1E6F0] dark:hover:bg-[#24334B]"
            >
              Keep Booking
            </button>
            <button
              onClick={handleCancelMyRequest}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              Cancel Seat
            </button>
          </div>
        </div>
      </Modal>

      {/* Report Driver Modal */}
      <ReportUserModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        reportedUserId={ride.driver_id}
        reportedUserName={ride.driver_name || 'Driver'}
        rideId={ride.id}
      />

      {/* Rate Driver Modal */}
      {rateTarget && (
        <RateUserModal
          isOpen={Boolean(rateTarget)}
          onClose={() => setRateTarget(null)}
          rideId={ride.id}
          revieweeId={rateTarget.user_id}
          revieweeName={rateTarget.name}
          roleLabel={rateTarget.role}
          onSuccess={fetchRideDetails}
        />
      )}
    </div>
  );
};

export default RideDetailsPage;
