import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db, type IDatabaseConnection } from '../config/db.ts';
import {
  isNonEmptyString,
  isPositiveIntId,
  isValidPhone,
  parsePaginationParams,
  sanitizePhone
} from '../utils/validators.ts';
import { createNotification } from '../services/notificationService.ts';

const ALLOWED_REPORT_REASONS = [
  'unsafe_driving',
  'harassment',
  'no_show',
  'fare_dispute',
  'fake_info',
  'other'
];

export async function getEmergencyContacts(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    try {
      const [rows] = await db.query(
        'SELECT id, user_id, name, relationship, phone, created_at FROM emergency_contacts WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id]
      );
      res.status(200).json({ success: true, contacts: rows });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        res.status(200).json({ success: true, contacts: [] });
        return;
      }
      throw err;
    }
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    console.error('getEmergencyContacts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch emergency contacts.' });
  }
}

export async function addEmergencyContact(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  const { name, relationship, phone } = req.body ?? {};
  if (!isNonEmptyString(name, 2, 100) || !isNonEmptyString(relationship, 2, 60) || !isNonEmptyString(phone, 8, 25)) {
    res.status(400).json({
      success: false,
      message: 'Name, relationship, and a valid phone number are required.'
    });
    return;
  }

  const cleanPhone = sanitizePhone(phone);
  if (!isValidPhone(cleanPhone)) {
    res.status(400).json({
      success: false,
      message: 'Please provide a valid 11-digit Bangladesh phone number.'
    });
    return;
  }

  const cleanName = name.trim();
  const cleanRelationship = relationship.trim();

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    console.error('addEmergencyContact connection error:', error);
    res.status(500).json({ success: false, message: 'Failed to save emergency contact.' });
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    // Lock parent user row so concurrent contact additions for the same student serialize safely in TiDB/MySQL
    const [userRows] = await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id]);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'User account not found.' });
      return;
    }

    const [existing] = await conn.query(
      'SELECT id FROM emergency_contacts WHERE user_id = ?',
      [req.user.id]
    );
    if (Array.isArray(existing) && existing.length >= 5) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({
        success: false,
        message: 'You can save up to 5 emergency contacts.'
      });
      return;
    }

    const [insertRes] = await conn.query(
      'INSERT INTO emergency_contacts (user_id, name, relationship, phone) VALUES (?, ?, ?, ?)',
      [req.user.id, cleanName, cleanRelationship, cleanPhone]
    );

    await conn.commit();
    txActive = false;

    res.status(201).json({
      success: true,
      message: 'Emergency contact saved.',
      contact: {
        id: (insertRes as any).insertId,
        user_id: req.user.id,
        name: cleanName,
        relationship: cleanRelationship,
        phone: cleanPhone
      }
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('addEmergencyContact rollback error:', rollbackErr);
      }
    }
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213) {
      res.status(409).json({
        success: false,
        message: 'Concurrent emergency contact update conflict. Please try again.'
      });
      return;
    }
    if (
      error?.code === 'ER_LOCK_WAIT_TIMEOUT' ||
      error?.errno === 1205 ||
      error?.isDatabaseUnavailable ||
      error?.status === 503
    ) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Emergency contacts require Migration 002.' });
      return;
    }
    console.error('addEmergencyContact error:', error);
    res.status(500).json({ success: false, message: 'Failed to save emergency contact.' });
  } finally {
    conn.release();
  }
}

export async function deleteEmergencyContact(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const contactId = isPositiveIntId(req.params.id);
    if (!contactId) {
      res.status(400).json({ success: false, message: 'Invalid contact ID.' });
      return;
    }

    const [rows] = await db.query('SELECT id, user_id FROM emergency_contacts WHERE id = ?', [contactId]);
    const contact = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!contact) {
      res.status(404).json({ success: false, message: 'Emergency contact not found.' });
      return;
    }
    if (Number(contact.user_id) !== req.user.id) {
      res.status(403).json({ success: false, message: 'Access denied.' });
      return;
    }

    await db.query('DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?', [contactId, req.user.id]);
    res.status(200).json({ success: true, message: 'Emergency contact removed.' });
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Emergency contacts require Migration 002.' });
      return;
    }
    console.error('deleteEmergencyContact error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete emergency contact.' });
  }
}

