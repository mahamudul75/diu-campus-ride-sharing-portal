import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db, type IDatabaseConnection } from '../config/db.ts';
import { parseRideDateTime, toUtcIsoString } from '../utils/dateTime.ts';
import { isPositiveIntId, parsePaginationParams } from '../utils/validators.ts';
import {
  areUsersBlocked,
  getUserExtendedFieldsBatch,
  getUserRatingSummaries
} from '../utils/dbHelpers.ts';
import { calculateHaversineDistanceKm, estimateDurationMinutes } from '../utils/distance.ts';
import { createNotification, invalidateReminderCacheForUser } from '../services/notificationService.ts';
import { syncPassengerRequestOnBookingCancelled } from './passengerRequestController.ts';

export async function createRideRequest(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  const rideId = isPositiveIntId(req.params.id);
  if (!rideId) {
    res.status(400).json({ success: false, message: 'Invalid ride ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable. Please try again shortly.' });
      return;
    }
    console.error('createRideRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit ride request.' });
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [rideRows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [rideId]);
    const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;

    if (!ride) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.driver_id === req.user.id) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'You cannot request your own ride.' });
      return;
    }

    if (await areUsersBlocked(req.user.id, Number(ride.driver_id))) {
      await conn.rollback();
      txActive = false;
      res.status(403).json({
        success: false,
        message: 'You cannot request a ride with this user due to block settings.'
      });
      return;
    }

    if (ride.status === 'cancelled') {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'This ride has been cancelled.' });
      return;
    }
    if (ride.status === 'completed' || ride.status === 'in_progress') {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: `This ride is already ${ride.status.replace('_', ' ')}.` });
      return;
    }

    const depDate = parseRideDateTime(ride.departure_time);
    if (!depDate || depDate.getTime() <= Date.now()) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'This ride has already departed.' });
      return;
    }

    if (ride.status === 'full' || ride.seats_available <= 0) {
      await conn.rollback();
      txActive = false;
      res.status(400).json({ success: false, message: 'This ride is currently full.' });
      return;
    }

    const [existingReq] = await conn.query(
      'SELECT id, status FROM ride_requests WHERE ride_id = ? AND passenger_id = ? FOR UPDATE',
      [rideId, req.user.id]
    );

    if (Array.isArray(existingReq) && existingReq.length > 0) {
      const prev = existingReq[0] as any;
      if (prev.status === 'pending') {
        await conn.rollback();
        txActive = false;
        res.status(409).json({
          success: false,
          message: 'You already have a pending request for this ride.'
        });
        return;
      }
      if (prev.status === 'accepted') {
        await conn.rollback();
        txActive = false;
        res.status(409).json({
          success: false,
          message: 'You are already an accepted passenger for this ride.'
        });
        return;
      }
      await conn.query(
        "UPDATE ride_requests SET status = 'pending', updated_at = NOW() WHERE id = ?",
        [prev.id]
      );
      await conn.commit();
      txActive = false;

      await createNotification({
        userId: Number(ride.driver_id),
        type: 'booking_request',
        title: 'New Seat Request',
        message: `${req.user.name} requested a seat on your ride to ${ride.dest_name}.`,
        link: '/my-rides'
      });

      res.status(200).json({
        success: true,
        message: 'Your ride request has been re-submitted to the driver.',
        requestId: prev.id
      });
      return;
    }

    const [result] = await conn.query(
      "INSERT INTO ride_requests (ride_id, passenger_id, status) VALUES (?, ?, 'pending')",
      [rideId, req.user.id]
    );

    await conn.commit();
    txActive = false;

    await createNotification({
      userId: Number(ride.driver_id),
      type: 'booking_request',
      title: 'New Seat Request',
      message: `${req.user.name} requested a seat on your ride from ${ride.pickup_name} to ${ride.dest_name}.`,
      link: '/my-rides'
    });

    res.status(201).json({
      success: true,
      message: 'Ride request submitted successfully! The driver will be notified.',
      requestId: (result as any).insertId
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('createRideRequest rollback error:', rollbackErr);
      }
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ success: false, message: 'A request for this ride already exists.' });
      return;
    }
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213) {
      res.status(409).json({ success: false, message: 'Concurrent booking update conflict. Please try again.' });
      return;
    }
    if (error?.code === 'ER_LOCK_WAIT_TIMEOUT' || error?.errno === 1205 || error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: 'Database busy or unavailable. Please try again shortly.' });
      return;
    }
    console.error('createRideRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit ride request.' });
  } finally {
    conn.release();
  }
}

