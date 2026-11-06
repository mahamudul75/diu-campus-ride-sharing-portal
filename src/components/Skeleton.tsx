import React from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'rectangular' | 'circular';
  type?: 'card' | 'table' | 'text' | 'rectangular' | 'circular';
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant,
  type,
  count = 1
}) => {
  const actualType = type || variant || 'rectangular';

  if (actualType === 'card') {
    return (
      <div className={`space-y-4 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (actualType === 'table') {
    return <TableSkeleton rows={count || 5} />;
  }

  const baseClasses = 'animate-pulse bg-slate-200 dark:bg-slate-800';
  const variantClasses: Record<string, string> = {
    text: 'h-4 rounded-md',
    rectangular: 'rounded-xl',
    circular: 'rounded-full'
  };

  const chosenVariant = actualType in variantClasses ? actualType : 'rectangular';

  if (count > 1) {
    return (
      <div className={`space-y-2.5 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={`${baseClasses} ${variantClasses[chosenVariant]}`} />
        ))}
      </div>
    );
  }

  return <div className={`${baseClasses} ${variantClasses[chosenVariant]} ${className}`} />;
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" className="w-10 h-10" />
          <div className="space-y-1.5">
            <Skeleton variant="text" className="w-28 h-3.5" />
            <Skeleton variant="text" className="w-20 h-2.5" />
          </div>
        </div>
        <Skeleton variant="rectangular" className="w-14 h-6 rounded-full" />
      </div>
      <div className="space-y-2 py-2">
        <Skeleton variant="text" className="w-3/4 h-3.5" />
        <Skeleton variant="text" className="w-1/2 h-3" />
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <Skeleton variant="rectangular" className="w-20 h-5" />
        <Skeleton variant="rectangular" className="w-16 h-5" />
      </div>
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 flex gap-4">
        <Skeleton variant="text" className="w-24" />
        <Skeleton variant="text" className="w-32" />
        <Skeleton variant="text" className="w-20" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Skeleton variant="circular" className="w-8 h-8" />
            <div className="space-y-1.5 flex-1 max-w-xs">
              <Skeleton variant="text" className="w-full h-3" />
              <Skeleton variant="text" className="w-2/3 h-2.5" />
            </div>
          </div>
          <Skeleton variant="rectangular" className="w-20 h-6" />
        </div>
      ))}
    </div>
  );
};

export default Skeleton;
