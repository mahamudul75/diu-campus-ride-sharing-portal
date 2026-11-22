import React, { useEffect, useRef, useState } from 'react';
import {
  Shield,
  Phone,
  PhoneCall,
  Plus,
  Trash2,
  Ban,
  Flag,
  Unlock,
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import api from '../services/api.ts';
import { EmergencyContact, UserBlock, UserReport } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';

function getSafeTelHref(rawPhone: string | null | undefined): string | null {
  if (typeof rawPhone !== 'string') return null;
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  return `tel:${hasLeadingPlus ? '+' : ''}${digits}`;
}

export const SafetyPage: React.FC = () => {
  const { showToast } = useToast();

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [blocks, setBlocks] = useState<UserBlock[]>([]);
  const [blocksHasMore, setBlocksHasMore] = useState(false);
  const [loadingMoreBlocks, setLoadingMoreBlocks] = useState(false);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [loadingMoreReports, setLoadingMoreReports] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Add Contact Form
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
  const [unblockingUserId, setUnblockingUserId] = useState<number | null>(null);

  const loadSafetyData = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadError(null);
    if (contacts.length === 0 && blocks.length === 0 && reports.length === 0) {
      setLoading(true);
    }
    try {
      const [cRes, bRes, rRes] = await Promise.allSettled([
        api.get('/safety/emergency-contacts', { signal: controller.signal }),
        api.get('/safety/blocks', { params: { limit: 50, offset: 0 }, signal: controller.signal }),
        api.get('/safety/reports/mine', { params: { limit: 50, offset: 0 }, signal: controller.signal })
      ]);
      if (controller.signal.aborted) return;

      let failureCount = 0;
      let firstErrorMsg: string | null = null;

      if (cRes.status === 'fulfilled' && cRes.value.data?.success) {
        setContacts(cRes.value.data.contacts || []);
      } else if (cRes.status === 'rejected' && cRes.reason?.code !== 'ERR_CANCELED') {
        failureCount++;
        firstErrorMsg = firstErrorMsg || cRes.reason?.response?.data?.message || 'Failed to load safety data.';
      }
      if (bRes.status === 'fulfilled' && bRes.value.data?.success) {
        setBlocks(bRes.value.data.blocks || []);
        setBlocksHasMore(Boolean(bRes.value.data.pagination?.has_more));
      } else if (bRes.status === 'rejected' && bRes.reason?.code !== 'ERR_CANCELED') {
        failureCount++;
        firstErrorMsg = firstErrorMsg || bRes.reason?.response?.data?.message || 'Failed to load safety data.';
      }
      if (rRes.status === 'fulfilled' && rRes.value.data?.success) {
        setReports(rRes.value.data.reports || []);
        setReportsHasMore(Boolean(rRes.value.data.pagination?.has_more));
      } else if (rRes.status === 'rejected' && rRes.reason?.code !== 'ERR_CANCELED') {
        failureCount++;
        firstErrorMsg = firstErrorMsg || rRes.reason?.response?.data?.message || 'Failed to load safety data.';
      }

      if (failureCount > 0) {
        setLoadError(firstErrorMsg || 'Some safety records could not be loaded.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const loadMoreBlocks = async () => {
    if (!blocksHasMore || loadingMoreBlocks) return;
    setLoadingMoreBlocks(true);
    try {
      const res = await api.get('/safety/blocks', {
        params: { limit: 50, offset: blocks.length }
      });
      if (res.data?.success) {
        const incoming: UserBlock[] = res.data.blocks || [];
        setBlocks((prev) => {
          const seen = new Set(prev.map((b) => b.id));
          return [...prev, ...incoming.filter((b) => !seen.has(b.id))];
        });
        setBlocksHasMore(Boolean(res.data.pagination?.has_more) && incoming.length > 0);
      }
    } finally {
      setLoadingMoreBlocks(false);
    }
  };

  const loadMoreReports = async () => {
    if (!reportsHasMore || loadingMoreReports) return;
    setLoadingMoreReports(true);
    try {
      const res = await api.get('/safety/reports/mine', {
        params: { limit: 50, offset: reports.length }
      });
      if (res.data?.success) {
        const incoming: UserReport[] = res.data.reports || [];
        setReports((prev) => {
          const seen = new Set(prev.map((rp) => rp.id));
          return [...prev, ...incoming.filter((rp) => !seen.has(rp.id))];
        });
        setReportsHasMore(Boolean(res.data.pagination?.has_more) && incoming.length > 0);
      }
    } finally {
      setLoadingMoreReports(false);
    }
  };

  useEffect(() => {
    loadSafetyData();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingContact(true);
    try {
      const res = await api.post('/safety/emergency-contacts', {
        name: name.trim(),
        relationship: relationship.trim(),
        phone: phone.trim()
      });
      if (res.data?.success) {
        showToast('Emergency contact saved.', 'success');
        setName('');
        setRelationship('');
        setPhone('');
        loadSafetyData();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to add emergency contact.', 'error');
    } finally {
      setSavingContact(false);
    }
  };

  const handleDeleteContact = async (contactId: number) => {
    if (deletingContactId === contactId) return;
    setDeletingContactId(contactId);
    try {
      const res = await api.delete(`/safety/emergency-contacts/${contactId}`);
      if (res.data?.success) {
        showToast('Emergency contact removed.', 'info');
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to remove contact.', 'error');
    } finally {
      setDeletingContactId(null);
    }
  };

  const handleUnblock = async (blockedId: number) => {
    if (unblockingUserId === blockedId) return;
    setUnblockingUserId(blockedId);
    try {
      const res = await api.delete(`/safety/blocks/${blockedId}`);
      if (res.data?.success) {
        showToast('User unblocked.', 'info');
        setBlocks((prev) => prev.filter((b) => b.blocked_id !== blockedId));
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to unblock user.', 'error');
    } finally {
      setUnblockingUserId(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Safety Center' }]}
        title="Campus Safety Center"
        subtitle="Manage emergency contacts, blocked users, and incident reports."
      >
        <div className="py-20 flex justify-center">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Safety Center' }]}
      title="Campus Safety Center"
      subtitle="Manage emergency contacts, blocked users, and submitted safety reports."
    >
      <div className="max-w-5xl space-y-6">
        {loadError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {loadError}
            </span>
            <button
              type="button"
              onClick={loadSafetyData}
              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Emergency Contacts Section */}
          <div className="lg:col-span-7 bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-[#D4DAE7]/50 dark:border-[#34445E] pb-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
                <h2 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                  Trusted Emergency Contacts
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                {contacts.length}/5 saved
              </span>
            </div>

            {contacts.length === 0 ? (
              <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                Save family or campus security numbers here for quick access during rides.
              </p>
            ) : (
              <div className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
                {contacts.map((c) => {
                  const telHref = getSafeTelHref(c.phone);
                  const callTarget =
                    c.relationship && c.relationship.toLowerCase() !== c.name.toLowerCase()
                      ? `${c.name} (${c.relationship})`
                      : c.name;
                  const callAriaLabel = `Call ${callTarget}`;

                  return (
                    <div key={c.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[#222B42] dark:text-[#F1F4FC] truncate">
                          {c.name}{' '}
                          <span className="text-[#626E86] dark:text-[#B0BCD0] font-normal">({c.relationship})</span>
                        </p>
                        <p className="font-mono text-[#515FC5] dark:text-[#818CF8] font-semibold tabular-nums truncate">
                          {c.phone}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {telHref && (
                          <a
                            href={telHref}
                            title={callAriaLabel}
                            aria-label={callAriaLabel}
                            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#515FC5]/10 hover:bg-[#515FC5]/20 dark:bg-[#818CF8]/15 dark:hover:bg-[#818CF8]/25 text-[#515FC5] dark:text-[#818CF8] border border-[#515FC5]/25 dark:border-[#818CF8]/30 font-semibold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span>Call</span>
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={deletingContactId === c.id}
                          onClick={() => handleDeleteContact(c.id)}
                          title="Delete contact"
                          aria-label={`Delete emergency contact ${c.name}`}
                          className="p-1.5 rounded-lg text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {contacts.length < 5 && (
              <form onSubmit={handleAddContact} className="pt-4 border-t border-[#D4DAE7]/50 dark:border-[#34445E] space-y-3 text-xs">
                <p className="font-bold text-[#222B42] dark:text-[#F1F4FC]">Add Emergency Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="px-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Relationship (e.g. Father)"
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="px-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
                  />
                  <input
                    type="tel"
                    required
                    placeholder="01712345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="px-3 py-2 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl text-[#222B42] dark:text-[#F1F4FC] font-mono focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8]"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingContact}
                    className="px-4 py-2 bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1] text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {savingContact ? 'Saving...' : 'Save Contact'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Blocked Users Section */}
          <div className="lg:col-span-5 bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#D4DAE7]/50 dark:border-[#34445E] pb-3">
              <div className="flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-500" />
                <h2 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                  Blocked Students
                </h2>
              </div>
              <span className="text-[11px] font-mono text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                {blocks.length}{blocksHasMore ? '+' : ''}
              </span>
            </div>

            {blocks.length === 0 ? (
              <p className="text-xs text-[#626E86] dark:text-[#B0BCD0]">
                You have not blocked any users. Blocked students cannot view your rides, book seats, or message you.
              </p>
            ) : (
              <div className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
                {blocks.map((b) => (
                  <div key={b.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-bold text-[#222B42] dark:text-[#F1F4FC]">{b.blocked_name}</p>
                      <p className="text-[11px] font-mono text-[#626E86] dark:text-[#B0BCD0]">{b.blocked_student_id}</p>
                    </div>
                    <button
                      type="button"
                      disabled={unblockingUserId === b.blocked_id}
                      onClick={() => handleUnblock(b.blocked_id)}
                      className="px-3 py-1.5 rounded-lg border border-[#D4DAE7] dark:border-[#34445E] text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      <Unlock className="w-3 h-3" /> {unblockingUserId === b.blocked_id ? 'Unblocking...' : 'Unblock'}
                    </button>
                  </div>
                ))}
                {blocksHasMore && (
                  <div className="pt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={loadMoreBlocks}
                      disabled={loadingMoreBlocks}
                      className="px-3.5 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] cursor-pointer disabled:opacity-50"
                    >
                      {loadingMoreBlocks ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* My Submitted Safety Reports */}
        <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] p-6 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#D4DAE7]/50 dark:border-[#34445E] pb-3">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-[#222B42] dark:text-[#F1F4FC]">
                My Submitted Safety Reports
              </h2>
            </div>
            <span className="text-[11px] font-mono text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
              {reports.length}{reportsHasMore ? '+' : ''} filed
            </span>
          </div>

          {reports.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-[#626E86] dark:text-[#B0BCD0]">
              <Shield className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8] shrink-0" />
              <span>No safety incident reports filed. You can report any concerning behavior from a ride page or chat thread.</span>
            </div>
          ) : (
            <div className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
              {reports.map((rp) => (
                <div key={rp.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                        {rp.reported_user_name} ({rp.reported_student_id})
                      </span>
                      <span className="text-[#626E86] dark:text-[#B0BCD0]">·</span>
                      <span className="capitalize text-[#222B42] dark:text-[#F1F4FC] font-medium">
                        {rp.reason.replace('_', ' ')}
                      </span>
                    </div>
                    <StatusBadge status={rp.status} size="sm" />
                  </div>
                  <p className="text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">{rp.description}</p>
                  {rp.admin_note && (
                    <p className="text-[11px] text-[#344269] dark:text-[#818CF8] bg-[#DDE2FA]/40 dark:bg-[#24334B]/60 px-3 py-2 rounded-lg border border-[#515FC5]/30 dark:border-[#818CF8]/30">
                      Admin resolution note: {rp.admin_note}
                    </p>
                  )}
                </div>
              ))}
              {reportsHasMore && (
                <div className="pt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMoreReports}
                    disabled={loadingMoreReports}
                    className="px-4 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#515FC5] dark:text-[#818CF8] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] cursor-pointer disabled:opacity-50"
                  >
                    {loadingMoreReports ? 'Loading...' : 'Load More Reports'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SafetyPage;
