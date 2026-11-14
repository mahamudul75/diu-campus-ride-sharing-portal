import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2, ArrowUpRight } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import EmptyState from '../components/EmptyState.tsx';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  const handleOpen = async (id: number, link: string | null, isRead: number) => {
    if (!isRead) {
      await markAsRead(id);
    }
    if (link) {
      navigate(link);
    }
  };

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Notifications' }]}
      title="Notifications"
      subtitle="Ride requests, confirmations, reminders, chat alerts, and safety updates."
      actions={
        unreadCount > 0 ? (
          <button
            onClick={markAllAsRead}
            className="px-3.5 py-1.5 rounded-xl bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark All Read ({unreadCount})
          </button>
        ) : undefined
      }
    >
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center gap-1 p-1 bg-[#E1E6F0] dark:bg-[#151F32] rounded-xl border border-[#D4DAE7] dark:border-[#34445E] w-fit">
          <button
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              filter === 'unread'
                ? 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] shadow-xs'
                : 'text-[#626E86] hover:text-[#222B42] dark:text-[#B0BCD0] dark:hover:text-white'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={filter === 'unread' ? 'All caught up' : 'No notifications yet'}
            description={
              filter === 'unread'
                ? 'You have no unread notifications right now.'
                : 'Booking updates, reminders, and ride status changes will appear here.'
            }
          />
        ) : (
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E] shadow-xs overflow-hidden">
            {visible.map((item) => (
              <div
                key={item.id}
                className={`p-4 sm:p-5 flex items-start justify-between gap-4 transition-colors ${
                  item.is_read ? '' : 'bg-[#DDE2FA]/40 dark:bg-[#24334B]/40'
                }`}
              >
                <div
                  onClick={() => handleOpen(item.id, item.link, item.is_read)}
                  className={`flex-1 space-y-1 ${item.link ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                      {item.title}
                    </h3>
                    {!item.is_read && (
                      <span className="text-[10px] font-bold text-[#515FC5] dark:text-[#818CF8]">
                        · New
                      </span>
                    )}
                    <span className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] font-mono tabular-nums">
                      · {new Date(item.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
                    {item.message}
                  </p>
                  {item.link && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#515FC5] dark:text-[#818CF8] pt-0.5">
                      Open <ArrowUpRight className="w-3 h-3" />
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!item.is_read && (
                    <button
                      onClick={() => markAsRead(item.id)}
                      title="Mark as read"
                      className="px-2.5 py-1 rounded-lg border border-[#D4DAE7] dark:border-[#34445E] text-[11px] font-semibold text-[#626E86] dark:text-[#B0BCD0] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] cursor-pointer"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    onClick={() => deleteNotification(item.id)}
                    title="Delete notification"
                    className="p-1.5 rounded-lg text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default NotificationsPage;
