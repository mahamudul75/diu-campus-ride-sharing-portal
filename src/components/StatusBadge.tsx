import React from 'react';
import { RideStatus, RequestStatus, DriverStatus } from '../types/index.ts';

interface StatusBadgeProps {
  status: RideStatus | RequestStatus | DriverStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const s = (status || '').toLowerCase();

  let colorClasses =
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  let label = status;

  // Ride Statuses
  if (s === 'open') {
    colorClasses =
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
    label = 'Open Seats';
  } else if (s === 'full') {
    colorClasses =
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
    label = 'Full';
  } else if (s === 'completed') {
    colorClasses =
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60';
    label = 'Completed';
  } else if (s === 'cancelled') {
    colorClasses =
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60';
    label = 'Cancelled';
  }
  // Request Statuses
  else if (s === 'pending') {
    colorClasses =
      'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
    label = 'Pending';
  } else if (s === 'accepted') {
    colorClasses =
      'bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60';
    label = 'Accepted';
  } else if (s === 'rejected') {
    colorClasses =
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60';
    label = 'Rejected';
  }
  // Driver Statuses
  else if (s === 'approved') {
    colorClasses =
      'bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60';
    label = 'Approved Driver';
  } else if (s === 'none') {
    colorClasses =
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    label = 'Passenger';
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex items-center rounded-full border tracking-wide uppercase font-semibold ${sizeClasses} ${colorClasses}`}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