export async function getRideRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const rideId = isPositiveIntId(req.params.id);
    if (!rideId) {
      res.status(400).json({ success: false, message: 'Invalid ride ID.' });
      return;
    }

    const [rideRows] = await db.query('SELECT driver_id FROM rides WHERE id = ?', [rideId]);
    const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;

    if (!ride) {
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.driver_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Access denied: You are not the driver of this ride.' });
      return;
    }

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100
    });

    const [rows] = await db.query(
      `SELECT req.id, req.ride_id, req.passenger_id, req.status, req.created_at, req.updated_at,
              u.name AS passenger_name, u.email AS passenger_email, u.phone AS passenger_phone,
              u.student_id AS passenger_student_id
       FROM ride_requests req
       JOIN users u ON req.passenger_id = u.id
       WHERE req.ride_id = ?
       ORDER BY req.created_at DESC
       LIMIT ? OFFSET ?`,
      [rideId, limit + 1, offset]
    );

    const rawRows = (rows as any[]) || [];
    const hasMore = rawRows.length > limit;
    const requestRows = hasMore ? rawRows.slice(0, limit) : rawRows;
    const passengerIds = requestRows.map((r) => Number(r.passenger_id));

    const [ratingsMap, extMap] = await Promise.all([
      getUserRatingSummaries(passengerIds),
      getUserExtendedFieldsBatch(passengerIds, { includeAvatar: true })
    ]);

    const enriched = requestRows.map((r) => {
      const pid = Number(r.passenger_id);
      const ext = extMap.get(pid);
      const rating = ratingsMap.get(pid) || { avg_rating: null, review_count: 0 };
      const canSeePhone =
        r.status === 'accepted' && ((ext?.show_phone_to_accepted ?? 1) !== 0 || req.user?.role === 'admin');
      return {
        ...r,
        passenger_phone: canSeePhone ? r.passenger_phone : null,
        passenger_student_verified: ext?.student_verified ?? 0,
        passenger_email_verified: ext?.email_verified ?? 0,
        passenger_avatar_url: ext?.avatar_url ?? null,
        passenger_avg_rating: rating.avg_rating,
        passenger_review_count: rating.review_count
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
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    console.error('getRideRequests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ride requests.' });
  }
}

