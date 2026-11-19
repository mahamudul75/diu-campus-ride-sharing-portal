import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db, type IDatabaseConnection } from '../config/db.ts';
import {
  formatDateToMySqlUtc,
  parseRideDateTime,
  resolveRideSearchDateBounds,
  toUtcIsoString
} from '../utils/dateTime.ts';
import {
  isNonEmptyString,
  isPositiveIntId,
  isTruthyDbFlag,
  isValidCoordinate,
  parsePaginationParams
} from '../utils/validators.ts';
import { calculateHaversineDistanceKm, estimateDurationMinutes } from '../utils/distance.ts';
import {
  areUsersBlocked,
  getBlockedUserIds,
  getUserExtendedFieldsBatch,
  getUserRatingSummaries
} from '../utils/dbHelpers.ts';
import { createNotification, invalidateReminderCacheForUser } from '../services/notificationService.ts';
import { pushToUser } from '../realtime/wsServer.ts';

const OFFER_PICKUP_WINDOW_MS = 4 * 60 * 60 * 1000;
const COMPATIBLE_RIDE_DEPARTURE_WINDOW_MS = 2 * 60 * 60 * 1000;
const MAX_COMPATIBLE_LOCATION_DISTANCE_KM = 1.0;
const DEFAULT_FALLBACK_PICKUP = { lat: 23.8768, lng: 90.3202 };
const DEFAULT_FALLBACK_DEST = { lat: 23.7538, lng: 90.377 };

