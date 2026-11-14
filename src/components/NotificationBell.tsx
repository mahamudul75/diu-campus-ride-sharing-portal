import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext.tsx';

export const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const recent = notifications.slice(0, 6);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative p-2 rounded-xl text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#1C2A40] transition-colors cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1C2A40] rounded-2xl shadow-xl border border-[#D4DAE7] dark:border-[#34445E] z-50 overflow-hidden text-xs">
          <div className="px-4 py-3 border-b border-[#D4DAE7] dark:border-[#34445E] flex items-center justify-between bg-[#F5F7FC] dark:bg-[#151F32]">
            <span className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
              Notifications {unreadCount > 0 && `(${unreadCount})`}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#515FC5] dark:text-[#818CF8] hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
            {recent.length === 0 ? (
              <div className="p-6 text-center text-[#626E86] dark:text-[#B0BCD0]">
                No notifications yet.
              </div>
            ) : (
              recent.map((n) => (
                <button
                  key={n.id}
                  onClick={async () => {
                    if (!n.is_read) await markAsRead(n.id);
                    setOpen(false);
                    if (n.link) navigate(n.link);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-[#F5F7FC] dark:hover:bg-[#24334B]/60 transition-colors cursor-pointer block ${
                    !n.is_read ? 'bg-[#DDE2FA]/40 dark:bg-[#24334B]/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-[#222B42] dark:text-[#F1F4FC] leading-snug">{n.title}</p>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-[#515FC5] dark:bg-[#818CF8] shrink-0 mt-1" />}
                  </div>
                  <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] mt-0.5 line-clamp-2">
                    {n.message}
                  </p>
                </button>
              ))
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 py-2.5 bg-[#F0F2F8] dark:bg-[#151F32] text-[#515FC5] dark:text-[#818CF8] font-bold hover:bg-[#E1E6F0] dark:hover:bg-[#172235] border-t border-[#D4DAE7] dark:border-[#34445E]"
          >
            View All Notifications <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
