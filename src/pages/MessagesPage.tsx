import React, { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  BadgeCheck,
  Ban,
  Flag,
  ArrowUpRight
} from 'lucide-react';
import api from '../services/api.ts';
import { Conversation, ChatMessage } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useNotifications } from '../context/NotificationContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';
import EmptyState from '../components/EmptyState.tsx';
import ReportUserModal from '../components/ReportUserModal.tsx';

export const MessagesPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { lastWsMessage, refreshUnreadChatCount } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const selectedIdParam = Number(searchParams.get('conversation') || 0);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(
    selectedIdParam > 0 ? selectedIdParam : null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isBlockedPair, setIsBlockedPair] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = async () => {
    try {
      const res = await api.get('/chat/conversations');
      if (res.data?.success) {
        const list: Conversation[] = res.data.conversations || [];
        setConversations(list);
        if (!selectedConvId && list.length > 0) {
          setSelectedConvId(list[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch conversations:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedIdParam > 0) {
      setSelectedConvId(selectedIdParam);
    }
  }, [selectedIdParam]);

  const fetchMessages = async (convId: number) => {
    setLoadingMessages(true);
    try {
      const res = await api.get(`/chat/conversations/${convId}/messages`);
      if (res.data?.success) {
        setMessages(res.data.messages || []);
        setIsBlockedPair(Boolean(res.data.is_blocked_pair));
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
        );
        refreshUnreadChatCount();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to load messages.', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (selectedConvId) {
      fetchMessages(selectedConvId);
    } else {
      setMessages([]);
    }
  }, [selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Live incoming WebSocket messages
  useEffect(() => {
    if (!lastWsMessage) return;
    const { conversationId, message } = lastWsMessage;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              last_message: message.content,
              last_message_at: message.created_at,
              unread_count:
                conversationId === selectedConvId
                  ? 0
                  : message.sender_id !== user?.id
                  ? c.unread_count + 1
                  : c.unread_count
            }
          : c
      )
    );

    if (conversationId === selectedConvId) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    }
  }, [lastWsMessage, selectedConvId, user?.id]);

  const activeConversation = conversations.find((c) => c.id === selectedConvId) || null;

  const handleSelectConversation = (convId: number) => {
    setSelectedConvId(convId);
    setSearchParams({ conversation: String(convId) });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConvId || !draft.trim() || sending || isBlockedPair) return;

    setSending(true);
    try {
      const res = await api.post(`/chat/conversations/${selectedConvId}/messages`, {
        content: draft.trim()
      });
      if (res.data?.success && res.data.message) {
        const sent = res.data.message as ChatMessage;
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedConvId
              ? { ...c, last_message: sent.content, last_message_at: sent.created_at }
              : c
          )
        );
        setDraft('');
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleBlockPeer = async () => {
    if (!activeConversation) return;
    try {
      const res = await api.post('/safety/blocks', { blocked_id: activeConversation.peer_id });
      if (res.data?.success) {
        showToast(res.data.message || 'User blocked.', 'info');
        setIsBlockedPair(true);
        fetchConversations();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to block user.', 'error');
    }
  };

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Messages' }]}
      title="Ride Messages"
      subtitle="Coordinate pickup points and timing directly with your driver or passengers."
    >
      {loadingList ? (
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Request a seat on a ride or open chat from a booking to message a fellow DIU student."
          action={
            <Link
              to="/search"
              className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl"
            >
              Browse Rides
            </Link>
          }
        />
      ) : (
        <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
          {/* Left Pane: Conversation List */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#D4DAE7] dark:border-[#34445E] divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E] max-h-[300px] lg:max-h-[620px] overflow-y-auto">
            {conversations.map((conv) => {
              const isSelected = conv.id === selectedConvId;
              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer space-y-1 ${
                    isSelected
                      ? 'bg-[#DDE2FA]/70 dark:bg-[#24334B]'
                      : 'hover:bg-[#E8ECF4]/60 dark:hover:bg-[#172235]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] truncate">
                        {conv.peer_name}
                      </span>
                      {conv.peer_student_verified === 1 && (
                        <BadgeCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8] shrink-0" />
                      )}
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#515FC5] dark:bg-[#818CF8] text-white text-[10px] font-bold font-mono tabular-nums">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-[#515FC5] dark:text-[#818CF8] truncate">
                    {conv.pickup_name} → {conv.dest_name}
                  </p>
                  <p className="text-[11px] text-[#626E86] dark:text-[#B0BCD0] truncate">
                    {conv.last_message || 'No messages yet — say hello'}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Pane: Active Thread */}
          <div className="lg:col-span-8 flex flex-col justify-between h-[520px] lg:h-[620px]">
            {activeConversation ? (
              <>
                {/* Thread Header */}
                <div className="px-5 py-3.5 border-b border-[#D4DAE7] dark:border-[#34445E] flex flex-wrap items-center justify-between gap-3 bg-[#F0F2F8] dark:bg-[#151F32]">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC] truncate">
                        {activeConversation.peer_name}
                      </h3>
                      <StatusBadge status={activeConversation.ride_status} size="sm" />
                    </div>
                    <Link
                      to={`/rides/${activeConversation.ride_id}`}
                      className="text-[11px] text-[#515FC5] dark:text-[#818CF8] hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      {activeConversation.pickup_name} → {activeConversation.dest_name}
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setShowReportModal(true)}
                      className="px-2.5 py-1.5 rounded-lg border border-[#D4DAE7] dark:border-[#34445E] text-[11px] font-semibold text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Flag className="w-3 h-3" /> Report
                    </button>
                    {!isBlockedPair && (
                      <button
                        onClick={handleBlockPeer}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <Ban className="w-3 h-3" /> Block
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#E8ECF4]/40 dark:bg-[#111827]">
                  {loadingMessages ? (
                    <div className="py-12 flex justify-center">
                      <Spinner size="md" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-16 text-center text-xs text-[#626E86] dark:text-[#B0BCD0]">
                      Start coordinating pickup time and campus meeting point below.
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMine = msg.sender_id === user?.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                              isMine
                                ? 'bg-[#515FC5] dark:bg-[#818CF8] text-white'
                                : 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E]'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          </div>
                          <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] mt-1 px-1 font-mono tabular-nums">
                            {new Date(msg.created_at).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Bar */}
                {isBlockedPair ? (
                  <div className="p-4 border-t border-[#D4DAE7] dark:border-[#34445E] bg-rose-50/70 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300 text-center font-medium">
                    Messaging is disabled because one of you has blocked the other.{' '}
                    <Link to="/safety" className="font-bold underline">
                      Manage Blocked Users
                    </Link>
                  </div>
                ) : (
                  <form
                    onSubmit={handleSend}
                    className="p-4 border-t border-[#D4DAE7] dark:border-[#34445E] bg-[#F5F7FC] dark:bg-[#1C2A40] flex items-center gap-2.5"
                  >
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a message about pickup point or timing..."
                      maxLength={1000}
                      className="flex-1 text-xs px-4 py-2.5 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] text-[#222B42] dark:text-[#F1F4FC]"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="px-4 py-2.5 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Send
                    </button>
                  </form>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[#626E86] dark:text-[#B0BCD0]">
                Select a conversation to view messages.
              </div>
            )}
          </div>
        </div>
      )}

      {activeConversation && (
        <ReportUserModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportedUserId={activeConversation.peer_id}
          reportedUserName={activeConversation.peer_name}
          rideId={activeConversation.ride_id}
        />
      )}
    </DashboardLayout>
  );
};

export default MessagesPage;