function normalizeLocationLabel(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isNearCoordinate(lat: number, lng: number, refLat: number, refLng: number): boolean {
  return Math.abs(lat - refLat) < 0.0005 && Math.abs(lng - refLng) < 0.0005;
}

function doLocationsMatch(
  nameA: unknown,
  latA: unknown,
  lngA: unknown,
  nameB: unknown,
  latB: unknown,
  lngB: unknown
): boolean {
  const normA = normalizeLocationLabel(nameA);
  const normB = normalizeLocationLabel(nameB);
  if (!normA || !normB) return false;

  const numLatA = Number(latA);
  const numLngA = Number(lngA);
  const numLatB = Number(latB);
  const numLngB = Number(lngB);
  const bothHaveValidCoords =
    isValidCoordinate(numLatA, numLngA) !== null && isValidCoordinate(numLatB, numLngB) !== null;

  if (normA === normB) {
    if (!bothHaveValidCoords) return true;
    const aIsDefault =
      isNearCoordinate(numLatA, numLngA, DEFAULT_FALLBACK_PICKUP.lat, DEFAULT_FALLBACK_PICKUP.lng) ||
      isNearCoordinate(numLatA, numLngA, DEFAULT_FALLBACK_DEST.lat, DEFAULT_FALLBACK_DEST.lng);
    const bIsDefault =
      isNearCoordinate(numLatB, numLngB, DEFAULT_FALLBACK_PICKUP.lat, DEFAULT_FALLBACK_PICKUP.lng) ||
      isNearCoordinate(numLatB, numLngB, DEFAULT_FALLBACK_DEST.lat, DEFAULT_FALLBACK_DEST.lng);
    if (aIsDefault || bIsDefault) return true;
    return calculateHaversineDistanceKm(numLatA, numLngA, numLatB, numLngB) <= 5.0;
  }

  if (!bothHaveValidCoords) return false;
  const distKm = calculateHaversineDistanceKm(numLatA, numLngA, numLatB, numLngB);
  if (distKm > MAX_COMPATIBLE_LOCATION_DISTANCE_KM) return false;
  return normA.includes(normB) || normB.includes(normA);
}

function isRideCompatibleForOffer(params: {
  ride: any;
  pr: any;
  offer: any;
  driverVehicle: 'bike' | 'car';
  prDepDate: Date;
  offerPickupDate: Date;
  nowMs: number;
}): { compatible: boolean; timeScoreMs: number } {
  const { ride, pr, offer, driverVehicle, prDepDate, offerPickupDate, nowMs } = params;

  if (Number(ride.driver_id) !== Number(offer.driver_id)) {
    return { compatible: false, timeScoreMs: Infinity };
  }

  if (ride.status !== 'open' && ride.status !== 'scheduled') {
    return { compatible: false, timeScoreMs: Infinity };
  }

  const seatsNeeded = Number(pr.seats_needed ?? 1);
  const seatsAvailable = Number(ride.seats_available);
  const seatsTotal = Number(ride.seats_total);
  if (
    !Number.isInteger(seatsNeeded) ||
    seatsNeeded !== 1 ||
    !Number.isFinite(seatsAvailable) ||
    !Number.isFinite(seatsTotal) ||
    seatsAvailable < seatsNeeded ||
    seatsTotal < 1 ||
    seatsAvailable > seatsTotal
  ) {
    return { compatible: false, timeScoreMs: Infinity };
  }

  if (ride.vehicle_type !== driverVehicle) {
    return { compatible: false, timeScoreMs: Infinity };
  }
  if (pr.vehicle_type !== 'any' && ride.vehicle_type !== pr.vehicle_type) {
    return { compatible: false, timeScoreMs: Infinity };
  }

  const pickupMatches = doLocationsMatch(
    ride.pickup_name,
    ride.pickup_lat,
    ride.pickup_lng,
    pr.pickup_name,
    pr.pickup_lat,
    pr.pickup_lng
  );
  const destMatches = doLocationsMatch(
    ride.dest_name,
    ride.dest_lat,
    ride.dest_lng,
    pr.dest_name,
    pr.dest_lat,
    pr.dest_lng
  );
  if (!pickupMatches || !destMatches) {
    return { compatible: false, timeScoreMs: Infinity };
  }

  const rideDepDate = parseRideDateTime(ride.departure_time);
  if (!rideDepDate || rideDepDate.getTime() <= nowMs) {
    return { compatible: false, timeScoreMs: Infinity };
  }

  const diffFromPrMs = Math.abs(rideDepDate.getTime() - prDepDate.getTime());
  const diffFromOfferMs = Math.abs(rideDepDate.getTime() - offerPickupDate.getTime());
  if (
    diffFromPrMs > COMPATIBLE_RIDE_DEPARTURE_WINDOW_MS ||
    diffFromOfferMs > COMPATIBLE_RIDE_DEPARTURE_WINDOW_MS
  ) {
    return { compatible: false, timeScoreMs: Infinity };
  }

  return { compatible: true, timeScoreMs: diffFromOfferMs + diffFromPrMs };
}

export function handlePassengerRequestError(
  res: Response,
  error: any,
  context: string,
  fallbackMessage: string
): void {
  if (error?.isDatabaseUnavailable || error?.status === 503) {
    res.status(503).json({
      success: false,
      message: error.message || 'Database service is temporarily unavailable. Please try again shortly.'
    });
    return;
  }
  if (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213) {
    console.warn(`${context} lock deadlock:`, error?.message || error);
    res.status(409).json({
      success: false,
      message: 'A concurrent update conflict occurred. Please try again.'
    });
    return;
  }
  if (error?.code === 'ER_LOCK_WAIT_TIMEOUT' || error?.errno === 1205) {
    console.warn(`${context} lock wait timeout:`, error?.message || error);
    res.status(503).json({
      success: false,
      message: 'The operation is taking longer than expected due to concurrent activity. Please try again shortly.'
    });
    return;
  }
  console.error(`${context} error:`, error);
  res.status(500).json({ success: false, message: fallbackMessage });
}

async function areUsersBlockedOnConn(
  conn: IDatabaseConnection,
  userA: number,
  userB: number
): Promise<boolean> {
  if (userA === userB) return false;
  try {
    const [rows] = await conn.query(
      `SELECT id FROM user_blocks
       WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
       LIMIT 1`,
      [userA, userB, userB, userA]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return false;
    throw err;
  }
}

async function expireSingleRequestOnConn(conn: IDatabaseConnection, requestId: number): Promise<void> {
  await conn.query(
    `UPDATE passenger_requests
     SET status = 'expired', updated_at = NOW()
     WHERE id = ? AND status = 'open' AND departure_time <= UTC_TIMESTAMP()`,
    [requestId]
  );
  await conn.query(
    `UPDATE driver_offers
     SET status = 'expired', updated_at = NOW()
     WHERE request_id = ? AND status = 'pending'`,
    [requestId]
  );
}

/**
 * Synchronizes linked passenger_requests -> 'cancelled' when a ride created from an accepted
 * driver offer is cancelled (by driver or admin). Note: driver_offers.status ENUM does not
 * include 'cancelled' ('pending','accepted','rejected','withdrawn','expired'), so the accepted
 * driver_offers row remains 'accepted' with confirmed_ride_id preserved and API consumers inspect
 * confirmed_ride_status alongside passenger_requests.status.
 */
export async function syncPassengerRequestOnRideCancelled(
  conn: IDatabaseConnection,
  rideId: number
): Promise<void> {
  try {
    const [lookupRows] = await conn.query(
      `SELECT id, request_id
       FROM driver_offers
       WHERE confirmed_ride_id = ? AND status = 'accepted'`,
      [rideId]
    );
    const candidates = Array.isArray(lookupRows) ? (lookupRows as any[]) : [];
    for (const candidate of candidates) {
      const reqId = Number(candidate.request_id);
      const offerId = Number(candidate.id);
      await conn.query('SELECT id FROM passenger_requests WHERE id = ? FOR UPDATE', [reqId]);
      const [offerRows] = await conn.query(
        'SELECT id, status FROM driver_offers WHERE id = ? AND request_id = ? FOR UPDATE',
        [offerId, reqId]
      );
      const offer = Array.isArray(offerRows) && offerRows.length > 0 ? (offerRows[0] as any) : null;
      if (!offer || offer.status !== 'accepted') continue;

      await conn.query(
        `UPDATE passenger_requests
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = ? AND accepted_offer_id = ? AND status = 'matched'`,
        [reqId, offerId]
      );
    }
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return;
    throw err;
  }
}

/**
 * Synchronizes a linked passenger_requests -> 'cancelled' ONLY when the cancelled booking belongs
 * to the matched requester (passenger_id matches). Cancelling an unrelated co-passenger's spare-seat
 * booking on a multi-seat matched car ride does not cancel the matched passenger request.
 */
export async function syncPassengerRequestOnBookingCancelled(
  conn: IDatabaseConnection,
  rideId: number,
  passengerId: number
): Promise<{ isMatchedRequester: boolean }> {
  let isMatchedRequester = false;
  try {
    const [lookupRows] = await conn.query(
      `SELECT id, request_id
       FROM driver_offers
       WHERE confirmed_ride_id = ? AND status = 'accepted'`,
      [rideId]
    );
    const candidates = Array.isArray(lookupRows) ? (lookupRows as any[]) : [];
    for (const candidate of candidates) {
      const reqId = Number(candidate.request_id);
      const offerId = Number(candidate.id);
      const [prRows] = await conn.query(
        'SELECT id, passenger_id, status, accepted_offer_id FROM passenger_requests WHERE id = ? FOR UPDATE',
        [reqId]
      );
      const [offerRows] = await conn.query(
        'SELECT id, status FROM driver_offers WHERE id = ? AND request_id = ? FOR UPDATE',
        [offerId, reqId]
      );
      const pr = Array.isArray(prRows) && prRows.length > 0 ? (prRows[0] as any) : null;
      const offer = Array.isArray(offerRows) && offerRows.length > 0 ? (offerRows[0] as any) : null;
      if (!pr || !offer || offer.status !== 'accepted') continue;

      if (Number(pr.passenger_id) === passengerId && Number(pr.accepted_offer_id) === offerId) {
        isMatchedRequester = true;
        if (pr.status === 'matched') {
          await conn.query(
            `UPDATE passenger_requests
             SET status = 'cancelled', updated_at = NOW()
             WHERE id = ? AND passenger_id = ? AND accepted_offer_id = ? AND status = 'matched'`,
            [reqId, passengerId, offerId]
          );
        }
      }
    }
    return { isMatchedRequester };
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return { isMatchedRequester: false };
    throw err;
  }
}

async function expireElapsedPassengerRequests(targetRequestId?: number): Promise<void> {
  try {
    if (targetRequestId) {
      const [rows] = await db.query(
        `SELECT id FROM passenger_requests
         WHERE id = ? AND status = 'open' AND departure_time <= UTC_TIMESTAMP()`,
        [targetRequestId]
      );
      if (!Array.isArray(rows) || rows.length === 0) return;

      await db.query(
        `UPDATE passenger_requests
         SET status = 'expired', updated_at = NOW()
         WHERE id = ? AND status = 'open' AND departure_time <= UTC_TIMESTAMP()`,
        [targetRequestId]
      );
      await db.query(
        `UPDATE driver_offers
         SET status = 'expired', updated_at = NOW()
         WHERE request_id = ? AND status = 'pending'`,
        [targetRequestId]
      );
      return;
    }

    const [expiredRows] = await db.query(
      `SELECT id FROM passenger_requests
       WHERE status = 'open' AND departure_time <= UTC_TIMESTAMP()
       LIMIT 200`
    );
    const expiredIds = Array.isArray(expiredRows)
      ? (expiredRows as any[]).map((r) => Number(r.id)).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (expiredIds.length === 0) return;

    const placeholders = expiredIds.map(() => '?').join(', ');
    await db.query(
      `UPDATE passenger_requests
       SET status = 'expired', updated_at = NOW()
       WHERE id IN (${placeholders}) AND status = 'open'`,
      expiredIds
    );
    await db.query(
      `UPDATE driver_offers
       SET status = 'expired', updated_at = NOW()
       WHERE request_id IN (${placeholders}) AND status = 'pending'`,
      expiredIds
    );
  } catch (err: any) {
    if (err?.isDatabaseUnavailable || err?.status === 503) {
      throw err;
    }
    if (err?.code !== 'ER_NO_SUCH_TABLE') {
      console.warn('expireElapsedPassengerRequests warning:', err?.message || err);
    }
  }
}

async function notifyEligibleDriversOfNewRequest(params: {
  requestId: number;
  passengerId: number;
  passengerName: string;
  pickupName: string;
  destName: string;
  vehicleType: 'any' | 'bike' | 'car';
}): Promise<void> {
  try {
    const blockedSet = await getBlockedUserIds(params.passengerId);
    const queryParams: any[] = [params.passengerId];
    let vehicleClause = '';
    if (params.vehicleType === 'bike' || params.vehicleType === 'car') {
      vehicleClause = ' AND vehicle_type = ?';
      queryParams.push(params.vehicleType);
    }

    const [rows] = await db.query(
      `SELECT id FROM users
       WHERE driver_status = 'approved' AND is_blocked = 0 AND id != ?${vehicleClause}
       LIMIT 25`,
      queryParams
    );

    if (!Array.isArray(rows) || rows.length === 0) return;

    const eligibleDrivers = (rows as any[])
      .map((r) => Number(r.id))
      .filter((driverId) => driverId > 0 && !blockedSet.has(driverId));

    for (const driverId of eligibleDrivers) {
      await createNotification({
        userId: driverId,
        type: 'passenger_request_new',
        title: 'New Passenger Ride Request',
        message: `${params.passengerName} needs a ride from ${params.pickupName} to ${params.destName}.`,
        link: `/passenger-requests/${params.requestId}`
      });
      pushToUser(driverId, {
        event: 'passenger_request:new',
        requestId: params.requestId
      });
    }
  } catch (err: any) {
    console.warn('notifyEligibleDriversOfNewRequest warning:', err?.message || err);
  }
}

export async function createPassengerRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }
    if (isTruthyDbFlag(req.user.is_blocked)) {
      res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
      return;
    }

    const {
      pickup_name,
      pickup_lat,
      pickup_lng,
      dest_name,
      dest_lat,
      dest_lng,
      departure_time,
      seats_needed,
      max_fare,
      vehicle_type,
      note
    } = req.body ?? {};

    if (!isNonEmptyString(pickup_name, 2, 255) || !isNonEmptyString(dest_name, 2, 255) || !departure_time) {
      res.status(400).json({
        success: false,
        message: 'Pickup location, destination, and departure time are required.'
      });
      return;
    }

    const pickupCoords =
      pickup_lat === undefined && pickup_lng === undefined
        ? { lat: 23.8768, lng: 90.3202 }
        : isValidCoordinate(pickup_lat, pickup_lng);
    if (!pickupCoords) {
      res.status(400).json({ success: false, message: 'Invalid pickup coordinates.' });
      return;
    }

    const destCoords =
      dest_lat === undefined && dest_lng === undefined
        ? { lat: 23.7538, lng: 90.377 }
        : isValidCoordinate(dest_lat, dest_lng);
    if (!destCoords) {
      res.status(400).json({ success: false, message: 'Invalid destination coordinates.' });
      return;
    }

    const depDate = parseRideDateTime(departure_time);
    if (!depDate) {
      res.status(400).json({ success: false, message: 'Invalid departure time format.' });
      return;
    }
    if (depDate.getTime() <= Date.now()) {
      res.status(400).json({ success: false, message: 'Departure time must be in the future.' });
      return;
    }

    if (seats_needed !== undefined && Number(seats_needed) !== 1) {
      res.status(400).json({
        success: false,
        message: 'Only 1 seat per passenger ride request is currently supported.'
      });
      return;
    }

    let parsedMaxFare: number | null = null;
    if (max_fare !== undefined && max_fare !== null && String(max_fare).trim() !== '') {
      const nFare = Number(max_fare);
      if (!Number.isFinite(nFare) || nFare < 0 || nFare > 50000) {
        res.status(400).json({ success: false, message: 'Max fare must be between 0 and 50,000 BDT.' });
        return;
      }
      parsedMaxFare = nFare;
    }

    const normalizedVehicleType =
      vehicle_type === undefined || vehicle_type === null || String(vehicle_type).trim() === ''
        ? 'any'
        : String(vehicle_type).trim().toLowerCase();
    if (normalizedVehicleType !== 'any' && normalizedVehicleType !== 'bike' && normalizedVehicleType !== 'car') {
      res.status(400).json({
        success: false,
        message: 'Preferred vehicle type must be "any", "bike", or "car".'
      });
      return;
    }

    if (note !== undefined && note !== null && (typeof note !== 'string' || note.trim().length > 1000)) {
      res.status(400).json({ success: false, message: 'Note must be text of at most 1000 characters.' });
      return;
    }

    const cleanNote = typeof note === 'string' && note.trim() ? note.trim() : null;
    const formattedDep = formatDateToMySqlUtc(depDate);

    const [insertRes] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [
        req.user.id,
        pickup_name.trim(),
        pickupCoords.lat,
        pickupCoords.lng,
        dest_name.trim(),
        destCoords.lat,
        destCoords.lng,
        formattedDep,
        1,
        parsedMaxFare,
        normalizedVehicleType,
        cleanNote
      ]
    );

    const requestId = Number((insertRes as any).insertId);

    void notifyEligibleDriversOfNewRequest({
      requestId,
      passengerId: req.user.id,
      passengerName: req.user.name,
      pickupName: pickup_name.trim(),
      destName: dest_name.trim(),
      vehicleType: normalizedVehicleType as 'any' | 'bike' | 'car'
    });

    res.status(201).json({
      success: true,
      message: 'Ride request posted! Approved drivers can now send you offers.',
      requestId
    });
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'createPassengerRequest', 'Failed to create ride request.');
  }
}

