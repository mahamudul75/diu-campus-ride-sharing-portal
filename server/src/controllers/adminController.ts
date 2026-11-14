import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isPositiveIntId } from '../utils/validators.ts';
import { toUtcIsoString } from '../utils/dateTime.ts';
import { getUserExtendedFields } from '../utils/dbHelpers.ts';
import { createNotification } from '../services/notificationService.ts';

export async function getAdminStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [userRows] = await db.query(
      `SELECT 
        COUNT(*) AS total_users,
        SUM(CASE WHEN driver_status = 'approved' THEN 1 ELSE 0 END) AS approved_drivers,
        SUM(CASE WHEN driver_status = 'pending' THEN 1 ELSE 0 END) AS pending_drivers
       FROM users`
    );

    const [rideRows] = await db.query('SELECT id, status, vehicle_type FROM rides');
    const [requestRows] = await db.query('SELECT id, status FROM ride_requests');

    let pendingReports = 0;
    let totalReports = 0;
    try {
      const [repRows] = await db.query('SELECT status FROM user_reports');
      const reports = (repRows as any[]) || [];
      totalReports = reports.length;
      pendingReports = reports.filter((r) => r.status === 'pending' || r.status === 'under_review').length;
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    let totalReviews = 0;
    try {
      const [revRows] = await db.query('SELECT id FROM reviews');
      totalReviews = Array.isArray(revRows) ? revRows.length : 0;
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    let verifiedStudents = 0;
    try {
      const [verRows] = await db.query('SELECT id FROM users WHERE student_verified = 1');
      verifiedStudents = Array.isArray(verRows) ? verRows.length : 0;
    } catch (err: any) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
    }

    const uStats = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as any) : {};
    const allRides = (rideRows as any[]) || [];
    const allRequests = (requestRows as any[]) || [];

    const activeRides = allRides.filter(
      (r) => r.status === 'open' || r.status === 'scheduled' || r.status === 'full' || r.status === 'in_progress'
    ).length;
    const completedRides = allRides.filter((r) => r.status === 'completed').length;
    const cancelledRides = allRides.filter((r) => r.status === 'cancelled').length;
    const bikeRides = allRides.filter((r) => r.vehicle_type === 'bike').length;
    const carRides = allRides.filter((r) => r.vehicle_type === 'car').length;

    const acceptedRequests = allRequests.filter((q) => q.status === 'accepted').length;
    const pendingRequests = allRequests.filter((q) => q.status === 'pending').length;
    const rejectedRequests = allRequests.filter((q) => q.status === 'rejected').length;
    const cancelledRequests = allRequests.filter((q) => q.status === 'cancelled').length;

    const finishedRides = completedRides + cancelledRides;
    const completionRate = finishedRides > 0 ? Math.round((completedRides / finishedRides) * 100) : 0;

    res.status(200).json({
      success: true,
      stats: {
        total_users: Number(uStats.total_users || 0),
        approved_drivers: Number(uStats.approved_drivers || 0),
        pending_drivers: Number(uStats.pending_drivers || 0),
        total_rides: allRides.length,
        total_requests: allRequests.length,
        active_rides: activeRides,
        completed_rides: completedRides,
        cancelled_rides: cancelledRides,
        bike_rides: bikeRides,
        car_rides: carRides,
        accepted_requests: acceptedRequests,
        pending_requests: pendingRequests,
        rejected_requests: rejectedRequests,
        cancelled_requests: cancelledRequests,
        pending_reports: pendingReports,
        total_reports: totalReports,
        verified_students: verifiedStudents,
        total_reviews: totalReviews,
        ride_completion_rate: completionRate
      }
    });
  } catch (error: any) {
    console.error('getAdminStats error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve admin dashboard stats.' });
  }
}

