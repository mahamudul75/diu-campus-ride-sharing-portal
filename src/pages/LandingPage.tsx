import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Car,
  ShieldCheck,
  Search,
  PlusCircle,
  Users,
  Compass,
  ArrowRight,
  CheckCircle2,
  Lock,
  MessageSquare,
  Zap
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
    <div className="space-y-24 pb-24 bg-[#F1F3F8] dark:bg-[#111827] text-[#253149] dark:text-[#F1F5FC] min-h-screen transition-colors">
      {/* SaaS Hero Section with Dual-Mode Gradient */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#E9EDF5] via-[#F1F3F8] to-[#E9EDF5] dark:from-[#172338] dark:via-[#111827] dark:to-[#172338] text-[#253149] dark:text-[#F1F5FC] pt-28 pb-32 px-4 sm:px-6 lg:px-8 border-b border-[#DCE2EC] dark:border-[#34445D]">
        {/* Subtle radial ambient lighting */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-gradient-to-r from-[#4F5FC9]/15 via-[#777DE0]/10 to-[#299E9A]/10 dark:from-[#818CF8]/15 dark:via-[#A5A6F6]/10 dark:to-[#54C5C0]/15 blur-[140px] rounded-full pointer-events-none" />

        <div className="relative max-w-5xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EEF0FA] dark:bg-[#818CF8]/15 border border-[#4F5FC9]/30 dark:border-[#818CF8]/30 text-[#4F5FC9] dark:text-[#818CF8] text-xs font-semibold shadow-xs">
            <ShieldCheck className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
            <span>Exclusively for Verified DIU Students</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-[#253149] dark:text-[#F1F5FC] leading-[1.15] whitespace-nowrap">
            Smarter Journeys{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4F5FC9] via-[#777DE0] to-[#299E9A] dark:from-[#818CF8] dark:via-[#A5A6F6] dark:to-[#54C5C0]">
              Stronger Connections
            </span>
          </h1>

          <p className="text-base sm:text-lg text-[#66738A] dark:text-[#B4C0D3] max-w-2xl mx-auto leading-relaxed">
            A simpler way for DIU students to travel together.
          </p>

          {/* Two Hero Action Buttons - Verified High-Contrast in both themes */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              to="/search"
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#4F5FC9] hover:bg-[#404EB2] dark:bg-[#818CF8] dark:hover:bg-[#6B79F2] text-white dark:text-[#111827] font-extrabold text-sm shadow-lg shadow-[#4F5FC9]/20 dark:shadow-[#818CF8]/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              Find a Ride
              <ArrowRight className="w-4 h-4" />
            </Link>

            <button
              onClick={handleOfferRide}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#FFFFFF] hover:bg-[#EEF0FA] dark:bg-[#243750] dark:hover:bg-[#2B3B56] text-[#253149] dark:text-[#F1F5FC] border border-[#DCE2EC] dark:border-[#34445D] font-bold text-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
            >
              <PlusCircle className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
              Offer a Ride
            </button>
          </div>

          {/* Feature / Trust Strip */}
          <div className="pt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto border-t border-[#DCE2EC] dark:border-[#34445D]">
            <div className="p-5 rounded-2xl bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] shadow-xs text-left space-y-2 hover:border-[#4F5FC9]/40 dark:hover:border-[#818CF8]/40 transition-all">
              <div className="w-8 h-8 rounded-lg bg-[#EEF0FA] dark:bg-[#818CF8]/20 text-[#4F5FC9] dark:text-[#818CF8] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-[#253149] dark:text-[#F1F5FC]">DIU Community</h3>
              <p className="text-xs text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">Built for verified students.</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] shadow-xs text-left space-y-2 hover:border-[#4F5FC9]/40 dark:hover:border-[#818CF8]/40 transition-all">
              <div className="w-8 h-8 rounded-lg bg-[#EEF0FA] dark:bg-[#54C5C0]/20 text-[#299E9A] dark:text-[#54C5C0] flex items-center justify-center">
                <Compass className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-[#253149] dark:text-[#F1F5FC]">Flexible Routes</h3>
              <p className="text-xs text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">Travel across campus corridors.</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] shadow-xs text-left space-y-2 hover:border-[#4F5FC9]/40 dark:hover:border-[#818CF8]/40 transition-all">
              <div className="w-8 h-8 rounded-lg bg-[#EEF0FA] dark:bg-[#818CF8]/20 text-[#4F5FC9] dark:text-[#818CF8] flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-[#253149] dark:text-[#F1F5FC]">Student Safety</h3>
              <p className="text-xs text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">Trust and security verified.</p>
            </div>

            <div className="p-5 rounded-2xl bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] shadow-xs text-left space-y-2 hover:border-[#4F5FC9]/40 dark:hover:border-[#818CF8]/40 transition-all">
              <div className="w-8 h-8 rounded-lg bg-[#EEF0FA] dark:bg-[#A5A6F6]/20 text-[#777DE0] dark:text-[#A5A6F6] flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-[#253149] dark:text-[#F1F5FC]">Real-Time Updates</h3>
              <p className="text-xs text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">Instant ride and booking alerts.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Campus Transit Network Map Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="text-xs font-bold text-[#4F5FC9] dark:text-[#818CF8] uppercase tracking-widest block mb-2">
            Interactive Transit Network
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-[#253149] dark:text-[#F1F5FC] tracking-tight">
            Explore Campus Routes
          </h2>
        </div>
        <CampusMapPreview />
      </section>

      {/* 3-Step How It Works Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-xl mx-auto mb-12">
          <span className="text-xs font-bold text-[#4F5FC9] dark:text-[#818CF8] uppercase tracking-widest block mb-2">
            Simple Process
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-[#253149] dark:text-[#F1F5FC] tracking-tight">
            How Campus Sharing Works
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-3xl bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] shadow-sm space-y-4 relative group hover:border-[#4F5FC9]/50 dark:hover:border-[#818CF8]/50 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF0FA] dark:bg-[#818CF8]/20 text-[#4F5FC9] dark:text-[#818CF8] flex items-center justify-center font-black text-base border border-[#4F5FC9]/30 dark:border-[#818CF8]/30">
              01
            </div>
            <h3 className="text-base font-bold text-[#253149] dark:text-[#F1F5FC]">Search Route</h3>
            <p className="text-xs sm:text-sm text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">
              Find available commutes by departure time, destination, and vehicle type.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] shadow-sm space-y-4 relative group hover:border-[#4F5FC9]/50 dark:hover:border-[#818CF8]/50 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF0FA] dark:bg-[#818CF8]/20 text-[#4F5FC9] dark:text-[#818CF8] flex items-center justify-center font-black text-base border border-[#4F5FC9]/30 dark:border-[#818CF8]/30">
              02
            </div>
            <h3 className="text-base font-bold text-[#253149] dark:text-[#F1F5FC]">Send Request</h3>
            <p className="text-xs sm:text-sm text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">
              Request a seat from a verified student driver. Get notified upon acceptance.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] shadow-sm space-y-4 relative group hover:border-[#4F5FC9]/50 dark:hover:border-[#818CF8]/50 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF0FA] dark:bg-[#818CF8]/20 text-[#4F5FC9] dark:text-[#818CF8] flex items-center justify-center font-black text-base border border-[#4F5FC9]/30 dark:border-[#818CF8]/30">
              03
            </div>
            <h3 className="text-base font-bold text-[#253149] dark:text-[#F1F5FC]">Ride Together</h3>
            <p className="text-xs sm:text-sm text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">
              Connect via secure in-app messaging, meet at the pickup point, and travel safely.
            </p>
          </div>
        </div>
      </section>

      {/* Featured Rides Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <span className="text-xs font-bold text-[#4F5FC9] dark:text-[#818CF8] uppercase tracking-widest block mb-1">
              Active Commutes
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-[#253149] dark:text-[#F1F5FC] tracking-tight">
              Featured Available Rides
            </h2>
          </div>
          <Link
            to="/search"
            className="inline-flex items-center gap-2 text-xs font-bold text-[#4F5FC9] dark:text-[#818CF8] hover:underline"
          >
            Browse All Rides <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton type="card" count={3} />
          </div>
        ) : featuredRides.length === 0 ? (
          <div className="p-12 text-center bg-[#FFFFFF] dark:bg-[#1B2940] rounded-3xl border border-[#DCE2EC] dark:border-[#34445D] shadow-sm space-y-3">
            <Car className="w-10 h-10 text-[#66738A] dark:text-[#B4C0D3] mx-auto" />
            <h3 className="font-bold text-[#253149] dark:text-[#F1F5FC] text-sm">No Rides Listed Right Now</h3>
            <p className="text-xs text-[#66738A] dark:text-[#B4C0D3]">Be the first student to offer a commute today.</p>
            <Link
              to="/become-driver"
              className="inline-block mt-2 px-4 py-2 bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#111827] text-xs font-bold rounded-xl"
            >
              Offer a Ride
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredRides.map((ride) => (
              <RideCard key={ride.id} ride={ride} />
            ))}
          </div>
        )}
      </section>

      {/* Trust & Safety Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#FFFFFF] dark:bg-[#1B2940] text-[#253149] dark:text-[#F1F5FC] rounded-3xl p-8 sm:p-12 border border-[#DCE2EC] dark:border-[#34445D] shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 w-96 h-96 bg-[#4F5FC9]/5 dark:bg-[#818CF8]/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-6">
              <span className="text-xs font-bold text-[#4F5FC9] dark:text-[#818CF8] uppercase tracking-widest block">
                Student Safety First
              </span>
              <h2 className="text-2xl sm:4xl font-black tracking-tight text-[#253149] dark:text-[#F1F5FC] leading-tight">
                Built Exclusively for University Safety Standards
              </h2>
              <p className="text-sm sm:text-base text-[#66738A] dark:text-[#B4C0D3] leading-relaxed">
                Every student user must authenticate with a valid student email and verified student ID. Drivers undergo administrative vehicle plate checks, and our Safety Center includes instant SOS emergency contacts and user blocking.
              </p>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-[#253149] dark:text-[#F1F5FC]">
                  <CheckCircle2 className="w-5 h-5 text-[#4F5FC9] dark:text-[#818CF8] shrink-0" />
                  <span>Verified student ID and official university email restrictions</span>
                </div>
                <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-[#253149] dark:text-[#F1F5FC]">
                  <CheckCircle2 className="w-5 h-5 text-[#4F5FC9] dark:text-[#818CF8] shrink-0" />
                  <span>Admin-approved motorcycle and car registration plates</span>
                </div>
                <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-[#253149] dark:text-[#F1F5FC]">
                  <CheckCircle2 className="w-5 h-5 text-[#4F5FC9] dark:text-[#818CF8] shrink-0" />
                  <span>Emergency SOS contacts and instant reporting tools</span>
                </div>
              </div>
              <div className="pt-2">
                <Link
                  to="/safety"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#4F5FC9] hover:bg-[#404EB2] dark:bg-[#818CF8] dark:hover:bg-[#6B79F2] text-white dark:text-[#111827] font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md"
                >
                  Explore Safety Center <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl bg-[#F8F9FD] dark:bg-[#243750] border border-[#DCE2EC] dark:border-[#34445D] space-y-3">
                <ShieldCheck className="w-8 h-8 text-[#4F5FC9] dark:text-[#818CF8]" />
                <h4 className="font-bold text-sm text-[#253149] dark:text-[#F1F5FC]">ID Badge Check</h4>
                <p className="text-xs text-[#66738A] dark:text-[#B4C0D3]">Admin-verified student badges prevent external accounts.</p>
              </div>
              <div className="p-6 rounded-2xl bg-[#F8F9FD] dark:bg-[#243750] border border-[#DCE2EC] dark:border-[#34445D] space-y-3">
                <MessageSquare className="w-8 h-8 text-[#777DE0] dark:text-[#A5A6F6]" />
                <h4 className="font-bold text-sm text-[#253149] dark:text-[#F1F5FC]">Private Chat</h4>
                <p className="text-xs text-[#66738A] dark:text-[#B4C0D3]">In-app messaging between confirmed ride participants.</p>
              </div>
              <div className="p-6 rounded-2xl bg-[#F8F9FD] dark:bg-[#243750] border border-[#DCE2EC] dark:border-[#34445D] space-y-3">
                <Lock className="w-8 h-8 text-[#299E9A] dark:text-[#54C5C0]" />
                <h4 className="font-bold text-sm text-[#253149] dark:text-[#F1F5FC]">Privacy Controls</h4>
                <p className="text-xs text-[#66738A] dark:text-[#B4C0D3]">Phone number privacy settings until seat is accepted.</p>
              </div>
              <div className="p-6 rounded-2xl bg-[#F8F9FD] dark:bg-[#243750] border border-[#DCE2EC] dark:border-[#34445D] space-y-3">
                <Compass className="w-8 h-8 text-[#4F5FC9] dark:text-[#818CF8]" />
                <h4 className="font-bold text-sm text-[#253149] dark:text-[#F1F5FC]">Live Tracking</h4>
                <p className="text-xs text-[#66738A] dark:text-[#B4C0D3]">Interactive map route preview for campus gates and hubs.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="p-10 sm:p-14 rounded-3xl bg-gradient-to-br from-[#E9EDF5] via-[#FFFFFF] to-[#F8F9FD] dark:from-[#172338] dark:via-[#1B2940] dark:to-[#243750] border border-[#DCE2EC] dark:border-[#34445D] shadow-xl space-y-6">
          <h2 className="text-3xl sm:text-4xl font-black text-[#253149] dark:text-[#F1F5FC] tracking-tight">
            Ready to commute smarter today?
          </h2>
          <p className="text-sm sm:text-base text-[#66738A] dark:text-[#B4C0D3] max-w-xl mx-auto">
            Join hundreds of students saving time and travel costs every single week.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              to="/register"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#4F5FC9] hover:bg-[#404EB2] dark:bg-[#818CF8] dark:hover:bg-[#6B79F2] text-white dark:text-[#111827] font-black text-sm shadow-lg transition-all"
            >
              Create Account
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#FFFFFF] hover:bg-[#EEF0FA] dark:bg-[#243750] dark:hover:bg-[#2B3B56] text-[#253149] dark:text-[#F1F5FC] border border-[#DCE2EC] dark:border-[#34445D] font-bold text-sm transition-all"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
