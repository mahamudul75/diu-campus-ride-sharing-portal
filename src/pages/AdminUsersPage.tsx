import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  ShieldAlert,
  ShieldCheck,
  Ban,
  CheckCircle,
  Trash2,
  Phone,
  Mail,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown
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
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-100"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
                      onClick={() => toggleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Student</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th
                      className="py-3 px-4 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
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
                      className="py-3 px-4 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
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
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedUsers.map((u) => {
                    const isBlocked = Boolean(u.is_blocked);
                    const isCurrentAdmin = u.id === currentAdmin?.id;

                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                          isBlocked ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                        }`}
                      >
                        {/* Name */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">
                              {u.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                {u.name}
                                {u.role === 'admin' && (
                                  <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[9px] rounded font-mono font-bold">
                                    ADMIN
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">{u.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Student ID */}
                        <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {u.student_id}
                        </td>

                        {/* Phone */}
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
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
                              <p className="font-medium text-slate-800 dark:text-slate-200 capitalize">
                                {u.vehicle_type}: {u.vehicle_model}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">{u.vehicle_plate}</p>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[10px]">None</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
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
              <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Page {currentPage} of {totalPages} ({users.length} students)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
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
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
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
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleToggleBlock}
              disabled={processing}
              className={`px-4 py-2 text-white text-xs font-bold rounded-xl shadow-xs ${
                targetUser?.is_blocked
                  ? 'bg-teal-600 hover:bg-teal-700'
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
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Permanently delete <strong>{targetUser?.name}</strong> ({targetUser?.student_id})? This action removes their active rides and booking history and cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setShowDeleteModal(false);
                setTargetUser(null);
              }}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteUser}
              disabled={processing}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs"
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
