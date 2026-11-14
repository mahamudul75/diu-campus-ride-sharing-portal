import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  Ban,
  CheckCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  BadgeCheck,
  MailCheck
} from 'lucide-react';
import api from '../services/api.ts';
import { User } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';
import Modal from '../components/Modal.tsx';
import EmptyState from '../components/EmptyState.tsx';

export const AdminUsersPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'name' | 'student_id' | 'driver_status'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users', {
        params: { search: searchTerm.trim() || undefined }
      });
      if (res.data?.success) {
        setUsers(res.data.users || []);
      }
    } catch (err) {
      console.warn('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    setCurrentPage(1);
  }, [searchTerm]);

  const handleToggleBlock = async () => {
    if (!targetUser) return;
    if (targetUser.id === currentAdmin?.id) {
      showToast('Cannot suspend your own account.', 'error');
      setShowBlockModal(false);
      return;
    }

    setProcessing(true);
    const action = targetUser.is_blocked ? 'unblock' : 'suspend';
    try {
      const res = await api.patch(`/admin/users/${targetUser.id}/block`, {
        is_blocked: targetUser.is_blocked ? 0 : 1
      });
      if (res.data?.success) {
        showToast(res.data.message || `User ${action}ed.`, 'success');
        setShowBlockModal(false);
        setTargetUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || `Failed to ${action} user.`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!targetUser) return;
    if (targetUser.id === currentAdmin?.id) {
      showToast('Cannot delete your own account.', 'error');
      setShowDeleteModal(false);
      return;
    }

    setProcessing(true);
    try {
      const res = await api.delete(`/admin/users/${targetUser.id}`);
      if (res.data?.success) {
        showToast(res.data.message || 'User deleted.', 'success');
        setShowDeleteModal(false);
        setTargetUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Delete failed.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleVerify = async (u: User) => {
    try {
      const nextState = u.student_verified === 1 ? 0 : 1;
      const res = await api.patch(`/admin/users/${u.id}/verify`, {
        student_verified: nextState
      });
      if (res.data?.success) {
        showToast(res.data.message || 'Student verification updated.', 'success');
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Verification update failed.', 'error');
    }
  };

  const toggleSort = (field: 'name' | 'student_id' | 'driver_status') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedUsers = [...users].sort((a, b) => {
    let aVal = a[sortField] || '';
    let bVal = b[sortField] || '';
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedUsers.length / pageSize) || 1;
  const paginatedUsers = sortedUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Student Directory' }]}
      title="Student Directory"
      subtitle="Search, inspect, and moderate university user accounts."
      actions={
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-white dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] text-[#222B42] dark:text-[#F1F4FC]"
          />
        </div>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Students Found"
            description="No student accounts matched your search query."
          />
        ) : (
          <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F0F2F8] dark:bg-[#151F32] border-b border-[#D4DAE7] dark:border-[#34445E] text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider font-bold text-[10px]">
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[#222B42] dark:hover:text-[#F1F4FC]"
                      onClick={() => toggleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Student</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[#222B42] dark:hover:text-[#F1F4FC]"
                      onClick={() => toggleSort('student_id')}
                    >
                      <div className="flex items-center gap-1">
                        <span>DIU ID</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Account</th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-[#222B42] dark:hover:text-[#F1F4FC]"
                      onClick={() => toggleSort('driver_status')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Driver</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Vehicle</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
                  {paginatedUsers.map((u) => {
                    const isBlocked = Boolean(u.is_blocked);
                    const isCurrentAdmin = u.id === currentAdmin?.id;

                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-[#E8ECF4]/60 dark:hover:bg-[#24334B]/40 transition-colors ${
                          isBlocked ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        {/* Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-white dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] flex items-center justify-center font-bold text-xs shrink-0 border border-[#D4DAE7] dark:border-[#34445E]">
                              {u.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-1">
                                {u.name}
                                {u.student_verified === 1 && (
                                  <span title="Verified DIU Student" className="inline-flex">
                                    <BadgeCheck className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                                  </span>
                                )}
                                {u.email_verified === 1 && (
                                  <span title="Email Verified" className="inline-flex">
                                    <MailCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  </span>
                                )}
                                {u.role === 'admin' && (
                                  <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[9px] rounded font-mono font-bold">
                                    ADMIN
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] font-mono">{u.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Student ID */}
                        <td className="py-3 px-4 font-mono font-bold text-[#222B42] dark:text-[#F1F4FC] tabular-nums">
                          {u.student_id}
                        </td>

                        {/* Phone */}
                        <td className="py-3 px-4 font-mono text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                          {u.phone}
                        </td>

                        {/* Account Status */}
                        <td className="py-3 px-4">
                          {isBlocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 text-[10px] font-bold">
                              <Ban className="w-3 h-3" /> Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                              <CheckCircle className="w-3 h-3" /> Active
                            </span>
                          )}
                        </td>

                        {/* Driver Status */}
                        <td className="py-3 px-4">
                          <StatusBadge status={u.driver_status} size="sm" />
                        </td>

                        {/* Vehicle */}
                        <td className="py-3 px-4">
                          {u.vehicle_model ? (
                            <div>
                              <p className="font-medium text-[#222B42] dark:text-[#F1F4FC] capitalize">
                                {u.vehicle_type}: {u.vehicle_model}
                              </p>
                              <p className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] font-mono">{u.vehicle_plate}</p>
                            </div>
                          ) : (
                            <span className="text-[#626E86] dark:text-[#B0BCD0] text-[10px]">None</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleVerify(u)}
                              title={u.student_verified === 1 ? 'Remove Student Verification' : 'Verify DIU Student'}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                u.student_verified === 1
                                  ? 'bg-[#DDE2FA]/70 dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] border-[#515FC5]/30 dark:border-[#818CF8]/30'
                                  : 'bg-white dark:bg-[#24334B] text-[#626E86] dark:text-[#B0BCD0] border-[#D4DAE7] dark:border-[#34445E] hover:text-[#515FC5]'
                              }`}
                            >
                              <BadgeCheck className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                setTargetUser(u);
                                setShowBlockModal(true);
                              }}
                              disabled={isCurrentAdmin}
                              title={isBlocked ? 'Unblock' : 'Suspend'}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                                isBlocked
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                              }`}
                            >
                              {isBlocked ? <CheckCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              onClick={() => {
                                setTargetUser(u);
                                setShowDeleteModal(true);
                              }}
                              disabled={isCurrentAdmin}
                              title="Delete"
                              className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-[#D4DAE7]/50 dark:border-[#34445E] flex items-center justify-between text-xs text-[#626E86] dark:text-[#B0BCD0]">
                <span>
                  Page {currentPage} of {totalPages} ({users.length} students)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded-lg border border-[#D4DAE7] dark:border-[#34445E] disabled:opacity-40 cursor-pointer hover:bg-[#E8ECF4] dark:hover:bg-[#24334B]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded-lg border border-[#D4DAE7] dark:border-[#34445E] disabled:opacity-40 cursor-pointer hover:bg-[#E8ECF4] dark:hover:bg-[#24334B]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Block / Unblock Modal */}
      <Modal
        isOpen={showBlockModal}
        onClose={() => {
          setShowBlockModal(false);
          setTargetUser(null);
        }}
        title={targetUser?.is_blocked ? 'Unblock Student' : 'Suspend Student'}
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            {targetUser?.is_blocked
              ? `Restore access for ${targetUser?.name} (${targetUser?.student_id})?`
              : `Suspend ${targetUser?.name} (${targetUser?.student_id})? They will be unable to log in or book rides.`}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setShowBlockModal(false);
                setTargetUser(null);
              }}
              className="px-4 py-2 border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#626E86] dark:text-[#B0BCD0] rounded-xl hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleToggleBlock}
              disabled={processing}
              className={`px-4 py-2 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer ${
                targetUser?.is_blocked
                  ? 'bg-[#515FC5] hover:bg-[#434FA8] dark:bg-[#818CF8] dark:hover:bg-[#6366F1]'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {processing ? 'Processing...' : targetUser?.is_blocked ? 'Unblock' : 'Suspend'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete User Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setTargetUser(null);
        }}
        title="Delete Student Account"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#626E86] dark:text-[#B0BCD0] leading-relaxed">
            Permanently delete <strong className="text-[#222B42] dark:text-[#F1F4FC]">{targetUser?.name}</strong> ({targetUser?.student_id})? This action removes their active rides and booking history and cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setTargetUser(null);
              }}
              className="px-4 py-2 border border-[#D4DAE7] dark:border-[#34445E] text-xs font-bold text-[#626E86] dark:text-[#B0BCD0] rounded-xl hover:bg-[#E8ECF4] dark:hover:bg-[#172235] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteUser}
              disabled={processing}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
            >
              {processing ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
};

export default AdminUsersPage;
