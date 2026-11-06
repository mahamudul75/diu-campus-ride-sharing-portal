import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Car,
  Search,
  PlusCircle,
  Clock,
  Compass,
  AlertCircle,
  Calendar,
  ArrowRight,
  Sparkles,
  MapPin,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import api from '../services/api.ts';
import { RideRequest, Ride } from '../types/index.ts';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Skeleton from '../components/Skeleton.tsx';
import MapView from '../components/MapView.tsx';

export const DashboardPage: React.FC = () => {
  const { user, isApprovedDriver, isPendingDriver } = useAuth();
  const navigate = useNavigate();

  const [myRequests, setMyRequests] = useState<RideRequest[]>([]);
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [upcomingRides, setUpcomingRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [reqRes, ridesRes, openRidesRes] = await Promise.allSettled([
          api.get('/requests/mine'),
          isApprovedDriver ? api.get('/rides/mine') : Promise.resolve({ data: { rides: [] } }),
          api.get('/rides')
        ]);

        if (reqRes.status === 'fulfilled' && reqRes.value.data?.success) {
          setMyRequests(reqRes.value.data.requests || []);
        }
        if (ridesRes.status === 'fulfilled' && (ridesRes.value as any).data?.success) {
          setMyRides((ridesRes.value as any).data.rides || []);
        }
        if (openRidesRes.status === 'fulfilled' && openRidesRes.value.data?.success) {
          setUpcomingRides((openRidesRes.value.data.rides || []).slice(0, 3));
        }
      } catch (err) {
        console.warn('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [isApprovedDriver]);

  if (!user) return null;

  const pendingRequests = myRequests.filter((r) => r.status === 'pending');
  const acceptedRequests = myRequests.filter((r) => r.status === 'accepted');

  // Mini map focal route: first accepted request, or first driver ride, or DIU corridor
  const focalRoute = acceptedRequests[0] || myRides[0] || upcomingRides[0];
  const miniMapPickup = focalRoute
    ? { lat: Number(focalRoute.pickup_lat), lng: Number(focalRoute.pickup_lng), name: focalRoute.pickup_name || 'DIU Smart City (Ashulia)' }
    : { lat: 23.8768, lng: 90.3202, name: 'DIU Smart City (Ashulia)' };
  const miniMapDest = focalRoute
    ? { lat: Number(focalRoute.dest_lat), lng: Number(focalRoute.dest_lng), name: focalRoute.dest_name || 'DIU Dhanmondi 27' }
    : { lat: 23.7538, lng: 90.377, name: 'DIU Dhanmondi 27' };

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard' }]}
      title={`Welcome, ${user.name}`}
      subtitle={`Student ID: ${user.student_id} • ${
        isApprovedDriver ? 'Approved Driver' : isPendingDriver ? 'Driver Pending' : 'Student Passenger'
      }`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/search"
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            Find Ride
          </Link>
          {isApprovedDriver ? (
            <Link
              to="/rides/create"
              className="px-3.5 py-1.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5 text-teal-400" />
              Post Ride
            </Link>
          ) : (
            <Link
              to="/become-driver"
              className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              {isPendingDriver ? 'Review Application' : 'Offer Rides'}
            </Link>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Stat Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Active Bookings
            </span>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{acceptedRequests.length}</p>
            <p className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">Confirmed seats</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Pending Requests
            </span>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{pendingRequests.length}</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Awaiting driver</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Requests
            </span>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{myRequests.length}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">All-time bookings</p>
          </div>

          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Driver Status
            </span>
            <p className="text-base font-black text-teal-600 dark:text-teal-400 capitalize">
              {isApprovedDriver ? 'Approved Driver' : isPendingDriver ? 'Review Pending' : 'Student Rider'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              {isApprovedDriver ? `${myRides.length} posted rides` : 'Eligible to apply'}
            </p>
          </div>
        </div>

        {/* Driver Application Alert if not approved */}
        {!isApprovedDriver && (
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
              isPendingDriver
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                : 'bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {isPendingDriver ? (
                <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <Car className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-xs">
                  {isPendingDriver ? 'Driver Verification in Progress' : 'Commuting with your bike or car?'}
                </h4>
                <p className="text-[11px] opacity-80 mt-0.5">
                  {isPendingDriver
                    ? 'Administration is reviewing your vehicle details. Rides can be posted after approval.'
                    : 'Apply once to become an approved student driver and offset fuel costs.'}
                </p>
              </div>
            </div>
            <Link
              to="/become-driver"
              className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-xl text-xs font-bold shadow-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-50 shrink-0"
            >
              {isPendingDriver ? 'Check Status' : 'Apply Now'}
            </Link>
          </div>
        )}

        {/* 2-Column Overview: Requests & Mini Map */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Recent Requests Section (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Recent Requests</h3>
              <Link
                to="/requests"
                className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                <Skeleton type="card" count={3} />
              </div>
            ) : myRequests.length > 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden">
                {myRequests.slice(0, 4).map((req) => (
                  <div
                    key={req.id}
                    className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {req.pickup_name} → {req.dest_name}
                        </span>
                        <StatusBadge status={req.status} size="sm" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>Driver: {req.driver_name}</span>
                        <span>•</span>
                        <span className="font-mono text-teal-600 dark:text-teal-400 font-semibold">৳{req.fare}</span>
                        <span>•</span>
                        <span>
                          {req.departure_time &&
                            new Date(req.departure_time).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={`/rides/${req.ride_id}`}
                      className="px-3 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                      Details
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">No ride requests yet.</p>
                <Link
                  to="/search"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700 shadow-xs"
                >
                  <Search className="w-3.5 h-3.5" />
                  Find a Ride
                </Link>
              </div>
            )}

            {/* Approved Driver's Posted Rides Section */}
            {isApprovedDriver && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Your Posted Rides</h3>
                  <Link
                    to="/my-rides"
                    className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
                  >
                    Manage <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {myRides.length > 0 ? (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-xs overflow-hidden">
                    {myRides.slice(0, 3).map((ride) => (
                      <div
                        key={ride.id}
                        className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {ride.pickup_name} → {ride.dest_name}
                            </span>
                            <StatusBadge status={ride.status} size="sm" />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>Seats: {ride.seats_available} / {ride.seats_total}</span>
                            <span>•</span>
                            <span className="font-mono text-teal-600 dark:text-teal-400 font-semibold">৳{ride.fare}</span>
                          </div>
                        </div>

                        <Link
                          to="/my-rides"
                          className="px-3 py-1 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 shrink-0"
                        >
                          Requests ({ride.pending_requests_count || 0})
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">No posted rides right now.</p>
                    <Link
                      to="/rides/create"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-xl text-xs font-bold hover:bg-teal-700 shadow-xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Post a Ride
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mini Map Section (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                Campus Corridor Map
              </h3>
              <span className="text-[10px] text-slate-400">Live Tiles</span>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 shadow-xs overflow-hidden">
              <MapView
                pickupLat={miniMapPickup.lat}
                pickupLng={miniMapPickup.lng}
                pickupName={miniMapPickup.name}
                destLat={miniMapDest.lat}
                destLng={miniMapDest.lng}
                destName={miniMapDest.name}
                height="280px"
              />

              <div className="p-2 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Primary Hub:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
                    {miniMapPickup.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Destination:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
                    {miniMapDest.name}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Available Campus Rides */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Open Departures</span>
                <Link to="/search" className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline">
                  All rides →
                </Link>
              </div>

              <div className="space-y-2">
                {upcomingRides.map((ride) => (
                  <Link
                    key={ride.id}
                    to={`/rides/${ride.id}`}
                    className="block p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-teal-50 dark:hover:bg-slate-800 transition-colors text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[160px]">
                        {ride.dest_name}
                      </span>
                      <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">৳{ride.fare}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      From {ride.pickup_name}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DashboardPage;