export async function getPassengerRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }
    if (isTruthyDbFlag(req.user.is_blocked)) {
      res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
      return;
    }

    await expireElapsedPassengerRequests();

    const {
      pickup,
      destination,
      date,
      date_start,
      date_end,
      tz_offset,
      time_zone,
      vehicle_type,
      min_budget,
      max_fare
    } = req.query;

    let dateBounds = null;
    try {
      dateBounds = resolveRideSearchDateBounds({ date, date_start, date_end, tz_offset, time_zone });
    } catch {
      res.status(400).json({ success: false, message: 'Invalid date filter format.' });
      return;
    }

    let parsedMinBudget: number | null = null;
    const rawBudget = min_budget !== undefined ? min_budget : max_fare;
    if (rawBudget !== undefined && String(rawBudget).trim() !== '') {
      const nBudget = Number(rawBudget);
      if (!Number.isFinite(nBudget) || nBudget < 0) {
        res.status(400).json({ success: false, message: 'Invalid fare/budget filter.' });
        return;
      }
      parsedMinBudget = nBudget;
    }

    const rawVehicle = typeof vehicle_type === 'string' ? vehicle_type.trim().toLowerCase() : '';
    if (rawVehicle && rawVehicle !== 'any' && rawVehicle !== 'bike' && rawVehicle !== 'car') {
      res.status(400).json({ success: false, message: 'Invalid vehicle_type filter.' });
      return;
    }

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100
    });

    const blockedSet = await getBlockedUserIds(req.user.id);

    let query = `
      SELECT pr.id, pr.passenger_id, pr.pickup_name, pr.pickup_lat, pr.pickup_lng,
             pr.dest_name, pr.dest_lat, pr.dest_lng, pr.departure_time, pr.seats_needed,
             pr.max_fare, pr.vehicle_type, pr.note, pr.status, pr.accepted_offer_id,
             pr.created_at, pr.updated_at,
             u.name AS passenger_name, u.student_id AS passenger_student_id
      FROM passenger_requests pr
      JOIN users u ON pr.passenger_id = u.id
      WHERE pr.status = 'open' AND pr.departure_time > UTC_TIMESTAMP() AND pr.passenger_id != ? AND u.is_blocked = 0
    `;
    const params: any[] = [req.user.id];

    if (blockedSet.size > 0) {
      const blockedIds = Array.from(blockedSet);
      const blockedPlaceholders = blockedIds.map(() => '?').join(', ');
      query += ` AND pr.passenger_id NOT IN (${blockedPlaceholders})`;
      params.push(...blockedIds);
    }

    if (pickup && typeof pickup === 'string' && pickup.trim()) {
      query += ` AND pr.pickup_name LIKE ?`;
      params.push(`%${pickup.trim().slice(0, 100)}%`);
    }

    if (destination && typeof destination === 'string' && destination.trim()) {
      query += ` AND pr.dest_name LIKE ?`;
      params.push(`%${destination.trim().slice(0, 100)}%`);
    }

    if (dateBounds) {
      query += ` AND pr.departure_time >= ? AND pr.departure_time < ?`;
      params.push(dateBounds.startUtcSql, dateBounds.endUtcSql);
    }

    if (rawVehicle === 'bike' || rawVehicle === 'car') {
      query += ` AND (pr.vehicle_type = 'any' OR pr.vehicle_type = ?)`;
      params.push(rawVehicle);
    } else if (rawVehicle === 'any') {
      query += ` AND pr.vehicle_type = ?`;
      params.push('any');
    }

    if (parsedMinBudget !== null) {
      query += ` AND (pr.max_fare IS NULL OR pr.max_fare >= ?)`;
      params.push(parsedMinBudget);
    }

    query += ` ORDER BY pr.departure_time ASC LIMIT ? OFFSET ?`;
    params.push(limit + 1, offset);

    const [rows] = await db.query(query, params);
    const rawList = (rows as any[]) || [];
    const hasMore = rawList.length > limit;
    const list = hasMore ? rawList.slice(0, limit) : rawList;

    if (list.length === 0) {
      res.status(200).json({
        success: true,
        count: 0,
        requests: [],
        pagination: { limit, offset, has_more: false }
      });
      return;
    }

    const requestIds = list.map((r) => Number(r.id));
    const passengerIds = list.map((r) => Number(r.passenger_id));
    const reqPlaceholders = requestIds.map(() => '?').join(', ');

    const [ratingMap, extMap, offerCountsRes, myOffersRes] = await Promise.all([
      getUserRatingSummaries(passengerIds),
      getUserExtendedFieldsBatch(passengerIds, { includeAvatar: true }),
      db.query(
        `SELECT request_id,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_offers_count,
                COUNT(*) AS total_offers_count
         FROM driver_offers
         WHERE request_id IN (${reqPlaceholders})
         GROUP BY request_id`,
        requestIds
      ),
      db.query(
        `SELECT id, request_id, fare, seats_offered, vehicle_type, pickup_time, message, status, confirmed_ride_id, created_at
         FROM driver_offers
         WHERE driver_id = ? AND request_id IN (${reqPlaceholders})`,
        [req.user.id, ...requestIds]
      )
    ]);

    const countMap = new Map<number, { pending: number; total: number }>();
    if (Array.isArray(offerCountsRes[0])) {
      for (const c of offerCountsRes[0] as any[]) {
        countMap.set(Number(c.request_id), {
          pending: Number(c.pending_offers_count || 0),
          total: Number(c.total_offers_count || 0)
        });
      }
    }

    const myOfferMap = new Map<number, any>();
    if (Array.isArray(myOffersRes[0])) {
      for (const o of myOffersRes[0] as any[]) {
        myOfferMap.set(Number(o.request_id), {
          ...o,
          fare: Number(o.fare),
          pickup_time: toUtcIsoString(o.pickup_time)
        });
      }
    }

    const enriched = list.map((pr) => {
      const pid = Number(pr.passenger_id);
      const distKm = calculateHaversineDistanceKm(
        Number(pr.pickup_lat),
        Number(pr.pickup_lng),
        Number(pr.dest_lat),
        Number(pr.dest_lng)
      );
      const speedMode = pr.vehicle_type === 'bike' ? 'bike' : 'car';
      const estMins = estimateDurationMinutes(distKm, speedMode);
      const rating = ratingMap.get(pid) || { avg_rating: null, review_count: 0 };
      const ext = extMap.get(pid);
      const counts = countMap.get(Number(pr.id)) || { pending: 0, total: 0 };

      return {
        ...pr,
        max_fare: pr.max_fare !== null && pr.max_fare !== undefined ? Number(pr.max_fare) : null,
        departure_time: toUtcIsoString(pr.departure_time),
        passenger_email: null,
        passenger_phone: null,
        distance_km: distKm,
        estimated_minutes: estMins,
        passenger_avg_rating: rating.avg_rating,
        passenger_review_count: rating.review_count,
        passenger_student_verified: ext?.student_verified ?? 0,
        passenger_avatar_url: ext?.avatar_url ?? null,
        pending_offers_count: counts.pending,
        total_offers_count: counts.total,
        my_offer: myOfferMap.get(Number(pr.id)) || null
      };
    });

    res.status(200).json({
      success: true,
      count: enriched.length,
      requests: enriched,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
    });
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'getPassengerRequests', 'Failed to fetch passenger ride requests.');
  }
}

