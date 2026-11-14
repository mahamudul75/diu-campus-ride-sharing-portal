import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isPositiveIntId } from '../utils/validators.ts';

export async function getAdminStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [userRows] = await db.query(
      `SELECT 
        COUNT(*) AS total_users,
        SUM(CASE WHEN driver_status = 'approved' THEN 1 ELSE 0 END) AS approved_drivers,
        SUM(CASE WHEN driver_status = 'pending' THEN 1 ELSE 0 END) AS pending_drivers
       FROM users`
    );

    const [rideRows] = await db.query('SELECT COUNT(*) AS total_rides FROM rides');
    const [requestRows] = await db.query('SELECT COUNT(*) AS total_requests FROM ride_requests');

    const uStats = Array.isArray(userRows) && userRows.length > 0 ? (userRows[0] as any) : {};
    const rStats = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : {};
    const qStats = Array.isArray(requestRows) && requestRows.length > 0 ? (requestRows[0] as any) : {};

    res.status(200).json({
      success: true,
      stats: {
        total_users: Number(uStats.total_users || 0),
        approved_drivers: Number(uStats.approved_drivers || 0),
        pending_drivers: Number(uStats.pending_drivers || 0),
        total_rides: Number(rStats.total_rides || 0),
        total_requests: Number(qStats.total_requests || 0)
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

    res.status(200).json({
      success: true,
      users: rows
    });
  } catch (error: any) {
    console.error('getUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
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

    // Safety rule: Prevent blocking oneself or the last admin
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

    // Prevent deleting oneself
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

    res.status(200).json({
      success: true,
      message: 'Student driver application rejected.'
    });
  } catch (error: any) {
    console.error('rejectDriver error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject driver application.' });
  }
}
