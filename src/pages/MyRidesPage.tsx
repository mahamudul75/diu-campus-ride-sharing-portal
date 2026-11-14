import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Compass,
  PlusCircle,
  Calendar,
  Clock,
  Users,
  Edit,
  XCircle,
  CheckCircle,
  MessageSquare
} from 'lucide-react';
import api from '../services/api.ts';
import { Ride, RideRequest } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Skeleton from '../components/Skeleton.tsx';
import EmptyState from '../components/EmptyState.tsx';
import Modal from '../components/Modal.tsx';

export const MyRidesPage: React.FC = () => {
  const { showToast } = useToast();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  // Requests Modal State
  const [activeRideForRequests, setActiveRideForRequests] = useState<Ride | null>(null);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Edit Ride Modal State
  const [editingRide, setEditingRide] = useState<Ride | null>(null);
  const [editFare, setEditFare] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Cancel Ride Modal State
  const [cancelRideId, setCancelRideId] = useState<number | null>(null);
  const [cancellingRide, setCancellingRide] = useState(false);

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

  // Fetch Requests for a specific ride
  const openRequestsModal = async (ride: Ride) => {
    setActiveRideForRequests(ride);
    setLoadingRequests(true);
    try {
      const res = await api.get(`/rides/${ride.id}/requests`);
      if (res.data?.success) {
        setRequests(res.data.requests || []);
      }
    } catch (err) {
      console.warn('Failed to load ride requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  // Accept request
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

  // Reject request
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

  // Cancel Ride
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

  // Complete Ride
  const handleCompleteRide = async (rideId: number) => {
    try {
      const res = await api.patch(`/rides/${rideId}/complete`);
      if (res.data?.success) {
        showToast(res.data.message || 'Ride marked as completed.', 'success');
        fetchMyRides();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to mark ride completed.', 'error');
    }
  };

  // Edit Ride Handler
  const openEditModal = (ride: Ride) => {
    setEditingRide(ride);
    setEditFare(String(ride.fare));
    setEditNote(ride.note || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRide) return;

    setSavingEdit(true);
    try {
      const res = await api.put(`/rides/${editingRide.id}`, {
        fare: Number(editFare),
        note: editNote.trim()
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
      subtitle="Manage your offered campus rides and approve passengers"
      actions={
        <Link
          to="/rides/create"
          className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
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
                className="px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-teal-700"
              >
                Post a Ride
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {rides.map((ride) => {
              const depDate = new Date(ride.departure_time);
              const isOpen = ride.status === 'open' || ride.status === 'full';

              return (
                <div
                  key={ride.id}
                  className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Route Information */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {ride.pickup_name} → {ride.dest_name}
                      </h3>
                      <StatusBadge status={ride.status} size="sm" />
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {depDate.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {depDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>•</span>
                      <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">৳{Number(ride.fare).toFixed(0)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                        <Users className="w-3 h-3 text-slate-400" />
                        {ride.seats_available} / {ride.seats_total} seats available
                      </span>
                    </div>

                    {ride.note && (
                      <p className="text-[11px] text-slate-400 italic">"{ride.note}"</p>
                    )}
                  </div>

                  {/* Driver Controls & Request Badge */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => openRequestsModal(ride)}
                      className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      Requests
                      <span className="px-1.5 py-0.2 bg-teal-600 text-white rounded-full text-[10px]">
                        {ride.pending_requests_count || 0}
                      </span>
                    </button>

                    {isOpen && (
                      <>
                        <button
                          onClick={() => openEditModal(ride)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          Edit
                        </button>

                        <button
                          onClick={() => handleCompleteRide(ride.id)}
                          className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Complete
                        </button>

                        <button
                          onClick={() => setCancelRideId(ride.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
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

      {/* Incoming Requests Modal */}
      <Modal
        isOpen={Boolean(activeRideForRequests)}
        onClose={() => setActiveRideForRequests(null)}
        title={`Requests (${activeRideForRequests?.seats_available || 0} seats left)`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {loadingRequests ? (
            <div className="py-6 flex justify-center">
              <Skeleton type="card" count={2} />
            </div>
          ) : requests.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No booking requests for this ride yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{req.passenger_name}</span>
                      <StatusBadge status={req.status} size="sm" />
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      ID: {req.passenger_student_id} • Phone: {req.passenger_phone}
                    </div>
                  </div>

                  {req.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRejectRequest(req.id)}
                        className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleAcceptRequest(req.id)}
                        disabled={activeRideForRequests?.seats_available === 0}
                        className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                      >
                        Accept
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Edit Ride Modal */}
      <Modal
        isOpen={Boolean(editingRide)}
        onClose={() => setEditingRide(null)}
        title="Edit Ride"
      >
        <form onSubmit={handleSaveEdit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Fare (৳)</label>
            <input
              type="number"
              required
              min="0"
              value={editFare}
              onChange={(e) => setEditFare(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Optional Note</label>
            <textarea
              rows={3}
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setEditingRide(null)}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              {savingEdit ? 'Saving...' : 'Save'}
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
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Are you sure you want to cancel this ride? All accepted passengers will be notified and seats released.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setCancelRideId(null)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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
    </DashboardLayout>
  );
};

export default MyRidesPage;