export async function getMyPassengerRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }
    if (isTruthyDbFlag(req.user.is_blocked)) {
      res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
      return;
    }

    await expireElapsedPassengerRequests();

    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
    if (rawStatus && !['open', 'matched', 'cancelled', 'expired'].includes(rawStatus)) {
      res.status(400).json({ success: false, message: 'Invalid status filter.' });
      return;
    }

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100
    });

    let query = `
      SELECT pr.*
      FROM passenger_requests pr
      WHERE pr.passenger_id = ?
    `;
    const params: any[] = [req.user.id];

    if (rawStatus) {
      query += ` AND pr.status = ?`;
      params.push(rawStatus);
    }

    query += ` ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit + 1, offset);

    const [rows] = await db.query(query, params);
    const rawList = (rows as any[]) || [];
    const hasMore = rawList.length > limit;
    const list = hasMore ? rawList.slice(0, limit) : rawList;

    if (list.length === 0) {
      res.status(200).json({
        success: true,
        requests: [],
        pagination: { limit, offset, has_more: false }
      });
      return;
    }

    const requestIds = list.map((r) => Number(r.id));
    const acceptedOfferIds = list
      .map((r) => (r.accepted_offer_id ? Number(r.accepted_offer_id) : null))
      .filter((id): id is number => id !== null && id > 0);
    const reqPlaceholders = requestIds.map(() => '?').join(', ');

    const [offerCountsRes, acceptedOffersRes] = await Promise.all([
      db.query(
        `SELECT request_id,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_offers_count,
                COUNT(*) AS total_offers_count
         FROM driver_offers
         WHERE request_id IN (${reqPlaceholders})
         GROUP BY request_id`,
        requestIds
      ),
      acceptedOfferIds.length > 0
        ? db.query(
            `SELECT o.id, o.request_id, o.driver_id, o.fare, o.seats_offered, o.vehicle_type, o.pickup_time,
                    o.status, o.confirmed_ride_id, r.status AS confirmed_ride_status, u.name AS driver_name
             FROM driver_offers o
             JOIN users u ON o.driver_id = u.id
             LEFT JOIN rides r ON o.confirmed_ride_id = r.id
             WHERE o.id IN (${acceptedOfferIds.map(() => '?').join(', ')})`,
            acceptedOfferIds
          )
        : Promise.resolve([[], []])
    ]);

    const countMap = new Map<number, { pending: number; total: number }>();
    if (Array.isArray(offerCountsRes[0])) {
      for (const c of offerCountsRes[0] as any[]) {
        countMap.set(Number(c.request_id), {
          pending: Number(c.pending_offers_count || 0),
          total: Number(c.total_offers_count || 0)
        });
      }
    }

    const acceptedMap = new Map<number, any>();
    if (Array.isArray(acceptedOffersRes[0])) {
      for (const o of acceptedOffersRes[0] as any[]) {
        acceptedMap.set(Number(o.id), {
          ...o,
          fare: Number(o.fare),
          pickup_time: toUtcIsoString(o.pickup_time)
        });
      }
    }

    const enriched = list.map((pr) => {
      const distKm = calculateHaversineDistanceKm(
        Number(pr.pickup_lat),
        Number(pr.pickup_lng),
        Number(pr.dest_lat),
        Number(pr.dest_lng)
      );
      const counts = countMap.get(Number(pr.id)) || { pending: 0, total: 0 };
      const acceptedOffer = pr.accepted_offer_id ? acceptedMap.get(Number(pr.accepted_offer_id)) || null : null;

      return {
        ...pr,
        max_fare: pr.max_fare !== null && pr.max_fare !== undefined ? Number(pr.max_fare) : null,
        departure_time: toUtcIsoString(pr.departure_time),
        distance_km: distKm,
        estimated_minutes: estimateDurationMinutes(distKm, pr.vehicle_type === 'bike' ? 'bike' : 'car'),
        pending_offers_count: counts.pending,
        total_offers_count: counts.total,
        confirmed_ride_id: acceptedOffer?.confirmed_ride_id ?? null,
        confirmed_ride_status: acceptedOffer?.confirmed_ride_status ?? null,
        accepted_offer: acceptedOffer
      };
    });

    res.status(200).json({
      success: true,
      requests: enriched,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
    });
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'getMyPassengerRequests', 'Failed to load your ride requests.');
  }
}

export async function getPassengerRequestById(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }
    if (isTruthyDbFlag(req.user.is_blocked)) {
      res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
      return;
    }

    const requestId = isPositiveIntId(req.params.id);
    if (!requestId) {
      res.status(400).json({ success: false, message: 'Invalid passenger request ID.' });
      return;
    }

    await expireElapsedPassengerRequests(requestId);

    const [rows] = await db.query(
      `SELECT pr.*, u.name AS passenger_name, u.email AS passenger_email, u.phone AS passenger_phone,
              u.student_id AS passenger_student_id, u.is_blocked AS passenger_is_blocked
       FROM passenger_requests pr
       JOIN users u ON pr.passenger_id = u.id
       WHERE pr.id = ?`,
      [requestId]
    );
    const pr = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!pr) {
      res.status(404).json({ success: false, message: 'Passenger ride request not found.' });
      return;
    }

    const passengerId = Number(pr.passenger_id);
    const isOwner = passengerId === req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isApprovedDriver = req.user.driver_status === 'approved';

    if (!isOwner && !isAdmin && !isApprovedDriver) {
      res.status(403).json({
        success: false,
        message: 'Only the requesting passenger or approved drivers can view this ride request.'
      });
      return;
    }

    if (!isAdmin && isTruthyDbFlag(pr.passenger_is_blocked)) {
      res.status(403).json({
        success: false,
        message: 'This ride request is currently unavailable.'
      });
      return;
    }

    const isBlockedPair = !isOwner ? await areUsersBlocked(req.user.id, passengerId) : false;
    if (isBlockedPair && !isAdmin) {
      res.status(403).json({
        success: false,
        message: 'This ride request is unavailable due to block settings.'
      });
      return;
    }

    const blockedSet = !isAdmin ? await getBlockedUserIds(req.user.id) : new Set<number>();

    const [passengerExtMap, passengerRatingMap] = await Promise.all([
      getUserExtendedFieldsBatch([passengerId], { includeAvatar: true }),
      getUserRatingSummaries([passengerId])
    ]);

    const passengerExt = passengerExtMap.get(passengerId);
    const passengerRating = passengerRatingMap.get(passengerId) || { avg_rating: null, review_count: 0 };

    let offers: any[] = [];
    let myOffer: any = null;
    let pendingOffersCount = 0;

    if (isOwner || isAdmin) {
      const [offerRows] = await db.query(
        `SELECT o.*, r.status AS confirmed_ride_status,
                u.name AS driver_name, u.email AS driver_email, u.phone AS driver_phone,
                u.student_id AS driver_student_id, u.driver_status AS driver_status,
                u.vehicle_model AS driver_vehicle_model, u.vehicle_plate AS driver_vehicle_plate,
                u.is_blocked AS driver_is_blocked
         FROM driver_offers o
         JOIN users u ON o.driver_id = u.id
         LEFT JOIN rides r ON o.confirmed_ride_id = r.id
         WHERE o.request_id = ?
         ORDER BY o.fare ASC, o.created_at ASC`,
        [requestId]
      );
      const rawOffersAll = Array.isArray(offerRows) ? (offerRows as any[]) : [];
      const visibleRawOffers = isAdmin
        ? rawOffersAll
        : rawOffersAll.filter((o) => {
            const dId = Number(o.driver_id);
            const blockedOrSuspended = blockedSet.has(dId) || isTruthyDbFlag(o.driver_is_blocked);
            return o.status === 'accepted' || !blockedOrSuspended;
          });
      pendingOffersCount = visibleRawOffers.filter((o) => o.status === 'pending').length;

      const driverIds = visibleRawOffers.map((o) => Number(o.driver_id));
      const [driverRatings, driverExtMap] = await Promise.all([
        getUserRatingSummaries(driverIds),
        getUserExtendedFieldsBatch(driverIds, { includeAvatar: true })
      ]);

      offers = visibleRawOffers.map((o) => {
        const dId = Number(o.driver_id);
        const dExt = driverExtMap.get(dId);
        const dRating = driverRatings.get(dId) || { avg_rating: null, review_count: 0 };
        const isAcceptedOffer = o.status === 'accepted';
        const isDriverBlockedOrSuspended =
          !isAdmin && (blockedSet.has(dId) || isTruthyDbFlag(o.driver_is_blocked));
        const allowDriverPhone =
          isAdmin ||
          (!isDriverBlockedOrSuspended && isAcceptedOffer && (dExt?.show_phone_to_accepted ?? 1) !== 0);
        const allowDriverSensitive = isAdmin || (!isDriverBlockedOrSuspended && isAcceptedOffer);

        return {
          ...o,
          fare: Number(o.fare),
          pickup_time: toUtcIsoString(o.pickup_time),
          confirmed_ride_status: o.confirmed_ride_status ?? null,
          driver_email: allowDriverSensitive ? o.driver_email : null,
          driver_phone: allowDriverPhone ? o.driver_phone : null,
          driver_vehicle_plate: allowDriverSensitive ? o.driver_vehicle_plate : null,
          driver_avg_rating: dRating.avg_rating,
          driver_review_count: dRating.review_count,
          driver_student_verified: dExt?.student_verified ?? 0,
          driver_avatar_url: dExt?.avatar_url ?? null
        };
      });

      // Put accepted offer first, then pending, then historical offers
      const statusWeight: Record<string, number> = {
        accepted: 0,
        pending: 1,
        rejected: 2,
        withdrawn: 3,
        expired: 4
      };
      offers.sort(
        (a, b) =>
          (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9) ||
          Number(a.fare) - Number(b.fare)
      );
    } else if (isApprovedDriver) {
      const [myRows, countRows] = await Promise.all([
        db.query(
          `SELECT o.*, r.status AS confirmed_ride_status
           FROM driver_offers o
           LEFT JOIN rides r ON o.confirmed_ride_id = r.id
           WHERE o.request_id = ? AND o.driver_id = ?`,
          [requestId, req.user.id]
        ),
        db.query(
          `SELECT request_id,
                  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_offers_count,
                  COUNT(*) AS total_offers_count
           FROM driver_offers
           WHERE request_id IN (?)
           GROUP BY request_id`,
          [requestId]
        )
      ]);
      if (Array.isArray(myRows[0]) && myRows[0].length > 0) {
        const o = myRows[0][0] as any;
        myOffer = {
          ...o,
          fare: Number(o.fare),
          pickup_time: toUtcIsoString(o.pickup_time),
          confirmed_ride_status: o.confirmed_ride_status ?? null
        };
        offers = [myOffer];
      }
      if (Array.isArray(countRows[0]) && countRows[0].length > 0) {
        pendingOffersCount = Number((countRows[0][0] as any).pending_offers_count || 0);
      }
    }

    const canSeePassengerContact = isAdmin || (!isBlockedPair && (isOwner || myOffer?.status === 'accepted'));
    const canSeePassengerPhone =
      isOwner ||
      isAdmin ||
      (!isBlockedPair && myOffer?.status === 'accepted' && (passengerExt?.show_phone_to_accepted ?? 1) !== 0);

    const acceptedOfferSummary = offers.find((o) => o.status === 'accepted') || null;
    const distKm = calculateHaversineDistanceKm(
      Number(pr.pickup_lat),
      Number(pr.pickup_lng),
      Number(pr.dest_lat),
      Number(pr.dest_lng)
    );

    const safeRequest = {
      ...pr,
      max_fare: pr.max_fare !== null && pr.max_fare !== undefined ? Number(pr.max_fare) : null,
      departure_time: toUtcIsoString(pr.departure_time),
      passenger_phone: canSeePassengerPhone ? pr.passenger_phone : null,
      passenger_email: canSeePassengerContact ? pr.passenger_email : null,
      passenger_avg_rating: passengerRating.avg_rating,
      passenger_review_count: passengerRating.review_count,
      passenger_student_verified: passengerExt?.student_verified ?? 0,
      passenger_avatar_url: passengerExt?.avatar_url ?? null,
      distance_km: distKm,
      estimated_minutes: estimateDurationMinutes(distKm, pr.vehicle_type === 'bike' ? 'bike' : 'car'),
      pending_offers_count: pendingOffersCount,
      confirmed_ride_id: acceptedOfferSummary?.confirmed_ride_id ?? null,
      confirmed_ride_status: acceptedOfferSummary?.confirmed_ride_status ?? null
    };

    res.status(200).json({
      success: true,
      request: safeRequest,
      offers,
      myOffer,
      isOwner,
      pendingOffersCount
    });
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'getPassengerRequestById', 'Failed to load passenger ride request.');
  }
}

export async function cancelPassengerRequest(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }
  if (isTruthyDbFlag(req.user.is_blocked)) {
    res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
    return;
  }

  const requestId = isPositiveIntId(req.params.id);
  if (!requestId) {
    res.status(400).json({ success: false, message: 'Invalid passenger request ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'cancelPassengerRequest', 'Failed to cancel ride request.');
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [rows] = await conn.query('SELECT * FROM passenger_requests WHERE id = ? FOR UPDATE', [requestId]);
    const pr = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!pr) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Passenger ride request not found.' });
      return;
    }

    if (Number(pr.passenger_id) !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'You can only cancel your own ride requests.' });
      return;
    }

    const depDate = parseRideDateTime(pr.departure_time);
    if (pr.status === 'open' && (!depDate || depDate.getTime() <= Date.now())) {
      await expireSingleRequestOnConn(conn, requestId);
      await conn.commit();
      txActive = false;
      res.status(409).json({ success: false, message: 'This ride request has already expired.' });
      return;
    }

    if (pr.status !== 'open') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot cancel a ride request that is already ${pr.status}.`
      });
      return;
    }

    const [pendingOffers] = await conn.query(
      "SELECT id, driver_id FROM driver_offers WHERE request_id = ? AND status = 'pending'",
      [requestId]
    );
    const affectedDrivers = Array.isArray(pendingOffers)
      ? (pendingOffers as any[]).map((o) => Number(o.driver_id))
      : [];

    const [reqUpdate] = await conn.query(
      "UPDATE passenger_requests SET status = 'cancelled', updated_at = NOW() WHERE id = ? AND status = 'open'",
      [requestId]
    );
    if ((reqUpdate as any)?.affectedRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Request could not be cancelled due to concurrent update.' });
      return;
    }

    await conn.query(
      "UPDATE driver_offers SET status = 'rejected', updated_at = NOW() WHERE request_id = ? AND status = 'pending'",
      [requestId]
    );

    await conn.commit();
    txActive = false;

    for (const driverId of affectedDrivers) {
      await createNotification({
        userId: driverId,
        type: 'passenger_request_cancelled',
        title: 'Passenger Request Cancelled',
        message: `The passenger cancelled the ride request from ${pr.pickup_name} to ${pr.dest_name}.`,
        link: `/passenger-requests/${requestId}`
      });
      pushToUser(driverId, { event: 'passenger_request:cancelled', requestId });
    }

    res.status(200).json({
      success: true,
      message: 'Ride request cancelled and pending driver offers closed.'
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('cancelPassengerRequest rollback error:', rollbackErr);
      }
    }
    handlePassengerRequestError(res, error, 'cancelPassengerRequest', 'Failed to cancel ride request.');
  } finally {
    conn.release();
  }
}

