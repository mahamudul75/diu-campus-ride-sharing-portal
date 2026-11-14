import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isNonEmptyString, isPositiveIntId } from '../utils/validators.ts';
import { areUsersBlocked, getUserExtendedFields } from '../utils/dbHelpers.ts';
import { toUtcIsoString } from '../utils/dateTime.ts';
import { pushToUsers } from '../realtime/wsServer.ts';
import { createNotification } from '../services/notificationService.ts';

function sanitizeChatMessage(raw: string): string {
  // Strip ASCII control characters except newline/tab; React renders strictly as plain text
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

export async function getConversations(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    try {
      const [rows] = await db.query(
        `SELECT c.id, c.ride_id, c.driver_id, c.passenger_id, c.created_at, c.updated_at,
                r.pickup_name, r.dest_name, r.departure_time, r.status AS ride_status,
                du.name AS driver_name, pu.name AS passenger_name
         FROM conversations c
         JOIN rides r ON c.ride_id = r.id
         JOIN users du ON c.driver_id = du.id
         JOIN users pu ON c.passenger_id = pu.id
         WHERE c.driver_id = ? OR c.passenger_id = ?
         ORDER BY c.updated_at DESC`,
        [req.user.id, req.user.id]
      );

      const list = (rows as any[]) || [];
      const enriched = await Promise.all(
        list.map(async (c) => {
          const isDriver = Number(c.driver_id) === req.user!.id;
          const peerId = isDriver ? Number(c.passenger_id) : Number(c.driver_id);
          const peerName = isDriver ? c.passenger_name : c.driver_name;
          const peerExt = await getUserExtendedFields(peerId);
          const blocked = await areUsersBlocked(req.user!.id, peerId);

          const [msgRows] = await db.query(
            `SELECT id, sender_id, content, is_read, created_at
             FROM messages
             WHERE conversation_id = ?
             ORDER BY created_at DESC`,
            [c.id]
          );
          const messages = (msgRows as any[]) || [];
          const lastMsg = messages.length > 0 ? messages[0] : null;
          const unreadCount = messages.filter(
            (m) => Number(m.sender_id) !== req.user!.id && !m.is_read
          ).length;

          return {
            id: c.id,
            ride_id: c.ride_id,
            driver_id: c.driver_id,
            passenger_id: c.passenger_id,
            pickup_name: c.pickup_name,
            dest_name: c.dest_name,
            departure_time: c.departure_time ? toUtcIsoString(c.departure_time) : c.departure_time,
            ride_status: c.ride_status,
            peer_id: peerId,
            peer_name: peerName,
            peer_avatar_url: peerExt.avatar_url,
            peer_student_verified: peerExt.student_verified,
            last_message: lastMsg ? lastMsg.content : null,
            last_message_at: lastMsg ? lastMsg.created_at : c.updated_at,
            unread_count: unreadCount,
            is_blocked_pair: blocked
          };
        })
      );

      res.status(200).json({ success: true, conversations: enriched });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        res.status(200).json({ success: true, conversations: [] });
        return;
      }
      throw err;
    }
  } catch (error: any) {
    console.error('getConversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to load conversations.' });
  }
}

export async function getOrCreateConversation(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const rideId = isPositiveIntId(req.body?.ride_id);
    if (!rideId) {
      res.status(400).json({ success: false, message: 'Valid ride_id is required.' });
      return;
    }

    const [rideRows] = await db.query('SELECT id, driver_id, status FROM rides WHERE id = ?', [rideId]);
    const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;
    if (!ride) {
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    const driverId = Number(ride.driver_id);
    let passengerId: number | null = null;

    if (req.user.id === driverId) {
      passengerId = isPositiveIntId(req.body?.passenger_id);
      if (!passengerId || passengerId === driverId) {
        res.status(400).json({ success: false, message: 'Valid passenger_id is required to message a passenger.' });
        return;
      }
    } else {
      passengerId = req.user.id;
    }

    // Verify passenger has an eligible booking request (pending or accepted; or accepted for completed ride)
    const [reqRows] = await db.query(
      'SELECT id, status FROM ride_requests WHERE ride_id = ? AND passenger_id = ?',
      [rideId, passengerId]
    );
    const rideReq = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!rideReq || rideReq.status === 'rejected' || rideReq.status === 'cancelled') {
      res.status(403).json({
        success: false,
        message: 'Chat is available only between drivers and passengers with an active or accepted booking.'
      });
      return;
    }

    if (await areUsersBlocked(driverId, passengerId)) {
      res.status(403).json({
        success: false,
        message: 'Messaging is unavailable because one of the users has blocked the other.'
      });
      return;
    }

    const [existingConv] = await db.query(
      'SELECT id, ride_id, driver_id, passenger_id, created_at, updated_at FROM conversations WHERE ride_id = ? AND passenger_id = ?',
      [rideId, passengerId]
    );

    if (Array.isArray(existingConv) && existingConv.length > 0) {
      res.status(200).json({ success: true, conversation: existingConv[0] });
      return;
    }

    const [insertRes] = await db.query(
      'INSERT INTO conversations (ride_id, driver_id, passenger_id) VALUES (?, ?, ?)',
      [rideId, driverId, passengerId]
    );

    const newId = (insertRes as any).insertId;
    res.status(201).json({
      success: true,
      conversation: {
        id: newId,
        ride_id: rideId,
        driver_id: driverId,
        passenger_id: passengerId
      }
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Chat tables require Migration 002.' });
      return;
    }
    console.error('getOrCreateConversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to open conversation.' });
  }
}

