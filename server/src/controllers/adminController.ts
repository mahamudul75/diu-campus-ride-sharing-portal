import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db, type IDatabaseConnection } from '../config/db.ts';
import { isPositiveIntId, isTruthyDbFlag, parsePaginationParams } from '../utils/validators.ts';
import { toUtcIsoString } from '../utils/dateTime.ts';
import { getRideRequestCountsBatch } from '../utils/dbHelpers.ts';
import { createNotification, invalidateReminderCacheForUser } from '../services/notificationService.ts';
import { syncPassengerRequestOnRideCancelled } from './passengerRequestController.ts';

export async function getAdminStats(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const queryUserStats = async () => {
      try {
        const [rows] = await db.query(
          `SELECT
            COUNT(*) AS total_users,
            SUM(CASE WHEN driver_status = 'approved' THEN 1 ELSE 0 END) AS approved_drivers,
            SUM(CASE WHEN driver_status = 'pending' THEN 1 ELSE 0 END) AS pending_drivers,
            SUM(CASE WHEN student_verified = 1 THEN 1 ELSE 0 END) AS verified_students
           FROM users`
        );
        return Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : {};
      } catch (err: any) {
        if (err?.code === 'ER_BAD_FIELD_ERROR') {
          const [rows] = await db.query(
            `SELECT
              COUNT(*) AS total_users,
              SUM(CASE WHEN driver_status = 'approved' THEN 1 ELSE 0 END) AS approved_drivers,
              SUM(CASE WHEN driver_status = 'pending' THEN 1 ELSE 0 END) AS pending_drivers
             FROM users`
          );
          return Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : {};
        }
        throw err;
      }
    };

    const queryRideStats = async () => {
      const [rows] = await db.query(
        `SELECT
          COUNT(*) AS total_rides,
          SUM(CASE WHEN status IN ('open', 'scheduled', 'full', 'in_progress') THEN 1 ELSE 0 END) AS active_rides,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_rides,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_rides,
          SUM(CASE WHEN vehicle_type = 'bike' THEN 1 ELSE 0 END) AS bike_rides,
          SUM(CASE WHEN vehicle_type = 'car' THEN 1 ELSE 0 END) AS car_rides
         FROM rides`
      );
      return Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : {};
    };

    const queryRequestStats = async () => {
      const [rows] = await db.query(
        `SELECT
          COUNT(*) AS total_requests,
          SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_requests,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_requests,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_requests,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_requests
         FROM ride_requests`
      );
      return Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : {};
    };

    const queryReportStats = async () => {
      try {
        const [rows] = await db.query(
          `SELECT
            COUNT(*) AS total_reports,
            SUM(CASE WHEN status IN ('pending', 'under_review') THEN 1 ELSE 0 END) AS pending_reports
           FROM user_reports`
        );
        return Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : {};
      } catch (err: any) {
        if (err?.code === 'ER_NO_SUCH_TABLE') return {};
        throw err;
      }
    };

    const queryReviewStats = async () => {
      try {
        const [rows] = await db.query('SELECT COUNT(*) AS total_reviews FROM reviews');
        return Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : {};
      } catch (err: any) {
        if (err?.code === 'ER_NO_SUCH_TABLE') return {};
        throw err;
      }
    };

    const [uStats, rStats, qStats, repStats, revStats] = await Promise.all([
      queryUserStats(),
      queryRideStats(),
      queryRequestStats(),
      queryReportStats(),
      queryReviewStats()
    ]);

    const completedRides = Number(rStats.completed_rides || 0);
    const cancelledRides = Number(rStats.cancelled_rides || 0);
    const finishedRides = completedRides + cancelledRides;
    const completionRate = finishedRides > 0 ? Math.round((completedRides / finishedRides) * 100) : 0;

    res.status(200).json({
      success: true,
      stats: {
        total_users: Number(uStats.total_users || 0),
        approved_drivers: Number(uStats.approved_drivers || 0),
        pending_drivers: Number(uStats.pending_drivers || 0),
        total_rides: Number(rStats.total_rides || 0),
        total_requests: Number(qStats.total_requests || 0),
        active_rides: Number(rStats.active_rides || 0),
        completed_rides: completedRides,
        cancelled_rides: cancelledRides,
        bike_rides: Number(rStats.bike_rides || 0),
        car_rides: Number(rStats.car_rides || 0),
        accepted_requests: Number(qStats.accepted_requests || 0),
        pending_requests: Number(qStats.pending_requests || 0),
        rejected_requests: Number(qStats.rejected_requests || 0),
        cancelled_requests: Number(qStats.cancelled_requests || 0),
        pending_reports: Number(repStats.pending_reports || 0),
        total_reports: Number(repStats.total_reports || 0),
        verified_students: Number(uStats.verified_students || 0),
        total_reviews: Number(revStats.total_reviews || 0),
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
    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 100,
      maxLimit: 200
    });

    const whereParts: string[] = [];
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      const term = `%${search.trim().slice(0, 100)}%`;
      whereParts.push('(name LIKE ? OR email LIKE ? OR student_id LIKE ?)');
      params.push(term, term, term);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const queryParams = [...params, limit + 1, offset];

    let rawUsers: any[] = [];
    try {
      const [rows] = await db.query(
        `SELECT id, student_id, name, email, phone, role, driver_status,
                vehicle_type, vehicle_model, vehicle_plate, is_blocked, created_at,
                email_verified, student_verified, show_phone_to_accepted, bio
         FROM users
         ${whereClause}
         ORDER BY id ASC
         LIMIT ? OFFSET ?`,
        queryParams
      );
      rawUsers = (rows as any[]) || [];
    } catch (err: any) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
      const [rows] = await db.query(
        `SELECT id, student_id, name, email, phone, role, driver_status,
                vehicle_type, vehicle_model, vehicle_plate, is_blocked, created_at
         FROM users
         ${whereClause}
         ORDER BY id ASC
         LIMIT ? OFFSET ?`,
        queryParams
      );
      rawUsers = ((rows as any[]) || []).map((u) => ({
        ...u,
        email_verified: 0,
        student_verified: 0,
        show_phone_to_accepted: 1,
        bio: null
      }));
    }

    const hasMore = rawUsers.length > limit;
    const pagedUsers = hasMore ? rawUsers.slice(0, limit) : rawUsers;
    const sanitizedUsers = pagedUsers.map((u) => ({
      id: u.id,
      student_id: u.student_id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      driver_status: u.driver_status,
      vehicle_type: u.vehicle_type,
      vehicle_model: u.vehicle_model,
      vehicle_plate: u.vehicle_plate,
      is_blocked: u.is_blocked,
      created_at: u.created_at,
      email_verified: Number(u.email_verified || 0),
      student_verified: Number(u.student_verified || 0),
      avatar_url: null,
      show_phone_to_accepted:
        u.show_phone_to_accepted === undefined ? 1 : Number(u.show_phone_to_accepted),
      bio: u.bio || null
    }));

    res.status(200).json({
      success: true,
      users: sanitizedUsers,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
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

    const rawVerify = req.body?.student_verified;
    const nextState =
      rawVerify === false || rawVerify === 0 || rawVerify === '0' || rawVerify === 'false' ? 0 : 1;

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
      is_blocked !== undefined
        ? isTruthyDbFlag(is_blocked)
          ? 1
          : 0
        : isTruthyDbFlag(targetUser.is_blocked)
        ? 0
        : 1;

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
    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 100,
      maxLimit: 200
    });

    const [rows] = await db.query(
      `SELECT id, student_id, name, email, phone, role, driver_status, 
              vehicle_type, vehicle_model, vehicle_plate, created_at
       FROM users 
       WHERE driver_status = 'pending'
       ORDER BY created_at ASC
       LIMIT ? OFFSET ?`,
      [limit + 1, offset]
    );

    const rawList = (rows as any[]) || [];
    const hasMore = rawList.length > limit;
    const drivers = hasMore ? rawList.slice(0, limit) : rawList;

    res.status(200).json({
      success: true,
      drivers,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
    });
  } catch (error: any) {
    console.error('getPendingDrivers error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve pending drivers.' });
  }
}

