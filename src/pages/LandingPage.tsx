import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Car,
  ShieldCheck,
  Search,
  PlusCircle,
  Users,
  Clock,
  Compass,
  ArrowRight,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import api from '../services/api.ts';
import { Ride } from '../types/index.ts';
import RideCard from '../components/RideCard.tsx';
import Skeleton from '../components/Skeleton.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import CampusMapPreview from '../components/CampusMapPreview.tsx';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isApprovedDriver } = useAuth();
  const [featuredRides, setFeaturedRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOpenRides() {
      try {
        const res = await api.get('/rides');
        if (res.data?.success) {
          setFeaturedRides((res.data.rides || []).slice(0, 3));
        }
      } catch (err) {
        console.warn('Failed to fetch rides:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOpenRides();
  }, []);

  const handleOfferRide = () => {
    if (!user) {
      navigate('/login?redirect=/rides/create');
    } else if (isApprovedDriver) {
      navigate('/rides/create');
    } else {
      navigate('/become-driver');
    }
  };

  return (
    <div className="space-y-16 pb-16">
      {/* SaaS Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 dark:bg-slate-950 text-white py-20 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(#14b8a6_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/80 border border-teal-500/30 text-teal-300 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Verified DIU Students Only</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Campus Ride Sharing Portal
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto leading-relaxed">
            Connect with verified DIU students commuting between campus and Dhaka city.
          </p>

          {/* Two Hero Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              to="/search"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              Find a Ride
            </Link>

            <button
              onClick={handleOfferRide}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-orange-400" />
              Offer a Ride
            </button>
          </div>
        </div>
      </section>

      {/* Campus Transit Network Map Preview */}
      <CampusMapPreview />

      {/* 3-Step How It Works Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            How It Works
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Three Steps to Travel
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
              01
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Search Route</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Find rides by campus, destination, and departure time.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
              02
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Send Request</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Request a seat from an approved DIU student driver.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
              03
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Ride Together</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Receive contact details, meet at pickup, and split fare.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Features
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Built for DIU Students
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <ShieldCheck className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">ID Verification</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Only verified DIU students can register and ride.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <DollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">Cost Sharing</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fair fuel-split fares, cheaper than commercial cabs.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <Compass className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">Dual Roles</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ride as passenger or offer rides using one account.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <Clock className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">Direct Travel</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Direct routes without stressful bus transit delays.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Live Rides */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-0.5">
              Available
            </span>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Upcoming Rides
            </h2>
          </div>
          <Link
            to="/search"
            className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton type="card" count={3} />
          </div>
        ) : featuredRides.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                onBookClick={() => navigate(`/rides/${ride.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">No scheduled rides available right now.</p>
            <button
              onClick={handleOfferRide}
              className="mt-3 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Post first campus ride →
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default LandingPage;
