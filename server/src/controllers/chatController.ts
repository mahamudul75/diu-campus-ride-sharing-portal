import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isNonEmptyString, isPositiveIntId, parsePaginationParams } from '../utils/validators.ts';
import {
  areUsersBlocked,
  getBlockedUserIds,
  getUserExtendedFieldsBatch
} from '../utils/dbHelpers.ts';
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

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100
    });

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
         ORDER BY c.updated_at DESC
         LIMIT ? OFFSET ?`,
        [req.user.id, req.user.id, limit + 1, offset]
      );

      const rawList = (rows as any[]) || [];
      const hasMore = rawList.length > limit;
      const list = hasMore ? rawList.slice(0, limit) : rawList;

      if (list.length === 0) {
        res.status(200).json({
          success: true,
          conversations: [],
          pagination: { limit, offset, has_more: false }
        });
        return;
      }

      const convIds = list.map((c) => Number(c.id));
      const peerIds = list.map((c) =>
        Number(c.driver_id) === req.user!.id ? Number(c.passenger_id) : Number(c.driver_id)
      );
      const convPlaceholders = convIds.map(() => '?').join(', ');

      const [peerExtMap, blockedSet, unreadResult, latestResult] = await Promise.all([
        getUserExtendedFieldsBatch(peerIds, { includeAvatar: true }),
        getBlockedUserIds(req.user.id),
        db.query(
          `SELECT conversation_id, COUNT(*) AS unread_count
           FROM messages
           WHERE conversation_id IN (${convPlaceholders}) AND sender_id != ? AND is_read = 0
           GROUP BY conversation_id`,
          [...convIds, req.user.id]
        ),
        db.query(
          `SELECT m.conversation_id, m.content, m.created_at
           FROM messages m
           INNER JOIN (
             SELECT m1.conversation_id, m1.created_at, MAX(m1.id) AS max_id
             FROM messages m1
             INNER JOIN (
               SELECT conversation_id, MAX(created_at) AS max_created_at
               FROM messages
               WHERE conversation_id IN (${convPlaceholders})
               GROUP BY conversation_id
             ) latest_ts
               ON m1.conversation_id = latest_ts.conversation_id
              AND m1.created_at = latest_ts.max_created_at
             GROUP BY m1.conversation_id, m1.created_at
           ) latest ON m.id = latest.max_id`,
          convIds
        )
      ]);

      const unreadMap = new Map<number, number>();
      const unreadRows = Array.isArray(unreadResult[0]) ? (unreadResult[0] as any[]) : [];
      for (const row of unreadRows) {
        unreadMap.set(Number(row.conversation_id), Number(row.unread_count || 0));
      }

      const latestMsgMap = new Map<number, { content: string; created_at: string }>();
      const latestRows = Array.isArray(latestResult[0]) ? (latestResult[0] as any[]) : [];
      for (const row of latestRows) {
        latestMsgMap.set(Number(row.conversation_id), {
          content: row.content,
          created_at: row.created_at
        });
      }

      const enriched = list.map((c) => {
        const isDriver = Number(c.driver_id) === req.user!.id;
        const peerId = isDriver ? Number(c.passenger_id) : Number(c.driver_id);
        const peerName = isDriver ? c.passenger_name : c.driver_name;
        const peerExt = peerExtMap.get(peerId);
        const lastMsg = latestMsgMap.get(Number(c.id)) || null;

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
          peer_avatar_url: peerExt?.avatar_url ?? null,
          peer_student_verified: peerExt?.student_verified ?? 0,
          last_message: lastMsg ? lastMsg.content : null,
          last_message_at: lastMsg ? lastMsg.created_at : c.updated_at,
          unread_count: unreadMap.get(Number(c.id)) ?? 0,
          is_blocked_pair: blockedSet.has(peerId)
        };
      });

      res.status(200).json({
        success: true,
        conversations: enriched,
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
          conversations: [],
          pagination: { limit, offset, has_more: false }
        });
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

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 100,
      maxLimit: 200
    });
    const beforeId = isPositiveIntId(req.query?.before_id);

    // Mark unread incoming messages as read
    await db.query(
      'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
      [convId, req.user.id]
    );

    const peerId = Number(conv.driver_id) === req.user.id ? Number(conv.passenger_id) : Number(conv.driver_id);

    const msgQueryParams: any[] = [convId];
    let beforeClause = '';
    if (beforeId) {
      const [anchorRows] = await db.query(
        'SELECT id, created_at FROM messages WHERE id = ? AND conversation_id = ?',
        [beforeId, convId]
      );
      const anchor = Array.isArray(anchorRows) && anchorRows.length > 0 ? (anchorRows[0] as any) : null;
      if (!anchor) {
        const blocked = await areUsersBlocked(req.user.id, peerId);
        res.status(200).json({
          success: true,
          conversation: conv,
          is_blocked_pair: blocked,
          messages: [],
          pagination: {
            limit,
            offset,
            has_more: false
          }
        });
        return;
      }
      beforeClause = ' AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))';
      msgQueryParams.push(anchor.created_at, anchor.created_at, anchor.id);
    }
    msgQueryParams.push(limit + 1, offset);

    const [[msgRows], blocked] = await Promise.all([
      db.query(
        `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.is_read, m.created_at,
                u.name AS sender_name
         FROM messages m
         JOIN users u ON m.sender_id = u.id
         WHERE m.conversation_id = ?${beforeClause}
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT ? OFFSET ?`,
        msgQueryParams
      ),
      areUsersBlocked(req.user.id, peerId)
    ]);

    const rawMsgs = (msgRows as any[]) || [];
    const hasMore = rawMsgs.length > limit;
    const pagedMsgs = (hasMore ? rawMsgs.slice(0, limit) : rawMsgs).slice().reverse();

    res.status(200).json({
      success: true,
      conversation: conv,
      is_blocked_pair: blocked,
      messages: pagedMsgs,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
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

export async function markConversationMessagesRead(req: AuthRequest, res: Response): Promise<void> {
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
      'SELECT id, driver_id, passenger_id FROM conversations WHERE id = ?',
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

    await db.query(
      'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
      [convId, req.user.id]
    );

    res.status(200).json({ success: true });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Chat tables require Migration 002.' });
      return;
    }
    console.error('markConversationMessagesRead error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read.' });
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