export async function approveDriver(req: AuthRequest, res: Response): Promise<void> {
  const targetUserId = isPositiveIntId(req.params.id);
  if (!targetUserId) {
    res.status(400).json({ success: false, message: 'Invalid user ID.' });
    return;
  }

  const adminNote =
    typeof req.body?.admin_note === 'string' && req.body.admin_note.trim()
      ? req.body.admin_note.trim().slice(0, 500)
      : null;

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({
        success: false,
        message: error.message || 'Database service is temporarily unavailable.'
      });
      return;
    }
    console.error('approveDriver connection error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve driver application.' });
    return;
  }

  let txActive = false;
  let committed = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [userRows] = await conn.query(
      'SELECT id, driver_status, vehicle_type, vehicle_model, vehicle_plate FROM users WHERE id = ? FOR UPDATE',
      [targetUserId]
    );
    const targetUser = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as any) : null;

    if (!targetUser) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Student not found.' });
      return;
    }

    if (targetUser.driver_status === 'approved') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'Student is already an approved driver.'
      });
      return;
    }

    if (targetUser.driver_status !== 'pending') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'Only pending driver applications can be approved.'
      });
      return;
    }

    if (!targetUser.vehicle_type || !targetUser.vehicle_model || !targetUser.vehicle_plate) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({
        success: false,
        message: 'Cannot approve driver: student has not submitted valid vehicle details.'
      });
      return;
    }

    await conn.query("UPDATE users SET driver_status = 'approved' WHERE id = ?", [targetUserId]);

    try {
      await conn.query(
        `UPDATE driver_applications
         SET status = 'approved', admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
         WHERE user_id = ? AND status = 'pending'`,
        [adminNote, req.user?.id || null, targetUserId]
      );
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    await conn.commit();
    txActive = false;
    committed = true;
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('approveDriver rollback error:', rollbackErr);
      }
    }
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213) {
      res.status(409).json({
        success: false,
        message: 'Concurrent driver review conflict. Please try again.'
      });
      return;
    }
    if (
      error?.code === 'ER_LOCK_WAIT_TIMEOUT' ||
      error?.errno === 1205 ||
      error?.isDatabaseUnavailable ||
      error?.status === 503
    ) {
      res.status(503).json({
        success: false,
        message: 'Database busy or unavailable. Please try again shortly.'
      });
      return;
    }
    console.error('approveDriver error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve driver application.' });
    return;
  } finally {
    conn.release();
  }

  if (committed) {
    await createNotification({
      userId: targetUserId,
      type: 'driver_approved',
      title: 'Driver Application Approved',
      message: 'Congratulations! Your DIU student driver application is approved. You can now post rides.',
      link: '/rides/create'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Student driver application approved. Student can now post rides!'
  });
}