export async function createDriverOffer(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }
  if (isTruthyDbFlag(req.user.is_blocked)) {
    res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
    return;
  }

  const requestId = isPositiveIntId(req.params.id);
  if (!requestId) {
    res.status(400).json({ success: false, message: 'Invalid passenger request ID.' });
    return;
  }

  const { fare, seats_offered, pickup_time, message } = req.body ?? {};

  if (fare === undefined || fare === null || String(fare).trim() === '') {
    res.status(400).json({ success: false, message: 'Offer fare (BDT) is required.' });
    return;
  }
  const numFare = Number(fare);
  if (!Number.isFinite(numFare) || numFare < 0 || numFare > 50000) {
    res.status(400).json({ success: false, message: 'Offer fare must be between 0 and 50,000 BDT.' });
    return;
  }

  const pickupDate = parseRideDateTime(pickup_time);
  if (!pickupDate) {
    res.status(400).json({ success: false, message: 'Valid pickup_time is required.' });
    return;
  }
  if (pickupDate.getTime() <= Date.now()) {
    res.status(400).json({ success: false, message: 'Proposed pickup time must be in the future.' });
    return;
  }

  if (message !== undefined && message !== null && (typeof message !== 'string' || message.trim().length > 500)) {
    res.status(400).json({ success: false, message: 'Message must be text of at most 500 characters.' });
    return;
  }
  const cleanMessage = typeof message === 'string' && message.trim() ? message.trim() : null;

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'createDriverOffer', 'Failed to submit driver offer.');
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [reqRows] = await conn.query('SELECT * FROM passenger_requests WHERE id = ? FOR UPDATE', [requestId]);
    const pr = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!pr) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Passenger ride request not found.' });
      return;
    }

    if (Number(pr.passenger_id) === req.user.id) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'You cannot submit an offer on your own ride request.' });
      return;
    }

    if (await areUsersBlockedOnConn(conn, req.user.id, Number(pr.passenger_id))) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({
        success: false,
        message: 'Cannot submit an offer due to block settings between users.'
      });
      return;
    }

    const [passengerRows] = await conn.query(
      'SELECT id, is_blocked FROM users WHERE id = ?',
      [Number(pr.passenger_id)]
    );
    const passengerUser = Array.isArray(passengerRows) && passengerRows.length > 0 ? (passengerRows[0] as any) : null;
    if (!passengerUser || isTruthyDbFlag(passengerUser.is_blocked)) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({
        success: false,
        message: 'Cannot submit an offer because this passenger account is unavailable.'
      });
      return;
    }

    const [driverRows] = await conn.query(
      'SELECT id, name, driver_status, vehicle_type, is_blocked FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );
    const driver = Array.isArray(driverRows) && driverRows.length > 0 ? (driverRows[0] as any) : null;
    if (
      !driver ||
      driver.driver_status !== 'approved' ||
      isTruthyDbFlag(driver.is_blocked) ||
      (driver.vehicle_type !== 'bike' && driver.vehicle_type !== 'car')
    ) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({
        success: false,
        message: 'Only active approved drivers with a registered bike or car can submit offers.'
      });
      return;
    }

    const driverVehicleType = driver.vehicle_type as 'bike' | 'car';
    const parsedSeats = seats_offered === undefined || seats_offered === null ? 1 : Number(seats_offered);

    if (driverVehicleType === 'bike' && parsedSeats !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'Bike drivers may only offer 1 seat.' });
      return;
    }
    if (driverVehicleType === 'car' && (!Number.isInteger(parsedSeats) || parsedSeats < 1 || parsedSeats > 4)) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'Car drivers must offer between 1 and 4 seats.' });
      return;
    }

    if (pr.vehicle_type !== 'any' && pr.vehicle_type !== driverVehicleType) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({
        success: false,
        message: `This passenger specifically requested a ${pr.vehicle_type}.`
      });
      return;
    }

    const depDate = parseRideDateTime(pr.departure_time);
    if (pr.status === 'open' && (!depDate || depDate.getTime() <= Date.now())) {
      await expireSingleRequestOnConn(conn, requestId);
      await conn.commit();
      txActive = false;
      res.status(409).json({ success: false, message: 'This passenger ride request has expired.' });
      return;
    }

    if (pr.status !== 'open') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot submit an offer because this request is ${pr.status}.`
      });
      return;
    }

    if (depDate && Math.abs(pickupDate.getTime() - depDate.getTime()) > OFFER_PICKUP_WINDOW_MS) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({
        success: false,
        message: 'Proposed pickup time must be within 4 hours of the requested departure time.'
      });
      return;
    }

    const [existingRows] = await conn.query(
      'SELECT id, status FROM driver_offers WHERE request_id = ? AND driver_id = ? FOR UPDATE',
      [requestId, req.user.id]
    );
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'You have already submitted an offer for this ride request.'
      });
      return;
    }

    const formattedPickup = formatDateToMySqlUtc(pickupDate);
    const [insertRes] = await conn.query(
      `INSERT INTO driver_offers
        (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [requestId, req.user.id, numFare, parsedSeats, driverVehicleType, formattedPickup, cleanMessage]
    );

    const offerId = Number((insertRes as any).insertId);
    await conn.commit();
    txActive = false;

    await createNotification({
      userId: Number(pr.passenger_id),
      type: 'offer_received',
      title: 'New Driver Offer Received',
      message: `${req.user.name} offered a ${driverVehicleType} ride for ৳${numFare} (${pr.pickup_name} to ${pr.dest_name}).`,
      link: `/passenger-requests/${requestId}`
    });
    pushToUser(Number(pr.passenger_id), {
      event: 'offer:new',
      requestId,
      offerId
    });

    res.status(201).json({
      success: true,
      message: 'Your ride offer has been sent to the passenger.',
      offerId
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('createDriverOffer rollback error:', rollbackErr);
      }
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({
        success: false,
        message: 'You have already submitted an offer for this ride request.'
      });
      return;
    }
    handlePassengerRequestError(res, error, 'createDriverOffer', 'Failed to submit driver offer.');
  } finally {
    conn.release();
  }
}