export async function acceptRequest(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  const requestId = isPositiveIntId(req.params.id);
  if (!requestId) {
    res.status(400).json({ success: false, message: 'Invalid request ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable. Please try again shortly.' });
      return;
    }
    console.error('acceptRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept ride request.' });
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [reqRows] = await conn.query(
      `SELECT id, ride_id, passenger_id, status FROM ride_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    const request = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!request) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    const [rideRows] = await conn.query(
      `SELECT id, driver_id, pickup_name, dest_name, seats_total, seats_available, departure_time, status FROM rides WHERE id = ? FOR UPDATE`,
      [request.ride_id]
    );

    const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;
    if (!ride) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Associated ride not found.' });
      return;
    }

    if (ride.driver_id !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'Only the driver can accept this request.' });
      return;
    }

    if (request.status !== 'pending') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot accept a request that is already ${request.status}.`
      });
      return;
    }

    if (ride.status === 'cancelled' || ride.status === 'completed') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot accept request for a ride that is already ${ride.status}.`
      });
      return;
    }

    const depDate = parseRideDateTime(ride.departure_time);
    if (!depDate || depDate.getTime() <= Date.now()) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'Cannot accept a request after the ride departure time has passed.'
      });
      return;
    }

    if (ride.seats_available <= 0) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'No seats remaining on this ride to accept further passengers.'
      });
      return;
    }

    const [rideUpdateResult] = await conn.query(
      `UPDATE rides 
       SET status = IF(seats_available = 1, 'full', status),
           seats_available = seats_available - 1
       WHERE id = ? AND seats_available > 0`,
      [ride.id]
    );

    const affectedRideRows = (rideUpdateResult as any)?.affectedRows;
    if (!affectedRideRows || affectedRideRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'Seat inventory conflict: all available seats have just been reserved.'
      });
      return;
    }

    const [reqUpdateResult] = await conn.query(
      `UPDATE ride_requests SET status = 'accepted', updated_at = NOW() WHERE id = ? AND status = 'pending'`,
      [requestId]
    );

    const affectedReqRows = (reqUpdateResult as any)?.affectedRows;
    if (!affectedReqRows || affectedReqRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: 'Request status conflict: request is no longer in pending status.'
      });
      return;
    }

    await conn.commit();
    txActive = false;
    invalidateReminderCacheForUser(Number(request.passenger_id));

    await createNotification({
      userId: Number(request.passenger_id),
      type: 'booking_accepted',
      title: 'Seat Request Accepted',
      message: `Your seat for ${ride.pickup_name} to ${ride.dest_name} was accepted by the driver.`,
      link: `/rides/${ride.id}`
    });

    res.status(200).json({
      success: true,
      message: 'Passenger request accepted! Passenger can now view your contact details.'
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('acceptRequest rollback error:', rollbackErr);
      }
    }
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213) {
      res.status(409).json({ success: false, message: 'Concurrent booking update conflict. Please try again.' });
      return;
    }
    if (error?.code === 'ER_LOCK_WAIT_TIMEOUT' || error?.errno === 1205 || error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: 'Database busy or unavailable. Please try again shortly.' });
      return;
    }
    console.error('acceptRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept ride request.' });
  } finally {
    conn.release();
  }
}

export async function rejectRequest(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  const requestId = isPositiveIntId(req.params.id);
  if (!requestId) {
    res.status(400).json({ success: false, message: 'Invalid request ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable. Please try again shortly.' });
      return;
    }
    console.error('rejectRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject request.' });
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [reqRows] = await conn.query(
      `SELECT req.id, req.ride_id, req.passenger_id, req.status, r.driver_id, r.pickup_name, r.dest_name
       FROM ride_requests req
       JOIN rides r ON req.ride_id = r.id
       WHERE req.id = ? FOR UPDATE`,
      [requestId]
    );

    const request = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!request) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (request.driver_id !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'Only the driver can reject this request.' });
      return;
    }

    if (request.status !== 'pending') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot reject a request that is already ${request.status}.`
      });
      return;
    }

    const [updateResult] = await conn.query(
      "UPDATE ride_requests SET status = 'rejected', updated_at = NOW() WHERE id = ? AND status = 'pending'",
      [requestId]
    );

    if ((updateResult as any)?.affectedRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Request is no longer in pending status.' });
      return;
    }

    await conn.commit();
    txActive = false;

    await createNotification({
      userId: Number(request.passenger_id),
      type: 'booking_rejected',
      title: 'Seat Request Declined',
      message: `Your seat request for ${request.pickup_name || 'campus ride'} to ${request.dest_name || 'destination'} was declined.`,
      link: '/requests'
    });

    res.status(200).json({
      success: true,
      message: 'Ride request rejected.'
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('rejectRequest rollback error:', rollbackErr);
      }
    }
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213) {
      res.status(409).json({ success: false, message: 'Concurrent update conflict. Please try again.' });
      return;
    }
    if (error?.code === 'ER_LOCK_WAIT_TIMEOUT' || error?.errno === 1205 || error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: 'Database busy or unavailable. Please try again shortly.' });
      return;
    }
    console.error('rejectRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject request.' });
  } finally {
    conn.release();
  }
}