export async function rejectDriver(req: AuthRequest, res: Response): Promise<void> {
  const targetUserId = isPositiveIntId(req.params.id);
  if (!targetUserId) {
    res.status(400).json({ success: false, message: 'Invalid user ID.' });
    return;
  }

  const adminNote =
    typeof req.body?.admin_note === 'string' && req.body.admin_note.trim()
      ? req.body.admin_note.trim().slice(0, 500)
      : null;

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({
        success: false,
        message: error.message || 'Database service is temporarily unavailable.'
      });
      return;
    }
    console.error('rejectDriver connection error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject driver application.' });
    return;
  }

  let txActive = false;
  let committed = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [userRows] = await conn.query('SELECT id, driver_status FROM users WHERE id = ? FOR UPDATE', [
      targetUserId
    ]);
    const targetUser = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as any) : null;

    if (!targetUser) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Student not found.' });
      return;
    }

    if (targetUser.driver_status === 'none') {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'Student has no driver application to reject.' });
      return;
    }

    if (targetUser.driver_status === 'approved') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Cannot reject an already approved driver.' });
      return;
    }

    if (targetUser.driver_status === 'rejected') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Driver application is already rejected.' });
      return;
    }

    await conn.query("UPDATE users SET driver_status = 'rejected' WHERE id = ?", [targetUserId]);

    try {
      await conn.query(
        `UPDATE driver_applications
         SET status = 'rejected', admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
         WHERE user_id = ? AND status = 'pending'`,
        [adminNote, req.user?.id || null, targetUserId]
      );
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    await conn.commit();
    txActive = false;
    committed = true;
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('rejectDriver rollback error:', rollbackErr);
      }
    }
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213) {
      res.status(409).json({
        success: false,
        message: 'Concurrent driver review conflict. Please try again.'
      });
      return;
    }
    if (
      error?.code === 'ER_LOCK_WAIT_TIMEOUT' ||
      error?.errno === 1205 ||
      error?.isDatabaseUnavailable ||
      error?.status === 503
    ) {
      res.status(503).json({
        success: false,
        message: 'Database busy or unavailable. Please try again shortly.'
      });
      return;
    }
    console.error('rejectDriver error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject driver application.' });
    return;
  } finally {
    conn.release();
  }

  if (committed) {
    await createNotification({
      userId: targetUserId,
      type: 'driver_rejected',
      title: 'Driver Application Update',
      message: adminNote
        ? `Your driver application was declined: ${adminNote}`
        : 'Your driver application was declined by campus administration.',
      link: '/become-driver'
    });
  }

  res.status(200).json({
    success: true,
    message: 'Student driver application rejected.'
  });
}

