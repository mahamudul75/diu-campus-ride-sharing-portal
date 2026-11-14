import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import api from '../services/api.ts';
import { NotificationItem, ChatMessage } from '../types/index.ts';
import { useAuth } from './AuthContext.tsx';
import { useToast } from './ToastContext.tsx';

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  unreadChatCount: number;
  lastWsMessage: { conversationId: number; message: ChatMessage } | null;
  refreshNotifications: () => Promise<void>;
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
  const [lastWsMessage, setLastWsMessage] = useState<{ conversationId: number; message: ChatMessage } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const res = await api.get('/notifications');
      if (res.data?.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(Number(res.data.unread_count || 0));
      }
    } catch {
      // Non-critical polling errors suppressed silently
    }
  }, [user]);

  const refreshUnreadChatCount = useCallback(async () => {
    if (!user) {
      setUnreadChatCount(0);
      return;
    }
    try {
      const res = await api.get('/chat/conversations');
      if (res.data?.success && Array.isArray(res.data.conversations)) {
        const total = res.data.conversations.reduce(
          (sum: number, c: any) => sum + Number(c.unread_count || 0),
          0
        );
        setUnreadChatCount(total);
      }
    } catch {
      // Ignore silently
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setUnreadChatCount(0);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    refreshNotifications();
    refreshUnreadChatCount();

    const pollTimer = setInterval(() => {
      refreshNotifications();
      refreshUnreadChatCount();
    }, 25000);

    let ws: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

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
            setLastWsMessage({
              conversationId: Number(payload.conversationId),
              message: payload.message as ChatMessage
            });
            if (Number(payload.message.sender_id) !== user.id) {
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
    } catch {
      // WebSocket construction fallback handled by polling
    }

    return () => {
      clearInterval(pollTimer);
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [user, refreshNotifications, refreshUnreadChatCount, showToast]);

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
        if (target && !target.is_read) {
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
        lastWsMessage,
        refreshNotifications,
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
