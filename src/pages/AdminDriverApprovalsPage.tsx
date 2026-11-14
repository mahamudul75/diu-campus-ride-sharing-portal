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
  const [rejectNote, setRejectNote] = useState('');
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
      const res = await api.patch(`/admin/drivers/${selectedDriver.id}/reject`, {
        admin_note: rejectNote.trim() || undefined
      });
      if (res.data?.success) {
        showToast(`Application for ${selectedDriver.name} rejected.`, 'info');
        setShowRejectModal(false);
        setSelectedDriver(null);
        setRejectNote('');
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
                className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs"
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
                  className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    {/* Student Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] flex items-center justify-center font-bold text-sm border border-[#515FC5]/20 dark:border-[#818CF8]/30">
                          {driver.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">
                            {driver.name}
                          </h3>
                          <p className="text-xs font-mono font-bold text-[#515FC5] dark:text-[#818CF8]">
                            ID: {driver.student_id}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                        Pending
                      </span>
                    </div>

                    {/* Student Contact */}
                    <div className="p-3 bg-white dark:bg-[#24334B] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 text-[#626E86] dark:text-[#B0BCD0]">
                        <Mail className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0]" />
                        <span className="font-mono truncate">{driver.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[#626E86] dark:text-[#B0BCD0]">
                        <Phone className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0]" />
                        <span className="font-mono">{driver.phone}</span>
                      </div>
                    </div>

                    {/* Vehicle Details */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider">
                        {isBike ? (
                          <Bike className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                        ) : (
                          <Car className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                        )}
                        <span>{driver.vehicle_type?.toUpperCase()} Specification</span>
                      </div>
                      <div className="p-3 bg-[#DDE2FA]/40 dark:bg-[#24334B]/60 rounded-xl border border-[#515FC5]/20 dark:border-[#818CF8]/30 space-y-1 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-[#344269] dark:text-[#818CF8] uppercase tracking-wider block">
                            Model
                          </span>
                          <p className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                            {driver.vehicle_model}
                          </p>
                        </div>
                        <div className="pt-1">
                          <span className="text-[10px] font-bold text-[#344269] dark:text-[#818CF8] uppercase tracking-wider block">
                            Registration Plate
                          </span>
                          <p className="font-mono font-bold text-[#515FC5] dark:text-[#67D5DF]">
                            {driver.vehicle_plate}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-[#D4DAE7]/50 dark:border-[#34445E] grid grid-cols-2 gap-2">
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
                      className="py-2 px-3 rounded-xl bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
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
          setRejectNote('');
        }}
        title="Reject Driver Application"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Reject driver verification for <strong className="text-[#222B42] dark:text-[#F1F4FC]">{selectedDriver?.name}</strong> (
            {selectedDriver?.student_id})? They will remain a passenger student.
          </p>
          <div>
            <label className="block text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1">
              Reason / Feedback Note (Optional)
            </label>
            <textarea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="e.g. Please re-enter full Dhaka Metro license plate format."
              maxLength={500}
              className="w-full text-xs px-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setShowRejectModal(false);
                setSelectedDriver(null);
                setRejectNote('');
              }}
              className="px-4 py-2 border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#626E86] dark:text-[#B0BCD0] rounded-xl hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={processing}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
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
