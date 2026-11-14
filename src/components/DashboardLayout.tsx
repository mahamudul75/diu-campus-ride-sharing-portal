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
  Sparkles,
  Layers,
  ChevronDown,
  MessageSquare,
  Bell,
  Shield,
  Flag
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotifications } from '../context/NotificationContext.tsx';
import ThemeToggle from './ThemeToggle.tsx';
import NotificationBell from './NotificationBell.tsx';
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
  const { unreadCount, unreadChatCount } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  const navLinks = [
    { label: 'Overview', path: '/dashboard', icon: Layers, badge: 0 },
    { label: 'Find a Ride', path: '/search', icon: Search, badge: 0 },
    ...(isApprovedDriver
      ? [{ label: 'Post a Ride', path: '/rides/create', icon: PlusCircle, badge: 0 }]
      : []),
    { label: 'My Bookings', path: '/requests', icon: Clock, badge: 0 },
    ...(isApprovedDriver
      ? [{ label: 'My Rides', path: '/my-rides', icon: Compass, badge: 0 }]
      : []),
    { label: 'Messages', path: '/messages', icon: MessageSquare, badge: unreadChatCount },
    { label: 'Notifications', path: '/notifications', icon: Bell, badge: unreadCount },
    { label: 'Safety Center', path: '/safety', icon: Shield, badge: 0 },
    ...(!isApprovedDriver
      ? [{ label: 'Driver Application', path: '/become-driver', icon: Sparkles, badge: 0 }]
      : []),
    { label: 'Profile', path: '/profile', icon: User, badge: 0 }
  ];

  const adminLinks = [
    { label: 'Admin Overview', path: '/admin', icon: ShieldAlert },
    { label: 'Student Users', path: '/admin/users', icon: User },
    { label: 'Driver Approvals', path: '/admin/drivers', icon: ShieldCheck },
    { label: 'Rides & Bookings', path: '/admin/rides', icon: Compass },
    { label: 'Safety Reports', path: '/admin/reports', icon: Flag }
  ];

  return (
    <div className="min-h-screen flex bg-[#F1F3F8] dark:bg-[#111827] text-[#253149] dark:text-[#F1F5FC] font-sans antialiased selection:bg-[#4F5FC9] selection:text-white">
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#253149]/50 dark:bg-[#111827]/80 backdrop-blur-xs md:hidden animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-[#FFFFFF] dark:bg-[#151F32] border-r border-[#DCE2EC] dark:border-[#34445D] flex flex-col justify-between transition-transform duration-200 ease-in-out shrink-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-[#DCE2EC] dark:border-[#34445D] flex items-center justify-between">
          <Link
            to="/dashboard"
            onClick={() => setMobileSidebarOpen(false)}
            className="flex items-center gap-2.5"
          >
            <div className="w-8 h-8 rounded-xl bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#111827] flex items-center justify-center font-bold shadow-md shadow-[#4F5FC9]/20">
              <Car className="w-4 h-4" />
            </div>
            <div>
              <span className="font-black text-[#253149] dark:text-[#F1F5FC] text-base tracking-tight">
                DIU <span className="text-[#4F5FC9] dark:text-[#818CF8]">Ride</span>
              </span>
              <span className="block text-[10px] text-[#66738A] dark:text-[#B4C0D3] font-mono leading-none">
                Campus Portal
              </span>
            </div>
          </Link>

          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-[#66738A] hover:text-[#253149] dark:text-[#B4C0D3] dark:hover:text-[#F1F5FC] cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div className="space-y-1">
            <span className="px-3 text-[10px] font-bold text-[#66738A] dark:text-[#B4C0D3] uppercase tracking-wider block mb-1">
              Menu
            </span>
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.path);

              return (
                <Link
                  key={`${link.path}:${link.label}`}
                  to={link.path}
                  onClick={() => setMobileSidebarOpen(false)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#EEF0FA] dark:bg-[#818CF8]/15 text-[#4F5FC9] dark:text-[#818CF8] font-bold shadow-xs'
                      : 'text-[#66738A] dark:text-[#B4C0D3] hover:text-[#253149] dark:hover:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#4F5FC9] dark:text-[#818CF8]' : 'text-[#66738A] dark:text-[#B4C0D3]'}`} />
                    <span className="truncate">{link.label}</span>
                  </span>
                  {link.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#111827] text-[10px] font-bold tabular-nums shrink-0">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {isAdmin && (
            <div className="space-y-1 pt-3 border-t border-[#DCE2EC] dark:border-[#34445D]">
              <span className="px-3 text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
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
                        ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 font-bold'
                        : 'text-[#66738A] dark:text-[#B4C0D3] hover:text-[#253149] dark:hover:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-amber-600 dark:text-amber-400' : 'text-[#66738A] dark:text-[#B4C0D3]'}`} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-[#DCE2EC] dark:border-[#34445D]">
          <div className="flex items-center justify-between p-2 rounded-xl bg-[#F8F9FD] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D]">
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-8 h-8 rounded-lg object-cover shrink-0 border border-[#DCE2EC] dark:border-[#34445D]"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-[#EEF0FA] dark:bg-[#818CF8]/20 text-[#4F5FC9] dark:text-[#818CF8] flex items-center justify-center font-bold text-xs shrink-0">
                  {user?.name?.charAt(0) || 'U'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#253149] dark:text-[#F1F5FC] truncate">
                  {user?.name}
                </p>
                <p className="text-[10px] text-[#4F5FC9] dark:text-[#818CF8] font-mono truncate">
                  {isAdmin ? 'Admin' : isApprovedDriver ? 'Driver' : isPendingDriver ? 'Pending' : 'Student'}
                </p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Sign Out"
              className="p-1.5 text-[#66738A] dark:text-[#B4C0D3] hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 bg-[#FFFFFF]/95 dark:bg-[#151F32]/95 backdrop-blur-md border-b border-[#DCE2EC] dark:border-[#34445D] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-2 rounded-xl text-[#66738A] dark:text-[#B4C0D3] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="relative hidden sm:block w-64 lg:w-80">
              <input
                type="text"
                placeholder="Search rides or locations..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    navigate(`/search?pickup=${encodeURIComponent((e.target as HTMLInputElement).value)}`);
                  }
                }}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#4F5FC9] dark:focus:ring-[#818CF8] text-[#253149] dark:text-[#F1F5FC]"
              />
              <Search className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3] absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isApprovedDriver ? (
              <Link
                to="/rides/create"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#4F5FC9] hover:bg-[#404EB2] dark:bg-[#818CF8] dark:hover:bg-[#6B79F2] text-white dark:text-[#111827] rounded-xl text-xs font-bold transition-all shadow-xs whitespace-nowrap"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Post Ride
              </Link>
            ) : (
              <Link
                to="/become-driver"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] dark:bg-[#1B2940] border border-[#DCE2EC] dark:border-[#34445D] text-[#253149] dark:text-[#F1F5FC] rounded-xl text-xs font-semibold hover:bg-[#EEF0FA] dark:hover:bg-[#243750] transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                {isPendingDriver ? 'Driver Pending' : 'Become Driver'}
              </Link>
            )}

            <NotificationBell />
            <ThemeToggle showDropdown={true} />

            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 p-1 pl-2 rounded-xl hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940] transition-colors cursor-pointer border border-transparent hover:border-[#DCE2EC] dark:hover:border-[#34445D]"
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-7 h-7 rounded-lg object-cover border border-[#DCE2EC] dark:border-[#34445D]"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#111827] flex items-center justify-center font-bold text-xs">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" />
              </button>

              {profileDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-52 bg-[#FFFFFF] dark:bg-[#243750] rounded-2xl shadow-xl border border-[#DCE2EC] dark:border-[#34445D] py-1.5 z-50 animate-scale-up text-xs"
                  onClick={() => setProfileDropdownOpen(false)}
                >
                  <div className="px-4 py-2 border-b border-[#DCE2EC] dark:border-[#34445D]">
                    <p className="font-bold text-[#253149] dark:text-[#F1F5FC] truncate">{user?.name}</p>
                    <p className="text-[11px] text-[#66738A] dark:text-[#B4C0D3] font-mono truncate">{user?.email}</p>
                  </div>

                  <Link
                    to="/profile"
                    className="flex items-center gap-2 px-4 py-2 text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
                  >
                    <User className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" /> Profile Settings
                  </Link>
                  <Link
                    to="/messages"
                    className="flex items-center gap-2 px-4 py-2 text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" /> Messages
                  </Link>
                  <Link
                    to="/safety"
                    className="flex items-center gap-2 px-4 py-2 text-[#253149] dark:text-[#F1F5FC] hover:bg-[#EEF0FA] dark:hover:bg-[#1B2940]"
                  >
                    <Shield className="w-3.5 h-3.5 text-[#66738A] dark:text-[#B4C0D3]" /> Safety Center
                  </Link>

                  <div className="border-t border-[#DCE2EC] dark:border-[#34445D] my-1" />

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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto pb-20 md:pb-8">
          {(breadcrumbs || title) && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                {breadcrumbs && <Breadcrumb items={breadcrumbs} className="mb-2" />}
                {title && (
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#253149] dark:text-[#F1F5FC]">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-xs text-[#66738A] dark:text-[#B4C0D3]">{subtitle}</p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
            </div>
          )}

          {children}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF]/95 dark:bg-[#151F32]/95 backdrop-blur-md border-t border-[#DCE2EC] dark:border-[#34445D] px-2 py-1.5 flex items-center justify-around">
          <Link
            to="/dashboard"
            className={`flex flex-col items-center gap-1 p-1 text-[10px] font-semibold ${
              location.pathname === '/dashboard' ? 'text-[#4F5FC9] dark:text-[#818CF8]' : 'text-[#66738A] dark:text-[#B4C0D3]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Home</span>
          </Link>
          <Link
            to="/search"
            className={`flex flex-col items-center gap-1 p-1 text-[10px] font-semibold ${
              location.pathname === '/search' ? 'text-[#4F5FC9] dark:text-[#818CF8]' : 'text-[#66738A] dark:text-[#B4C0D3]'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Search</span>
          </Link>
          <Link
            to={isApprovedDriver ? '/rides/create' : '/become-driver'}
            className="flex flex-col items-center gap-1 p-1 text-[10px] font-semibold text-[#4F5FC9] dark:text-[#818CF8]"
          >
            <div className="w-7 h-7 rounded-full bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#111827] flex items-center justify-center -mt-3 shadow-md shadow-[#4F5FC9]/30">
              <PlusCircle className="w-4 h-4" />
            </div>
            <span>Ride</span>
          </Link>
          <Link
            to="/messages"
            className={`relative flex flex-col items-center gap-1 p-1 text-[10px] font-semibold ${
              location.pathname === '/messages' ? 'text-[#4F5FC9] dark:text-[#818CF8]' : 'text-[#66738A] dark:text-[#B4C0D3]'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat</span>
          </Link>
          <Link
            to="/profile"
            className={`flex flex-col items-center gap-1 p-1 text-[10px] font-semibold ${
              location.pathname === '/profile' ? 'text-[#4F5FC9] dark:text-[#818CF8]' : 'text-[#66738A] dark:text-[#B4C0D3]'
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
