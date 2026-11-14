import React, { useState } from 'react';
import { Star, X } from 'lucide-react';
import api from '../services/api.ts';
import { useToast } from '../context/ToastContext.tsx';

interface RateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  rideId: number;
  revieweeId: number;
  revieweeName: string;
  roleLabel: string;
  onSuccess?: () => void;
}

export const RateUserModal: React.FC<RateUserModalProps> = ({
  isOpen,
  onClose,
  rideId,
  revieweeId,
  revieweeName,
  roleLabel,
  onSuccess
}) => {
  const { showToast } = useToast();
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/reviews', {
        ride_id: rideId,
        reviewee_id: revieweeId,
        rating,
        comment: comment.trim() || undefined
      });
      if (res.data?.success) {
        showToast('Review submitted. Thank you!', 'success');
        setComment('');
        onSuccess?.();
        onClose();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to submit review.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#D4DAE7] dark:border-[#34445E] pb-3">
          <div>
            <h3 className="font-bold text-base text-[#222B42] dark:text-[#F1F4FC]">
              Rate {revieweeName}
            </h3>
            <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] capitalize">Ride {roleLabel}</p>
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
            <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-2">
              Star Rating
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer transition-transform hover:scale-105"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= rating
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-[#D4DAE7] dark:text-[#34445E]'
                    }`}
                  />
                </button>
              ))}
              <span className="ml-2 font-mono font-bold text-sm text-[#222B42] dark:text-[#F1F4FC]">
                {rating}/5
              </span>
            </div>
          </div>

          <div>
            <label className="block font-bold text-[#222B42] dark:text-[#F1F4FC] mb-1.5">
              Written Feedback (optional)
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share punctuality, safety, or ride experience..."
              maxLength={500}
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
              className="px-4 py-2 rounded-xl bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-bold disabled:opacity-50 cursor-pointer shadow-md shadow-[#515FC5]/20"
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RateUserModal;
