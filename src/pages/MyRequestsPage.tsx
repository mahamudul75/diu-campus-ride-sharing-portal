import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  MapPin,
  Phone,
  Car,
  ShieldCheck,
  XCircle,
  Lock,
  ArrowRight
} from 'lucide-react';
import api from '../services/api.ts';
import { RideRequest } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Skeleton from '../components/Skeleton.tsx';
import EmptyState from '../components/EmptyState.tsx';
import Modal from '../components/Modal.tsx';

export const MyRequestsPage: React.FC = () => {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal confirmation state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedReqToCancel, setSelectedReqToCancel] = useState<{ id: number; wasAccepted: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);

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

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Bookings' }]}
      title="My Bookings"
      subtitle="Track your campus ride requests and driver contacts"
      actions={
        <Link
          to="/search"
          className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
        >
          Find a Ride
        </Link>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton type="card" count={4} />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No ride requests yet"
            description="You haven't requested any campus rides."
            action={
              <Link
                to="/search"
                className="px-4 py-2 bg-teal-600 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-teal-700"
              >
                Find a Ride
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const isAccepted = req.status === 'accepted';
              const isPending = req.status === 'pending';
              const canCancel = isPending || isAccepted;

              return (
                <div
                  key={req.id}
                  className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
                >
                  {/* Header with Route and Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {req.pickup_name} → {req.dest_name}
                        </h3>
                        <StatusBadge status={req.status} size="sm" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>Driver: {req.driver_name}</span>
                        <span>•</span>
                        <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">৳{req.fare}</span>
                        <span>•</span>
                        <span>
                          {new Date(req.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        to={`/rides/${req.ride_id}`}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
                      >
                        Details <ArrowRight className="w-3 h-3" />
                      </Link>

                      {canCancel && (
                        <button
                          onClick={() => openCancelModal(req.id, isAccepted)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Driver Contact Box (Rule F17 Privacy: only visible when accepted) */}
                  {isAccepted ? (
                    <div className="p-3.5 bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-teal-900 dark:text-teal-300">
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                          <span>Driver Contact Details</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-slate-700 dark:text-slate-300">
                          <span className="flex items-center gap-1 font-bold">
                            <Phone className="w-3 h-3 text-teal-600 dark:text-teal-400" />
                            {req.driver_phone}
                          </span>
                          {req.driver_vehicle_plate && (
                            <span className="flex items-center gap-1 font-mono">
                              <Car className="w-3 h-3 text-slate-400" />
                              {req.driver_vehicle_plate}
                            </span>
                          )}
                          {req.driver_vehicle_model && (
                            <span className="text-slate-500 italic">
                              ({req.driver_vehicle_model})
                            </span>
                          )}
                        </div>
                      </div>

                      <a
                        href={`tel:${req.driver_phone}`}
                        className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 text-center"
                      >
                        Call Driver
                      </a>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {isPending
                          ? 'Driver phone will unlock once accepted.'
                          : 'Driver contact protected.'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Booking"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {selectedReqToCancel?.wasAccepted
              ? 'Are you sure you want to cancel your confirmed seat? The driver will be notified and your seat released.'
              : 'Are you sure you want to cancel this pending ride request?'}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => setCancelModalOpen(false)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Keep Booking
            </button>
            <button
              onClick={handleConfirmCancel}
              disabled={cancelling}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Cancel Seat'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default MyRequestsPage;
