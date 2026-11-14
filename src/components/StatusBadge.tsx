import React from 'react';
import { RideStatus, RequestStatus, DriverStatus, ReportStatus } from '../types/index.ts';

interface StatusBadgeProps {
  status: RideStatus | RequestStatus | DriverStatus | ReportStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const s = (status || '').toLowerCase();

  let colorClasses =
    'bg-[#E1E6F0] text-[#626E86] border-[#D4DAE7] dark:bg-[#172235] dark:text-[#B0BCD0] dark:border-[#34445E]';
  let label = status;

  // Ride Statuses
  if (s === 'scheduled') {
    colorClasses =
      'bg-[#DDE2FA]/70 text-[#344269] border-[#D4DAE7] dark:bg-[#24334B] dark:text-[#A78BFA] dark:border-[#34445E]';
    label = 'Scheduled';
  } else if (s === 'open') {
    colorClasses =
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    label = 'Open Seats';
  } else if (s === 'full') {
    colorClasses =
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
    label = 'Full';
  } else if (s === 'in_progress') {
    colorClasses =
      'bg-indigo-50 text-[#515FC5] border-indigo-200 dark:bg-[#24334B] dark:text-[#67D5DF] dark:border-[#34445E]';
    label = 'In Progress';
  } else if (s === 'completed') {
    colorClasses =
      'bg-[#DDE2FA]/60 text-[#515FC5] border-[#D4DAE7] dark:bg-[#1C2A40] dark:text-[#818CF8] dark:border-[#34445E]';
    label = 'Completed';
  } else if (s === 'cancelled') {
    colorClasses =
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60';
    label = 'Cancelled';
  }
  // Request Statuses
  else if (s === 'pending') {
    colorClasses =
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
    label = 'Pending';
  } else if (s === 'accepted') {
    colorClasses =
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    label = 'Accepted';
  } else if (s === 'rejected') {
    colorClasses =
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60';
    label = 'Rejected';
  }
  // Driver Statuses
  else if (s === 'approved') {
    colorClasses =
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    label = 'Approved Driver';
  } else if (s === 'none') {
    colorClasses =
      'bg-[#E1E6F0] text-[#626E86] border-[#D4DAE7] dark:bg-[#172235] dark:text-[#B0BCD0] dark:border-[#34445E]';
    label = 'Passenger';
  }
  // Report Statuses
  else if (s === 'under_review') {
    colorClasses =
      'bg-[#DDE2FA]/70 text-[#344269] border-[#D4DAE7] dark:bg-[#24334B] dark:text-[#A78BFA] dark:border-[#34445E]';
    label = 'Under Review';
  } else if (s === 'resolved') {
    colorClasses =
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    label = 'Resolved';
  } else if (s === 'dismissed') {
    colorClasses =
      'bg-[#E1E6F0] text-[#626E86] border-[#D4DAE7] dark:bg-[#172235] dark:text-[#B0BCD0] dark:border-[#34445E]';
    label = 'Dismissed';
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center rounded-full border tracking-wide uppercase font-semibold whitespace-nowrap ${sizeClasses} ${colorClasses}`}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
