import { db } from '../config/db.ts';
import { pushToUser } from '../realtime/wsServer.ts';
import { formatDateToMySqlUtc, parseRideDateTime } from '../utils/dateTime.ts';

const RIDE_REMINDER_WINDOW_MS = 60 * 60 * 1000;
const REMINDER_CHECK_COOLDOWN_MS = 60 * 1000;
const MAX_REMINDER_CACHE_ENTRIES = 2000;
const recentReminderChecks = new Map<number, number>();

export function invalidateReminderCacheForUser(userId?: number): void {
  if (typeof userId === 'number' && userId > 0) {
    recentReminderChecks.delete(userId);
  } else {
    recentReminderChecks.clear();
  }
}

export function resetReminderCheckCacheForTesting(): void {
  recentReminderChecks.clear();
}

export interface NotificationInput {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string | null;
}

/**
 * Creates a notification, stores it in the database,
 * and sends it to the user through WebSocket.
 */
export async function createNotification(
  input: NotificationInput
): Promise<boolean> {
  try {
    const [result] = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link, is_read)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [
        input.userId,
        input.type,
        input.title,
        input.message,
        input.link || null
      ]
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
    return true;
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return true;

    console.error(
      'createNotification warning:',
      err?.message || err
    );
    return false;
  }
}

function recordReminderCheckCooldown(userId: number, nowMs: number): void {
  if (recentReminderChecks.size >= MAX_REMINDER_CACHE_ENTRIES) {
    const oldestKey = recentReminderChecks.keys().next().value;
    if (oldestKey !== undefined) recentReminderChecks.delete(oldestKey);
  }
  recentReminderChecks.set(userId, nowMs);
}

/**
 * Creates ride reminder notifications for rides departing
 * within the next 60 minutes.
 *
 * Queries only active rides in the 60-minute departure window and
 * caches checks per user briefly to prevent repeated redundant DB scans.
 */
export async function ensureUpcomingRideRemindersForUser(
  userId: number
): Promise<void> {
  try {
    const nowMs = Date.now();
    const lastCheckedAt = recentReminderChecks.get(userId);
    if (lastCheckedAt !== undefined && nowMs - lastCheckedAt < REMINDER_CHECK_COOLDOWN_MS) {
      return;
    }

    const horizonMs = nowMs + RIDE_REMINDER_WINDOW_MS;
    const nowSql = formatDateToMySqlUtc(new Date(nowMs));
    const horizonSql = formatDateToMySqlUtc(new Date(horizonMs));

    const [[passengerRows], [driverRows]] = await Promise.all([
      db.query(
        `SELECT req.ride_id, r.pickup_name, r.dest_name,
                r.departure_time, r.status AS ride_status
         FROM ride_requests req
         JOIN rides r ON req.ride_id = r.id
         WHERE req.passenger_id = ?
           AND req.status = 'accepted'
           AND r.status IN ('open', 'full', 'scheduled', 'in_progress')
           AND r.departure_time > ?
           AND r.departure_time <= ?`,
        [userId, nowSql, horizonSql]
      ),
      db.query(
        `SELECT r.id AS ride_id, r.pickup_name, r.dest_name,
                r.departure_time, r.status AS ride_status
         FROM rides r
         WHERE r.driver_id = ?
           AND r.status IN ('open', 'full', 'scheduled', 'in_progress')
           AND r.departure_time > ?
           AND r.departure_time <= ?`,
        [userId, nowSql, horizonSql]
      )
    ]);

    const candidateRides = [
      ...((passengerRows as any[]) || []).map((ride) => ({
        ...ride,
        role: 'passenger'
      })),
      ...((driverRows as any[]) || []).map((ride) => ({
        ...ride,
        role: 'driver'
      }))
    ];

    // Filter window accurately in JS as well for strict equivalence across backends
    const upcomingRides: Array<{ ride: any; departureMs: number; link: string }> = [];
    for (const ride of candidateRides) {
      if (ride.ride_status === 'cancelled' || ride.ride_status === 'completed') continue;
      const departureDate = parseRideDateTime(ride.departure_time);
      if (!departureDate) continue;
      const departureMs = departureDate.getTime();
      if (departureMs <= nowMs || departureMs > horizonMs) continue;
      upcomingRides.push({
        ride,
        departureMs,
        link: `/rides/${ride.ride_id}`
      });
    }

    if (upcomingRides.length === 0) {
      recordReminderCheckCooldown(userId, nowMs);
      return;
    }

    const candidateLinks = Array.from(new Set(upcomingRides.map((u) => u.link)));
    const linkPlaceholders = candidateLinks.map(() => '?').join(', ');

    const [existingNotifs] = await db.query(
      `SELECT link
       FROM notifications
       WHERE user_id = ? AND type = 'ride_reminder' AND link IN (${linkPlaceholders})`,
      [userId, ...candidateLinks]
    );

    const existingLinks = new Set(
      ((existingNotifs as any[]) || []).map((notification) => notification.link)
    );

    let allSucceeded = true;
    for (const { ride, departureMs, link } of upcomingRides) {
      if (existingLinks.has(link)) continue;

      const minutesLeft = Math.max(
        1,
        Math.round((departureMs - nowMs) / 60000)
      );

      const title = `Ride departs in ~${minutesLeft} min`;
      const message =
        ride.role === 'driver'
          ? `Your campus ride from ${ride.pickup_name} to ${ride.dest_name} departs soon.`
          : `Your confirmed ride from ${ride.pickup_name} to ${ride.dest_name} departs soon.`;

      const created = await createNotification({
        userId,
        type: 'ride_reminder',
        title,
        message,
        link
      });

      if (created) {
        existingLinks.add(link);
      } else {
        allSucceeded = false;
      }
    }

    if (allSucceeded) {
      recordReminderCheckCooldown(userId, nowMs);
    }
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return;

    console.error(
      'ensureUpcomingRideRemindersForUser warning:',
      err?.message || err
    );
  }
}