export async function getAllRidesAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 100,
      maxLimit: 200
    });

    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const searchFilter = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const whereParts: string[] = [];
    const params: any[] = [];

    if (statusFilter) {
      whereParts.push('r.status = ?');
      params.push(statusFilter);
    }

    if (searchFilter) {
      const term = `%${searchFilter.slice(0, 100)}%`;
      whereParts.push('(r.pickup_name LIKE ? OR r.dest_name LIKE ? OR u.name LIKE ?)');
      params.push(term, term, term);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    params.push(limit + 1, offset);

    const [rows] = await db.query(
      `SELECT r.*,
              u.name AS driver_name, u.email AS driver_email, u.student_id AS driver_student_id,
              u.vehicle_model AS driver_vehicle_model, u.vehicle_plate AS driver_vehicle_plate
       FROM rides r
       JOIN users u ON r.driver_id = u.id
       ${whereClause}
       ORDER BY r.departure_time DESC
       LIMIT ? OFFSET ?`,
      params
    );

    const rawList = (rows as any[]) || [];
    const hasMore = rawList.length > limit;
    const pagedRides = hasMore ? rawList.slice(0, limit) : rawList;
    const rideIds = pagedRides.map((r) => Number(r.id));
    const countsMap = await getRideRequestCountsBatch(rideIds);

    const rides = pagedRides.map((r) => {
      const counts = countsMap.get(Number(r.id)) || {
        pending_requests_count: 0,
        accepted_requests_count: 0
      };
      return {
        ...r,
        pending_requests_count: counts.pending_requests_count,
        accepted_requests_count: counts.accepted_requests_count,
        departure_time: toUtcIsoString(r.departure_time)
      };
    });

    res.status(200).json({
      success: true,
      rides,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
    });
  } catch (error: any) {
    console.error('getAllRidesAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve all rides.' });
  }
}

export async function moderateRideAdmin(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  const rideId = isPositiveIntId(req.params.id);
  if (!rideId) {
    res.status(400).json({ success: false, message: 'Invalid ride ID.' });
    return;
  }

  const reason =
    typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim().slice(0, 300)
      : 'Removed by campus transport administration for policy compliance.';

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    console.error('moderateRideAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to moderate ride.' });
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [rows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [rideId]);
    const ride = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!ride) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.status === 'cancelled' || ride.status === 'completed') {
      await conn.rollback();
      txActive = false;
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
    await syncPassengerRequestOnRideCancelled(conn, rideId);

    await conn.commit();
    txActive = false;
    invalidateReminderCacheForUser();

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
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('moderateRideAdmin rollback error:', rollbackErr);
      }
    }
    console.error('moderateRideAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to moderate ride.' });
  } finally {
    conn.release();
  }
}

export async function getAllBookingsAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 100,
      maxLimit: 200
    });

    const [rows] = await db.query(
      `SELECT req.id, req.ride_id, req.passenger_id, req.status, req.created_at, req.updated_at,
              pu.name AS passenger_name, pu.student_id AS passenger_student_id,
              r.pickup_name, r.dest_name, r.departure_time, r.fare, r.status AS ride_status,
              du.name AS driver_name
       FROM ride_requests req
       JOIN users pu ON req.passenger_id = pu.id
       JOIN rides r ON req.ride_id = r.id
       JOIN users du ON r.driver_id = du.id
       ORDER BY req.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit + 1, offset]
    );

    const rawList = (rows as any[]) || [];
    const hasMore = rawList.length > limit;
    const pagedBookings = hasMore ? rawList.slice(0, limit) : rawList;

    const bookings = pagedBookings.map((b) => ({
      ...b,
      departure_time: b.departure_time ? toUtcIsoString(b.departure_time) : b.departure_time
    }));

    res.status(200).json({
      success: true,
      bookings,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
    });
  } catch (error: any) {
    console.error('getAllBookingsAdmin error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve booking records.' });
  }
}

export async function getReportsAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 100,
      maxLimit: 200
    });
    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const allowedStatuses = ['pending', 'under_review', 'resolved', 'dismissed'];
    const statusFilter = allowedStatuses.includes(rawStatus) ? rawStatus : '';

    const whereClause = statusFilter ? 'WHERE rp.status = ?' : '';
    const params: any[] = statusFilter ? [statusFilter, limit + 1, offset] : [limit + 1, offset];

    try {
      const [rows] = await db.query(
        `SELECT rp.id, rp.reporter_id, rp.reported_user_id, rp.ride_id, rp.reason, rp.description,
                rp.status, rp.admin_note, rp.reviewed_by, rp.created_at, rp.updated_at,
                ru.name AS reporter_name, ru.student_id AS reporter_student_id,
                tu.name AS reported_user_name, tu.student_id AS reported_student_id, tu.is_blocked AS reported_is_blocked
         FROM user_reports rp
         JOIN users ru ON rp.reporter_id = ru.id
         JOIN users tu ON rp.reported_user_id = tu.id
         ${whereClause}
         ORDER BY rp.created_at DESC
         LIMIT ? OFFSET ?`,
        params
      );
      const rawList = (rows as any[]) || [];
      const hasMore = rawList.length > limit;
      const reports = hasMore ? rawList.slice(0, limit) : rawList;

      res.status(200).json({
        success: true,
        reports,
        pagination: {
          limit,
          offset,
          has_more: hasMore
        }
      });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        res.status(200).json({
          success: true,
          reports: [],
          pagination: { limit, offset, has_more: false }
        });
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