export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { search } = req.query;

    let query = `
      SELECT id, student_id, name, email, phone, role, driver_status, 
             vehicle_type, vehicle_model, vehicle_plate, is_blocked, created_at
      FROM users
    `;
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim().slice(0, 100)}%`;
      query += ` WHERE name LIKE ? OR email LIKE ? OR student_id LIKE ?`;
      params.push(term, term, term);
    }

    query += ` ORDER BY id ASC`;

    const [rows] = await db.query(query, params);
    const enriched = await Promise.all(
      (rows as any[]).map(async (u) => {
        const ext = await getUserExtendedFields(Number(u.id));
        return { ...u, ...ext };
      })
    );

    res.status(200).json({
      success: true,
      users: enriched
    });
  } catch (error: any) {
    console.error('getUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
}

export async function verifyStudent(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = isPositiveIntId(req.params.id);
    if (!targetUserId) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    const [rows] = await db.query('SELECT id, name FROM users WHERE id = ?', [targetUserId]);
    const user = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!user) {
      res.status(404).json({ success: false, message: 'Student not found.' });
      return;
    }

    const nextState = req.body?.student_verified === false || req.body?.student_verified === 0 ? 0 : 1;

    try {
      await db.query('UPDATE users SET student_verified = ? WHERE id = ?', [nextState, targetUserId]);
    } catch (err: any) {
      if (err?.code === 'ER_BAD_FIELD_ERROR') {
        res.status(503).json({ success: false, message: 'Student verification column requires Migration 002.' });
        return;
      }
      throw err;
    }

    if (nextState === 1) {
      await createNotification({
        userId: targetUserId,
        type: 'account_verified',
        title: 'DIU Student Identity Verified',
        message: 'Campus administration has verified your DIU student badge.',
        link: '/profile'
      });
    }

    res.status(200).json({
      success: true,
      student_verified: nextState,
      message: nextState === 1 ? `${user.name} marked as Verified DIU Student.` : `Verification removed for ${user.name}.`
    });
  } catch (error: any) {
    console.error('verifyStudent error:', error);
    res.status(500).json({ success: false, message: 'Failed to update student verification.' });
  }
}

export async function toggleBlockUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = isPositiveIntId(req.params.id);
    if (!targetUserId) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    const { is_blocked } = req.body ?? {};

    if (req.user && req.user.id === targetUserId) {
      res.status(400).json({
        success: false,
        message: 'Security warning: You cannot suspend your own admin account.'
      });
      return;
    }

    const [userRows] = await db.query('SELECT id, role, is_blocked FROM users WHERE id = ?', [targetUserId]);
    const targetUser = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as any) : null;

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const newBlockedState =
      is_blocked !== undefined ? (is_blocked === true || is_blocked === 1 ? 1 : 0) : targetUser.is_blocked ? 0 : 1;

    if (targetUser.role === 'admin' && newBlockedState === 1) {
      const [adminCount] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_blocked = 0");
      const activeAdmins = Array.isArray(adminCount) && adminCount.length > 0 ? Number((adminCount[0] as any).count) : 0;
      if (activeAdmins <= 1) {
        res.status(400).json({
          success: false,
          message: 'Action prohibited: Cannot block the last active administrator.'
        });
        return;
      }
    }

    await db.query('UPDATE users SET is_blocked = ? WHERE id = ?', [newBlockedState, targetUserId]);

    res.status(200).json({
      success: true,
      message: newBlockedState === 1 ? 'User has been blocked.' : 'User has been unblocked.',
      is_blocked: newBlockedState
    });
  } catch (error: any) {
    console.error('toggleBlockUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user block status.' });
  }
}

export async function deleteUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = isPositiveIntId(req.params.id);
    if (!targetUserId) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    if (req.user && req.user.id === targetUserId) {
      res.status(400).json({
        success: false,
        message: 'Security warning: You cannot delete your own admin account.'
      });
      return;
    }

    const [userRows] = await db.query('SELECT id, role FROM users WHERE id = ?', [targetUserId]);
    const targetUser = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as any) : null;

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    if (targetUser.role === 'admin') {
      const [adminCount] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
      const count = Array.isArray(adminCount) && adminCount.length > 0 ? Number((adminCount[0] as any).count) : 0;
      if (count <= 1) {
        res.status(400).json({
          success: false,
          message: 'Action prohibited: Cannot remove the last active administrator.'
        });
        return;
      }
    }

    await db.query('DELETE FROM users WHERE id = ?', [targetUserId]);

    res.status(200).json({
      success: true,
      message: 'User account and associated records removed successfully.'
    });
  } catch (error: any) {
    console.error('deleteUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
}

export async function getPendingDrivers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await db.query(
      `SELECT id, student_id, name, email, phone, role, driver_status, 
              vehicle_type, vehicle_model, vehicle_plate, created_at
       FROM users 
       WHERE driver_status = 'pending'
       ORDER BY created_at ASC`
    );

    res.status(200).json({
      success: true,
      drivers: rows
    });
  } catch (error: any) {
    console.error('getPendingDrivers error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve pending drivers.' });
  }
}

export async function approveDriver(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = isPositiveIntId(req.params.id);
    if (!targetUserId) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    const adminNote =
      typeof req.body?.admin_note === 'string' && req.body.admin_note.trim()
        ? req.body.admin_note.trim().slice(0, 500)
        : null;

    const [userRows] = await db.query(
      'SELECT id, driver_status, vehicle_type, vehicle_model, vehicle_plate FROM users WHERE id = ?',
      [targetUserId]
    );
    const targetUser = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as any) : null;

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'Student not found.' });
      return;
    }

    if (!targetUser.vehicle_type || !targetUser.vehicle_model || !targetUser.vehicle_plate) {
      res.status(400).json({
        success: false,
        message: 'Cannot approve driver: student has not submitted valid vehicle details.'
      });
      return;
    }

    await db.query("UPDATE users SET driver_status = 'approved' WHERE id = ?", [targetUserId]);

    try {
      await db.query(
        `UPDATE driver_applications
         SET status = 'approved', admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
         WHERE user_id = ? AND status = 'pending'`,
        [adminNote, req.user?.id || null, targetUserId]
      );
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    await createNotification({
      userId: targetUserId,
      type: 'driver_approved',
      title: 'Driver Application Approved',
      message: 'Congratulations! Your DIU student driver application is approved. You can now post rides.',
      link: '/rides/create'
    });

    res.status(200).json({
      success: true,
      message: 'Student driver application approved. Student can now post rides!'
    });
  } catch (error: any) {
    console.error('approveDriver error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve driver application.' });
  }
}

export async function rejectDriver(req: AuthRequest, res: Response): Promise<void> {
  try {
    const targetUserId = isPositiveIntId(req.params.id);
    if (!targetUserId) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    const adminNote =
      typeof req.body?.admin_note === 'string' && req.body.admin_note.trim()
        ? req.body.admin_note.trim().slice(0, 500)
        : null;

    const [userRows] = await db.query('SELECT id, driver_status FROM users WHERE id = ?', [targetUserId]);
    const targetUser = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as any) : null;

    if (!targetUser) {
      res.status(404).json({ success: false, message: 'Student not found.' });
      return;
    }

    if (targetUser.driver_status === 'none') {
      res.status(400).json({ success: false, message: 'Student has no driver application to reject.' });
      return;
    }

    await db.query("UPDATE users SET driver_status = 'rejected' WHERE id = ?", [targetUserId]);

    try {
      await db.query(
        `UPDATE driver_applications
         SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
         WHERE user_id = ? AND status = 'pending'`,
        [adminNote, req.user?.id || null, targetUserId]
      );
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    await createNotification({
      userId: targetUserId,
      type: 'driver_rejected',
      title: 'Driver Application Update',
      message: adminNote
        ? `Your driver application was declined: ${adminNote}`
        : 'Your driver application was declined by campus administration.',
      link: '/become-driver'
    });

    res.status(200).json({
      success: true,
      message: 'Student driver application rejected.'
    });
  } catch (error: any) {
    console.error('rejectDriver error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject driver application.' });
  }
}

export async function getAllRidesAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await db.query(
      `SELECT r.*,
              u.name AS driver_name, u.email AS driver_email, u.student_id AS driver_student_id,
              u.vehicle_model AS driver_vehicle_model, u.vehicle_plate AS driver_vehicle_plate,
              (SELECT COUNT(*) FROM ride_requests req WHERE req.ride_id = r.id AND req.status = 'pending') AS pending_requests_count,
              (SELECT COUNT(*) FROM ride_requests req WHERE req.ride_id = r.id AND req.status = 'accepted') AS accepted_requests_count
       FROM rides r
       JOIN users u ON r.driver_id = u.id
       ORDER BY r.departure_time DESC`
    );

    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const searchFilter = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    let rides = (rows as any[]).map((r) => ({
      ...r,
      departure_time: toUtcIsoString(r.departure_time)
    }));

    if (statusFilter) {
      rides = rides.filter((r) => r.status === statusFilter);
    }
    if (searchFilter) {
      rides = rides.filter(
        (r) =>
          String(r.pickup_name || '').toLowerCase().includes(searchFilter) ||
          String(r.dest_name || '').toLowerCase().includes(searchFilter) ||
          String(r.driver_name || '').toLowerCase().includes(searchFilter)
      );
    }

    res.status(200).json({ success: true, rides });
  } catch (error: any) {
    console.error('getAllRidesAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve all rides.' });
  }
}

export async function moderateRideAdmin(req: AuthRequest, res: Response): Promise<void> {
  const conn = await db.getConnection();
  try {
    const rideId = isPositiveIntId(req.params.id);
    if (!rideId) {
      res.status(400).json({ success: false, message: 'Invalid ride ID.' });
      return;
    }

    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 300)
        : 'Removed by campus transport administration for policy compliance.';

    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [rideId]);
    const ride = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!ride) {
      await conn.rollback();
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.status === 'cancelled' || ride.status === 'completed') {
      await conn.rollback();
      res.status(409).json({ success: false, message: `Ride is already ${ride.status}.` });
      return;
    }

    const [reqRows] = await conn.query(
      "SELECT DISTINCT passenger_id FROM ride_requests WHERE ride_id = ? AND status IN ('pending', 'accepted')",
      [rideId]
    );

    await conn.query("UPDATE rides SET status = 'cancelled' WHERE id = ?", [rideId]);
    await conn.query(
      "UPDATE ride_requests SET status = 'cancelled', updated_at = NOW() WHERE ride_id = ? AND status IN ('pending', 'accepted')",
      [rideId]
    );

    await conn.commit();

    await createNotification({
      userId: Number(ride.driver_id),
      type: 'ride_cancelled',
      title: 'Ride Cancelled by Admin',
      message: `Your ride (${ride.pickup_name} to ${ride.dest_name}) was cancelled by admin: ${reason}`,
      link: '/my-rides'
    });

    if (Array.isArray(reqRows)) {
      for (const p of reqRows as any[]) {
        await createNotification({
          userId: Number(p.passenger_id),
          type: 'ride_cancelled',
          title: 'Ride Cancelled by Admin',
          message: `Your booked ride (${ride.pickup_name} to ${ride.dest_name}) was cancelled by campus admin.`,
          link: '/requests'
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Ride cancelled and affected participants notified.'
    });
  } catch (error: any) {
    await conn.rollback();
    console.error('moderateRideAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to moderate ride.' });
  } finally {
    conn.release();
  }
}

export async function getAllBookingsAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await db.query(
      `SELECT req.id, req.ride_id, req.passenger_id, req.status, req.created_at, req.updated_at,
              pu.name AS passenger_name, pu.student_id AS passenger_student_id,
              r.pickup_name, r.dest_name, r.departure_time, r.fare, r.status AS ride_status,
              du.name AS driver_name
       FROM ride_requests req
       JOIN users pu ON req.passenger_id = pu.id
       JOIN rides r ON req.ride_id = r.id
       JOIN users du ON r.driver_id = du.id
       ORDER BY req.created_at DESC`
    );

    const bookings = (rows as any[]).map((b) => ({
      ...b,
      departure_time: b.departure_time ? toUtcIsoString(b.departure_time) : b.departure_time
    }));

    res.status(200).json({ success: true, bookings });
  } catch (error: any) {
    console.error('getAllBookingsAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve booking records.' });
  }
}

export async function getReportsAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    try {
      const [rows] = await db.query(
        `SELECT rp.id, rp.reporter_id, rp.reported_user_id, rp.ride_id, rp.reason, rp.description,
                rp.status, rp.admin_note, rp.reviewed_by, rp.created_at, rp.updated_at,
                ru.name AS reporter_name, ru.student_id AS reporter_student_id,
                tu.name AS reported_user_name, tu.student_id AS reported_student_id, tu.is_blocked AS reported_is_blocked
         FROM user_reports rp
         JOIN users ru ON rp.reporter_id = ru.id
         JOIN users tu ON rp.reported_user_id = tu.id
         ORDER BY rp.created_at DESC`
      );
      res.status(200).json({ success: true, reports: rows });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        res.status(200).json({ success: true, reports: [] });
        return;
      }
      throw err;
    }
  } catch (error: any) {
    console.error('getReportsAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve safety reports.' });
  }
}

export async function updateReportAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const reportId = isPositiveIntId(req.params.id);
    if (!reportId) {
      res.status(400).json({ success: false, message: 'Invalid report ID.' });
      return;
    }

    const { status, admin_note, block_user } = req.body ?? {};
    const allowedStatuses = ['pending', 'under_review', 'resolved', 'dismissed'];
    if (!allowedStatuses.includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid report status.' });
      return;
    }

    const [rows] = await db.query('SELECT id, reporter_id, reported_user_id FROM user_reports WHERE id = ?', [
      reportId
    ]);
    const report = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!report) {
      res.status(404).json({ success: false, message: 'Report not found.' });
      return;
    }

    const cleanNote =
      typeof admin_note === 'string' && admin_note.trim() ? admin_note.trim().slice(0, 500) : null;

    await db.query(
      'UPDATE user_reports SET status = ?, admin_note = ?, reviewed_by = ?, updated_at = NOW() WHERE id = ?',
      [status, cleanNote, req.user?.id || null, reportId]
    );

    if (block_user === true && Number(report.reported_user_id) !== req.user?.id) {
      const [targetRows] = await db.query('SELECT role FROM users WHERE id = ?', [report.reported_user_id]);
      const targetRole = Array.isArray(targetRows) && targetRows.length > 0 ? (targetRows[0] as any).role : 'student';
      if (targetRole !== 'admin') {
        await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [report.reported_user_id]);
      }
    }

    await createNotification({
      userId: Number(report.reporter_id),
      type: 'safety_report',
      title: 'Safety Report Updated',
      message: `Your submitted safety report status is now "${status.replace('_', ' ')}".`,
      link: '/safety'
    });

    res.status(200).json({
      success: true,
      message: `Report updated to ${status.replace('_', ' ')}.`
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Safety reports require Migration 002.' });
      return;
    }
    console.error('updateReportAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to update report.' });
  }
}
