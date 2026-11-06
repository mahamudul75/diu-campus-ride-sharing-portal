import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  Users,
  Bike,
  Car,
  ShieldCheck,
  Phone,
  Mail,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowLeft,
  XCircle
} from 'lucide-react';
import api from '../services/api.ts';
import { Ride, RideRequest } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import MapView from '../components/MapView.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';
import Modal from '../components/Modal.tsx';
import Breadcrumb from '../components/Breadcrumb.tsx';

export const RideDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [ride, setRide] = useState<Ride | null>(null);
  const [userRequest, setUserRequest] = useState<RideRequest | null>(null);
  const [isDriver, setIsDriver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const fetchRideDetails = async () => {
    try {
      const res = await api.get(`/rides/${id}`);
      if (res.data?.success) {
        setRide(res.data.ride);
        setUserRequest(res.data.userRequest || null);
        setIsDriver(Boolean(res.data.isDriver));
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

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!ride) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Ride Not Found</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          This ride may have departed or was cancelled.
        </p>
        <Link
          to="/search"
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700"
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
  const isAccepted = userRequest?.status === 'accepted';
  const isPending = userRequest?.status === 'pending';
  const canRequest =
    !isDriver &&
    ride.status === 'open' &&
    ride.seats_available > 0 &&
    !isAccepted &&
    !isPending;

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
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Search
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Route, Map, and Driver Info */}
        <div className="lg:col-span-8 space-y-6">
          {/* Main Route Card */}
          <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
                  Campus Trip
                </span>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {ride.pickup_name} → {ride.dest_name}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={ride.status} />
                <span className="text-2xl font-black text-teal-700 dark:text-teal-400 font-mono">
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
              height="360px"
            />

            {/* Route Details Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  Date
                </span>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{formattedDate}</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  Departure
                </span>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{formattedTime}</p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  Vehicle
                </span>
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 capitalize">
                  {isBike ? (
                    <Bike className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  ) : (
                    <Car className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  )}
                  {ride.vehicle_type}
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  Available
                </span>
                <p className="text-xs font-bold text-teal-700 dark:text-teal-400 font-mono">
                  {ride.seats_available} of {ride.seats_total} seats
                </p>
              </div>
            </div>

            {/* Driver Notes */}
            {ride.note && (
              <div className="p-4 bg-teal-50/60 dark:bg-teal-950/30 rounded-xl border border-teal-100 dark:border-teal-900/40 space-y-1">
                <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider block">
                  Driver Notes
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed italic">
                  "{ride.note}"
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Driver Profile & Booking Action */}
        <div className="lg:col-span-4 space-y-6">
          {/* Booking Action Card */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Ride Reservation</h3>

            {isDriver ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-3">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  You are the driver of this ride.
                </p>
                <Link
                  to="/my-rides"
                  className="block w-full py-2.5 text-center bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-xs transition-colors"
                >
                  Manage Ride
                </Link>
              </div>
            ) : userRequest ? (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-xl border ${
                    isAccepted
                      ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200'
                      : isPending
                      ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isAccepted ? (
                      <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
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
                      ? 'Your seat is confirmed. Driver contact is revealed below.'
                      : isPending
                      ? 'Awaiting driver approval. Contact info will display once accepted.'
                      : 'This booking request is inactive.'}
                  </p>
                </div>

                {(isPending || isAccepted) && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="w-full py-2.5 px-4 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Cancel Booking
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>Fare Per Seat</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-base">
                    ৳{Number(ride.fare).toFixed(0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <span>Seats Left</span>
                  <span className="font-bold text-teal-700 dark:text-teal-400 font-mono">
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
                    className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Request Seat
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold text-xs rounded-xl cursor-not-allowed"
                  >
                    {ride.status === 'full' || ride.seats_available === 0 ? 'Ride Full' : `Ride ${ride.status}`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Driver Contact & Vehicle Profile (F17 Privacy Enforced) */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-sm border border-teal-100 dark:border-teal-900">
                {ride.driver_name?.charAt(0) || 'D'}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{ride.driver_name}</h4>
                  <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                </div>
                <p className="text-[11px] text-teal-700 dark:text-teal-400 font-semibold">
                  Verified DIU Driver
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  Vehicle Model
                </span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {ride.driver_vehicle_model || (isBike ? 'Motorbike' : 'Passenger Car')}
                </p>
              </div>

              {/* Contact Information (F17 Privacy Rule) */}
              {isAccepted || isDriver ? (
                <div className="p-3.5 bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-teal-900 dark:text-teal-200 font-bold">
                    <Phone className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>Phone: {ride.driver_phone || 'Available'}</span>
                  </div>
                  {ride.driver_vehicle_plate && (
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Car className="w-3.5 h-3.5 text-slate-400" />
                      <span>Plate: {ride.driver_vehicle_plate}</span>
                    </div>
                  )}
                  {ride.driver_email && (
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono">{ride.driver_email}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-semibold text-xs">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Contact Protected</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Driver contact revealed once booking request is accepted.
                  </p>
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
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Request 1 seat from <strong>{ride.pickup_name}</strong> to{' '}
            <strong>{ride.dest_name}</strong> for{' '}
            <strong className="text-teal-700 dark:text-teal-400 font-mono">৳{ride.fare}</strong>?
          </p>
          <div className="p-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl text-[11px] text-teal-800 dark:text-teal-300">
            Once accepted, coordinate pickup directly with your fellow DIU student.
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleBookRequest}
              disabled={requesting}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5"
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
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Are you sure you want to cancel your seat request for this trip?
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCancelModal(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
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
    </div>
  );
};

export default RideDetailsPage;