export async function submitUserReport(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const reportedUserId = isPositiveIntId(req.body?.reported_user_id);
    const rawRideId = req.body?.ride_id;
    const hasRideId = rawRideId !== undefined && rawRideId !== null && String(rawRideId).trim() !== '';
    const rideId = hasRideId ? isPositiveIntId(rawRideId) : null;
    const reason = req.body?.reason;
    const description = req.body?.description;

    if (!reportedUserId) {
      res.status(400).json({ success: false, message: 'Valid reported_user_id is required.' });
      return;
    }

    if (hasRideId && !rideId) {
      res.status(400).json({ success: false, message: 'Invalid ride_id.' });
      return;
    }

    if (reportedUserId === req.user.id) {
      res.status(400).json({ success: false, message: 'You cannot file a report against yourself.' });
      return;
    }

    if (typeof reason !== 'string' || !ALLOWED_REPORT_REASONS.includes(reason)) {
      res.status(400).json({ success: false, message: 'Please select a valid report reason.' });
      return;
    }

    if (!isNonEmptyString(description, 10, 1000)) {
      res.status(400).json({
        success: false,
        message: 'Please provide report details (10 to 1000 characters).'
      });
      return;
    }

    const [userRows] = await db.query('SELECT id FROM users WHERE id = ?', [reportedUserId]);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      res.status(404).json({ success: false, message: 'Reported user not found.' });
      return;
    }

    if (rideId) {
      const [rideRows] = await db.query('SELECT id FROM rides WHERE id = ?', [rideId]);
      if (!Array.isArray(rideRows) || rideRows.length === 0) {
        res.status(404).json({ success: false, message: 'Associated ride not found.' });
        return;
      }
    }

    const [insertRes] = await db.query(
      `INSERT INTO user_reports (reporter_id, reported_user_id, ride_id, reason, description, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, reportedUserId, rideId, reason, description.trim()]
    );

    // Notify active campus administrators
    const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_blocked = 0");
    if (Array.isArray(admins)) {
      for (const admin of admins as any[]) {
        await createNotification({
          userId: Number(admin.id),
          type: 'safety_report',
          title: 'New Campus Safety Report',
          message: `A student submitted a ${reason.replace('_', ' ')} report requiring admin review.`,
          link: '/admin/reports'
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Safety report submitted to DIU administration.',
      reportId: (insertRes as any).insertId
    });
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    if (error?.code === 'ER_NO_REFERENCED_ROW_2' || error?.code === 'ER_NO_REFERENCED_ROW') {
      res.status(400).json({ success: false, message: 'Referenced user or ride does not exist.' });
      return;
    }
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Safety reports require Migration 002.' });
      return;
    }
    console.error('submitUserReport error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit safety report.' });
  }
}

export async function getMyReports(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100
    });

    try {
      const [rows] = await db.query(
        `SELECT rp.id, rp.reporter_id, rp.reported_user_id, rp.ride_id, rp.reason, rp.description,
                rp.status, rp.admin_note, rp.created_at, rp.updated_at,
                u.name AS reported_user_name, u.student_id AS reported_student_id
         FROM user_reports rp
         JOIN users u ON rp.reported_user_id = u.id
         WHERE rp.reporter_id = ?
         ORDER BY rp.created_at DESC
         LIMIT ? OFFSET ?`,
        [req.user.id, limit + 1, offset]
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
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    console.error('getMyReports error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch submitted reports.' });
  }
}

export async function getBlockedUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100
    });

    try {
      const [rows] = await db.query(
        `SELECT ub.id, ub.blocked_id, ub.created_at, u.name AS blocked_name, u.student_id AS blocked_student_id
         FROM user_blocks ub
         JOIN users u ON ub.blocked_id = u.id
         WHERE ub.blocker_id = ?
         ORDER BY ub.created_at DESC
         LIMIT ? OFFSET ?`,
        [req.user.id, limit + 1, offset]
      );
      const rawList = (rows as any[]) || [];
      const hasMore = rawList.length > limit;
      const blocks = hasMore ? rawList.slice(0, limit) : rawList;

      res.status(200).json({
        success: true,
        blocks,
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
          blocks: [],
          pagination: { limit, offset, has_more: false }
        });
        return;
      }
      throw err;
    }
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    console.error('getBlockedUsers error:', error);
    res.status(500).json({ success: false, message: 'Failed to load blocked users.' });
  }
}

export async function blockUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const blockedId = isPositiveIntId(req.body?.blocked_id);
    if (!blockedId) {
      res.status(400).json({ success: false, message: 'Valid blocked_id is required.' });
      return;
    }

    if (blockedId === req.user.id) {
      res.status(400).json({ success: false, message: 'You cannot block yourself.' });
      return;
    }

    const [userRows] = await db.query('SELECT id, name FROM users WHERE id = ?', [blockedId]);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const [existing] = await db.query(
      'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
      [req.user.id, blockedId]
    );
    if (!Array.isArray(existing) || existing.length === 0) {
      try {
        await db.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)', [
          req.user.id,
          blockedId
        ]);
      } catch (insertErr: any) {
        if (insertErr?.code !== 'ER_DUP_ENTRY' && insertErr?.errno !== 1062) {
          throw insertErr;
        }
      }
    }

    res.status(200).json({
      success: true,
      message: `${(userRows[0] as any).name} has been blocked. They can no longer message you or join your rides.`
    });
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'User blocking requires Migration 002.' });
      return;
    }
    console.error('blockUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to block user.' });
  }
}

export async function unblockUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const blockedId = isPositiveIntId(req.params.blockedId);
    if (!blockedId) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    await db.query('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [
      req.user.id,
      blockedId
    ]);

    res.status(200).json({ success: true, message: 'User unblocked successfully.' });
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'User blocking requires Migration 002.' });
      return;
    }
    console.error('unblockUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to unblock user.' });
  }
}
