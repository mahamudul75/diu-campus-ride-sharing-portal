import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  Clock,
  Bike,
  Car,
  Sparkles,
  BadgeCheck,
  CheckCircle2,
  XCircle,
  Phone,
  MessageSquare,
  Send,
  Edit3,
  ShieldCheck,
  Users,
  Route,
  RotateCcw
} from 'lucide-react';
import api from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { PassengerRequest, DriverOffer } from '../types/index.ts';
import DashboardLayout from '../components/DashboardLayout.tsx';
import MapView from '../components/MapView.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';
import Modal from '../components/Modal.tsx';
import EmptyState from '../components/EmptyState.tsx';
import { isDbFlagTrue } from '../utils/boolean.ts';

function toLocalDateTimeParts(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

function combineLocalDateTimeToIso(dateStr: string, timeStr: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
  if (!dm || !tm) return null;
  const dt = new Date(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
    tm[3] ? Number(tm[3]) : 0,
    0
  );
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

export const PassengerRequestDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isApprovedDriver } = useAuth();
  const { showToast } = useToast();

  const [request, setRequest] = useState<PassengerRequest | null>(null);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [myOffer, setMyOffer] = useState<DriverOffer | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [pendingOffersCount, setPendingOffersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Passenger actions
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [acceptTarget, setAcceptTarget] = useState<DriverOffer | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [rejectingOfferId, setRejectingOfferId] = useState<number | null>(null);

  // Driver offer form / edit state
  const [editingOffer, setEditingOffer] = useState(false);
  const [offerFare, setOfferFare] = useState('');
  const [offerSeats, setOfferSeats] = useState('1');
  const [offerDate, setOfferDate] = useState('');
  const [offerTime, setOfferTime] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const [openingChat, setOpeningChat] = useState(false);
  const fetchSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDetails = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading((prev) => (prev || !request ? true : prev));
    setAccessError(null);
    try {
      const res = await api.get(`/passenger-requests/${id}`, { signal: controller.signal });
      if (seq !== fetchSeqRef.current) return;
      if (res.data?.success) {
        const pr: PassengerRequest = res.data.request;
        setRequest(pr);
        setOffers(res.data.offers || []);
        setMyOffer(res.data.myOffer || null);
        setIsOwner(Boolean(res.data.isOwner));
        setPendingOffersCount(Number(res.data.pendingOffersCount || 0));

        if (res.data.myOffer) {
          const existing: DriverOffer = res.data.myOffer;
          const p = toLocalDateTimeParts(existing.pickup_time);
          setOfferFare(String(existing.fare));
          setOfferSeats(String(existing.seats_offered));
          setOfferDate(p.date);
          setOfferTime(p.time);
          setOfferMessage(existing.message || '');
        } else {
          const p = toLocalDateTimeParts(pr.departure_time);
          setOfferFare(pr.max_fare !== null && pr.max_fare !== undefined ? String(pr.max_fare) : '');
          setOfferSeats('1');
          setOfferDate(p.date);
          setOfferTime(p.time);
          setOfferMessage('');
        }
      }
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') {
        return;
      }
      if (seq === fetchSeqRef.current) {
        setAccessError(err.response?.data?.message || 'Passenger ride request is unavailable.');
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchDetails();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDetails]);

  const handleOpenChat = async (rideId: number) => {
    setOpeningChat(true);
    try {
      const res = await api.post('/chat/conversations', { ride_id: rideId });
      if (res.data?.success && res.data.conversation?.id) {
        navigate(`/messages?conversation=${res.data.conversation.id}`);
      } else {
        navigate('/messages');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Unable to open conversation.', 'error');
    } finally {
      setOpeningChat(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!request) return;
    setCancelling(true);
    try {
      const res = await api.patch(`/passenger-requests/${request.id}/cancel`);
      if (res.data?.success) {
        showToast(res.data.message || 'Ride request cancelled.', 'info');
        setCancelModalOpen(false);
        fetchDetails();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to cancel ride request.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleAcceptOffer = async () => {
    if (!request || !acceptTarget) return;
    setAccepting(true);
    try {
      const res = await api.patch(`/passenger-requests/${request.id}/offers/${acceptTarget.id}/accept`);
      if (res.data?.success) {
        showToast('Offer accepted! Your ride is now confirmed.', 'success');
        setAcceptTarget(null);
        await fetchDetails();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to accept offer.', 'error');
    } finally {
      setAccepting(false);
    }
  };

  const handleRejectOffer = async (offerId: number) => {
    if (!request) return;
    setRejectingOfferId(offerId);
    try {
      const res = await api.patch(`/passenger-requests/${request.id}/offers/${offerId}/reject`);
      if (res.data?.success) {
        showToast('Driver offer declined.', 'info');
        fetchDetails();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to decline offer.', 'error');
    } finally {
      setRejectingOfferId(null);
    }
  };

  const handleSubmitOrUpdateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!request) return;

    const fareNum = Number(offerFare);
    if (!Number.isFinite(fareNum) || fareNum < 0 || fareNum > 50000) {
      showToast('Fare must be between 0 and 50,000 BDT.', 'error');
      return;
    }

    const pickupIso = combineLocalDateTimeToIso(offerDate, offerTime);
    if (!pickupIso) {
      showToast('Please select a valid pickup date and time.', 'error');
      return;
    }

    const driverVehicle = user?.vehicle_type === 'bike' ? 'bike' : 'car';
    const seatsNum = driverVehicle === 'bike' ? 1 : Number(offerSeats);

    setSubmittingOffer(true);
    try {
      if (myOffer && editingOffer) {
        const res = await api.patch(`/passenger-requests/offers/${myOffer.id}`, {
          fare: fareNum,
          seats_offered: seatsNum,
          pickup_time: pickupIso,
          message: offerMessage.trim() || null
        });
        if (res.data?.success) {
          showToast('Your offer has been updated.', 'success');
          setEditingOffer(false);
          fetchDetails();
        }
      } else {
        const res = await api.post(`/passenger-requests/${request.id}/offers`, {
          fare: fareNum,
          seats_offered: seatsNum,
          pickup_time: pickupIso,
          message: offerMessage.trim() || null
        });
        if (res.data?.success) {
          showToast('Ride offer submitted to passenger!', 'success');
          fetchDetails();
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to submit offer.', 'error');
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleWithdrawOffer = async () => {
    if (!myOffer) return;
    setWithdrawing(true);
    try {
      const res = await api.patch(`/passenger-requests/offers/${myOffer.id}/withdraw`);
      if (res.data?.success) {
        showToast('Offer withdrawn.', 'info');
        setWithdrawModalOpen(false);
        fetchDetails();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to withdraw offer.', 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Ride Requests', path: '/passenger-requests' }]}
      >
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (accessError || !request) {
    return (
      <DashboardLayout
        breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Ride Requests', path: '/passenger-requests' }]}
      >
        <div className="max-w-lg mx-auto my-12 p-8 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">Request Unavailable</h2>
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] mb-5">
            {accessError || 'This passenger ride request could not be found.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchDetails();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 border border-[#D4DAE7] dark:border-[#34445E] bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] rounded-xl text-xs font-bold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry
            </button>
            <Link
              to="/passenger-requests"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#515FC5] dark:bg-[#818CF8] text-white dark:text-[#111827] rounded-xl text-xs font-bold"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Ride Requests
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const depDate = new Date(request.departure_time);
  const driverVehicleType = user?.vehicle_type === 'bike' ? 'bike' : 'car';
  const isDriverCompatible =
    request.vehicle_type === 'any' || request.vehicle_type === driverVehicleType;
  const acceptedOffer = offers.find((o) => o.status === 'accepted') || null;
  const confirmedRideId = request.confirmed_ride_id || acceptedOffer?.confirmed_ride_id || myOffer?.confirmed_ride_id;
  const confirmedRideStatus =
    request.confirmed_ride_status || acceptedOffer?.confirmed_ride_status || myOffer?.confirmed_ride_status || null;
  const isConfirmedRideCancelled =
    confirmedRideStatus === 'cancelled' || (Boolean(confirmedRideId) && request.status === 'cancelled');
  const isConfirmedActive =
    request.status === 'matched' && Boolean(confirmedRideId) && !isConfirmedRideCancelled;

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Ride Requests', path: '/passenger-requests' },
        { label: `Request #${request.id}` }
      ]}
      title={`${request.pickup_name} → ${request.dest_name}`}
      subtitle={`Requested for ${depDate.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/passenger-requests"
            className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] bg-white dark:bg-[#24334B] text-xs font-semibold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          {isOwner && request.status === 'open' && (
            <button
              onClick={() => setCancelModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold cursor-pointer flex items-center gap-1 whitespace-nowrap"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel Request
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Confirmed Match / Cancelled Ride Banner */}
        {isConfirmedActive && confirmedRideId && (
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                  Ride Confirmed & Matched
                </h3>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                  A confirmed campus ride (#{confirmedRideId}) has been scheduled and chat is unlocked.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => handleOpenChat(confirmedRideId)}
                disabled={openingChat}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#24334B] border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {openingChat ? 'Opening...' : 'Open Chat'}
              </button>
              <Link
                to={`/rides/${confirmedRideId}`}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                View Ride #{confirmedRideId}
              </Link>
            </div>
          </div>
        )}

        {isConfirmedRideCancelled && confirmedRideId && (
          <div className="p-4 sm:p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-black text-rose-900 dark:text-rose-200">
                  Confirmed Ride Cancelled
                </h3>
                <p className="text-xs text-rose-800/80 dark:text-rose-300/80 mt-0.5">
                  The matched campus ride (#{confirmedRideId}) was cancelled and is no longer active.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link
                to={`/rides/${confirmedRideId}`}
                className="px-4 py-2 rounded-xl bg-white dark:bg-[#24334B] border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                View Ride #{confirmedRideId}
              </Link>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Request Summary & Route Map */}
          <div className="lg:col-span-5 space-y-5">
            <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-5 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#D4DAE7] dark:border-[#34445E]">
                <div className="flex items-center gap-2">
                  <StatusBadge status={request.status} context="passenger_request" />
                  {request.status === 'open' && (
                    <span className="text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                      {pendingOffersCount} {pendingOffersCount === 1 ? 'pending offer' : 'pending offers'}
                    </span>
                  )}
                </div>
                {request.distance_km !== undefined && (
                  <span className="text-xs font-mono font-bold text-[#515FC5] dark:text-[#818CF8] flex items-center gap-1 tabular-nums">
                    <Route className="w-3.5 h-3.5" />
                    {request.distance_km} km · ~{request.estimated_minutes}m
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0] block">
                    Max Budget
                  </span>
                  <span className="text-sm font-black font-mono text-[#515FC5] dark:text-[#67D5DF] tabular-nums">
                    {request.max_fare !== null ? `৳${request.max_fare}` : 'Flexible'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0] block">
                    Vehicle Pref
                  </span>
                  <span className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC] inline-flex items-center gap-1.5 mt-0.5 capitalize">
                    {request.vehicle_type === 'bike' ? (
                      <Bike className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                    ) : request.vehicle_type === 'car' ? (
                      <Car className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                    )}
                    {request.vehicle_type === 'any' ? 'Any Vehicle' : request.vehicle_type}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0] block">
                    Seats Needed
                  </span>
                  <span className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] inline-flex items-center gap-1 mt-0.5 tabular-nums">
                    <Users className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                    {request.seats_needed} seat
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0] block">
                    Departure
                  </span>
                  <span className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] inline-flex items-center gap-1 mt-0.5 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                    {depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {request.note && (
                <div className="p-3 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] text-xs text-[#222B42] dark:text-[#F1F4FC]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0] block mb-1">
                    Passenger Note
                  </span>
                  {request.note}
                </div>
              )}

              {/* Passenger Info */}
              <div className="pt-3 border-t border-[#D4DAE7] dark:border-[#34445E] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {request.passenger_avatar_url ? (
                    <img
                      src={request.passenger_avatar_url}
                      alt={request.passenger_name}
                      className="w-9 h-9 rounded-xl object-cover border border-[#D4DAE7] dark:border-[#34445E]"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-[#DDE2FA] dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] flex items-center justify-center font-bold text-xs">
                      {request.passenger_name?.charAt(0) || 'P'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] truncate">
                        {request.passenger_name}
                      </span>
                      {isDbFlagTrue(request.passenger_student_verified) && (
                        <BadgeCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8] shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] font-mono">
                      ID: {request.passenger_student_id}
                      {request.passenger_avg_rating !== null && request.passenger_avg_rating !== undefined
                        ? ` · ${request.passenger_avg_rating}★`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>

              {request.passenger_phone && !isOwner && (
                <div className="p-3 rounded-xl bg-[#DDE2FA]/40 dark:bg-[#24334B]/60 border border-[#515FC5]/30 dark:border-[#818CF8]/30 text-xs flex items-center gap-2 font-semibold text-[#222B42] dark:text-[#F1F4FC]">
                  <Phone className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                  <span>{request.passenger_phone}</span>
                </div>
              )}
            </div>

            <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-3 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs overflow-hidden">
              <MapView
                pickupLat={Number(request.pickup_lat)}
                pickupLng={Number(request.pickup_lng)}
                pickupName={request.pickup_name}
                destLat={Number(request.dest_lat)}
                destLng={Number(request.dest_lng)}
                destName={request.dest_name}
                height="300px"
              />
            </div>
          </div>

          {/* Right Column: Owner Offers List OR Approved Driver Offer Console */}
          <div className="lg:col-span-7 space-y-5">
            {isOwner || user?.role === 'admin' ? (
              <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-5 sm:p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-black text-[#222B42] dark:text-[#F1F4FC]">
                      Driver Offers ({offers.length})
                    </h2>
                    <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                      Compare fares, proposed pickup times, and driver ratings. Accepting one offer automatically schedules your ride.
                    </p>
                  </div>
                </div>

                {offers.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="Waiting for driver offers"
                    description={
                      request.status === 'open'
                        ? 'Approved DIU drivers have been notified. Offers will appear here as drivers respond.'
                        : `No offers were submitted before this request became ${request.status}.`
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {offers.map((offer) => {
                      const isAccepted = offer.status === 'accepted';
                      const isOfferRideCancelled =
                        isAccepted &&
                        (offer.confirmed_ride_status === 'cancelled' || isConfirmedRideCancelled);
                      const isPending = offer.status === 'pending';
                      const withinBudget =
                        request.max_fare === null || Number(offer.fare) <= Number(request.max_fare);

                      return (
                        <div
                          key={offer.id}
                          className={`p-4 rounded-2xl border space-y-3 transition-all ${
                            isAccepted && !isOfferRideCancelled
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-800'
                              : isOfferRideCancelled
                              ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800'
                              : 'bg-white dark:bg-[#24334B] border-[#D4DAE7] dark:border-[#34445E]'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {offer.driver_avatar_url ? (
                                <img
                                  src={offer.driver_avatar_url}
                                  alt={offer.driver_name}
                                  className="w-10 h-10 rounded-xl object-cover border border-[#D4DAE7] dark:border-[#34445E] shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-[#DDE2FA] dark:bg-[#172235] text-[#515FC5] dark:text-[#818CF8] flex items-center justify-center font-bold text-sm shrink-0">
                                  {offer.driver_name?.charAt(0) || 'D'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC] truncate">
                                    {offer.driver_name}
                                  </span>
                                  {isDbFlagTrue(offer.driver_student_verified) && (
                                    <BadgeCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                                  )}
                                  <StatusBadge
                                    status={isOfferRideCancelled ? 'cancelled' : offer.status}
                                    size="sm"
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#626E86] dark:text-[#B0BCD0] mt-0.5">
                                  <span className="capitalize font-semibold">
                                    {offer.vehicle_type}
                                    {offer.driver_vehicle_model ? ` · ${offer.driver_vehicle_model}` : ''}
                                  </span>
                                  {offer.driver_avg_rating !== null && offer.driver_avg_rating !== undefined && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                                        {offer.driver_avg_rating}★ ({offer.driver_review_count})
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0">
                              <span className="text-lg font-black font-mono text-[#515FC5] dark:text-[#67D5DF] tabular-nums">
                                ৳{offer.fare}
                              </span>
                              <span
                                className={`text-[10px] font-bold ${
                                  withinBudget
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {request.max_fare === null
                                  ? 'Proposed fare'
                                  : withinBudget
                                  ? 'Within budget'
                                  : `৳${Number(offer.fare) - Number(request.max_fare)} above max`}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              Pickup:{' '}
                              <strong className="text-[#222B42] dark:text-[#F1F4FC]">
                                {new Date(offer.pickup_time).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </strong>
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Offering {offer.seats_offered} {offer.seats_offered === 1 ? 'seat' : 'seats'}
                            </span>
                          </div>

                          {offer.message && (
                            <p className="text-xs text-[#222B42] dark:text-[#F1F4FC] bg-[#F5F7FC] dark:bg-[#172235] px-3 py-2 rounded-xl border border-[#D4DAE7]/60 dark:border-[#34445E]">
                              "{offer.message}"
                            </p>
                          )}

                          {isAccepted && !isOfferRideCancelled && (
                            <div className="p-3 rounded-xl bg-white/80 dark:bg-[#172235] border border-emerald-200 dark:border-emerald-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex flex-wrap items-center gap-3 text-[#222B42] dark:text-[#F1F4FC]">
                                <span className="inline-flex items-center gap-1 font-bold">
                                  <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  {offer.driver_phone || 'Hidden by driver (use in-app chat)'}
                                </span>
                                {offer.driver_vehicle_plate && (
                                  <span className="font-mono text-[#626E86] dark:text-[#B0BCD0]">
                                    Plate: {offer.driver_vehicle_plate}
                                  </span>
                                )}
                              </div>
                              {offer.confirmed_ride_id && (
                                <Link
                                  to={`/rides/${offer.confirmed_ride_id}`}
                                  className="font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline"
                                >
                                  Ride Details →
                                </Link>
                              )}
                            </div>
                          )}

                          {isOfferRideCancelled && offer.confirmed_ride_id && (
                            <div className="p-3 rounded-xl bg-white/80 dark:bg-[#172235] border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-rose-700 dark:text-rose-300 font-semibold">
                                Matched ride was cancelled.
                              </span>
                              <Link
                                to={`/rides/${offer.confirmed_ride_id}`}
                                className="font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline"
                              >
                                Ride Details →
                              </Link>
                            </div>
                          )}

                          {isOwner && request.status === 'open' && isPending && (
                            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#D4DAE7]/60 dark:border-[#34445E]">
                              <button
                                onClick={() => handleRejectOffer(offer.id)}
                                disabled={rejectingOfferId === offer.id}
                                className="px-3.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                {rejectingOfferId === offer.id ? 'Declining...' : 'Decline'}
                              </button>
                              <button
                                onClick={() => setAcceptTarget(offer)}
                                className="px-4 py-1.5 rounded-xl bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold cursor-pointer flex items-center gap-1.5"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Accept Offer
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : isApprovedDriver ? (
              <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-5 sm:p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
                {myOffer && !editingOffer ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-black text-[#222B42] dark:text-[#F1F4FC]">Your Submitted Offer</h2>
                        <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                          Only you and the passenger can see your offer terms.
                        </p>
                      </div>
                      <StatusBadge
                        status={
                          myOffer.status === 'accepted' && isConfirmedRideCancelled
                            ? 'cancelled'
                            : myOffer.status
                        }
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E]">
                        <span className="text-[10px] font-bold uppercase text-[#626E86] dark:text-[#B0BCD0] block">
                          Your Fare
                        </span>
                        <span className="text-base font-black font-mono text-[#515FC5] dark:text-[#67D5DF] tabular-nums">
                          ৳{myOffer.fare}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E]">
                        <span className="text-[10px] font-bold uppercase text-[#626E86] dark:text-[#B0BCD0] block">
                          Pickup Time
                        </span>
                        <span className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] tabular-nums">
                          {new Date(myOffer.pickup_time).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E]">
                        <span className="text-[10px] font-bold uppercase text-[#626E86] dark:text-[#B0BCD0] block">
                          Seats Offered
                        </span>
                        <span className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] capitalize">
                          {myOffer.seats_offered} ({myOffer.vehicle_type})
                        </span>
                      </div>
                    </div>

                    {myOffer.message && (
                      <p className="text-xs text-[#222B42] dark:text-[#F1F4FC] bg-white dark:bg-[#24334B] p-3 rounded-xl border border-[#D4DAE7] dark:border-[#34445E]">
                        "{myOffer.message}"
                      </p>
                    )}

                    {myOffer.status === 'pending' && request.status === 'open' && (
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#D4DAE7] dark:border-[#34445E]">
                        <button
                          onClick={() => setWithdrawModalOpen(true)}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold cursor-pointer"
                        >
                          Withdraw Offer
                        </button>
                        <button
                          onClick={() => setEditingOffer(true)}
                          className="px-4 py-1.5 rounded-xl bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit Offer
                        </button>
                      </div>
                    )}
                  </div>
                ) : request.status !== 'open' ? (
                  <EmptyState
                    icon={Clock}
                    title={`Request is ${request.status}`}
                    description="This passenger ride request is no longer accepting new driver offers."
                  />
                ) : !isDriverCompatible ? (
                  <EmptyState
                    icon={Car}
                    title={`${request.vehicle_type.toUpperCase()} Vehicle Requested`}
                    description={`Your driver profile is registered with a ${driverVehicleType}, while this passenger specifically requested a ${request.vehicle_type}.`}
                  />
                ) : (
                  <form onSubmit={handleSubmitOrUpdateOffer} className="space-y-4">
                    <div>
                      <h2 className="text-base font-black text-[#222B42] dark:text-[#F1F4FC]">
                        {editingOffer ? 'Update Your Ride Offer' : 'Submit a Ride Offer'}
                      </h2>
                      <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                        Propose your fare and pickup time (within 4 hours of passenger departure).
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                          Offer Fare (৳)
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          max="50000"
                          value={offerFare}
                          onChange={(e) => setOfferFare(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl font-bold font-mono tabular-nums"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                          Seats Offered ({driverVehicleType === 'bike' ? 'Bike: 1 seat' : 'Car: 1–4 seats'})
                        </label>
                        {driverVehicleType === 'bike' ? (
                          <div className="px-3 py-2 bg-[#E8ECF4] dark:bg-[#172235] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl font-bold font-mono text-[#222B42] dark:text-[#F1F4FC]">
                            1 Seat (Bike)
                          </div>
                        ) : (
                          <select
                            value={offerSeats}
                            onChange={(e) => setOfferSeats(e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl font-bold font-mono"
                          >
                            <option value="1">1 Seat</option>
                            <option value="2">2 Seats</option>
                            <option value="3">3 Seats</option>
                            <option value="4">4 Seats</option>
                          </select>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                          Proposed Pickup Date
                        </label>
                        <input
                          type="date"
                          required
                          value={offerDate}
                          onChange={(e) => setOfferDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                          Proposed Pickup Time
                        </label>
                        <input
                          type="time"
                          required
                          value={offerTime}
                          onChange={(e) => setOfferTime(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl font-bold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                        Message to Passenger (Optional)
                      </label>
                      <textarea
                        rows={3}
                        maxLength={500}
                        placeholder="Share pickup point details, helmet availability, or extra seat capacity..."
                        value={offerMessage}
                        onChange={(e) => setOfferMessage(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D4DAE7] dark:border-[#34445E]">
                      {editingOffer && (
                        <button
                          type="button"
                          onClick={() => setEditingOffer(false)}
                          className="px-3.5 py-2 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={submittingOffer}
                        className="px-5 py-2 rounded-xl bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {submittingOffer ? 'Submitting...' : editingOffer ? 'Save Offer' : 'Send Ride Offer'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Cancel Request Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Ride Request"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Cancelling this request will close all pending driver offers and notify those drivers.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setCancelModalOpen(false)}
              className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] cursor-pointer"
            >
              Keep Request
            </button>
            <button
              onClick={handleCancelRequest}
              disabled={cancelling}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Accept Offer Confirmation Modal */}
      <Modal
        isOpen={Boolean(acceptTarget)}
        onClose={() => setAcceptTarget(null)}
        title="Confirm Driver Offer"
      >
        {acceptTarget && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F5F7FC] dark:bg-[#1C2A40] border border-[#D4DAE7] dark:border-[#34445E] space-y-2">
              <div className="flex items-center justify-between font-bold text-[#222B42] dark:text-[#F1F4FC]">
                <span>Driver: {acceptTarget.driver_name}</span>
                <span className="font-mono text-[#515FC5] dark:text-[#67D5DF] tabular-nums">৳{acceptTarget.fare}</span>
              </div>
              <div className="text-[#626E86] dark:text-[#B0BCD0] flex flex-wrap gap-2">
                <span className="capitalize">
                  {acceptTarget.vehicle_type}
                  {acceptTarget.driver_vehicle_model ? ` (${acceptTarget.driver_vehicle_model})` : ''}
                </span>
                <span>·</span>
                <span>
                  Pickup:{' '}
                  {new Date(acceptTarget.pickup_time).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8] shrink-0 mt-0.5" />
              <span>
                Accepting this offer immediately creates a confirmed campus ride with a reserved seat for you, opens in-app chat with {acceptTarget.driver_name}, and declines all other pending offers.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setAcceptTarget(null)}
                className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] font-semibold cursor-pointer"
              >
                Review Others
              </button>
              <button
                onClick={handleAcceptOffer}
                disabled={accepting}
                className="px-4 py-1.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] rounded-xl font-bold cursor-pointer disabled:opacity-50"
              >
                {accepting ? 'Confirming...' : 'Confirm & Match Ride'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Withdraw Offer Modal */}
      <Modal
        isOpen={withdrawModalOpen}
        onClose={() => setWithdrawModalOpen(false)}
        title="Withdraw Your Offer"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Are you sure you want to withdraw your offer? The passenger will be notified immediately.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setWithdrawModalOpen(false)}
              className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] cursor-pointer"
            >
              Keep Offer
            </button>
            <button
              onClick={handleWithdrawOffer}
              disabled={withdrawing}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {withdrawing ? 'Withdrawing...' : 'Confirm Withdraw'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default PassengerRequestDetailsPage;
