import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Calendar, Clock, DollarSign, Users, Bike, Car, MapPin } from 'lucide-react';
import api from '../services/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import MapPicker, { LocationPoint } from '../components/MapPicker.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import Spinner from '../components/Spinner.tsx';

export const PostRidePage: React.FC = () => {
  const { user } = useAuth();
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
  const [fare, setFare] = useState('100');
  const [seatsTotal, setSeatsTotal] = useState(user?.vehicle_type === 'bike' ? '1' : '3');
  const [vehicleType, setVehicleType] = useState<'bike' | 'car'>(user?.vehicle_type || 'bike');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pickup.lat || !pickup.lng || !pickup.name.trim()) {
      setError('Please select a valid pickup location on the map.');
      return;
    }

    if (!dest.lat || !dest.lng || !dest.name.trim()) {
      setError('Please select a valid destination location on the map.');
      return;
    }

    if (!departureDate || !departureTime) {
      setError('Please choose a departure date and time.');
      return;
    }

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(departureDate);
    const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(departureTime);
    if (!dateMatch || !timeMatch) {
      setError('Please choose a valid departure date and time.');
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

    if (depDateTime.getTime() < Date.now()) {
      setError('Departure time must be in the future.');
      return;
    }

    const numFare = Number(fare);
    if (isNaN(numFare) || numFare < 0) {
      setError('Please enter a valid fare in BDT.');
      return;
    }

    const seats = Number(seatsTotal);
    if (isNaN(seats) || seats < 1 || seats > 8) {
      setError('Seats must be between 1 and 8.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/rides', {
        pickup_name: pickup.name,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dest_name: dest.name,
        dest_lat: dest.lat,
        dest_lng: dest.lng,
        departure_time: depDateTime.toISOString(),
        fare: numFare,
        seats_total: seats,
        vehicle_type: vehicleType,
        note: note.trim() || null
      });

      if (res.data?.success) {
        showToast('Ride posted successfully!', 'success');
        navigate('/my-rides');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to post ride.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Post Ride' }]}
      title="Post a Ride"
      subtitle="Publish your commute and offer seats to fellow DIU students"
    >
      <div className="space-y-6 max-w-4xl pb-10">
        {error && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-2xl text-xs font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
            <div className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900 flex items-center justify-center shrink-0">!</div>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Map Route Selection */}
          <div className="bg-white dark:bg-slate-900 p-5 sm:p-7 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">1. Route Definition</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Search or click the map to define your journey.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${pickup.lat ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}></span>
                <span className={`w-2 h-2 rounded-full ${dest.lat ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}></span>
              </div>
            </div>

            <MapPicker
              initialPickup={pickup.lat ? pickup : undefined}
              initialDest={dest.lat ? dest : undefined}
              onPickupChange={(p) => setPickup(p)}
              onDestChange={(d) => setDest(d)}
              height="380px"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Pickup Landmark</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-emerald-600" />
                  <input
                    type="text"
                    required
                    placeholder="Enter landmark name..."
                    value={pickup.name}
                    onChange={(e) => setPickup({ ...pickup, name: e.target.value })}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Destination Landmark</label>
                <div className="relative">
                  <PlusCircle className="absolute left-3 top-2.5 w-4 h-4 text-orange-500 rotate-45" />
                  <input
                    type="text"
                    required
                    placeholder="Enter landmark name..."
                    value={dest.name}
                    onChange={(e) => setDest({ ...dest, name: e.target.value })}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Trip Details */}
          <div className="bg-white dark:bg-slate-900 p-5 sm:p-7 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <h2 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight">2. Journey Logistics</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Departure Date */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Date</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="date"
                    required
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 transition-all font-bold"
                  />
                </div>
              </div>

              {/* Departure Time */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Time</label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="time"
                    required
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 transition-all font-bold"
                  />
                </div>
              </div>

              {/* Fare */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Fare (৳)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-emerald-600 font-black">৳</span>
                  <input
                    type="number"
                    required
                    min="0"
                    max="1000"
                    value={fare}
                    onChange={(e) => setFare(e.target.value)}
                    className="w-full text-sm pl-8 pr-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 transition-all font-black font-mono"
                  />
                </div>
              </div>

              {/* Seats Total */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Seats</label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="number"
                    required
                    min="1"
                    max={vehicleType === 'bike' ? 2 : 6}
                    value={seatsTotal}
                    onChange={(e) => setSeatsTotal(e.target.value)}
                    className="w-full text-sm pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 transition-all font-bold font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Vehicle Type Switcher */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Vehicle Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setVehicleType('bike');
                      if (Number(seatsTotal) > 1) setSeatsTotal('1');
                    }}
                    className={`py-3 px-4 rounded-2xl border text-xs font-black flex items-center justify-center gap-3 transition-all ${
                      vehicleType === 'bike'
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-300'
                    }`}
                  >
                    <Bike className={vehicleType === 'bike' ? 'w-5 h-5' : 'w-4 h-4'} /> 
                    Motorbike
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVehicleType('car');
                    }}
                    className={`py-3 px-4 rounded-2xl border text-xs font-black flex items-center justify-center gap-3 transition-all ${
                      vehicleType === 'car'
                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-300'
                    }`}
                  >
                    <Car className={vehicleType === 'car' ? 'w-5 h-5' : 'w-4 h-4'} /> 
                    Private Car
                  </button>
                </div>
              </div>

              {/* Optional Description / Route Note */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Ride Note (Optional)
                </label>
                <textarea
                  placeholder="e.g. Please bring your own helmet, AC will be on..."
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full text-sm px-4 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium resize-none"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
               <p className="text-[10px] text-slate-400 max-w-[200px]">By publishing, you agree to DIU campus ride safety guidelines.</p>
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-600/20 transition-all flex items-center gap-3 cursor-pointer disabled:opacity-50 group"
              >
                {submitting ? <Spinner size="sm" /> : <PlusCircle className="w-5 h-5 group-hover:rotate-90 transition-transform" />}
                {submitting ? 'Publishing...' : 'Publish Ride'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default PostRidePage;
