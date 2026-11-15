import { db } from '../config/db.ts';
import { pushToUser } from '../realtime/wsServer.ts';
import { parseRideDateTime } from '../utils/dateTime.ts';

const RIDE_REMINDER_WINDOW_MS = 60 * 60 * 1000;

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
): Promise<void> {
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
  } catch (err: any) {
    // Keep the primary ride and booking flow working if the
    // notification table has not been created yet.
    if (err?.code === 'ER_NO_SUCH_TABLE') return;

    console.error(
      'createNotification warning:',
      err?.message || err
    );
  }
}

/**
 * Creates ride reminder notifications for rides departing
 * within the next 60 minutes.
 *
 * Existing reminders are checked to avoid duplicate notifications.
 */
export async function ensureUpcomingRideRemindersForUser(
  userId: number
): Promise<void> {
  try {
    const nowMs = Date.now();
    const horizonMs = nowMs + RIDE_REMINDER_WINDOW_MS;

    // Find accepted bookings where the user is a passenger.
    const [passengerRows] = await db.query(
      `SELECT req.ride_id, r.pickup_name, r.dest_name,
              r.departure_time, r.status AS ride_status
       FROM ride_requests req
       JOIN rides r ON req.ride_id = r.id
       WHERE req.passenger_id = ? AND req.status = 'accepted'`,
      [userId]
    );

    // Find rides where the user is the driver.
    const [driverRows] = await db.query(
      `SELECT r.id AS ride_id, r.pickup_name, r.dest_name,
              r.departure_time, r.status AS ride_status
       FROM rides r
       WHERE r.driver_id = ?`,
      [userId]
    );

    // Combine passenger and driver rides.
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

    if (candidateRides.length === 0) return;

    // Retrieve existing reminder links to prevent repeated notifications.
    const [existingNotifs] = await db.query(
      `SELECT link
       FROM notifications
       WHERE user_id = ? AND type = 'ride_reminder'`,
      [userId]
    );

    const existingLinks = new Set(
      ((existingNotifs as any[]) || []).map((notification) => notification.link)
    );

    for (const ride of candidateRides) {
      // Ignore rides that are no longer active.
      if (
        ride.ride_status === 'cancelled' ||
        ride.ride_status === 'completed'
      ) {
        continue;
      }

      const departureDate = parseRideDateTime(ride.departure_time);

      if (!departureDate) continue;

      const departureMs = departureDate.getTime();

      // Only process rides departing within the next 60 minutes.
      if (departureMs <= nowMs || departureMs > horizonMs) {
        continue;
      }

      const link = `/rides/${ride.ride_id}`;

      // Skip reminders that already exist.
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

      await createNotification({
        userId,
        type: 'ride_reminder',
        title,
        message,
        link
      });

      // Track the link to prevent duplicates during this execution.
      existingLinks.add(link);
    }
  } catch (err: any) {
    // Gracefully handle installations where migration 002
    // has not created the notification table yet.
    if (err?.code === 'ER_NO_SUCH_TABLE') return;

    console.error(
      'ensureUpcomingRideRemindersForUser warning:',
      err?.message || err
    );
  }
}
