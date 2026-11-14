import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Users, Bike, Car, ChevronRight, User, Star, BadgeCheck, Route } from 'lucide-react';
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
  const isAvailable = (ride.status === 'open' || ride.status === 'scheduled') && ride.seats_available > 0;

  return (
    <div className="bg-[#FFFFFF] dark:bg-[#1B2940] rounded-2xl border border-[#DCE2EC] dark:border-[#34445D] shadow-sm hover:shadow-md hover:border-[#4F5FC9]/40 dark:hover:border-[#818CF8]/40 transition-all duration-200 overflow-hidden flex flex-col group relative">
      {/* Fare Display - Prominent top-right */}
      <div className="absolute top-4 right-4 z-10 text-right">
        <span className="text-xl font-black text-[#4F5FC9] dark:text-[#54C5C0] font-mono tabular-nums tracking-tighter">
          ৳{Number(ride.fare).toFixed(0)}
        </span>
      </div>

      {/* Driver Header */}
      <div className="p-5 pb-3 flex items-center gap-3 pr-20">
        <div className="relative shrink-0">
          {ride.driver_avatar_url ? (
            <img
              src={ride.driver_avatar_url}
              alt={ride.driver_name || 'Driver'}
              className="w-10 h-10 rounded-full object-cover border border-[#DCE2EC] dark:border-[#34445D]"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#EEF0FA] dark:bg-[#243750] flex items-center justify-center font-bold text-sm text-[#4F5FC9] dark:text-[#818CF8] border border-[#DCE2EC] dark:border-[#34445D]">
              {ride.driver_name ? ride.driver_name.charAt(0) : <User className="w-5 h-5" />}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-bold text-[#253149] dark:text-[#F1F5FC] text-sm truncate">
              {ride.driver_name || 'DIU Student'}
            </h4>
            {ride.driver_student_verified === 1 && (
              <span title="Verified DIU Student">
                <BadgeCheck className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8] shrink-0" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[#66738A] dark:text-[#B4C0D3] font-bold flex-wrap mt-0.5">
            <span className="inline-flex items-center gap-1 uppercase tracking-wide">
              {isBike ? <Bike className="w-3 h-3 text-[#4F5FC9] dark:text-[#818CF8]" /> : <Car className="w-3 h-3 text-[#4F5FC9] dark:text-[#818CF8]" />}
              {isBike ? 'Motorbike' : 'Car'}
            </span>
            {ride.driver_avg_rating !== null && ride.driver_avg_rating !== undefined && (
              <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                {ride.driver_avg_rating.toFixed(1)}
                {ride.driver_review_count ? ` (${ride.driver_review_count})` : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Journey */}
      <div className="px-5 py-2 space-y-2.5">
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-[#66738A] dark:text-[#B4C0D3] tracking-wider">Pickup</p>
          <p className="text-sm font-bold text-[#253149] dark:text-[#F1F5FC] line-clamp-1">{ride.pickup_name}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase font-bold text-[#66738A] dark:text-[#B4C0D3] tracking-wider">Destination</p>
          <p className="text-sm font-bold text-[#253149] dark:text-[#F1F5FC] line-clamp-1">{ride.dest_name}</p>
        </div>
      </div>

      {/* Metadata Chips / Status */}
      <div className="px-5 py-3.5 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#DCE2EC] dark:border-[#34445D]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-1 text-[11px] font-medium text-[#66738A] dark:text-[#B4C0D3]">
            <Calendar className="w-3 h-3 text-[#4F5FC9] dark:text-[#818CF8]" />
            {formattedDate}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-[#66738A] dark:text-[#B4C0D3]">
            <Clock className="w-3 h-3 text-[#4F5FC9] dark:text-[#818CF8]" />
            {formattedTime}
          </div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-[#66738A] dark:text-[#B4C0D3]">
            <Users className="w-3 h-3 text-[#4F5FC9] dark:text-[#818CF8]" />
            <span className="font-bold text-[#253149] dark:text-[#F1F5FC] tabular-nums">
              {ride.seats_available}/{ride.seats_total} left
            </span>
          </div>
          {ride.distance_km !== undefined && ride.distance_km !== null && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-[#66738A] dark:text-[#B4C0D3] tabular-nums">
              <Route className="w-3 h-3 text-[#4F5FC9] dark:text-[#818CF8]" />
              {ride.distance_km} km{ride.estimated_minutes ? ` · ~${ride.estimated_minutes}m` : ''}
            </div>
          )}
        </div>
        <StatusBadge status={ride.status} size="sm" />
      </div>

      <div className="px-5 pb-5 flex items-center justify-between">
        <Link
          to={`/rides/${ride.id}`}
          className="flex items-center gap-1 text-xs font-bold text-[#4F5FC9] dark:text-[#818CF8] hover:text-[#404EB2] dark:hover:text-[#A5A6F6] transition-colors"
        >
          View Route <ChevronRight className="w-3 h-3" />
        </Link>
        {showBookButton && isAvailable && onBookClick && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBookClick(ride);
            }}
            className="px-4 py-2 bg-[#4F5FC9] hover:bg-[#404EB2] dark:bg-[#818CF8] dark:hover:bg-[#6B79F2] text-white dark:text-[#111827] rounded-xl text-xs font-bold shadow-sm shadow-[#4F5FC9]/15 transition-all cursor-pointer whitespace-nowrap"
          >
            Request Ride
          </button>
        )}
      </div>
    </div>
  );
};

export default RideCard;
