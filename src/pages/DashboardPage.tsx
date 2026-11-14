import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Car,
  Search,
  PlusCircle,
  Clock,
  Compass,
  ArrowRight,
  Sparkles,
  MapPin
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
    ? { lat: Number(focalRoute.pickup_lat), lng: Number(focalRoute.pickup_lng), name: focalRoute.pickup_name || 'DIU Campus Hub' }
    : { lat: 23.8768, lng: 90.3202, name: 'DIU Campus Hub' };
  const miniMapDest = focalRoute
    ? { lat: Number(focalRoute.dest_lat), lng: Number(focalRoute.dest_lng), name: focalRoute.dest_name || 'City Transit Hub' }
    : { lat: 23.7538, lng: 90.377, name: 'City Transit Hub' };

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
            className="px-3.5 py-1.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white dark:text-[#111827] rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            Find Ride
          </Link>
          {isApprovedDriver ? (
            <Link
              to="/rides/create"
              className="px-3.5 py-1.5 bg-[#FFFFFF] dark:bg-[#24334B] hover:bg-[#F5F7FC] dark:hover:bg-[#1C2A40] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
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
          <div className="p-5 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-1">
            <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
              Active Bookings
            </span>
            <p className="text-2xl font-black text-[#222B42] dark:text-[#F1F4FC] font-mono tabular-nums">{acceptedRequests.length}</p>
            <p className="text-[10px] text-[#515FC5] dark:text-[#818CF8] font-medium">Confirmed seats</p>
          </div>

          <div className="p-5 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-1">
            <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
              Pending Requests
            </span>
            <p className="text-2xl font-black text-[#222B42] dark:text-[#F1F4FC] font-mono tabular-nums">{pendingRequests.length}</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Awaiting driver</p>
          </div>

          <div className="p-5 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-1">
            <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
              Total Requests
            </span>
            <p className="text-2xl font-black text-[#222B42] dark:text-[#F1F4FC] font-mono tabular-nums">{myRequests.length}</p>
            <p className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] font-medium">All-time bookings</p>
          </div>

          <div className="p-5 bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-1">
            <span className="text-[10px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider block">
              Driver Status
            </span>
            <p className="text-base font-black text-[#515FC5] dark:text-[#818CF8] capitalize">
              {isApprovedDriver ? 'Approved Driver' : isPendingDriver ? 'Review Pending' : 'Student Rider'}
            </p>
            <p className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] font-medium">
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
                : 'bg-[#DDE2FA] dark:bg-[#818CF8]/15 border-[#515FC5]/30 dark:border-[#818CF8]/30 text-[#222B42] dark:text-[#F1F4FC]'
            }`}
          >
            <div className="flex items-start gap-3">
              {isPendingDriver ? (
                <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <Car className="w-5 h-5 text-[#515FC5] dark:text-[#818CF8] mt-0.5 shrink-0" />
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
              className="px-3.5 py-1.5 bg-[#FFFFFF] dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] rounded-xl text-xs font-bold shadow-xs border border-[#D4DAE7] dark:border-[#34445E] hover:bg-[#F5F7FC] dark:hover:bg-[#1C2A40] shrink-0"
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
              <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">Recent Requests</h3>
              <Link
                to="/requests"
                className="text-xs font-semibold text-[#515FC5] dark:text-[#818CF8] hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                <Skeleton type="card" count={3} />
              </div>
            ) : myRequests.length > 0 ? (
              <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] divide-y divide-[#D4DAE7] dark:divide-[#34445E] shadow-xs overflow-hidden">
                {myRequests.slice(0, 4).map((req) => (
                  <div
                    key={req.id}
                    className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                          {req.pickup_name} → {req.dest_name}
                        </span>
                        <StatusBadge status={req.status} size="sm" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#626E86] dark:text-[#B0BCD0]">
                        <span>Driver: {req.driver_name}</span>
                        <span>•</span>
                        <span className="font-mono text-[#515FC5] dark:text-[#818CF8] font-semibold">৳{req.fare}</span>
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
                      className="px-3 py-1 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-semibold text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#FFFFFF] dark:hover:bg-[#24334B] transition-colors shrink-0"
                    >
                      Details
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E]">
                <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] mb-3">No ride requests yet.</p>
                <Link
                  to="/search"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#515FC5] dark:bg-[#818CF8] text-white dark:text-[#111827] rounded-xl text-xs font-bold hover:bg-[#434FA8] shadow-xs"
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
                  <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">Your Posted Rides</h3>
                  <Link
                    to="/my-rides"
                    className="text-xs font-semibold text-[#515FC5] dark:text-[#818CF8] hover:underline flex items-center gap-1"
                  >
                    Manage <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {myRides.length > 0 ? (
                  <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] divide-y divide-[#D4DAE7] dark:divide-[#34445E] shadow-xs overflow-hidden">
                    {myRides.slice(0, 3).map((ride) => (
                      <div
                        key={ride.id}
                        className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                              {ride.pickup_name} → {ride.dest_name}
                            </span>
                            <StatusBadge status={ride.status} size="sm" />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#626E86] dark:text-[#B0BCD0]">
                            <span>Seats: {ride.seats_available} / {ride.seats_total}</span>
                            <span>•</span>
                            <span className="font-mono text-[#515FC5] dark:text-[#818CF8] font-semibold">৳{ride.fare}</span>
                          </div>
                        </div>

                        <Link
                          to="/my-rides"
                          className="px-3 py-1 rounded-xl bg-[#DDE2FA] dark:bg-[#818CF8]/15 text-[#515FC5] dark:text-[#818CF8] text-xs font-bold hover:bg-[#DDE2FA]/80 shrink-0"
                        >
                          Requests ({ride.pending_requests_count || 0})
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E]">
                    <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] mb-2">No posted rides right now.</p>
                    <Link
                      to="/rides/create"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#515FC5] dark:bg-[#818CF8] text-white dark:text-[#111827] rounded-xl text-xs font-bold hover:bg-[#434FA8] shadow-xs"
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
              <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                Campus Corridor Map
              </h3>
              <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0]">Live Tiles</span>
            </div>

            <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] p-3 shadow-xs overflow-hidden">
              <MapView
                pickupLat={miniMapPickup.lat}
                pickupLng={miniMapPickup.lng}
                pickupName={miniMapPickup.name}
                destLat={miniMapDest.lat}
                destLng={miniMapDest.lng}
                destName={miniMapDest.name}
                height="420px"
              />

              <div className="p-2 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#626E86] dark:text-[#B0BCD0]">Primary Hub:</span>
                  <span className="font-semibold text-[#222B42] dark:text-[#F1F4FC] truncate max-w-[180px]">
                    {miniMapPickup.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#626E86] dark:text-[#B0BCD0]">Destination:</span>
                  <span className="font-semibold text-[#222B42] dark:text-[#F1F4FC] truncate max-w-[180px]">
                    {miniMapDest.name}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Available Campus Rides */}
            <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC]">Open Departures</span>
                <Link to="/search" className="text-[11px] text-[#515FC5] dark:text-[#818CF8] hover:underline">
                  All rides →
                </Link>
              </div>

              <div className="space-y-2">
                {upcomingRides.map((ride) => (
                  <Link
                    key={ride.id}
                    to={`/rides/${ride.id}`}
                    className="block p-2.5 rounded-xl bg-[#FFFFFF] dark:bg-[#24334B] hover:bg-[#DDE2FA]/50 dark:hover:bg-[#1C2A40] border border-[#D4DAE7]/50 dark:border-[#34445E]/50 transition-colors text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#222B42] dark:text-[#F1F4FC] truncate max-w-[160px]">
                        {ride.dest_name}
                      </span>
                      <span className="font-mono text-[#515FC5] dark:text-[#818CF8] font-bold">৳{ride.fare}</span>
                    </div>
                    <p className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] truncate mt-0.5">
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
