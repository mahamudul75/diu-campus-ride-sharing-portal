import React, { useState, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Car,
  Compass,
  Search,
  PlusCircle,
  Clock,
  User,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Sparkles,
  Layers,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import ThemeToggle from './ThemeToggle.tsx';
import Breadcrumb, { BreadcrumbItem } from './Breadcrumb.tsx';

interface DashboardLayoutProps {
  children: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  breadcrumbs,
  title,
  subtitle,
  actions
}) => {
  const { user, logout, isAdmin, isApprovedDriver, isPendingDriver } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  const navLinks = [
    { label: 'Overview', path: '/dashboard', icon: Layers },
    { label: 'Find a Ride', path: '/search', icon: Search },
    {
      label: isApprovedDriver ? 'Post a Ride' : 'Offer a Ride',
      path: isApprovedDriver ? '/rides/create' : '/become-driver',
      icon: PlusCircle
    },
    { label: 'My Bookings', path: '/requests', icon: Clock },
    ...(isApprovedDriver
      ? [{ label: 'My Rides', path: '/my-rides', icon: Compass }]
      : []),
    ...(!isApprovedDriver
      ? [{ label: 'Driver Application', path: '/become-driver', icon: Sparkles }]
      : []),
    { label: 'Profile', path: '/profile', icon: User }
  ];

  const adminLinks = [
    { label: 'Admin Overview', path: '/admin', icon: ShieldAlert },
    { label: 'Student Users', path: '/admin/users', icon: User },
    { label: 'Driver Approvals', path: '/admin/drivers', icon: ShieldCheck }
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans antialiased selection:bg-teal-500 selection:text-white">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs md:hidden animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <Link
            to="/dashboard"
            onClick={() => setMobileSidebarOpen(false)}
            className="flex items-center gap-2.5"
          >
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <span className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                DIU <span className="text-teal-600 dark:text-teal-400">Ride</span>
              </span>
              <span className="block text-[10px] text-slate-400 font-mono leading-none">
                Campus Portal
              </span>
            </div>
          </Link>

          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Main Navigation */}
          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
              Menu
            </span>
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.path);

              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Admin Navigation */}
          {isAdmin && (
            <div className="space-y-1 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="px-3 text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Administration
              </span>
              {adminLinks.map((link) => {
                const Icon = link.icon;
                const active = location.pathname === link.path;

                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar Footer User Card */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-200 flex items-center justify-center font-bold text-xs shrink-0">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {user?.name}
                </p>
                <p className="text-[10px] text-teal-700 dark:text-teal-400 font-mono truncate">
                  {isAdmin ? 'Admin' : isApprovedDriver ? 'Driver' : isPendingDriver ? 'Pending' : 'Student'}
                </p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Quick Search Shortcut */}
            <div className="relative hidden sm:block w-64 lg:w-80">
              <input
                type="text"
                placeholder="Search rides or locations..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    navigate(`/search?pickup=${encodeURIComponent((e.target as HTMLInputElement).value)}`);
                  }
                }}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-200"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Right Action Icons & Theme Toggle */}
          <div className="flex items-center gap-2">
            {/* Quick Offer Ride CTA */}
            {isApprovedDriver ? (
              <Link
                to="/rides/create"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Post Ride
              </Link>
            ) : (
              <Link
                to="/become-driver"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                {isPendingDriver ? 'Driver Pending' : 'Become Driver'}
              </Link>
            )}

            {/* Theme Toggle (Light / Dark / System) */}
            <ThemeToggle showDropdown={true} />

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 p-1 pl-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-scale-up text-xs"
                  onClick={() => setProfileDropdownOpen(false)}
                >
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{user?.name}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{user?.email}</p>
                  </div>

                  <Link
                    to="/profile"
                    className="flex items-center gap-2 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <User className="w-3.5 h-3.5 text-slate-400" /> Profile Settings
                  </Link>
                  <Link
                    to="/requests"
                    className="flex items-center gap-2 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400" /> My Bookings
                  </Link>

                  <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                  <button
                    onClick={() => logout()}
                    className="w-full flex items-center gap-2 px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto pb-20 md:pb-8">
          {/* Breadcrumb & Title Area */}
          {(breadcrumbs || title) && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                {breadcrumbs && <Breadcrumb items={breadcrumbs} className="mb-2" />}
                {title && (
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
            </div>
          )}

          {children}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around">
          <Link
            to="/dashboard"
            className={`flex flex-col items-center gap-1 p-1 text-[10px] font-semibold ${
              location.pathname === '/dashboard' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Home</span>
          </Link>
          <Link
            to="/search"
            className={`flex flex-col items-center gap-1 p-1 text-[10px] font-semibold ${
              location.pathname === '/search' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
          </Link>
          <Link
            to={isApprovedDriver ? '/rides/create' : '/become-driver'}
            className="flex flex-col items-center gap-1 p-1 text-[10px] font-semibold text-teal-600 dark:text-teal-400"
          >
            <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center -mt-3 shadow-md shadow-teal-600/30">
              <PlusCircle className="w-4 h-4" />
            </div>
            <span>Ride</span>
          </Link>
          <Link
            to="/requests"
            className={`flex flex-col items-center gap-1 p-1 text-[10px] font-semibold ${
              location.pathname === '/requests' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Bookings</span>
          </Link>
          <Link
            to="/profile"
            className={`flex flex-col items-center gap-1 p-1 text-[10px] font-semibold ${
              location.pathname === '/profile' ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profile</span>
          </Link>
        </nav>
      </div>
    </div>
  );
};

export default DashboardLayout;
