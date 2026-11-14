import React, { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import api from '../services/api.ts';
import { useToast } from '../context/ToastContext.tsx';

interface ReportUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportedUserId: number;
  reportedUserName: string;
  rideId?: number;
}

const REASONS = [
  { value: 'unsafe_driving', label: 'Unsafe driving or speeding' },
  { value: 'harassment', label: 'Harassment or inappropriate conduct' },
  { value: 'no_show', label: 'No-show without notice' },
  { value: 'fare_dispute', label: 'Fare dispute or overcharging' },
  { value: 'fake_info', label: 'Inaccurate vehicle or identity details' },
  { value: 'other', label: 'Other safety concern' }
];

export const ReportUserModal: React.FC<ReportUserModalProps> = ({
  isOpen,
  onClose,
  reportedUserId,
  reportedUserName,
  rideId
}) => {
  const { showToast } = useToast();
  const [reason, setReason] = useState('unsafe_driving');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      showToast('Please describe the issue in at least 10 characters.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/safety/reports', {
        reported_user_id: reportedUserId,
        ride_id: rideId || undefined,
        reason,
        description: description.trim()
      });
      if (res.data?.success) {
        showToast('Safety report submitted to DIU administration.', 'success');
        setDescription('');
        onClose();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to submit safety report.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#D4DAE7] dark:border-[#34445E] pb-3">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="font-bold text-base text-[#222B42] dark:text-[#F1F4FC]">
              Report {reportedUserName}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#626E86] dark:text-[#B0BCD0] hover:text-[#222B42] dark:hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1.5">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2.5 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] font-medium focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1.5">
              Details (reviewed by DIU Campus Admin)
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what happened concisely (min 10 characters)..."
              maxLength={1000}
              required
              className="w-full px-3 py-2.5 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#D4DAE7] dark:border-[#34445E]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] font-semibold text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50 cursor-pointer shadow-md shadow-rose-600/20"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReportUserModal;
