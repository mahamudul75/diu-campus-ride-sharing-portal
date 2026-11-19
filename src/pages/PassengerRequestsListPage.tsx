import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Navigation,
  PlusCircle,
  Search,
  Clock,
  Bike,
  Car,
  Sparkles,
  BadgeCheck,
  ArrowRight,
  XCircle,
  Edit3,
  Send,
  Phone,
  CheckCircle2,
  MapPin,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import api from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import {
  PassengerRequest,
  DriverOffer,
  PassengerRequestStatus,
  DriverOfferStatus,
  PassengerVehiclePref
} from '../types/index.ts';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Skeleton from '../components/Skeleton.tsx';
import EmptyState from '../components/EmptyState.tsx';
import Modal from '../components/Modal.tsx';
import { isDbFlagTrue } from '../utils/boolean.ts';

type ActiveTab = 'mine' | 'browse' | 'offers';

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

function formatVehicleLabel(v: PassengerVehiclePref | 'bike' | 'car'): string {
  if (v === 'bike') return 'Bike';
  if (v === 'car') return 'Car';
  return 'Any Vehicle';
}

export const PassengerRequestsListPage: React.FC = () => {
  const { user, isApprovedDriver } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const paramTab = searchParams.get('tab');
  const resolveInitialTab = (): ActiveTab => {
    if (isApprovedDriver && paramTab === 'browse') return 'browse';
    if (isApprovedDriver && paramTab === 'offers') return 'offers';
    if (paramTab === 'mine') return 'mine';
    return isApprovedDriver ? 'browse' : 'mine';
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>(resolveInitialTab);

  // My Requests state
  const [myRequests, setMyRequests] = useState<PassengerRequest[]>([]);
  const [myReqStatusFilter, setMyReqStatusFilter] = useState<'all' | PassengerRequestStatus>('all');
  const [loadingMine, setLoadingMine] = useState(true);
  const [mineError, setMineError] = useState<string | null>(null);
  const mineSeqRef = useRef(0);
  const mineAbortRef = useRef<AbortController | null>(null);

  // Browse Open Requests state (Approved drivers)
  const [browseRequests, setBrowseRequests] = useState<PassengerRequest[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [filterPickup, setFilterPickup] = useState('');
  const [filterDest, setFilterDest] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterVehicle, setFilterVehicle] = useState<'' | PassengerVehiclePref>(
    user?.vehicle_type || ''
  );
  const [filterMinBudget, setFilterMinBudget] = useState('');
  const [appliedBrowseFilters, setAppliedBrowseFilters] = useState<{
    pickup: string;
    destination: string;
    date: string;
    vehicle_type: '' | PassengerVehiclePref;
    min_budget: string;
  }>({
    pickup: '',
    destination: '',
    date: '',
    vehicle_type: user?.vehicle_type || '',
    min_budget: ''
  });
  const browseRequestSeqRef = useRef(0);
  const browseAbortRef = useRef<AbortController | null>(null);

  // My Driver Offers state
  const [myOffers, setMyOffers] = useState<DriverOffer[]>([]);
  const [myOfferStatusFilter, setMyOfferStatusFilter] = useState<'all' | DriverOfferStatus | 'cancelled'>('all');
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offersError, setOffersError] = useState<string | null>(null);
  const offersSeqRef = useRef(0);
  const offersAbortRef = useRef<AbortController | null>(null);

  // Modals
  const [cancelReqId, setCancelReqId] = useState<number | null>(null);
  const [cancellingReq, setCancellingReq] = useState(false);

  const [offerModalTarget, setOfferModalTarget] = useState<PassengerRequest | null>(null);
  const [editOfferTarget, setEditOfferTarget] = useState<DriverOffer | null>(null);
  const [offerFare, setOfferFare] = useState('');
  const [offerSeats, setOfferSeats] = useState('1');
  const [offerDate, setOfferDate] = useState('');
  const [offerTime, setOfferTime] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);

  const [withdrawOfferId, setWithdrawOfferId] = useState<number | null>(null);
  const [withdrawingOffer, setWithdrawingOffer] = useState(false);

  const switchTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const fetchMyRequests = useCallback(async () => {
    const seq = ++mineSeqRef.current;
    mineAbortRef.current?.abort();
    const controller = new AbortController();
    mineAbortRef.current = controller;

    setLoadingMine(true);
    setMineError(null);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (myReqStatusFilter !== 'all') params.status = myReqStatusFilter;
      const res = await api.get('/passenger-requests/mine', { params, signal: controller.signal });
      if (seq !== mineSeqRef.current) return;
      if (res.data?.success) {
        setMyRequests(res.data.requests || []);
      }
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') {
        return;
      }
      if (seq === mineSeqRef.current) {
        setMineError(err?.response?.data?.message || 'Unable to load your ride requests. Please try again.');
      }
    } finally {
      if (seq === mineSeqRef.current) {
        setLoadingMine(false);
      }
    }
  }, [myReqStatusFilter]);

  useEffect(() => {
    setAppliedBrowseFilters((prev) =>
      prev.date === filterDate && prev.vehicle_type === filterVehicle
        ? prev
        : { ...prev, date: filterDate, vehicle_type: filterVehicle }
    );
  }, [filterDate, filterVehicle]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedBrowseFilters((prev) =>
        prev.pickup === filterPickup &&
        prev.destination === filterDest &&
        prev.min_budget === filterMinBudget
          ? prev
          : {
              ...prev,
              pickup: filterPickup,
              destination: filterDest,
              min_budget: filterMinBudget
            }
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filterPickup, filterDest, filterMinBudget]);

  useEffect(() => {
    return () => {
      mineAbortRef.current?.abort();
      browseAbortRef.current?.abort();
      offersAbortRef.current?.abort();
    };
  }, []);

  const fetchBrowseRequests = useCallback(async () => {
    if (!isApprovedDriver) return;
    const requestSeq = ++browseRequestSeqRef.current;
    browseAbortRef.current?.abort();
    const controller = new AbortController();
    browseAbortRef.current = controller;

    setLoadingBrowse(true);
    setBrowseError(null);
    try {
      const params: Record<string, any> = {
        limit: 100,
        tz_offset: new Date().getTimezoneOffset()
      };
      if (appliedBrowseFilters.pickup.trim()) params.pickup = appliedBrowseFilters.pickup.trim();
      if (appliedBrowseFilters.destination.trim()) {
        params.destination = appliedBrowseFilters.destination.trim();
      }
      if (appliedBrowseFilters.date) params.date = appliedBrowseFilters.date;
      if (appliedBrowseFilters.vehicle_type) params.vehicle_type = appliedBrowseFilters.vehicle_type;
      if (appliedBrowseFilters.min_budget.trim() !== '') {
        params.min_budget = appliedBrowseFilters.min_budget.trim();
      }

      const res = await api.get('/passenger-requests', {
        params,
        signal: controller.signal
      });
      if (requestSeq !== browseRequestSeqRef.current) return;
      if (res.data?.success) {
        setBrowseRequests(res.data.requests || []);
      }
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') {
        return;
      }
      if (requestSeq === browseRequestSeqRef.current) {
        setBrowseError(
          err?.response?.data?.message || 'Unable to load open passenger requests. Please try again.'
        );
      }
    } finally {
      if (requestSeq === browseRequestSeqRef.current) {
        setLoadingBrowse(false);
      }
    }
  }, [isApprovedDriver, appliedBrowseFilters]);

  const fetchMyOffers = useCallback(async () => {
    if (!isApprovedDriver) return;
    const seq = ++offersSeqRef.current;
    offersAbortRef.current?.abort();
    const controller = new AbortController();
    offersAbortRef.current = controller;

    setLoadingOffers(true);
    setOffersError(null);
    try {
      const params: Record<string, any> = { limit: 100 };
      if (myOfferStatusFilter === 'cancelled') {
        params.status = 'accepted';
      } else if (myOfferStatusFilter !== 'all') {
        params.status = myOfferStatusFilter;
      }
      const res = await api.get('/passenger-requests/offers/mine', { params, signal: controller.signal });
      if (seq !== offersSeqRef.current) return;
      if (res.data?.success) {
        setMyOffers(res.data.offers || []);
      }
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') {
        return;
      }
      if (seq === offersSeqRef.current) {
        setOffersError(err?.response?.data?.message || 'Unable to load your submitted offers. Please try again.');
      }
    } finally {
      if (seq === offersSeqRef.current) {
        setLoadingOffers(false);
      }
    }
  }, [isApprovedDriver, myOfferStatusFilter]);

  useEffect(() => {
    if (activeTab === 'mine') {
      fetchMyRequests();
    } else if (activeTab === 'browse' && isApprovedDriver) {
      fetchBrowseRequests();
    } else if (activeTab === 'offers' && isApprovedDriver) {
      fetchMyOffers();
    }
  }, [activeTab, isApprovedDriver, fetchMyRequests, fetchBrowseRequests, fetchMyOffers]);

  const handleConfirmCancelRequest = async () => {
    if (!cancelReqId) return;
    setCancellingReq(true);
    try {
      const res = await api.patch(`/passenger-requests/${cancelReqId}/cancel`);
      if (res.data?.success) {
        showToast(res.data.message || 'Ride request cancelled.', 'info');
        setCancelReqId(null);
        fetchMyRequests();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to cancel ride request.', 'error');
    } finally {
      setCancellingReq(false);
    }
  };

  const openCreateOfferModal = (reqItem: PassengerRequest) => {
    const parts = toLocalDateTimeParts(reqItem.departure_time);
    setEditOfferTarget(null);
    setOfferModalTarget(reqItem);
    setOfferFare(reqItem.max_fare !== null && reqItem.max_fare !== undefined ? String(reqItem.max_fare) : '');
    setOfferSeats(user?.vehicle_type === 'bike' ? '1' : '1');
    setOfferDate(parts.date);
    setOfferTime(parts.time);
    setOfferMessage('');
  };

  const openEditOfferModal = (offer: DriverOffer) => {
    const parts = toLocalDateTimeParts(offer.pickup_time);
    setOfferModalTarget(null);
    setEditOfferTarget(offer);
    setOfferFare(String(offer.fare));
    setOfferSeats(String(offer.seats_offered));
    setOfferDate(parts.date);
    setOfferTime(parts.time);
    setOfferMessage(offer.message || '');
  };

  const handleSubmitOfferModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const fareNum = Number(offerFare);
    if (!Number.isFinite(fareNum) || fareNum < 0 || fareNum > 50000) {
      showToast('Please enter a valid fare between 0 and 50,000 BDT.', 'error');
      return;
    }

    const pickupIso = combineLocalDateTimeToIso(offerDate, offerTime);
    if (!pickupIso) {
      showToast('Please select a valid pickup date and time.', 'error');
      return;
    }

    const seatsNum = user?.vehicle_type === 'bike' ? 1 : Number(offerSeats);
    if (user?.vehicle_type === 'car' && (!Number.isInteger(seatsNum) || seatsNum < 1 || seatsNum > 4)) {
      showToast('Car drivers must offer between 1 and 4 seats.', 'error');
      return;
    }

    setSubmittingOffer(true);
    try {
      if (offerModalTarget) {
        const res = await api.post(`/passenger-requests/${offerModalTarget.id}/offers`, {
          fare: fareNum,
          seats_offered: seatsNum,
          pickup_time: pickupIso,
          message: offerMessage.trim() || null
        });
        if (res.data?.success) {
          showToast('Offer sent to passenger!', 'success');
          setOfferModalTarget(null);
          fetchBrowseRequests();
        }
      } else if (editOfferTarget) {
        const res = await api.patch(`/passenger-requests/offers/${editOfferTarget.id}`, {
          fare: fareNum,
          seats_offered: seatsNum,
          pickup_time: pickupIso,
          message: offerMessage.trim() || null
        });
        if (res.data?.success) {
          showToast('Offer updated successfully!', 'success');
          setEditOfferTarget(null);
          fetchMyOffers();
        }
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Unable to submit offer.', 'error');
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleConfirmWithdrawOffer = async () => {
    if (!withdrawOfferId) return;
    setWithdrawingOffer(true);
    try {
      const res = await api.patch(`/passenger-requests/offers/${withdrawOfferId}/withdraw`);
      if (res.data?.success) {
        showToast('Offer withdrawn.', 'info');
        setWithdrawOfferId(null);
        fetchMyOffers();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to withdraw offer.', 'error');
    } finally {
      setWithdrawingOffer(false);
    }
  };

  const driverVehicleType = user?.vehicle_type === 'bike' ? 'bike' : 'car';

  const isOfferMatchCancelled = (offer: DriverOffer) =>
    offer.status === 'accepted' &&
    (offer.confirmed_ride_status === 'cancelled' || offer.request_status === 'cancelled');

  const displayedOffers = myOffers.filter((offer) => {
    if (myOfferStatusFilter === 'accepted') {
      return offer.status === 'accepted' && !isOfferMatchCancelled(offer);
    }
    if (myOfferStatusFilter === 'cancelled') {
      return isOfferMatchCancelled(offer);
    }
    return true;
  });

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Ride Requests' }]}
      title="Passenger Ride Requests"
      subtitle={
        isApprovedDriver
          ? 'Post your own ride request, browse open student requests, and manage your driver offers'
          : 'Post where and when you need a ride and compare offers from verified DIU drivers'
      }
      actions={
        <Link
          to="/passenger-requests/create"
          className="px-3.5 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Post Ride Request
        </Link>
      }
    >
      <div className="space-y-5">
        {/* Top Mode Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#E1E6F0] dark:bg-[#151F32] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] w-fit">
          {isApprovedDriver && (
            <button
              onClick={() => switchTab('browse')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'browse'
                  ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                  : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              Browse Open Requests
            </button>
          )}
          <button
            onClick={() => switchTab('mine')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'mine'
                ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            My Requests
          </button>
          {isApprovedDriver && (
            <button
              onClick={() => switchTab('offers')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'offers'
                  ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                  : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              My Offers
            </button>
          )}
        </div>

        {/* TAB 1: MY PASSENGER REQUESTS */}
        {activeTab === 'mine' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#E1E6F0] dark:bg-[#151F32] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] w-fit">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'open', label: 'Open' },
                  { key: 'matched', label: 'Matched' },
                  { key: 'cancelled', label: 'Cancelled' },
                  { key: 'expired', label: 'Expired' }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMyReqStatusFilter(tab.key)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    myReqStatusFilter === tab.key
                      ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                      : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {mineError && myRequests.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {mineError}
                </span>
                <button
                  type="button"
                  onClick={fetchMyRequests}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}

            {loadingMine && myRequests.length === 0 ? (
              <div className="space-y-3">
                <Skeleton type="card" count={3} />
              </div>
            ) : mineError && myRequests.length === 0 ? (
              <div className="p-8 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-rose-200 dark:border-rose-800 space-y-3">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">Could not load your ride requests</h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">{mineError}</p>
                </div>
                <button
                  type="button"
                  onClick={fetchMyRequests}
                  className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : myRequests.length === 0 ? (
              <EmptyState
                icon={Navigation}
                title={myReqStatusFilter === 'all' ? 'No passenger ride requests yet' : `No ${myReqStatusFilter} requests`}
                description={
                  myReqStatusFilter === 'all'
                    ? 'Post a ride request with your route, departure time, and optional budget to receive offers from approved DIU drivers.'
                    : 'Try switching the status filter or posting a new ride request.'
                }
                action={
                  <Link
                    to="/passenger-requests/create"
                    className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-3.5 h-3.5" /> Post Ride Request
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {myRequests.map((reqItem) => {
                  const pendingCount = Number(reqItem.pending_offers_count || 0);
                  const confirmedRideId = reqItem.confirmed_ride_id || reqItem.accepted_offer?.confirmed_ride_id;

                  return (
                    <div
                      key={reqItem.id}
                      className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-4 sm:p-5 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                              {reqItem.pickup_name} → {reqItem.dest_name}
                            </h3>
                            <StatusBadge status={reqItem.status} size="sm" context="passenger_request" />
                            {reqItem.status === 'open' && pendingCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-[#515FC5]/10 dark:bg-[#818CF8]/20 text-[#515FC5] dark:text-[#818CF8] border border-[#515FC5]/20 dark:border-[#818CF8]/30 text-[10px] font-bold tabular-nums">
                                {pendingCount} {pendingCount === 1 ? 'Offer' : 'Offers'} Waiting
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {new Date(reqItem.departure_time).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatVehicleLabel(reqItem.vehicle_type)}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-bold text-[#515FC5] dark:text-[#67D5DF]">
                              {reqItem.max_fare !== null ? `Max ৳${reqItem.max_fare}` : 'Budget Flexible'}
                            </span>
                            {reqItem.distance_km !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{reqItem.distance_km} km</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {reqItem.status === 'matched' &&
                            confirmedRideId &&
                            reqItem.confirmed_ride_status !== 'cancelled' && (
                              <Link
                                to={`/rides/${confirmedRideId}`}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1 whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Confirmed Ride
                              </Link>
                            )}
                          {(reqItem.status === 'cancelled' || reqItem.confirmed_ride_status === 'cancelled') &&
                            confirmedRideId && (
                              <Link
                                to={`/rides/${confirmedRideId}`}
                                className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition-colors flex items-center gap-1 whitespace-nowrap"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Ride Cancelled
                              </Link>
                            )}

                          <Link
                            to={`/passenger-requests/${reqItem.id}`}
                            className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] hover:border-[#515FC5] dark:hover:border-[#818CF8] transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            {reqItem.status === 'open' ? 'Compare Offers' : 'View Details'}
                            <ArrowRight className="w-3 h-3" />
                          </Link>

                          {reqItem.status === 'open' && (
                            <button
                              onClick={() => setCancelReqId(reqItem.id)}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {reqItem.note && (
                        <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] bg-white/70 dark:bg-[#172235] px-3 py-2 rounded-xl border border-[#D4DAE7]/60 dark:border-[#34445E]">
                          {reqItem.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BROWSE OPEN PASSENGER REQUESTS (APPROVED DRIVERS) */}
        {activeTab === 'browse' && isApprovedDriver && (
          <div className="space-y-4">
            {/* Search & Filter Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const nextFilters = {
                  pickup: filterPickup,
                  destination: filterDest,
                  date: filterDate,
                  vehicle_type: filterVehicle,
                  min_budget: filterMinBudget
                };
                const unchanged =
                  appliedBrowseFilters.pickup === nextFilters.pickup &&
                  appliedBrowseFilters.destination === nextFilters.destination &&
                  appliedBrowseFilters.date === nextFilters.date &&
                  appliedBrowseFilters.vehicle_type === nextFilters.vehicle_type &&
                  appliedBrowseFilters.min_budget === nextFilters.min_budget;
                if (unchanged) {
                  fetchBrowseRequests();
                } else {
                  setAppliedBrowseFilters(nextFilters);
                }
              }}
              className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-4 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <input
                  type="text"
                  placeholder="Pickup area..."
                  value={filterPickup}
                  onChange={(e) => setFilterPickup(e.target.value)}
                  className="text-xs px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/30"
                />
                <input
                  type="text"
                  placeholder="Destination..."
                  value={filterDest}
                  onChange={(e) => setFilterDest(e.target.value)}
                  className="text-xs px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/30"
                />
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="text-xs px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/30"
                />
                <select
                  value={filterVehicle}
                  onChange={(e) => setFilterVehicle(e.target.value as '' | PassengerVehiclePref)}
                  className="text-xs px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/30"
                >
                  <option value="">All Requests</option>
                  <option value="bike">Bike Compatible</option>
                  <option value="car">Car Compatible</option>
                  <option value="any">Any Vehicle Only</option>
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Min budget (৳)"
                    value={filterMinBudget}
                    onChange={(e) => setFilterMinBudget(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/30"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] rounded-xl text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Filter
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#626E86] dark:text-[#B0BCD0]">
                <span>
                  Registered driver vehicle: <strong className="text-[#222B42] dark:text-[#F1F4FC] capitalize">{driverVehicleType}</strong>
                </span>
                {(filterPickup || filterDest || filterDate || filterVehicle || filterMinBudget) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterPickup('');
                      setFilterDest('');
                      setFilterDate('');
                      setFilterVehicle('');
                      setFilterMinBudget('');
                      setAppliedBrowseFilters({
                        pickup: '',
                        destination: '',
                        date: '',
                        vehicle_type: '',
                        min_budget: ''
                      });
                    }}
                    className="text-[#515FC5] dark:text-[#818CF8] font-semibold hover:underline cursor-pointer"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </form>

            {browseError && browseRequests.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {browseError}
                </span>
                <button
                  type="button"
                  onClick={fetchBrowseRequests}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}

            {loadingBrowse && browseRequests.length === 0 ? (
              <div className="space-y-3">
                <Skeleton type="card" count={3} />
              </div>
            ) : browseError && browseRequests.length === 0 ? (
              <div className="p-8 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-rose-200 dark:border-rose-800 space-y-3">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">Could not load open ride requests</h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">{browseError}</p>
                </div>
                <button
                  type="button"
                  onClick={fetchBrowseRequests}
                  className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : browseRequests.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching passenger ride requests"
                description="There are no open passenger requests matching your current filters right now."
              />
            ) : (
              <div className="space-y-3">
                {browseRequests.map((reqItem) => {
                  const isCompatible =
                    reqItem.vehicle_type === 'any' || reqItem.vehicle_type === driverVehicleType;
                  const alreadyOffered = Boolean(reqItem.my_offer);

                  return (
                    <div
                      key={reqItem.id}
                      className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-4 sm:p-5 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                              {reqItem.pickup_name} → {reqItem.dest_name}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] inline-flex items-center gap-1">
                              {reqItem.vehicle_type === 'bike' ? (
                                <Bike className="w-3 h-3 text-[#515FC5] dark:text-[#818CF8]" />
                              ) : reqItem.vehicle_type === 'car' ? (
                                <Car className="w-3 h-3 text-[#515FC5] dark:text-[#818CF8]" />
                              ) : (
                                <Sparkles className="w-3 h-3 text-[#515FC5] dark:text-[#818CF8]" />
                              )}
                              {formatVehicleLabel(reqItem.vehicle_type)}
                            </span>
                            {alreadyOffered && reqItem.my_offer && (
                              <StatusBadge status={reqItem.my_offer.status} size="sm" />
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                            <span className="inline-flex items-center gap-1 font-semibold text-[#222B42] dark:text-[#F1F4FC]">
                              {reqItem.passenger_name}
                              {isDbFlagTrue(reqItem.passenger_student_verified) && (
                                <BadgeCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                              )}
                            </span>
                            {reqItem.passenger_avg_rating !== null && reqItem.passenger_avg_rating !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                                  {reqItem.passenger_avg_rating}★
                                </span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span>
                              {new Date(reqItem.departure_time).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-bold text-[#515FC5] dark:text-[#67D5DF]">
                              {reqItem.max_fare !== null ? `Max ৳${reqItem.max_fare}` : 'Budget Flexible'}
                            </span>
                            {reqItem.distance_km !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {reqItem.distance_km} km ({reqItem.estimated_minutes} min)
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <Link
                            to={`/passenger-requests/${reqItem.id}`}
                            className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] bg-white dark:bg-[#24334B] text-xs font-semibold text-[#222B42] dark:text-[#F1F4FC] hover:border-[#515FC5] transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            Details <ArrowRight className="w-3 h-3" />
                          </Link>

                          {alreadyOffered ? (
                            <Link
                              to={`/passenger-requests/${reqItem.id}`}
                              className="px-3 py-1.5 rounded-xl bg-[#DDE2FA] dark:bg-[#818CF8]/20 text-[#515FC5] dark:text-[#818CF8] text-xs font-bold whitespace-nowrap"
                            >
                              Your Offer: ৳{reqItem.my_offer?.fare}
                            </Link>
                          ) : isCompatible ? (
                            <button
                              onClick={() => openCreateOfferModal(reqItem)}
                              className="px-3.5 py-1.5 rounded-xl bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Make Offer
                            </button>
                          ) : (
                            <span className="px-3 py-1.5 rounded-xl bg-[#E1E6F0] dark:bg-[#172235] text-[#626E86] dark:text-[#B0BCD0] text-[11px] font-semibold whitespace-nowrap">
                              Requires {reqItem.vehicle_type}
                            </span>
                          )}
                        </div>
                      </div>

                      {reqItem.note && (
                        <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] bg-white/70 dark:bg-[#172235] px-3 py-2 rounded-xl border border-[#D4DAE7]/60 dark:border-[#34445E]">
                          {reqItem.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MY SUBMITTED DRIVER OFFERS */}
        {activeTab === 'offers' && isApprovedDriver && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#E1E6F0] dark:bg-[#151F32] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] w-fit">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'pending', label: 'Pending' },
                  { key: 'accepted', label: 'Accepted' },
                  { key: 'cancelled', label: 'Cancelled' },
                  { key: 'rejected', label: 'Rejected' },
                  { key: 'withdrawn', label: 'Withdrawn' },
                  { key: 'expired', label: 'Expired' }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setMyOfferStatusFilter(tab.key)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    myOfferStatusFilter === tab.key
                      ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                      : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {offersError && displayedOffers.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {offersError}
                </span>
                <button
                  type="button"
                  onClick={fetchMyOffers}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}

            {loadingOffers && displayedOffers.length === 0 ? (
              <div className="space-y-3">
                <Skeleton type="card" count={3} />
              </div>
            ) : offersError && displayedOffers.length === 0 ? (
              <div className="p-8 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-rose-200 dark:border-rose-800 space-y-3">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">Could not load your offers</h3>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">{offersError}</p>
                </div>
                <button
                  type="button"
                  onClick={fetchMyOffers}
                  className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry
                </button>
              </div>
            ) : displayedOffers.length === 0 ? (
              <EmptyState
                icon={Send}
                title={
                  myOfferStatusFilter === 'all'
                    ? 'No offers submitted yet'
                    : myOfferStatusFilter === 'cancelled'
                    ? 'No cancelled matched rides'
                    : `No ${myOfferStatusFilter} offers`
                }
                description={
                  myOfferStatusFilter === 'accepted'
                    ? 'No active accepted offers right now. Cancelled matches appear under Cancelled.'
                    : 'Browse open passenger ride requests to send your fare and pickup proposal.'
                }
                action={
                  <button
                    onClick={() => switchTab('browse')}
                    className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                  >
                    Browse Requests
                  </button>
                }
              />
            ) : (
              <div className="space-y-3">
                {displayedOffers.map((offer) => {
                  const isOfferRideCancelled = isOfferMatchCancelled(offer);
                  const canEditOrWithdraw = offer.status === 'pending' && offer.request_status === 'open';

                  return (
                    <div
                      key={offer.id}
                      className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-4 sm:p-5 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                              {offer.pickup_name} → {offer.dest_name}
                            </h3>
                            <StatusBadge
                              status={isOfferRideCancelled ? 'cancelled' : offer.status}
                              size="sm"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                            <span className="font-semibold text-[#222B42] dark:text-[#F1F4FC]">
                              Passenger: {offer.passenger_name}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-bold text-[#515FC5] dark:text-[#67D5DF]">
                              Offer: ৳{offer.fare}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Pickup:{' '}
                              {new Date(offer.pickup_time).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {offer.seats_offered} {offer.seats_offered === 1 ? 'seat' : 'seats'} ({offer.vehicle_type})
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {offer.status === 'accepted' && offer.confirmed_ride_id && !isOfferRideCancelled && (
                            <Link
                              to={`/rides/${offer.confirmed_ride_id}`}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Open Ride
                            </Link>
                          )}

                          {isOfferRideCancelled && offer.confirmed_ride_id && (
                            <Link
                              to={`/rides/${offer.confirmed_ride_id}`}
                              className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1 whitespace-nowrap"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Ride Cancelled
                            </Link>
                          )}

                          <Link
                            to={`/passenger-requests/${offer.request_id}`}
                            className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] bg-white dark:bg-[#24334B] text-xs font-semibold text-[#222B42] dark:text-[#F1F4FC] hover:border-[#515FC5] flex items-center gap-1 whitespace-nowrap"
                          >
                            Request <ArrowRight className="w-3 h-3" />
                          </Link>

                          {canEditOrWithdraw && (
                            <>
                              <button
                                onClick={() => openEditOfferModal(offer)}
                                className="px-3 py-1.5 rounded-xl bg-[#DDE2FA] dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] text-xs font-bold hover:opacity-90 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button
                                onClick={() => setWithdrawOfferId(offer.id)}
                                className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 cursor-pointer whitespace-nowrap"
                              >
                                Withdraw
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {offer.status === 'accepted' && !isOfferRideCancelled && (
                        <div className="p-3 bg-[#DDE2FA]/40 dark:bg-[#24334B]/60 border border-[#515FC5]/30 dark:border-[#818CF8]/30 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-[#222B42] dark:text-[#F1F4FC]">
                            <Phone className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                            {offer.passenger_phone || 'Hidden by passenger (use in-app chat)'}
                          </span>
                          <Link
                            to="/messages"
                            className="font-bold text-[#515FC5] dark:text-[#818CF8] hover:underline"
                          >
                            Go to Messages →
                          </Link>
                        </div>
                      )}

                      {offer.message && (
                        <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] bg-white/70 dark:bg-[#172235] px-3 py-2 rounded-xl border border-[#D4DAE7]/60 dark:border-[#34445E]">
                          "{offer.message}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cancel Passenger Request Confirmation Modal */}
      <Modal
        isOpen={Boolean(cancelReqId)}
        onClose={() => setCancelReqId(null)}
        title="Cancel Ride Request"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Are you sure you want to cancel this passenger ride request? All pending driver offers on it will be closed.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setCancelReqId(null)}
              className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] cursor-pointer"
            >
              Keep Open
            </button>
            <button
              onClick={handleConfirmCancelRequest}
              disabled={cancellingReq}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {cancellingReq ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create / Edit Offer Modal */}
      <Modal
        isOpen={Boolean(offerModalTarget || editOfferTarget)}
        onClose={() => {
          setOfferModalTarget(null);
          setEditOfferTarget(null);
        }}
        title={editOfferTarget ? 'Update Ride Offer' : 'Submit Ride Offer'}
      >
        <form onSubmit={handleSubmitOfferModal} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-[#F5F7FC] dark:bg-[#1C2A40] border border-[#D4DAE7] dark:border-[#34445E] space-y-1">
            <div className="font-bold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
              <span>
                {(offerModalTarget || editOfferTarget)?.pickup_name} → {(offerModalTarget || editOfferTarget)?.dest_name}
              </span>
            </div>
            {(offerModalTarget?.max_fare ?? editOfferTarget?.max_fare) !== null &&
              (offerModalTarget?.max_fare ?? editOfferTarget?.max_fare) !== undefined && (
                <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                  Passenger max budget: ৳{offerModalTarget?.max_fare ?? editOfferTarget?.max_fare}
                </p>
              )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                Proposed Fare (৳)
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
                Seats Offered ({driverVehicleType === 'bike' ? 'Bike: 1 seat' : 'Car: 1–4'})
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
                Pickup Date
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
                Pickup Time
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

          <div className="space-y-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#626E86] dark:text-[#B0BCD0]">
              Message to Passenger (Optional)
            </label>
            <textarea
              rows={2}
              maxLength={500}
              placeholder="e.g. Passing through Savar 10 mins early, extra helmet ready..."
              value={offerMessage}
              onChange={(e) => setOfferMessage(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setOfferModalTarget(null);
                setEditOfferTarget(null);
              }}
              className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingOffer}
              className="px-4 py-1.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] rounded-xl font-bold cursor-pointer disabled:opacity-50"
            >
              {submittingOffer ? 'Saving...' : editOfferTarget ? 'Save Changes' : 'Send Offer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Withdraw Offer Modal */}
      <Modal
        isOpen={Boolean(withdrawOfferId)}
        onClose={() => setWithdrawOfferId(null)}
        title="Withdraw Driver Offer"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Are you sure you want to withdraw this offer? The passenger will be notified and will no longer be able to accept it.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setWithdrawOfferId(null)}
              className="px-3 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#626E86] dark:text-[#B0BCD0] cursor-pointer"
            >
              Keep Offer
            </button>
            <button
              onClick={handleConfirmWithdrawOffer}
              disabled={withdrawingOffer}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {withdrawingOffer ? 'Withdrawing...' : 'Confirm Withdraw'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default PassengerRequestsListPage;
