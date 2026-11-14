import React, { useEffect, useState } from 'react';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';
import api from '../services/api.ts';
import { UserReport, ReportStatus } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import DashboardLayout from '../components/DashboardLayout.tsx';
import StatusBadge from '../components/StatusBadge.tsx';
import Spinner from '../components/Spinner.tsx';
import EmptyState from '../components/EmptyState.tsx';
import Modal from '../components/Modal.tsx';

export const AdminReportsPage: React.FC = () => {
  const { showToast } = useToast();
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');

  // Review Modal
  const [activeReport, setActiveReport] = useState<UserReport | null>(null);
  const [nextStatus, setNextStatus] = useState<ReportStatus>('under_review');
  const [adminNote, setAdminNote] = useState('');
  const [blockUser, setBlockUser] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchReports = async () => {
    try {
      const res = await api.get('/admin/reports');
      if (res.data?.success) {
        setReports(res.data.reports || []);
      }
    } catch (err) {
      console.warn('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const openReviewModal = (report: UserReport) => {
    setActiveReport(report);
    setNextStatus(report.status === 'pending' ? 'resolved' : report.status);
    setAdminNote(report.admin_note || '');
    setBlockUser(false);
  };

  const handleUpdateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReport) return;

    setSaving(true);
    try {
      const res = await api.patch(`/admin/reports/${activeReport.id}`, {
        status: nextStatus,
        admin_note: adminNote.trim() || undefined,
        block_user: blockUser
      });
      if (res.data?.success) {
        showToast(res.data.message || 'Report updated.', 'success');
        setActiveReport(null);
        fetchReports();
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update report.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered =
    statusFilter === 'all' ? reports : reports.filter((r) => r.status === statusFilter);

  return (
    <DashboardLayout
      breadcrumbs={[{ label: 'Admin', path: '/admin' }, { label: 'Safety Reports' }]}
      title="Safety Reports Queue"
      subtitle="Review student incident reports, record resolution notes, and enforce account suspensions."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 w-fit">
          {(['all', 'pending', 'under_review', 'resolved', 'dismissed'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="No reports in this queue"
            description="Safety reports submitted by DIU students will appear here for administrative review."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((rp) => (
              <div
                key={rp.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        Reported: {rp.reported_user_name} ({rp.reported_student_id})
                      </span>
                      <StatusBadge status={rp.status} size="sm" />
                      {rp.reported_is_blocked === 1 && (
                        <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          · Account Suspended
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Filed by {rp.reporter_name} ({rp.reporter_student_id}) · Reason:{' '}
                      <span className="capitalize font-semibold">{rp.reason.replace('_', ' ')}</span> ·{' '}
                      {new Date(rp.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>

                  <button
                    onClick={() => openReviewModal(rp)}
                    className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Update Status
                  </button>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                  {rp.description}
                </p>

                {rp.admin_note && (
                  <p className="text-[11px] text-teal-800 dark:text-teal-300 font-medium">
                    Admin note: {rp.admin_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Report Modal */}
      <Modal
        isOpen={Boolean(activeReport)}
        onClose={() => setActiveReport(null)}
        title="Review Safety Report"
      >
        <form onSubmit={handleUpdateReport} className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            Update report against <strong>{activeReport?.reported_user_name}</strong> (
            {activeReport?.reported_student_id}).
          </p>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Resolution Status
            </label>
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as ReportStatus)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="pending">Pending</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Admin Resolution Note
            </label>
            <textarea
              rows={3}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Document review findings or action taken..."
              maxLength={500}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
            />
          </div>

          {activeReport?.reported_is_blocked !== 1 && (
            <label className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={blockUser}
                onChange={(e) => setBlockUser(e.target.checked)}
                className="rounded text-rose-600"
              />
              <span className="font-semibold text-rose-800 dark:text-rose-200">
                Suspend reported student account immediately
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveReport(null)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold"
            >
              {saving ? 'Saving...' : 'Save Review'}
            </button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
};

export default AdminReportsPage;
