import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isNonEmptyString, isPositiveIntId, isValidPhone, sanitizePhone } from '../utils/validators.ts';
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
    console.error('getEmergencyContacts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch emergency contacts.' });
  }
}

export async function addEmergencyContact(req: AuthRequest, res: Response): Promise<void> {
  try {
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

    const [existing] = await db.query(
      'SELECT id FROM emergency_contacts WHERE user_id = ?',
      [req.user.id]
    );
    if (Array.isArray(existing) && existing.length >= 5) {
      res.status(400).json({
        success: false,
        message: 'You can save up to 5 emergency contacts.'
      });
      return;
    }

    const [insertRes] = await db.query(
      'INSERT INTO emergency_contacts (user_id, name, relationship, phone) VALUES (?, ?, ?, ?)',
      [req.user.id, name.trim(), relationship.trim(), cleanPhone]
    );

    res.status(201).json({
      success: true,
      message: 'Emergency contact saved.',
      contact: {
        id: (insertRes as any).insertId,
        user_id: req.user.id,
        name: name.trim(),
        relationship: relationship.trim(),
        phone: cleanPhone
      }
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Emergency contacts require Migration 002.' });
      return;
    }
    console.error('addEmergencyContact error:', error);
    res.status(500).json({ success: false, message: 'Failed to save emergency contact.' });
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
    const rideId = req.body?.ride_id ? isPositiveIntId(req.body.ride_id) : null;
    const reason = req.body?.reason;
    const description = req.body?.description;

    if (!reportedUserId) {
      res.status(400).json({ success: false, message: 'Valid reported_user_id is required.' });
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

    try {
      const [rows] = await db.query(
        `SELECT rp.id, rp.reporter_id, rp.reported_user_id, rp.ride_id, rp.reason, rp.description,
                rp.status, rp.admin_note, rp.created_at, rp.updated_at,
                u.name AS reported_user_name, u.student_id AS reported_student_id
         FROM user_reports rp
         JOIN users u ON rp.reported_user_id = u.id
         WHERE rp.reporter_id = ?
         ORDER BY rp.created_at DESC`,
        [req.user.id]
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

    try {
      const [rows] = await db.query(
        `SELECT ub.id, ub.blocked_id, ub.created_at, u.name AS blocked_name, u.student_id AS blocked_student_id
         FROM user_blocks ub
         JOIN users u ON ub.blocked_id = u.id
         WHERE ub.blocker_id = ?
         ORDER BY ub.created_at DESC`,
        [req.user.id]
      );
      res.status(200).json({ success: true, blocks: rows });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        res.status(200).json({ success: true, blocks: [] });
        return;
      }
      throw err;
    }
  } catch (error: any) {
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
      await db.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)', [
        req.user.id,
        blockedId
      ]);
    }

    res.status(200).json({
      success: true,
      message: `${(userRows[0] as any).name} has been blocked. They can no longer message you or join your rides.`
    });
  } catch (error: any) {
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
    console.error('unblockUser error:', error);
    res.status(500).json({ success: false, message: 'Failed to unblock user.' });
  }
}
