import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Users, Bike, Car, ChevronRight, User } from 'lucide-react';
import { Ride } from '../types/index.ts';
import StatusBadge from './StatusBadge.tsx';

interface RideCardProps {
  ride: Ride;
  onBookClick?: (ride: Ride) => void;
  showBookButton?: boolean;
}

export const RideCard: React.FC<RideCardProps> = ({
  ride,
  onBookClick,
  showBookButton = true
}) => {
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
  const isAvailable = ride.status === 'open' && ride.seats_available > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col group relative">
      
      {/* Fare Display - Prominent top-right */}
      <div className="absolute top-4 right-4 z-10">
        <span className="text-xl font-black text-emerald-600 font-mono tracking-tighter">৳{Number(ride.fare).toFixed(0)}</span>
      </div>

      {/* Driver Header */}
      <div className="p-5 pb-3 flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {ride.driver_name ? ride.driver_name.charAt(0) : <User className="w-5 h-5" />}
          </div>
          {/* Online Status Badge */}
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" />
        </div>
        <div>
          <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{ride.driver_name || 'DIU Student'}</h4>
          <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wide font-bold">
            {isBike ? <Bike className="w-3 h-3" /> : <Car className="w-3 h-3" />}
            {isBike ? 'Motorbike' : 'Car'}
          </div>
        </div>
      </div>

      {/* Journey */}
      <div className="px-5 py-2 space-y-3">
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pickup</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{ride.pickup_name}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Destination</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{ride.dest_name}</p>
        </div>
      </div>

      {/* Metadata Chips / Status */}
      <div className="px-5 py-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-50 dark:border-slate-800/50">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Calendar className="w-3 h-3" />
            {formattedDate}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Clock className="w-3 h-3" />
            {formattedTime}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Users className="w-3 h-3 text-emerald-600" />
            <span className="font-bold text-slate-700 dark:text-slate-300">{ride.seats_available}/{ride.seats_total} left</span>
          </div>
        </div>
        <StatusBadge status={ride.status} size="sm" />
      </div>

      <div className="px-5 pb-5 flex items-center justify-between">
        <Link to={`/rides/${ride.id}`} className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors">
          View Route <ChevronRight className="w-3 h-3" />
        </Link>
        {showBookButton && isAvailable && onBookClick && (
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBookClick(ride);
            }} 
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-600/10 transition-all cursor-pointer"
          >
            Request Ride
          </button>
        )}
      </div>
    </div>
  );
};

export default RideCard;