export async function getConversationMessages(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const convId = isPositiveIntId(req.params.id);
    if (!convId) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
      return;
    }

    const [convRows] = await db.query(
      'SELECT id, ride_id, driver_id, passenger_id FROM conversations WHERE id = ?',
      [convId]
    );
    const conv = Array.isArray(convRows) && convRows.length > 0 ? (convRows[0] as any) : null;
    if (!conv) {
      res.status(404).json({ success: false, message: 'Conversation not found.' });
      return;
    }

    if (Number(conv.driver_id) !== req.user.id && Number(conv.passenger_id) !== req.user.id) {
      res.status(403).json({ success: false, message: 'Access denied: You are not a participant in this conversation.' });
      return;
    }

    // Mark unread incoming messages as read
    await db.query(
      'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
      [convId, req.user.id]
    );

    const [msgRows] = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.is_read, m.created_at,
              u.name AS sender_name
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at ASC`,
      [convId]
    );

    const peerId = Number(conv.driver_id) === req.user.id ? Number(conv.passenger_id) : Number(conv.driver_id);
    const blocked = await areUsersBlocked(req.user.id, peerId);

    res.status(200).json({
      success: true,
      conversation: conv,
      is_blocked_pair: blocked,
      messages: msgRows
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Chat tables require Migration 002.' });
      return;
    }
    console.error('getConversationMessages error:', error);
    res.status(500).json({ success: false, message: 'Failed to load messages.' });
  }
}

export async function sendMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const convId = isPositiveIntId(req.params.id);
    if (!convId) {
      res.status(400).json({ success: false, message: 'Invalid conversation ID.' });
      return;
    }

    if (!isNonEmptyString(req.body?.content, 1, 1000)) {
      res.status(400).json({ success: false, message: 'Message content must be 1 to 1000 characters.' });
      return;
    }

    const cleanContent = sanitizeChatMessage(req.body.content);
    if (!cleanContent) {
      res.status(400).json({ success: false, message: 'Message cannot be empty.' });
      return;
    }

    const [convRows] = await db.query(
      'SELECT id, ride_id, driver_id, passenger_id FROM conversations WHERE id = ?',
      [convId]
    );
    const conv = Array.isArray(convRows) && convRows.length > 0 ? (convRows[0] as any) : null;
    if (!conv) {
      res.status(404).json({ success: false, message: 'Conversation not found.' });
      return;
    }

    if (Number(conv.driver_id) !== req.user.id && Number(conv.passenger_id) !== req.user.id) {
      res.status(403).json({ success: false, message: 'Access denied: You are not a participant in this conversation.' });
      return;
    }

    const peerId = Number(conv.driver_id) === req.user.id ? Number(conv.passenger_id) : Number(conv.driver_id);
    if (await areUsersBlocked(req.user.id, peerId)) {
      res.status(403).json({
        success: false,
        message: 'Cannot send message because one of the users has blocked the other.'
      });
      return;
    }

    const [insertRes] = await db.query(
      'INSERT INTO messages (conversation_id, sender_id, content, is_read) VALUES (?, ?, ?, 0)',
      [convId, req.user.id, cleanContent]
    );
    await db.query('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [convId]);

    const msgId = (insertRes as any).insertId;
    const messagePayload = {
      id: msgId,
      conversation_id: convId,
      sender_id: req.user.id,
      sender_name: req.user.name,
      content: cleanContent,
      is_read: 0,
      created_at: new Date().toISOString()
    };

    pushToUsers([Number(conv.driver_id), Number(conv.passenger_id)], {
      event: 'chat:message',
      conversationId: convId,
      message: messagePayload
    });

    await createNotification({
      userId: peerId,
      type: 'new_message',
      title: `New message from ${req.user.name}`,
      message: cleanContent.length > 90 ? `${cleanContent.slice(0, 87)}...` : cleanContent,
      link: `/messages?conversation=${convId}`
    });

    res.status(201).json({
      success: true,
      message: messagePayload
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Chat tables require Migration 002.' });
      return;
    }
    console.error('sendMessage error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message.' });
  }
}