export async function cancelRequest(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  const requestId = isPositiveIntId(req.params.id);
  if (!requestId) {
    res.status(400).json({ success: false, message: 'Invalid request ID.' });
    return;
  }

  let conn: IDatabaseConnection;
  try {
    conn = await db.getConnection();
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({
        success: false,
        message: error.message || 'Database service is temporarily unavailable. Please try again shortly.'
      });
      return;
    }
    console.error('cancelRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel request.' });
    return;
  }

  let txActive = false;
  try {
    await conn.beginTransaction();
    txActive = true;

    const [reqRows] = await conn.query(
      `SELECT id, ride_id, passenger_id, status FROM ride_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    const request = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!request) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (request.passenger_id !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      txActive = false;
      res.status(403).json({ success: false, message: 'You can only cancel your own ride requests.' });
      return;
    }

    const [rideRows] = await conn.query(
      `SELECT id, driver_id, pickup_name, dest_name, seats_available, seats_total, status FROM rides WHERE id = ? FOR UPDATE`,
      [request.ride_id]
    );
    const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;
    if (!ride) {
      await conn.rollback();
      txActive = false;
      res.status(404).json({ success: false, message: 'Associated ride not found.' });
      return;
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Cannot cancel booking for a ride that is already ${ride.status}.`
      });
      return;
    }

    if (request.status === 'cancelled' || request.status === 'rejected') {
      await conn.rollback();
      txActive = false;
      res.status(409).json({
        success: false,
        message: `Request is already ${request.status}.`
      });
      return;
    }

    const wasAccepted = request.status === 'accepted';

    const [reqUpdateResult] = await conn.query(
      "UPDATE ride_requests SET status = 'cancelled', updated_at = NOW() WHERE id = ? AND status IN ('pending', 'accepted')",
      [requestId]
    );
    if ((reqUpdateResult as any)?.affectedRows !== 1) {
      await conn.rollback();
      txActive = false;
      res.status(409).json({ success: false, message: 'Booking status conflict during cancellation.' });
      return;
    }

    let cancelledSingleSeatMatchedRide = false;
    if (wasAccepted) {
      const { isMatchedRequester } = await syncPassengerRequestOnBookingCancelled(
        conn,
        Number(request.ride_id),
        Number(request.passenger_id)
      );

      if (isMatchedRequester && Number(ride.seats_total) <= 1) {
        cancelledSingleSeatMatchedRide = true;
        await conn.query(
          `UPDATE rides
           SET status = 'cancelled'
           WHERE id = ?`,
          [request.ride_id]
        );
        await conn.query(
          "UPDATE ride_requests SET status = 'cancelled', updated_at = NOW() WHERE ride_id = ? AND status IN ('pending', 'accepted')",
          [request.ride_id]
        );
      } else {
        await conn.query(
          `UPDATE rides
           SET seats_available = LEAST(seats_total, seats_available + 1),
               status = IF(status = 'full', 'open', status)
           WHERE id = ? AND seats_available < seats_total`,
          [request.ride_id]
        );
      }
    }

    await conn.commit();
    txActive = false;
    invalidateReminderCacheForUser(Number(request.passenger_id));

    await createNotification({
      userId: Number(ride.driver_id),
      type: 'booking_cancelled',
      title: 'Passenger Cancelled Request',
      message: `${req.user.name} cancelled their ${wasAccepted ? 'confirmed seat' : 'request'} for ${ride.pickup_name} to ${ride.dest_name}.`,
      link: '/my-rides'
    });

    res.status(200).json({
      success: true,
      message: cancelledSingleSeatMatchedRide
        ? 'Matched ride booking cancelled. This single-seat matched ride has been closed.'
        : wasAccepted
        ? 'Ride booking cancelled. Seat has been restored.'
        : 'Pending request cancelled.'
    });
  } catch (error: any) {
    if (txActive) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('cancelRequest rollback error:', rollbackErr);
      }
    }
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213) {
      res.status(409).json({ success: false, message: 'Concurrent booking update conflict. Please try again.' });
      return;
    }
    if (error?.code === 'ER_LOCK_WAIT_TIMEOUT' || error?.errno === 1205 || error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({
        success: false,
        message: error.message || 'Database service is temporarily unavailable. Please try again shortly.'
      });
      return;
    }
    console.error('cancelRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel request.' });
  } finally {
    conn.release();
  }
}

