import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import api from '../services/api.ts';
import { NotificationItem, ChatMessage } from '../types/index.ts';
import { useAuth } from './AuthContext.tsx';
import { useToast } from './ToastContext.tsx';
import { isDbFlagTrue } from '../utils/boolean.ts';
import { shouldIncrementUnreadChatCount } from '../utils/chatUnread.ts';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  unreadChatCount: number;
  hasMoreNotifications: boolean;
  loadingMoreNotifications: boolean;
  lastWsMessage: { conversationId: number; message: ChatMessage } | null;
  setActiveConversationId: (id: number | null) => void;
  refreshNotifications: () => Promise<void>;
  loadMoreNotifications: () => Promise<void>;
  refreshUnreadChatCount: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const [loadingMoreNotifications, setLoadingMoreNotifications] = useState(false);
  const [lastWsMessage, setLastWsMessage] = useState<{ conversationId: number; message: ChatMessage } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeConversationIdRef = useRef<number | null>(null);
  const hasLoadedExtraPagesRef = useRef(false);
  const notificationsLengthRef = useRef(0);

  useEffect(() => {
    notificationsLengthRef.current = notifications.length;
  }, [notifications.length]);

  const setActiveConversationId = useCallback((id: number | null) => {
    activeConversationIdRef.current = id;
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setHasMoreNotifications(false);
      hasLoadedExtraPagesRef.current = false;
      return;
    }
    try {
      const res = await api.get('/notifications', { params: { limit: 50, offset: 0 } });
      if (res.data?.success) {
        const firstPage: NotificationItem[] = res.data.notifications || [];
        const pageHasMore = Boolean(res.data.pagination?.has_more);
        if (!hasLoadedExtraPagesRef.current) {
          setNotifications(firstPage);
          setHasMoreNotifications(pageHasMore);
        } else {
          setNotifications((prev) => {
            const firstIds = new Set(firstPage.map((n) => n.id));
            return [...firstPage, ...prev.filter((n) => !firstIds.has(n.id))];
          });
        }
        setUnreadCount(Number(res.data.unread_count || 0));
      }
    } catch {
      // Non-critical polling errors suppressed silently
    }
  }, [user]);

  const loadMoreNotifications = useCallback(async () => {
    if (!user || loadingMoreNotifications || !hasMoreNotifications) return;
    setLoadingMoreNotifications(true);
    try {
      const currentOffset = notificationsLengthRef.current;
      const res = await api.get('/notifications', {
        params: { limit: 50, offset: currentOffset }
      });
      if (res.data?.success) {
        const incoming: NotificationItem[] = res.data.notifications || [];
        hasLoadedExtraPagesRef.current = true;
        setNotifications((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          return [...prev, ...incoming.filter((n) => !seen.has(n.id))];
        });
        setHasMoreNotifications(Boolean(res.data.pagination?.has_more) && incoming.length > 0);
        if (typeof res.data.unread_count === 'number') {
          setUnreadCount(Number(res.data.unread_count));
        }
      }
    } catch {
      // Non-critical errors suppressed
    } finally {
      setLoadingMoreNotifications(false);
    }
  }, [user, loadingMoreNotifications, hasMoreNotifications]);

  const refreshUnreadChatCount = useCallback(async () => {
    if (!user) {
      setUnreadChatCount(0);
      return;
    }
    try {
      let offset = 0;
      let total = 0;
      let hasMore = true;
      let pages = 0;
      const maxPages = 10;

      while (hasMore && pages < maxPages) {
        const res = await api.get('/chat/conversations', { params: { limit: 100, offset } });
        if (!res.data?.success || !Array.isArray(res.data.conversations)) break;
        const batch = res.data.conversations;
        for (const c of batch) {
          if (
            activeConversationIdRef.current !== null &&
            Number(c.id) === activeConversationIdRef.current
          ) {
            continue;
          }
          total += Number(c.unread_count || 0);
        }
        hasMore = Boolean(res.data.pagination?.has_more) && batch.length > 0;
        offset += batch.length;
        pages += 1;
      }
      setUnreadChatCount(total);
    } catch {
      // Ignore silently
    }
  }, [user]);

  const refreshNotificationsRef = useRef(refreshNotifications);
  const refreshUnreadChatCountRef = useRef(refreshUnreadChatCount);

  useEffect(() => {
    refreshNotificationsRef.current = refreshNotifications;
    refreshUnreadChatCountRef.current = refreshUnreadChatCount;
  }, [refreshNotifications, refreshUnreadChatCount]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setUnreadChatCount(0);
      setHasMoreNotifications(false);
      hasLoadedExtraPagesRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    hasLoadedExtraPagesRef.current = false;
    refreshNotificationsRef.current();
    refreshUnreadChatCountRef.current();

    const pollTimer = setInterval(() => {
      if (document.hidden) return;
      // If WebSocket is connected and healthy, reduce background polling frequency or rely on WS
      const isWsHealthy = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
      if (isWsHealthy && Math.random() > 0.33) {
        // Skip ~2/3 of background polls when WS is healthy, keeping light heartbeat check
        return;
      }
      refreshNotificationsRef.current();
      refreshUnreadChatCountRef.current();
    }, 25000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshNotificationsRef.current();
        refreshUnreadChatCountRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let intentionalClose = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 6;

    const connectWebSocket = () => {
      if (intentionalClose || wsRef.current) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttempts = 0;
        };

        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if (payload?.event === 'notification:new' && payload.notification) {
              const incoming = payload.notification as NotificationItem;
              setNotifications((prev) => {
                if (prev.some((n) => n.id === incoming.id)) return prev;
                return [incoming, ...prev];
              });
              setUnreadCount((c) => c + 1);
              if (incoming.type !== 'new_message') {
                showToast(incoming.title, 'info');
              }
            } else if (payload?.event === 'chat:message' && payload.message) {
              const incomingConversationId = Number(payload.conversationId);
              setLastWsMessage({
                conversationId: incomingConversationId,
                message: payload.message as ChatMessage
              });
              if (
                shouldIncrementUnreadChatCount({
                  currentUserId: user.id,
                  senderId: Number(payload.message.sender_id),
                  incomingConversationId,
                  activeConversationId: activeConversationIdRef.current
                })
              ) {
                setUnreadChatCount((c) => c + 1);
              }
            }
          } catch {
            // Ignore malformed frame
          }
        };

        ws.onerror = () => {
          // Polling remains active as fallback
        };

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          if (!intentionalClose && reconnectAttempts < maxReconnectAttempts) {
            const delayMs = Math.min(30000, 2000 * Math.pow(2, reconnectAttempts));
            reconnectAttempts += 1;
            reconnectTimer = setTimeout(connectWebSocket, delayMs);
          }
        };
      } catch {
        // WebSocket construction fallback handled by polling
      }
    };

    connectWebSocket();

    return () => {
      intentionalClose = true;
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.id, showToast]);

  const markAsRead = async (id: number) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // Ignore
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  const deleteNotification = async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => {
        const target = prev.find((n) => n.id === id);
        if (target && !isDbFlagTrue(target.is_read)) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return prev.filter((n) => n.id !== id);
      });
    } catch {
      // Ignore
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        unreadChatCount,
        hasMoreNotifications,
        loadingMoreNotifications,
        lastWsMessage,
        setActiveConversationId,
        refreshNotifications,
        loadMoreNotifications,
        refreshUnreadChatCount,
        markAsRead,
        markAllAsRead,
        deleteNotification
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextType {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}