export async function getMyDriverOffers(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }
    if (isTruthyDbFlag(req.user.is_blocked)) {
      res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
      return;
    }

    await expireElapsedPassengerRequests();

    const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
    if (rawStatus && !['pending', 'accepted', 'rejected', 'withdrawn', 'expired'].includes(rawStatus)) {
      res.status(400).json({ success: false, message: 'Invalid status filter.' });
      return;
    }

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100
    });

    const blockedSet = await getBlockedUserIds(req.user.id);

    let query = `
      SELECT o.*,
             cr.status AS confirmed_ride_status,
             pr.passenger_id, pr.pickup_name, pr.pickup_lat, pr.pickup_lng,
             pr.dest_name, pr.dest_lat, pr.dest_lng, pr.departure_time,
             pr.max_fare, pr.vehicle_type AS request_vehicle_type, pr.status AS request_status,
             pu.name AS passenger_name, pu.email AS passenger_email,
             pu.phone AS passenger_phone, pu.student_id AS passenger_student_id,
             pu.is_blocked AS passenger_is_blocked
      FROM driver_offers o
      JOIN passenger_requests pr ON o.request_id = pr.id
      JOIN users pu ON pr.passenger_id = pu.id
      LEFT JOIN rides cr ON o.confirmed_ride_id = cr.id
      WHERE o.driver_id = ?
    `;
    const params: any[] = [req.user.id];

    if (rawStatus) {
      query += ` AND o.status = ?`;
      params.push(rawStatus);
    }

    query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit + 1, offset);

    const [rows] = await db.query(query, params);
    const rawList = (rows as any[]) || [];
    const visibleRaw = rawList.filter((o) => {
      const pid = Number(o.passenger_id);
      const blockedOrSuspended = blockedSet.has(pid) || isTruthyDbFlag(o.passenger_is_blocked);
      return o.status === 'accepted' || !blockedOrSuspended;
    });
    const hasMore = visibleRaw.length > limit;
    const list = hasMore ? visibleRaw.slice(0, limit) : visibleRaw;

    const passengerIds = list.map((o) => Number(o.passenger_id)).filter(Boolean);
    const [extMap, ratingMap] = await Promise.all([
      getUserExtendedFieldsBatch(passengerIds, { includeAvatar: true }),
      getUserRatingSummaries(passengerIds)
    ]);

    const enriched = list.map((o) => {
      const pid = Number(o.passenger_id);
      const pExt = extMap.get(pid);
      const pRating = ratingMap.get(pid) || { avg_rating: null, review_count: 0 };
      const isAccepted = o.status === 'accepted';
      const isBlockedOrSuspended = blockedSet.has(pid) || isTruthyDbFlag(o.passenger_is_blocked);
      const allowEmail = isAccepted && !isBlockedOrSuspended;
      const allowPhone = allowEmail && (pExt?.show_phone_to_accepted ?? 1) !== 0;

      return {
        ...o,
        fare: Number(o.fare),
        max_fare: o.max_fare !== null && o.max_fare !== undefined ? Number(o.max_fare) : null,
        pickup_time: toUtcIsoString(o.pickup_time),
        departure_time: o.departure_time ? toUtcIsoString(o.departure_time) : o.departure_time,
        confirmed_ride_status: o.confirmed_ride_status ?? null,
        passenger_phone: allowPhone ? o.passenger_phone : null,
        passenger_email: allowEmail ? o.passenger_email : null,
        passenger_avg_rating: pRating.avg_rating,
        passenger_review_count: pRating.review_count,
        passenger_student_verified: pExt?.student_verified ?? 0,
        passenger_avatar_url: pExt?.avatar_url ?? null
      };
    });

    res.status(200).json({
      success: true,
      offers: enriched,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
    });
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'getMyDriverOffers', 'Failed to load your submitted offers.');
  }
}

