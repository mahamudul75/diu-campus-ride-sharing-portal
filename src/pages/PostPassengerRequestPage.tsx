import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  Calendar,
  Clock,
  Users,
  Bike,
  Car,
  Sparkles,
  MapPin
} from 'lucide-react';
import api from '../services/api.ts';
import { useToast } from '../context/ToastContext.tsx';
import MapPicker, { LocationPoint } from '../components/MapPicker.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import Spinner from '../components/Spinner.tsx';
import { isValidRideCoordinate } from '../utils/validators.ts';
import { PassengerVehiclePref } from '../types/index.ts';

export const PostPassengerRequestPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [pickup, setPickup] = useState<LocationPoint>({
    name: 'DIU Daffodil Smart City (Ashulia Campus)',
    lat: 23.8768,
    lng: 90.3202
  });
  const [dest, setDest] = useState<LocationPoint>({
    name: 'DIU Dhanmondi 27 (Sobhanbag)',
    lat: 23.7538,
    lng: 90.377
  });

  const [departureDate, setDepartureDate] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [maxFare, setMaxFare] = useState('');
  const [vehiclePref, setVehiclePref] = useState<PassengerVehiclePref>('any');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidRideCoordinate(pickup.lat, pickup.lng) || !pickup.name.trim()) {
      setError('Please select a valid pickup location on the map.');
      return;
    }

    if (!isValidRideCoordinate(dest.lat, dest.lng) || !dest.name.trim()) {
      setError('Please select a valid destination location on the map.');
      return;
    }

    if (!departureDate || !departureTime) {
      setError('Please choose a preferred departure date and time.');
      return;
    }

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(departureDate);
    const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(departureTime);
    if (!dateMatch || !timeMatch) {
      setError('Please enter a valid departure date and time.');
      return;
    }

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;

    const depDateTime = new Date(year, month - 1, day, hours, minutes, seconds, 0);
    if (
      isNaN(depDateTime.getTime()) ||
      depDateTime.getFullYear() !== year ||
      depDateTime.getMonth() !== month - 1 ||
      depDateTime.getDate() !== day
    ) {
      setError('Please choose a valid departure date and time.');
      return;
    }

    if (depDateTime.getTime() <= Date.now()) {
      setError('Departure time must be in the future.');
      return;
    }

    let parsedMaxFare: number | null = null;
    if (maxFare.trim() !== '') {
      const nFare = Number(maxFare);
      if (!Number.isFinite(nFare) || nFare < 0 || nFare > 50000) {
        setError('Max budget must be between 0 and 50,000 BDT.');
        return;
      }
      parsedMaxFare = nFare;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/passenger-requests', {
        pickup_name: pickup.name.trim(),
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dest_name: dest.name.trim(),
        dest_lat: dest.lat,
        dest_lng: dest.lng,
        departure_time: depDateTime.toISOString(),
        seats_needed: 1,
        max_fare: parsedMaxFare,
        vehicle_type: vehiclePref,
        note: note.trim() || null
      });

      if (res.data?.success && res.data.requestId) {
        showToast('Ride request posted! Approved drivers can now send offers.', 'success');
        navigate(`/passenger-requests/${res.data.requestId}`);
      } else if (res.data?.success) {
        showToast('Ride request posted successfully!', 'success');
        navigate('/passenger-requests');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create ride request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Ride Requests', path: '/passenger-requests' },
        { label: 'Post Request' }
      ]}
      title="Post a Ride Request"
      subtitle="Tell verified DIU drivers where and when you need a ride and compare offers"
    >
      <div className="space-y-6 max-w-4xl pb-10">
        {error && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-bold flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900 flex items-center justify-center shrink-0">!</div>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Route Selection */}
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-5 sm:p-7 rounded-3xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight">
                  1. Pickup & Destination Route
                </h2>
                <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                  Search or click on the map to set your pickup and drop-off points.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isValidRideCoordinate(pickup.lat, pickup.lng) ? 'bg-emerald-500' : 'bg-[#D4DAE7] dark:bg-[#34445E]'
                  }`}
                />
                <span
                  className={`w-2 h-2 rounded-full ${
                    isValidRideCoordinate(dest.lat, dest.lng) ? 'bg-emerald-500' : 'bg-[#D4DAE7] dark:bg-[#34445E]'
                  }`}
                />
              </div>
            </div>

            <MapPicker
              initialPickup={isValidRideCoordinate(pickup.lat, pickup.lng) ? pickup : undefined}
              initialDest={isValidRideCoordinate(dest.lat, dest.lng) ? dest : undefined}
              onPickupChange={(p) => setPickup(p)}
              onDestChange={(d) => setDest(d)}
              height="380px"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-widest ml-1">
                  Pickup Landmark
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                  <input
                    type="text"
                    required
                    placeholder="Enter pickup landmark..."
                    value={pickup.name}
                    onChange={(e) => setPickup({ ...pickup, name: e.target.value })}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/20 focus:border-[#515FC5] dark:focus:border-[#818CF8] transition-all font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-widest ml-1">
                  Destination Landmark
                </label>
                <div className="relative">
                  <PlusCircle className="absolute left-3 top-2.5 w-4 h-4 text-[#8175D5] dark:text-[#A78BFA] rotate-45" />
                  <input
                    type="text"
                    required
                    placeholder="Enter destination landmark..."
                    value={dest.name}
                    onChange={(e) => setDest({ ...dest, name: e.target.value })}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/20 focus:border-[#515FC5] dark:focus:border-[#818CF8] transition-all font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Schedule, Budget & Preferences */}
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-5 sm:p-7 rounded-3xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-6">
            <h2 className="text-base font-black text-[#222B42] dark:text-[#F1F4FC] tracking-tight">
              2. Schedule, Budget & Preferences
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-widest ml-1">
                  Departure Date
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="date"
                    required
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/20 focus:border-[#515FC5] dark:focus:border-[#818CF8] transition-all font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-widest ml-1">
                  Departure Time
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="time"
                    required
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/20 focus:border-[#515FC5] dark:focus:border-[#818CF8] transition-all font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-widest ml-1">
                  Max Budget (৳ Optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-[#515FC5] dark:text-[#67D5DF] font-black">৳</span>
                  <input
                    type="number"
                    min="0"
                    max="50000"
                    placeholder="Flexible"
                    value={maxFare}
                    onChange={(e) => setMaxFare(e.target.value)}
                    className="w-full text-sm pl-8 pr-4 py-2 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/20 focus:border-[#515FC5] dark:focus:border-[#818CF8] transition-all font-black font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-widest ml-1">
                  Seats Needed
                </label>
                <div className="h-[38px] px-3 bg-[#E8ECF4]/70 dark:bg-[#172235] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl flex items-center gap-2 text-xs font-bold text-[#222B42] dark:text-[#F1F4FC]">
                  <Users className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                  <span className="font-mono tabular-nums">1 seat</span>
                  <span className="text-[10px] font-normal text-[#626E86] dark:text-[#B0BCD0]">(Fixed)</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-widest ml-1">
                  Preferred Vehicle
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setVehiclePref('any')}
                    className={`py-3 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      vehiclePref === 'any'
                        ? 'bg-[#515FC5] text-white border-[#515FC5] shadow-md shadow-[#515FC5]/20'
                        : 'bg-white dark:bg-[#24334B] border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] hover:border-[#515FC5]'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    Any
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehiclePref('bike')}
                    className={`py-3 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      vehiclePref === 'bike'
                        ? 'bg-[#515FC5] text-white border-[#515FC5] shadow-md shadow-[#515FC5]/20'
                        : 'bg-white dark:bg-[#24334B] border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] hover:border-[#515FC5]'
                    }`}
                  >
                    <Bike className="w-4 h-4" />
                    Bike
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehiclePref('car')}
                    className={`py-3 px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      vehiclePref === 'car'
                        ? 'bg-[#515FC5] text-white border-[#515FC5] shadow-md shadow-[#515FC5]/20'
                        : 'bg-white dark:bg-[#24334B] border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] hover:border-[#515FC5]'
                    }`}
                  >
                    <Car className="w-4 h-4" />
                    Car
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-widest ml-1">
                  Note for Drivers (Optional)
                </label>
                <textarea
                  placeholder="e.g. Waiting near DIU Main Gate, carrying a small backpack..."
                  rows={2}
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full text-sm px-4 py-2.5 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5]/20 focus:border-[#515FC5] dark:focus:border-[#818CF8] transition-all font-medium resize-none"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-[#D4DAE7] dark:border-[#34445E] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] max-w-md">
                Only approved DIU drivers can view this request and propose a fare and pickup time. Your phone number stays hidden until you accept an offer.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="px-7 py-3 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] font-black text-sm rounded-2xl shadow-lg shadow-[#515FC5]/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {submitting ? <Spinner size="sm" /> : <PlusCircle className="w-4 h-4" />}
                {submitting ? 'Posting...' : 'Post Ride Request'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default PostPassengerRequestPage;
