import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Car,
  Search,
  PlusCircle,
  User as UserIcon,
  LogOut,
  ShieldAlert,
  Menu,
  X,
  Compass,
  Clock,
  Sparkles,
  ChevronDown,
  Layers,
  MessageSquare,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotifications } from '../context/NotificationContext.tsx';
import ThemeToggle from './ThemeToggle.tsx';
import NotificationBell from './NotificationBell.tsx';

export const Navbar: React.FC = () => {
  const { user, logout, isAdmin, isApprovedDriver, isPendingDriver } = useAuth();
  const { unreadChatCount } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const handleOfferRideClick = () => {
    if (!user) {
      navigate('/login?redirect=/rides/create');
      return;
    }

    if (isApprovedDriver) {
      navigate('/rides/create');
    } else {
      navigate('/become-driver');
    }
  };

  const closeMenus = () => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 dark:bg-[#151F32]/95 backdrop-blur-md border-b border-[#DCE2EC] dark:border-[#34445D] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & University Brand */}
          <Link to="/" onClick={closeMenus} className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#111827] flex items-center justify-center shadow-md shadow-[#4F5FC9]/20 group-hover:scale-105 transition-all">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-[#253149] dark:text-[#F1F5FC] tracking-tight text-base sm:text-lg whitespace-nowrap">
                  DIU <span className="text-[#4F5FC9] dark:text-[#818CF8]">Ride</span>
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold bg-[#EEF0FA] dark:bg-[#818CF8]/15 text-[#4F5FC9] dark:text-[#818CF8] rounded-md border border-[#4F5FC9]/20 dark:border-[#818CF8]/30">
                  Campus
                </span>
              </div>
              <p className="text-[10px] text-[#66738A] dark:text-[#B4C0D3] font-medium hidden lg:block">
                Daffodil International University
              </p>
            </div>
          </Link>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              to="/search"
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                isActive('/search')
                  ? 'bg-[#EEF0FA] dark:bg-[#818CF8]/15 text-[#4F5FC9] dark:text-[#818CF8] font-bold'
                  : 'text-[#66738A] dark:text-[#B4C0D3] hover:text-[#253149] dark:hover:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-[#4F5FC9] dark:text-[#818CF8]" />
              Find Ride
            </Link>

            <button
              onClick={handleOfferRideClick}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-[#66738A] dark:text-[#B4C0D3] hover:text-[#253149] dark:hover:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#4F5FC9] dark:text-[#818CF8]" />
              Offer Ride
              {!isApprovedDriver && user && (
                <span className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-bold">
                  {isPendingDriver ? 'Pending' : 'Apply'}
                </span>
              )}
            </button>

            {user && (
              <>
                <Link
                  to="/dashboard"
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    isActive('/dashboard')
                      ? 'bg-[#EEF0FA] dark:bg-[#818CF8]/15 text-[#4F5FC9] dark:text-[#818CF8] font-bold'
                      : 'text-[#66738A] dark:text-[#B4C0D3] hover:text-[#253149] dark:hover:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-[#4F5FC9] dark:text-[#818CF8]" />
                  Dashboard
                </Link>

                <Link
                  to="/requests"
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    isActive('/requests')
                      ? 'bg-[#EEF0FA] dark:bg-[#818CF8]/15 text-[#4F5FC9] dark:text-[#818CF8] font-bold'
                      : 'text-[#66738A] dark:text-[#B4C0D3] hover:text-[#253149] dark:hover:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Bookings
                </Link>

                <Link
                  to="/messages"
                  className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    isActive('/messages')
                      ? 'bg-[#EEF0FA] dark:bg-[#818CF8]/15 text-[#4F5FC9] dark:text-[#818CF8] font-bold'
                      : 'text-[#66738A] dark:text-[#B4C0D3] hover:text-[#253149] dark:hover:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Messages
                  {unreadChatCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#111827] font-bold tabular-nums">
                      {unreadChatCount}
                    </span>
                  )}
                </Link>

                {isApprovedDriver && (
                  <Link
                    to="/my-rides"
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      isActive('/my-rides')
                        ? 'bg-[#EEF0FA] dark:bg-[#818CF8]/15 text-[#4F5FC9] dark:text-[#818CF8] font-bold'
                        : 'text-[#66738A] dark:text-[#B4C0D3] hover:text-[#253149] dark:hover:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    My Rides
                  </Link>
                )}

                {isAdmin && (
                  <Link
                    to="/admin"
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      isActive('/admin')
                        ? 'bg-amber-600 text-white'
                        : 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Admin
                  </Link>
                )}
              </>
            )}
          </nav>

          {/* Right Action Menu */}
          <div className="flex items-center gap-2">
            {user && <NotificationBell />}
            <ThemeToggle showDropdown={true} />

            {!user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3.5 py-1.5 text-xs font-bold text-[#253149] dark:text-[#F1F5FC] hover:text-[#4F5FC9] dark:hover:text-[#818CF8] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] rounded-xl transition-all whitespace-nowrap"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-1.5 text-xs font-bold text-white dark:text-[#111827] bg-[#4F5FC9] hover:bg-[#404EB2] dark:bg-[#818CF8] dark:hover:bg-[#6B79F2] rounded-xl shadow-sm transition-all whitespace-nowrap"
                >
                  Register
                </Link>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 p-1.5 pl-3 rounded-xl border border-[#DCE2EC] dark:border-[#34445D] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] transition-all cursor-pointer"
                >
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-bold text-[#253149] dark:text-[#F1F5FC] leading-tight truncate max-w-[120px]">
                      {user.name}
                    </p>
                    <p className="text-[10px] text-[#4F5FC9] dark:text-[#818CF8] font-medium">
                      {isAdmin
                        ? 'Admin'
                        : isApprovedDriver
                        ? 'Driver'
                        : isPendingDriver
                        ? 'Pending'
                        : 'Student'}
                    </p>
                  </div>
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="w-7 h-7 rounded-lg object-cover border border-[#DCE2EC] dark:border-[#34445D]"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-[#EEF0FA] dark:bg-[#818CF8]/20 text-[#4F5FC9] dark:text-[#818CF8] flex items-center justify-center font-bold text-xs">
                      {user.name.charAt(0)}
                    </div>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" />
                </button>

                {profileDropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 bg-[#FFFFFF] dark:bg-[#243750] rounded-2xl shadow-xl border border-[#DCE2EC] dark:border-[#34445D] py-1.5 z-50 animate-scale-up text-xs"
                    onClick={() => setProfileDropdownOpen(false)}
                  >
                    <div className="px-4 py-2.5 border-b border-[#DCE2EC] dark:border-[#34445D]">
                      <p className="text-xs font-bold text-[#253149] dark:text-[#F1F5FC] truncate">{user.name}</p>
                      <p className="text-[11px] text-[#66738A] dark:text-[#B4C0D3] font-mono truncate">{user.email}</p>
                      <p className="text-[10px] text-[#66738A] dark:text-[#B4C0D3] font-mono">ID: {user.student_id}</p>
                    </div>

                    <Link
                      to="/dashboard"
                      className="flex items-center gap-2.5 px-4 py-2 text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] hover:text-[#4F5FC9] dark:hover:text-[#818CF8]"
                    >
                      <Layers className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" />
                      Dashboard
                    </Link>

                    <Link
                      to="/messages"
                      className="flex items-center gap-2.5 px-4 py-2 text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] hover:text-[#4F5FC9] dark:hover:text-[#818CF8]"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" />
                      Messages
                    </Link>

                    <Link
                      to="/safety"
                      className="flex items-center gap-2.5 px-4 py-2 text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] hover:text-[#4F5FC9] dark:hover:text-[#818CF8]"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" />
                      Safety Center
                    </Link>

                    <Link
                      to="/profile"
                      className="flex items-center gap-2.5 px-4 py-2 text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] hover:text-[#4F5FC9] dark:hover:text-[#818CF8]"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" />
                      Profile Settings
                    </Link>

                    {!isApprovedDriver && (
                      <Link
                        to="/become-driver"
                        className="flex items-center gap-2.5 px-4 py-2 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Become Driver
                      </Link>
                    )}

                    {isApprovedDriver && (
                      <Link
                        to="/rides/create"
                        className="flex items-center gap-2.5 px-4 py-2 text-[#4F5FC9] dark:text-[#818CF8] hover:bg-[#EEF0FA] dark:hover:bg-[#818CF8]/20"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-[#4F5FC9] dark:text-[#818CF8]" />
                        Post Ride
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-2.5 px-4 py-2 font-bold text-amber-800 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 border-t border-[#DCE2EC] dark:border-[#34445D]"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                        Admin Portal
                      </Link>
                    )}

                    <div className="border-t border-[#DCE2EC] dark:border-[#34445D] my-1"></div>

                    <button
                      onClick={() => logout()}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer text-left"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-500" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mobile Menu Button */}
            <div className="flex md:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl text-[#66738A] dark:text-[#B4C0D3] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] focus:outline-hidden"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[#DCE2EC] dark:border-[#34445D] bg-[#FFFFFF] dark:bg-[#151F32] px-4 pt-3 pb-6 space-y-2 text-xs">
          <Link
            to="/search"
            onClick={closeMenus}
            className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
          >
            <Search className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
            Find Ride
          </Link>

          <button
            onClick={() => {
              closeMenus();
              handleOfferRideClick();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl font-semibold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] text-left cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
            Offer Ride
          </button>

          {user && (
            <>
              <Link
                to="/dashboard"
                onClick={closeMenus}
                className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
              >
                <Layers className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
                Dashboard
              </Link>

              <Link
                to="/requests"
                onClick={closeMenus}
                className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
              >
                <Clock className="w-4 h-4 text-[#66738A] dark:text-[#B4C0D3]" />
                Bookings
              </Link>

              <Link
                to="/messages"
                onClick={closeMenus}
                className="flex items-center justify-between p-2.5 rounded-xl font-semibold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
              >
                <span className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
                  Messages
                </span>
                {unreadChatCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#111827] text-[10px] font-bold">
                    {unreadChatCount}
                  </span>
                )}
              </Link>

              <Link
                to="/safety"
                onClick={closeMenus}
                className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
              >
                <ShieldCheck className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
                Safety Center
              </Link>

              {isApprovedDriver && (
                <Link
                  to="/my-rides"
                  onClick={closeMenus}
                  className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
                >
                  <Compass className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
                  My Rides
                </Link>
              )}

              <Link
                to="/profile"
                onClick={closeMenus}
                className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
              >
                <UserIcon className="w-4 h-4 text-[#66738A] dark:text-[#B4C0D3]" />
                Profile
              </Link>

              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={closeMenus}
                  className="flex items-center gap-3 p-2.5 rounded-xl font-bold text-amber-900 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/50"
                >
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  Admin Portal
                </Link>
              )}

              <div className="pt-2 border-t border-[#DCE2EC] dark:border-[#34445D]">
                <button
                  onClick={() => {
                    closeMenus();
                    logout();
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </>
          )}

          {!user && (
            <div className="pt-2 border-t border-[#DCE2EC] dark:border-[#34445D] grid grid-cols-2 gap-2">
              <Link
                to="/login"
                onClick={closeMenus}
                className="text-center py-2 rounded-xl border border-[#DCE2EC] dark:border-[#34445D] text-xs font-bold text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                onClick={closeMenus}
                className="text-center py-2 rounded-xl bg-[#4F5FC9] dark:bg-[#818CF8] text-xs font-bold text-white dark:text-[#111827] hover:bg-[#404EB2] dark:hover:bg-[#6B79F2] shadow-xs"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Navbar;