export async function updateDriverOffer(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }
  if (isTruthyDbFlag(req.user.is_blocked)) {
    res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
    return;
  }

  const offerId = isPositiveIntId(req.params.offerId);
  if (!offerId) {
    res.status(400).json({ success: false, message: 'Invalid offer ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'updateDriverOffer', 'Failed to update driver offer.');
    return;
  }

  let txActive = false;
  try {
    // Non-locking lookup of parent request_id so transaction locks strictly follow:
    // 1. passenger_requests FOR UPDATE -> 2. driver_offers FOR UPDATE
    const [offerLookupRows] = await conn.query('SELECT id, request_id FROM driver_offers WHERE id = ?', [offerId]);
    const offerLookup =
      Array.isArray(offerLookupRows) && offerLookupRows.length > 0 ? (offerLookupRows[0] as any) : null;
    if (!offerLookup) {
      res.status(404).json({ success: false, message: 'Offer not found.' });
      return;
    }

    await conn.beginTransaction();
    txActive = true;

    const [reqRows] = await conn.query('SELECT * FROM passenger_requests WHERE id = ? FOR UPDATE', [
      offerLookup.request_id
    ]);
    const pr = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;

    const [offerRows] = await conn.query(
      'SELECT * FROM driver_offers WHERE id = ? AND request_id = ? FOR UPDATE',
      [offerId, offerLookup.request_id]
    );
    const offer = Array.isArray(offerRows) && offerRows.length > 0 ? (offerRows[0] as any) : null;
    if (!offer) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Offer not found.' });
      return;
    }

    if (Number(offer.driver_id) !== req.user.id) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'You can only edit your own offers.' });
      return;
    }

    if (offer.status !== 'pending') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: `Cannot edit an offer that is ${offer.status}.` });
      return;
    }

    if (!pr) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Parent ride request not found.' });
      return;
    }

    const depDate = parseRideDateTime(pr.departure_time);
    if (pr.status === 'open' && (!depDate || depDate.getTime() <= Date.now())) {
      await expireSingleRequestOnConn(conn, Number(pr.id));
      await conn.commit();
      txActive = false;
      res.status(409).json({ success: false, message: 'This passenger ride request has expired.' });
      return;
    }

    if (pr.status !== 'open') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: `Cannot edit offer because request is ${pr.status}.` });
      return;
    }

    if (await areUsersBlockedOnConn(conn, req.user.id, Number(pr.passenger_id))) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({
        success: false,
        message: 'Cannot edit offer due to block settings between users.'
      });
      return;
    }

    const [passengerRows] = await conn.query(
      'SELECT id, is_blocked FROM users WHERE id = ?',
      [Number(pr.passenger_id)]
    );
    const passengerUser = Array.isArray(passengerRows) && passengerRows.length > 0 ? (passengerRows[0] as any) : null;
    if (!passengerUser || isTruthyDbFlag(passengerUser.is_blocked)) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({
        success: false,
        message: 'Cannot edit offer because this passenger account is unavailable.'
      });
      return;
    }

    const [driverRows] = await conn.query(
      'SELECT id, driver_status, vehicle_type, is_blocked FROM users WHERE id = ? FOR UPDATE',
      [req.user.id]
    );
    const driver = Array.isArray(driverRows) && driverRows.length > 0 ? (driverRows[0] as any) : null;
    if (
      !driver ||
      driver.driver_status !== 'approved' ||
      isTruthyDbFlag(driver.is_blocked) ||
      (driver.vehicle_type !== 'bike' && driver.vehicle_type !== 'car')
    ) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'Approved active driver status is required.' });
      return;
    }
    const driverVehicle = driver.vehicle_type as 'bike' | 'car';

    const { fare, seats_offered, pickup_time, message } = req.body ?? {};

    let nextFare = Number(offer.fare);
    if (fare !== undefined && fare !== null && String(fare).trim() !== '') {
      const parsedFare = Number(fare);
      if (!Number.isFinite(parsedFare) || parsedFare < 0 || parsedFare > 50000) {
        await conn.rollback();
        txActive = false;
        res.status(400).json({ success: false, message: 'Offer fare must be between 0 and 50,000 BDT.' });
        return;
      }
      nextFare = parsedFare;
    }

    let nextSeats = Number(offer.seats_offered);
    if (seats_offered !== undefined && seats_offered !== null) {
      nextSeats = Number(seats_offered);
    }
    if (driverVehicle === 'bike' && nextSeats !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'Bike drivers may only offer 1 seat.' });
      return;
    }
    if (driverVehicle === 'car' && (!Number.isInteger(nextSeats) || nextSeats < 1 || nextSeats > 4)) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'Car drivers must offer between 1 and 4 seats.' });
      return;
    }

    let nextPickupDate = parseRideDateTime(offer.pickup_time);
    if (pickup_time !== undefined && pickup_time !== null && String(pickup_time).trim() !== '') {
      nextPickupDate = parseRideDateTime(pickup_time);
      if (!nextPickupDate) {
        await conn.rollback();
        txActive = false;
        res.status(400).json({ success: false, message: 'Invalid pickup_time format.' });
        return;
      }
    }
    if (!nextPickupDate || nextPickupDate.getTime() <= Date.now()) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'Proposed pickup time must be in the future.' });
      return;
    }
    if (depDate && Math.abs(nextPickupDate.getTime() - depDate.getTime()) > OFFER_PICKUP_WINDOW_MS) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({
        success: false,
        message: 'Proposed pickup time must be within 4 hours of the requested departure time.'
      });
      return;
    }

    let nextMessage = offer.message;
    if (message !== undefined) {
      if (message !== null && (typeof message !== 'string' || message.trim().length > 500)) {
        await conn.rollback();
        txActive = false;
        res.status(400).json({ success: false, message: 'Message must be text of at most 500 characters.' });
        return;
      }
      nextMessage = typeof message === 'string' && message.trim() ? message.trim() : null;
    }

    const formattedPickup = formatDateToMySqlUtc(nextPickupDate);
    const [updateRes] = await conn.query(
      `UPDATE driver_offers
       SET fare = ?, seats_offered = ?, pickup_time = ?, message = ?, updated_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [nextFare, nextSeats, formattedPickup, nextMessage, offerId]
    );
    if ((updateRes as any)?.affectedRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Offer could not be updated concurrently.' });
      return;
    }

    await conn.commit();
    txActive = false;

    await createNotification({
      userId: Number(pr.passenger_id),
      type: 'offer_updated',
      title: 'Driver Offer Updated',
      message: `${req.user.name} updated their offer to ৳${nextFare} for your ride request (${pr.pickup_name} to ${pr.dest_name}).`,
      link: `/passenger-requests/${pr.id}`
    });
    pushToUser(Number(pr.passenger_id), { event: 'offer:updated', requestId: Number(pr.id), offerId });

    res.status(200).json({
      success: true,
      message: 'Offer updated successfully.'
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('updateDriverOffer rollback error:', rollbackErr);
      }
    }
    handlePassengerRequestError(res, error, 'updateDriverOffer', 'Failed to update driver offer.');
  } finally {
    conn.release();
  }
}

export async function withdrawDriverOffer(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }
  if (isTruthyDbFlag(req.user.is_blocked)) {
    res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
    return;
  }

  const offerId = isPositiveIntId(req.params.offerId);
  if (!offerId) {
    res.status(400).json({ success: false, message: 'Invalid offer ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'withdrawDriverOffer', 'Failed to withdraw offer.');
    return;
  }

  let txActive = false;
  try {
    // Non-locking lookup of parent request_id so transaction locks strictly follow:
    // 1. passenger_requests FOR UPDATE -> 2. driver_offers FOR UPDATE
    const [offerLookupRows] = await conn.query('SELECT id, request_id FROM driver_offers WHERE id = ?', [offerId]);
    const offerLookup =
      Array.isArray(offerLookupRows) && offerLookupRows.length > 0 ? (offerLookupRows[0] as any) : null;
    if (!offerLookup) {
      res.status(404).json({ success: false, message: 'Offer not found.' });
      return;
    }

    await conn.beginTransaction();
    txActive = true;

    const [reqRows] = await conn.query(
      'SELECT id, passenger_id, pickup_name, dest_name, status, departure_time FROM passenger_requests WHERE id = ? FOR UPDATE',
      [offerLookup.request_id]
    );
    const pr = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;

    const [offerRows] = await conn.query(
      'SELECT * FROM driver_offers WHERE id = ? AND request_id = ? FOR UPDATE',
      [offerId, offerLookup.request_id]
    );
    const offer = Array.isArray(offerRows) && offerRows.length > 0 ? (offerRows[0] as any) : null;
    if (!offer) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Offer not found.' });
      return;
    }

    if (Number(offer.driver_id) !== req.user.id) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'You can only withdraw your own offers.' });
      return;
    }

    if (offer.status !== 'pending') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot withdraw an offer that is already ${offer.status}.`
      });
      return;
    }

    if (!pr) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Parent passenger ride request not found.' });
      return;
    }

    const depDate = parseRideDateTime(pr.departure_time);
    if (pr.status === 'open' && (!depDate || depDate.getTime() <= Date.now())) {
      await expireSingleRequestOnConn(conn, Number(pr.id));
      await conn.commit();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'This passenger ride request has expired and your offer can no longer be withdrawn.'
      });
      return;
    }

    if (pr.status !== 'open') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot withdraw offer because request is already ${pr.status}.`
      });
      return;
    }

    const [updateRes] = await conn.query(
      "UPDATE driver_offers SET status = 'withdrawn', updated_at = NOW() WHERE id = ? AND status = 'pending'",
      [offerId]
    );
    if ((updateRes as any)?.affectedRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Offer status changed concurrently.' });
      return;
    }

    await conn.commit();
    txActive = false;

    if (pr) {
      await createNotification({
        userId: Number(pr.passenger_id),
        type: 'offer_withdrawn',
        title: 'Driver Offer Withdrawn',
        message: `${req.user.name} withdrew their offer for your ride request (${pr.pickup_name} to ${pr.dest_name}).`,
        link: `/passenger-requests/${pr.id}`
      });
      pushToUser(Number(pr.passenger_id), { event: 'offer:withdrawn', requestId: Number(pr.id), offerId });
    }

    res.status(200).json({
      success: true,
      message: 'Offer withdrawn.'
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('withdrawDriverOffer rollback error:', rollbackErr);
      }
    }
    handlePassengerRequestError(res, error, 'withdrawDriverOffer', 'Failed to withdraw offer.');
  } finally {
    conn.release();
  }
}

export async function acceptDriverOffer(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }
  if (isTruthyDbFlag(req.user.is_blocked)) {
    res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
    return;
  }

  const requestId = isPositiveIntId(req.params.id);
  const offerId = isPositiveIntId(req.params.offerId);
  if (!requestId || !offerId) {
    res.status(400).json({ success: false, message: 'Invalid request ID or offer ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'acceptDriverOffer', 'Failed to accept driver offer.');
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    // 1. Lock passenger_requests row FOR UPDATE
    const [reqRows] = await conn.query('SELECT * FROM passenger_requests WHERE id = ? FOR UPDATE', [requestId]);
    const pr = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!pr) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Passenger ride request not found.' });
      return;
    }

    // 2. Lock driver_offers row FOR UPDATE
    const [offerRows] = await conn.query(
      'SELECT * FROM driver_offers WHERE id = ? AND request_id = ? FOR UPDATE',
      [offerId, requestId]
    );
    const offer = Array.isArray(offerRows) && offerRows.length > 0 ? (offerRows[0] as any) : null;
    if (!offer) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Driver offer not found for this request.' });
      return;
    }

    // 3. Ownership check
    if (Number(pr.passenger_id) !== req.user.id) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'Only the requesting passenger can accept an offer.' });
      return;
    }

    // 4. Blocking check
    if (await areUsersBlockedOnConn(conn, Number(pr.passenger_id), Number(offer.driver_id))) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({
        success: false,
        message: 'Cannot accept offer because one of the users has blocked the other.'
      });
      return;
    }

    // 5. Check request expiration / open status
    const depDate = parseRideDateTime(pr.departure_time);
    if (pr.status === 'open' && (!depDate || depDate.getTime() <= Date.now())) {
      await expireSingleRequestOnConn(conn, requestId);
      await conn.commit();
      txActive = false;
      res.status(409).json({ success: false, message: 'This passenger ride request has expired.' });
      return;
    }

    if (pr.status !== 'open' || pr.accepted_offer_id !== null) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot accept offer: this ride request is already ${pr.status}.`
      });
      return;
    }

    // 6. Check offer pending status
    if (offer.status !== 'pending') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot accept an offer that is already ${offer.status}.`
      });
      return;
    }

    // 7. Check offer pickup_time is still in the future
    const pickupDate = parseRideDateTime(offer.pickup_time);
    if (!pickupDate || pickupDate.getTime() <= Date.now()) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'The proposed pickup time has already passed.' });
      return;
    }

    // 8. Lock driver in users table to verify active approved driver status & vehicle_type
    const [driverRows] = await conn.query(
      'SELECT id, name, driver_status, vehicle_type, is_blocked FROM users WHERE id = ? FOR UPDATE',
      [offer.driver_id]
    );
    const driver = Array.isArray(driverRows) && driverRows.length > 0 ? (driverRows[0] as any) : null;
    if (
      !driver ||
      driver.driver_status !== 'approved' ||
      isTruthyDbFlag(driver.is_blocked) ||
      (driver.vehicle_type !== 'bike' && driver.vehicle_type !== 'car')
    ) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'Selected driver is no longer an active approved driver.'
      });
      return;
    }

    // 9. Re-check vehicle & seat rules
    const driverVehicle = driver.vehicle_type as 'bike' | 'car';
    const seatsTotal = Number(offer.seats_offered);
    if (offer.vehicle_type !== driverVehicle) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'Offer vehicle type no longer matches the driver registered vehicle.'
      });
      return;
    }
    if (driverVehicle === 'bike' && seatsTotal !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Bike offers can only provide 1 seat.' });
      return;
    }
    if (driverVehicle === 'car' && (!Number.isInteger(seatsTotal) || seatsTotal < 1 || seatsTotal > 4)) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Car offers must provide between 1 and 4 seats.' });
      return;
    }

    const seatsAvailable = seatsTotal - 1;
    const rideStatus = seatsAvailable === 0 ? 'full' : 'open';
    const formattedPickupTime = formatDateToMySqlUtc(pickupDate);
    const rideNote = offer.message ? String(offer.message) : pr.note ?? null;

    // 10. Collect competing pending offers for post-commit notifications
    const [competingRows] = await conn.query(
      "SELECT id, driver_id FROM driver_offers WHERE request_id = ? AND id != ? AND status = 'pending'",
      [requestId, offerId]
    );
    const competingDriverIds = Array.isArray(competingRows)
      ? (competingRows as any[]).map((r) => Number(r.driver_id))
      : [];

    // 11. Prefer reusing a verified compatible existing posted ride from this driver;
    //     otherwise fall back to creating a new confirmed ride.
    let targetRideId = 0;
    let reusedExistingRide = false;

    const [candidateRideRows] = await conn.query(
      `SELECT r.*
       FROM rides r
       WHERE r.driver_id = ?
         AND r.status IN ('open', 'scheduled')
         AND r.seats_available > 0
         AND r.departure_time > UTC_TIMESTAMP()
       ORDER BY r.departure_time ASC`,
      [Number(offer.driver_id)]
    );

    const nowMs = Date.now();
    const compatibleCandidates = depDate
      ? (Array.isArray(candidateRideRows) ? (candidateRideRows as any[]) : [])
          .map((cand) => ({
            cand,
            ...isRideCompatibleForOffer({
              ride: cand,
              pr,
              offer,
              driverVehicle,
              prDepDate: depDate,
              offerPickupDate: pickupDate,
              nowMs
            })
          }))
          .filter((item) => item.compatible)
          .sort((a, b) => a.timeScoreMs - b.timeScoreMs || Number(a.cand.id) - Number(b.cand.id))
      : [];

    for (const candidate of compatibleCandidates) {
      if (!depDate) break;
      const candidateRideId = Number(candidate.cand.id);
      const [lockedRideRows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [candidateRideId]);
      const lockedRide =
        Array.isArray(lockedRideRows) && lockedRideRows.length > 0 ? (lockedRideRows[0] as any) : null;
      if (!lockedRide) continue;

      const recheck = isRideCompatibleForOffer({
        ride: lockedRide,
        pr,
        offer,
        driverVehicle,
        prDepDate: depDate,
        offerPickupDate: pickupDate,
        nowMs: Date.now()
      });
      if (!recheck.compatible) continue;

      const [existingBookingRows] = await conn.query(
        'SELECT id, status FROM ride_requests WHERE ride_id = ? AND passenger_id = ? FOR UPDATE',
        [candidateRideId, Number(pr.passenger_id)]
      );
      const existingBooking =
        Array.isArray(existingBookingRows) && existingBookingRows.length > 0
          ? (existingBookingRows[0] as any)
          : null;

      // Never create duplicate accepted bookings or resurrect rejected/cancelled bookings on an existing ride.
      if (existingBooking && existingBooking.status !== 'pending') {
        continue;
      }

      const [rideUpdateRes] = await conn.query(
        `UPDATE rides
         SET seats_available = seats_available - 1,
             status = IF(seats_available - 1 = 0, 'full', status)
         WHERE id = ? AND seats_available > 0`,
        [candidateRideId]
      );
      if ((rideUpdateRes as any)?.affectedRows !== 1) {
        continue;
      }

      if (existingBooking) {
        const [reuseReqUpdateRes] = await conn.query(
          "UPDATE ride_requests SET status = 'accepted', updated_at = NOW() WHERE id = ? AND status = 'pending'",
          [Number(existingBooking.id)]
        );
        if ((reuseReqUpdateRes as any)?.affectedRows !== 1) {
          await conn.rollback();
          txActive = false;
          res.status(409).json({
            success: false,
            message: 'Passenger booking state changed concurrently. Please try again.'
          });
          return;
        }
      } else {
        await conn.query(
          `INSERT INTO ride_requests (ride_id, passenger_id, status) VALUES (?, ?, 'accepted')`,
          [candidateRideId, Number(pr.passenger_id)]
        );
      }

      targetRideId = candidateRideId;
      reusedExistingRide = true;
      break;
    }

    if (!targetRideId) {
      const [rideInsertRes] = await conn.query(
        `INSERT INTO rides
          (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(offer.driver_id),
          pr.pickup_name,
          Number(pr.pickup_lat),
          Number(pr.pickup_lng),
          pr.dest_name,
          Number(pr.dest_lat),
          Number(pr.dest_lng),
          formattedPickupTime,
          Number(offer.fare),
          seatsTotal,
          seatsAvailable,
          driverVehicle,
          rideNote,
          rideStatus
        ]
      );
      targetRideId = Number((rideInsertRes as any).insertId);

      // 12. Create accepted ride_request booking for the passenger on the new ride
      await conn.query(
        `INSERT INTO ride_requests (ride_id, passenger_id, status) VALUES (?, ?, 'accepted')`,
        [targetRideId, Number(pr.passenger_id)]
      );
    }

    // 13. Reuse or create conversation for driver & passenger on this confirmed ride
    const [existingConvRows] = await conn.query(
      'SELECT id FROM conversations WHERE ride_id = ? AND passenger_id = ? LIMIT 1',
      [targetRideId, Number(pr.passenger_id)]
    );
    let conversationId: number;
    if (Array.isArray(existingConvRows) && existingConvRows.length > 0) {
      conversationId = Number((existingConvRows[0] as any).id);
    } else {
      const [convInsertRes] = await conn.query(
        `INSERT INTO conversations (ride_id, driver_id, passenger_id) VALUES (?, ?, ?)`,
        [targetRideId, Number(offer.driver_id), Number(pr.passenger_id)]
      );
      conversationId = Number((convInsertRes as any).insertId);
    }

    // 14. Mark selected offer as accepted & link confirmed_ride_id
    const [acceptOfferRes] = await conn.query(
      `UPDATE driver_offers
       SET status = 'accepted', confirmed_ride_id = ?, updated_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [targetRideId, offerId]
    );
    if ((acceptOfferRes as any)?.affectedRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Offer could not be accepted due to concurrent update.' });
      return;
    }

    // 15. Reject competing pending offers
    await conn.query(
      `UPDATE driver_offers
       SET status = 'rejected', updated_at = NOW()
       WHERE request_id = ? AND id != ? AND status = 'pending'`,
      [requestId, offerId]
    );

    // 16. Mark passenger request matched
    const [matchReqRes] = await conn.query(
      `UPDATE passenger_requests
       SET status = 'matched', accepted_offer_id = ?, updated_at = NOW()
       WHERE id = ? AND status = 'open' AND accepted_offer_id IS NULL`,
      [offerId, requestId]
    );
    if ((matchReqRes as any)?.affectedRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'Request was already matched concurrently.'
      });
      return;
    }

    // 17. Commit atomically
    await conn.commit();
    txActive = false;

    // 18. Invalidate reminder caches & emit post-commit notifications + WS events
    invalidateReminderCacheForUser(Number(offer.driver_id));
    invalidateReminderCacheForUser(Number(pr.passenger_id));

    await createNotification({
      userId: Number(offer.driver_id),
      type: 'offer_accepted',
      title: 'Your Ride Offer Was Accepted!',
      message: reusedExistingRide
        ? `${req.user.name} accepted your ৳${Number(offer.fare)} offer from ${pr.pickup_name} to ${pr.dest_name} and joined your existing ride (#${targetRideId}).`
        : `${req.user.name} accepted your ৳${Number(offer.fare)} offer from ${pr.pickup_name} to ${pr.dest_name}. A confirmed ride (#${targetRideId}) is now scheduled.`,
      link: `/rides/${targetRideId}`
    });
    pushToUser(Number(offer.driver_id), {
      event: 'offer:accepted',
      requestId,
      offerId,
      rideId: targetRideId,
      conversationId
    });

    await createNotification({
      userId: Number(pr.passenger_id),
      type: 'ride_matched',
      title: 'Ride Confirmed!',
      message: `Your ride with ${driver.name} (${pr.pickup_name} to ${pr.dest_name}) is confirmed for ৳${Number(offer.fare)}.`,
      link: `/rides/${targetRideId}`
    });
    pushToUser(Number(pr.passenger_id), {
      event: 'passenger_request:matched',
      requestId,
      offerId,
      rideId: targetRideId,
      conversationId
    });

    for (const rejectedDriverId of competingDriverIds) {
      await createNotification({
        userId: rejectedDriverId,
        type: 'offer_rejected',
        title: 'Offer Not Selected',
        message: `Another driver's offer was selected for the ride request (${pr.pickup_name} to ${pr.dest_name}).`,
        link: `/passenger-requests/${requestId}`
      });
      pushToUser(rejectedDriverId, {
        event: 'offer:rejected',
        requestId
      });
    }

    res.status(200).json({
      success: true,
      message: reusedExistingRide
        ? 'Driver offer accepted! Passenger linked to your existing ride and chat conversation ready.'
        : 'Driver offer accepted! Confirmed ride and chat conversation created.',
      rideId: targetRideId,
      reusedExistingRide,
      conversationId,
      offerId,
      requestId
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('acceptDriverOffer rollback error:', rollbackErr);
      }
    }
    handlePassengerRequestError(res, error, 'acceptDriverOffer', 'Failed to accept driver offer.');
  } finally {
    conn.release();
  }
}

