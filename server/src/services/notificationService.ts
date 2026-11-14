import { db } from '../config/db.ts';
import { pushToUser } from '../realtime/wsServer.ts';
import { parseRideDateTime } from '../utils/dateTime.ts';

export interface NotificationInput {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string | null;
}

export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    const [result] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link, is_read)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [input.userId, input.type, input.title, input.message, input.link || null]
    );

    const insertId = (result as any)?.insertId;
    pushToUser(input.userId, {
      event: 'notification:new',
      notification: {
        id: insertId || Date.now(),
        user_id: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link || null,
        is_read: 0,
        created_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    // Do not break primary ride/booking flow if migration 002 tables are not yet created
    if (err?.code === 'ER_NO_SUCH_TABLE') return;
    console.error('createNotification warning:', err?.message || err);
  }
}

/**
 * Creates idempotent ride reminder notifications for rides departing within the next 60 minutes.
 */
export async function ensureUpcomingRideRemindersForUser(userId: number): Promise<void> {
  try {
    const nowMs = Date.now();
    const horizonMs = nowMs + 60 * 60 * 1000;

    // 1. Check accepted bookings where user is passenger
    const [passengerRows] = await db.query(
      `SELECT req.ride_id, r.pickup_name, r.dest_name, r.departure_time, r.status AS ride_status
       FROM ride_requests req
       JOIN rides r ON req.ride_id = r.id
       WHERE req.passenger_id = ? AND req.status = 'accepted'`,
      [userId]
    );

    // 2. Check upcoming rides where user is driver
    const [driverRows] = await db.query(
      `SELECT r.id AS ride_id, r.pickup_name, r.dest_name, r.departure_time, r.status AS ride_status
       FROM rides r
       WHERE r.driver_id = ?`,
      [userId]
    );

    const candidateRides = [
      ...((passengerRows as any[]) || []).map((r) => ({ ...r, role: 'passenger' })),
      ...((driverRows as any[]) || []).map((r) => ({ ...r, role: 'driver' }))
    ];

    if (candidateRides.length === 0) return;

    const [existingNotifs] = await db.query(
      `SELECT link FROM notifications WHERE user_id = ? AND type = 'ride_reminder'`,
      [userId]
    );
    const existingLinks = new Set(((existingNotifs as any[]) || []).map((n) => n.link));

    for (const item of candidateRides) {
      if (item.ride_status === 'cancelled' || item.ride_status === 'completed') continue;
      const depDate = parseRideDateTime(item.departure_time);
      if (!depDate) continue;
      const depMs = depDate.getTime();
      if (depMs <= nowMs || depMs > horizonMs) continue;

      const link = `/rides/${item.ride_id}`;
      if (existingLinks.has(link)) continue;

      const minsLeft = Math.max(1, Math.round((depMs - nowMs) / 60000));
      const title = `Ride departs in ~${minsLeft} min`;
      const message =
        item.role === 'driver'
          ? `Your campus ride from ${item.pickup_name} to ${item.dest_name} departs soon.`
          : `Your confirmed ride from ${item.pickup_name} to ${item.dest_name} departs soon.`;

      await createNotification({
        userId,
        type: 'ride_reminder',
        title,
        message,
        link
      });
      existingLinks.add(link);
    }
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return;
    console.error('ensureUpcomingRideRemindersForUser warning:', err?.message || err);
  }
}
