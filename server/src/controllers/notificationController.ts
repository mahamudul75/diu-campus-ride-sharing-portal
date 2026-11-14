import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isPositiveIntId } from '../utils/validators.ts';
import { ensureUpcomingRideRemindersForUser } from '../services/notificationService.ts';

export async function getMyNotifications(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    await ensureUpcomingRideRemindersForUser(req.user.id);

    try {
      const [rows] = await db.query(
        `SELECT id, user_id, type, title, message, link, is_read, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [req.user.id]
      );
      const list = (rows as any[]) || [];
      const unreadCount = list.filter((n) => !n.is_read).length;

      res.status(200).json({
        success: true,
        unread_count: unreadCount,
        notifications: list
      });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        res.status(200).json({ success: true, unread_count: 0, notifications: [] });
        return;
      }
      throw err;
    }
  } catch (error: any) {
    console.error('getMyNotifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to load notifications.' });
  }
}

export async function markNotificationRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const notificationId = isPositiveIntId(req.params.id);
    if (!notificationId) {
      res.status(400).json({ success: false, message: 'Invalid notification ID.' });
      return;
    }

    const [rows] = await db.query('SELECT id, user_id FROM notifications WHERE id = ?', [notificationId]);
    const notif = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!notif) {
      res.status(404).json({ success: false, message: 'Notification not found.' });
      return;
    }
    if (Number(notif.user_id) !== req.user.id) {
      res.status(403).json({ success: false, message: 'Access denied.' });
      return;
    }

    await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [
      notificationId,
      req.user.id
    ]);

    res.status(200).json({ success: true, message: 'Notification marked as read.' });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Notifications table requires Migration 002.' });
      return;
    }
    console.error('markNotificationRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification.' });
  }
}

export async function markAllNotificationsRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    try {
      await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (error: any) {
    console.error('markAllNotificationsRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notifications as read.' });
  }
}

export async function deleteNotification(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const notificationId = isPositiveIntId(req.params.id);
    if (!notificationId) {
      res.status(400).json({ success: false, message: 'Invalid notification ID.' });
      return;
    }

    const [rows] = await db.query('SELECT id, user_id FROM notifications WHERE id = ?', [notificationId]);
    const notif = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!notif) {
      res.status(404).json({ success: false, message: 'Notification not found.' });
      return;
    }
    if (Number(notif.user_id) !== req.user.id) {
      res.status(403).json({ success: false, message: 'Access denied.' });
      return;
    }

    await db.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [notificationId, req.user.id]);
    res.status(200).json({ success: true, message: 'Notification removed.' });
  } catch (error: any) {
    console.error('deleteNotification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
}
