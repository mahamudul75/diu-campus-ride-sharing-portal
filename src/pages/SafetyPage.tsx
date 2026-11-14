import React, { useEffect, useState } from 'react';
import {
  Shield,
  PhoneCall,
  Plus,
  Trash2,
  Ban,
  Flag,
  Unlock
} from 'lucide-react';
import api from '../services/api.ts';
import { EmergencyContact, UserBlock, UserReport } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';

export const SafetyPage: React.FC = () => {
  const { showToast } = useToast();

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [blocks, setBlocks] = useState<UserBlock[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Contact Form
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  const loadSafetyData = async () => {
    try {
      const [cRes, bRes, rRes] = await Promise.allSettled([
        api.get('/safety/emergency-contacts'),
        api.get('/safety/blocks'),
        api.get('/safety/reports/mine')
      ]);

      if (cRes.status === 'fulfilled' && cRes.value.data?.success) {
        setContacts(cRes.value.data.contacts || []);
      }
      if (bRes.status === 'fulfilled' && bRes.value.data?.success) {
        setBlocks(bRes.value.data.blocks || []);
      }
      if (rRes.status === 'fulfilled' && rRes.value.data?.success) {
        setReports(rRes.value.data.reports || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSafetyData();
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
    try {
      const res = await api.delete(`/safety/emergency-contacts/${contactId}`);
      if (res.data?.success) {
        showToast('Emergency contact removed.', 'info');
        setContacts((prev) => prev.filter((c) => c.id !== contactId));
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to remove contact.', 'error');
    }
  };

  const handleUnblock = async (blockedId: number) => {
    try {
      const res = await api.delete(`/safety/blocks/${blockedId}`);
      if (res.data?.success) {
        showToast('User unblocked.', 'info');
        setBlocks((prev) => prev.filter((b) => b.blocked_id !== blockedId));
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to unblock user.', 'error');
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
                {contacts.map((c) => (
                  <div key={c.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-bold text-[#222B42] dark:text-[#F1F4FC]">
                        {c.name} <span className="text-[#626E86] dark:text-[#B0BCD0] font-normal">({c.relationship})</span>
                      </p>
                      <a
                        href={`tel:${c.phone}`}
                        className="font-mono text-[#515FC5] dark:text-[#818CF8] font-semibold hover:underline tabular-nums"
                      >
                        {c.phone}
                      </a>
                    </div>
                    <button
                      onClick={() => handleDeleteContact(c.id)}
                      title="Delete contact"
                      className="p-1.5 rounded-lg text-[#626E86] dark:text-[#B0BCD0] hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
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
                {blocks.length}
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
                      onClick={() => handleUnblock(b.blocked_id)}
                      className="px-3 py-1.5 rounded-lg border border-[#D4DAE7] dark:border-[#34445E] text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#E8ECF4] dark:hover:bg-[#24334B] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Unlock className="w-3 h-3" /> Unblock
                    </button>
                  </div>
                ))}
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
              {reports.length} filed
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
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SafetyPage;