export async function rejectDriverOffer(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }
  if (isTruthyDbFlag(req.user.is_blocked)) {
    res.status(403).json({ success: false, message: 'Your account has been suspended by campus administration.' });
    return;
  }

  const requestId = isPositiveIntId(req.params.id);
  const offerId = isPositiveIntId(req.params.offerId);
  if (!requestId || !offerId) {
    res.status(400).json({ success: false, message: 'Invalid request ID or offer ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    handlePassengerRequestError(res, error, 'rejectDriverOffer', 'Failed to reject driver offer.');
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [reqRows] = await conn.query('SELECT * FROM passenger_requests WHERE id = ? FOR UPDATE', [requestId]);
    const pr = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!pr) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Passenger ride request not found.' });
      return;
    }

    if (Number(pr.passenger_id) !== req.user.id) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'Only the requesting passenger can reject offers.' });
      return;
    }

    const [offerRows] = await conn.query(
      'SELECT * FROM driver_offers WHERE id = ? AND request_id = ? FOR UPDATE',
      [offerId, requestId]
    );
    const offer = Array.isArray(offerRows) && offerRows.length > 0 ? (offerRows[0] as any) : null;
    if (!offer) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Driver offer not found for this request.' });
      return;
    }

    const depDate = parseRideDateTime(pr.departure_time);
    if (pr.status === 'open' && (!depDate || depDate.getTime() <= Date.now())) {
      await expireSingleRequestOnConn(conn, requestId);
      await conn.commit();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'This passenger ride request has expired.'
      });
      return;
    }

    if (pr.status !== 'open') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: `Cannot reject offer: request is ${pr.status}.` });
      return;
    }

    if (offer.status !== 'pending') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: `Offer is already ${offer.status}.` });
      return;
    }

    const [updateRes] = await conn.query(
      "UPDATE driver_offers SET status = 'rejected', updated_at = NOW() WHERE id = ? AND status = 'pending'",
      [offerId]
    );
    if ((updateRes as any)?.affectedRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Offer status changed concurrently.' });
      return;
    }

    await conn.commit();
    txActive = false;

    await createNotification({
      userId: Number(offer.driver_id),
      type: 'offer_rejected',
      title: 'Ride Offer Declined',
      message: `${req.user.name} declined your offer for the ride request (${pr.pickup_name} to ${pr.dest_name}).`,
      link: `/passenger-requests/${requestId}`
    });
    pushToUser(Number(offer.driver_id), { event: 'offer:rejected', requestId, offerId });

    res.status(200).json({
      success: true,
      message: 'Driver offer declined.'
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('rejectDriverOffer rollback error:', rollbackErr);
      }
    }
    handlePassengerRequestError(res, error, 'rejectDriverOffer', 'Failed to reject driver offer.');
  } finally {
    conn.release();
  }
}