export async function getMyRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { limit, offset } = parsePaginationParams(req.query as Record<string, unknown>, {
      defaultLimit: 50,
      maxLimit: 100
    });

    const [rows] = await db.query(
      `SELECT req.id, req.ride_id, req.passenger_id, req.status, req.created_at, req.updated_at,
              r.driver_id, r.pickup_name, r.pickup_lat, r.pickup_lng,
              r.dest_name, r.dest_lat, r.dest_lng,
              r.departure_time, r.fare, r.seats_available, r.seats_total, r.vehicle_type,
              r.status AS ride_status,
              u.name AS driver_name, u.email AS driver_email,
              u.phone AS driver_phone,
              u.vehicle_model AS driver_vehicle_model,
              u.vehicle_plate AS driver_vehicle_plate
       FROM ride_requests req
       JOIN rides r ON req.ride_id = r.id
       JOIN users u ON r.driver_id = u.id
       WHERE req.passenger_id = ?
       ORDER BY req.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit + 1, offset]
    );

    const rawRows = (rows as any[]) || [];
    const hasMore = rawRows.length > limit;
    const requestRows = hasMore ? rawRows.slice(0, limit) : rawRows;
    const driverIds = requestRows.map((r) => Number(r.driver_id)).filter(Boolean);
    const rideIds = Array.from(new Set(requestRows.map((r) => Number(r.ride_id)).filter(Boolean)));

    const [ratingMap, extCache, reviewedRideIds] = await Promise.all([
      getUserRatingSummaries(driverIds),
      getUserExtendedFieldsBatch(driverIds, { includeAvatar: false }),
      (async () => {
        const set = new Set<number>();
        if (rideIds.length === 0) return set;
        try {
          const ridePlaceholders = rideIds.map(() => '?').join(', ');
          const [revRows] = await db.query(
            `SELECT ride_id FROM reviews WHERE reviewer_id = ? AND ride_id IN (${ridePlaceholders})`,
            [req.user!.id, ...rideIds]
          );
          if (Array.isArray(revRows)) {
            for (const x of revRows as any[]) set.add(Number(x.ride_id));
          }
        } catch (err: any) {
          if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
        }
        return set;
      })()
    ]);

    const safeRequests = requestRows.map((r) => {
      const distKm =
        r.pickup_lat !== undefined && r.dest_lat !== undefined
          ? calculateHaversineDistanceKm(Number(r.pickup_lat), Number(r.pickup_lng), Number(r.dest_lat), Number(r.dest_lng))
          : null;
      const ext = r.driver_id ? extCache.get(Number(r.driver_id)) : undefined;
      const rating = r.driver_id ? ratingMap.get(Number(r.driver_id)) : undefined;
      const allowPhone = r.status === 'accepted' && (ext?.show_phone_to_accepted ?? 1) !== 0;

      return {
        ...r,
        departure_time: r.departure_time ? toUtcIsoString(r.departure_time) : r.departure_time,
        driver_phone: allowPhone ? r.driver_phone : null,
        driver_vehicle_plate: r.status === 'accepted' ? r.driver_vehicle_plate : null,
        distance_km: distKm,
        estimated_minutes:
          distKm !== null ? estimateDurationMinutes(distKm, r.vehicle_type === 'car' ? 'car' : 'bike') : null,
        driver_avg_rating: rating?.avg_rating ?? null,
        driver_review_count: rating?.review_count ?? 0,
        driver_student_verified: ext?.student_verified ?? 0,
        has_reviewed: reviewedRideIds.has(Number(r.ride_id))
      };
    });

    res.status(200).json({
      success: true,
      requests: safeRequests,
      pagination: {
        limit,
        offset,
        has_more: hasMore
      }
    });
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({ success: false, message: error.message || 'Database service is temporarily unavailable.' });
      return;
    }
    console.error('getMyRequests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your ride requests.' });
  }
}
