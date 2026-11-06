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
  Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import ThemeToggle from './ThemeToggle.tsx';

export const Navbar: React.FC = () => {
  const { user, logout, isAdmin, isApprovedDriver, isPendingDriver } = useAuth();
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
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & University Brand */}
          <Link to="/" onClick={closeMenus} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs group-hover:bg-teal-700 transition-colors">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 dark:text-white tracking-tight text-base sm:text-lg">
                  DIU <span className="text-teal-600 dark:text-teal-400">Ride</span>
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 rounded-md border border-teal-200 dark:border-teal-800">
                  Campus
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium hidden md:block">
                Daffodil International University
              </p>
            </div>
          </Link>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              to="/search"
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                isActive('/search')
                  ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Find Ride
            </Link>

            <button
              onClick={handleOfferRideClick}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-orange-500" />
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
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isActive('/dashboard')
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-bold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  Dashboard
                </Link>

                <Link
                  to="/requests"
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isActive('/requests')
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-bold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Bookings
                </Link>

                {isApprovedDriver && (
                  <Link
                    to="/my-rides"
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      isActive('/my-rides')
                        ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-bold'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    My Rides
                  </Link>
                )}

                {isAdmin && (
                  <Link
                    to="/admin"
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      isActive('/admin')
                        ? 'bg-amber-600 text-white'
                        : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800'
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
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle in Navbar */}
            <ThemeToggle showDropdown={true} />

            {!user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-all"
                >
                  Register
                </Link>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 p-1.5 pl-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight truncate max-w-[120px]">
                      {user.name}
                    </p>
                    <p className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">
                      {isAdmin
                        ? 'Admin'
                        : isApprovedDriver
                        ? 'Driver'
                        : isPendingDriver
                        ? 'Pending'
                        : 'Student'}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 flex items-center justify-center font-bold text-xs">
                    {user.name.charAt(0)}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Dropdown Menu */}
                {profileDropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-scale-up text-xs"
                    onClick={() => setProfileDropdownOpen(false)}
                  >
                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{user.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono truncate">{user.email}</p>
                      <p className="text-[10px] text-slate-500 font-mono">ID: {user.student_id}</p>
                    </div>

                    <Link
                      to="/dashboard"
                      className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-teal-600 dark:hover:text-teal-400"
                    >
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      Dashboard
                    </Link>

                    <Link
                      to="/profile"
                      className="flex items-center gap-2.5 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-teal-600 dark:hover:text-teal-400"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
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
                        className="flex items-center gap-2.5 px-4 py-2 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-teal-600" />
                        Post Ride
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-2.5 px-4 py-2 font-bold text-amber-800 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 border-t border-slate-100 dark:border-slate-800"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                        Admin Portal
                      </Link>
                    )}

                    <div className="border-t border-slate-100 dark:border-slate-800 my-1"></div>

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
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-hidden"
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
        <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-3 pb-6 space-y-2 text-xs">
          <Link
            to="/search"
            onClick={closeMenus}
            className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-slate-800 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-slate-800"
          >
            <Search className="w-4 h-4 text-teal-600" />
            Find Ride
          </Link>

          <button
            onClick={() => {
              closeMenus();
              handleOfferRideClick();
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl font-semibold text-slate-800 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-slate-800 text-left cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-orange-500" />
            Offer Ride
          </button>

          {user && (
            <>
              <Link
                to="/dashboard"
                onClick={closeMenus}
                className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Layers className="w-4 h-4 text-teal-600" />
                Dashboard
              </Link>

              <Link
                to="/requests"
                onClick={closeMenus}
                className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Clock className="w-4 h-4 text-slate-400" />
                Bookings
              </Link>

              {isApprovedDriver && (
                <Link
                  to="/my-rides"
                  onClick={closeMenus}
                  className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Compass className="w-4 h-4 text-teal-600" />
                  My Rides
                </Link>
              )}

              <Link
                to="/profile"
                onClick={closeMenus}
                className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <UserIcon className="w-4 h-4 text-slate-400" />
                Profile
              </Link>

              {!isApprovedDriver && (
                <Link
                  to="/become-driver"
                  onClick={closeMenus}
                  className="flex items-center gap-3 p-2.5 rounded-xl font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40"
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Become Driver
                </Link>
              )}

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

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
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
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
              <Link
                to="/login"
                onClick={closeMenus}
                className="text-center py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                onClick={closeMenus}
                className="text-center py-2 rounded-xl bg-teal-600 text-xs font-bold text-white hover:bg-teal-700 shadow-xs"
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
