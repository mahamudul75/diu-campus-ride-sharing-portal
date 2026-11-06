import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Bike,
  Car,
  Mail,
  Phone,
  FileCheck,
  ShieldCheck
} from 'lucide-react';
import api from '../services/api.ts';
import { User as UserModel } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import Spinner from '../components/Spinner.tsx';
import EmptyState from '../components/EmptyState.tsx';
import Modal from '../components/Modal.tsx';

export const AdminDriverApprovalsPage: React.FC = () => {
  const { showToast } = useToast();
  const [pendingDrivers, setPendingDrivers] = useState<UserModel[]>([]);
  const [loading, setLoading] = useState(true);

  // Rejection modal
  const [selectedDriver, setSelectedDriver] = useState<UserModel | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  const fetchPendingDrivers = async () => {
    try {
      const res = await api.get('/admin/drivers/pending');
      if (res.data?.success) {
        setPendingDrivers(res.data.drivers || []);
      }
    } catch (err) {
      console.warn('Failed to fetch pending drivers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingDrivers();
  }, []);

  const handleApprove = async (driverId: number, name: string) => {
    try {
      const res = await api.patch(`/admin/drivers/${driverId}/approve`);
      if (res.data?.success) {
        showToast(`${name} approved as driver.`, 'success');
        fetchPendingDrivers();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Approval failed.', 'error');
    }
  };

  const handleReject = async () => {
    if (!selectedDriver) return;
    setProcessing(true);
    try {
      const res = await api.patch(`/admin/drivers/${selectedDriver.id}/reject`);
      if (res.data?.success) {
        showToast(`Application for ${selectedDriver.name} rejected.`, 'info');
        setShowRejectModal(false);
        setSelectedDriver(null);
        fetchPendingDrivers();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Rejection failed.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Driver Approvals' }]}
      title="Driver Approvals"
      subtitle="Verify student driver applications, inspect vehicle model and plates."
      actions={
        <span className="px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold">
          {pendingDrivers.length} Pending
        </span>
      }
    >
      <div className="space-y-6">
        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : pendingDrivers.length === 0 ? (
          <EmptyState
            icon={FileCheck}
            title="Queue Clear"
            description="No pending student driver verification requests."
            action={
              <Link
                to="/admin/users"
                className="px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs hover:bg-slate-800"
              >
                Browse Students
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pendingDrivers.map((driver) => {
              const isBike = driver.vehicle_type === 'bike';

              return (
                <div
                  key={driver.id}
                  className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    {/* Student Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold text-sm border border-amber-200 dark:border-amber-800">
                          {driver.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {driver.name}
                          </h3>
                          <p className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400">
                            ID: {driver.student_id}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                        Pending
                      </span>
                    </div>

                    {/* Student Contact */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono truncate">{driver.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono">{driver.phone}</span>
                      </div>
                    </div>

                    {/* Vehicle Details */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {isBike ? (
                          <Bike className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        ) : (
                          <Car className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        )}
                        <span>{driver.vehicle_type?.toUpperCase()} Specification</span>
                      </div>
                      <div className="p-3 bg-teal-50/50 dark:bg-teal-950/30 rounded-xl border border-teal-100 dark:border-teal-900/40 space-y-1 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider block">
                            Model
                          </span>
                          <p className="font-bold text-slate-900 dark:text-slate-100">
                            {driver.vehicle_model}
                          </p>
                        </div>
                        <div className="pt-1">
                          <span className="text-[10px] font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wider block">
                            Registration Plate
                          </span>
                          <p className="font-mono font-bold text-teal-900 dark:text-teal-200">
                            {driver.vehicle_plate}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setSelectedDriver(driver);
                        setShowRejectModal(true);
                      }}
                      className="py-2 px-3 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                    <button
                      onClick={() => handleApprove(driver.id, driver.name)}
                      className="py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setSelectedDriver(null);
        }}
        title="Reject Driver Application"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Reject driver verification for <strong>{selectedDriver?.name}</strong> (
            {selectedDriver?.student_id})? They will remain a passenger student.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setShowRejectModal(false);
                setSelectedDriver(null);
              }}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={processing}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs"
            >
              {processing ? 'Rejecting...' : 'Reject Application'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default AdminDriverApprovalsPage;
