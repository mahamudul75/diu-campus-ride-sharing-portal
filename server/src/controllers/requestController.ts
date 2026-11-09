import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';

export async function createRideRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const rideId = Number(req.params.id);
    if (!rideId || isNaN(rideId)) {
      res.status(400).json({ success: false, message: 'Invalid ride ID.' });
      return;
    }

    // 1. Fetch ride
    const [rideRows] = await db.query('SELECT * FROM rides WHERE id = ?', [rideId]);
    const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;

    if (!ride) {
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    // 2. Prevent driver from requesting their own ride
    if (ride.driver_id === req.user.id) {
      res.status(400).json({
        success: false,
        message: 'You cannot request your own ride.'
      });
      return;
    }

    // 3. Prevent requesting for full, completed, or cancelled rides
    if (ride.status === 'cancelled') {
      res.status(400).json({ success: false, message: 'This ride has been cancelled.' });
      return;
    }
    if (ride.status === 'completed') {
      res.status(400).json({ success: false, message: 'This ride is already completed.' });
      return;
    }
    if (ride.status === 'full' || ride.seats_available <= 0) {
      res.status(400).json({ success: false, message: 'This ride is currently full.' });
      return;
    }

    // 4. One request per student per ride
    const [existingReq] = await db.query(
      'SELECT id, status FROM ride_requests WHERE ride_id = ? AND passenger_id = ?',
      [rideId, req.user.id]
    );

    if (Array.isArray(existingReq) && existingReq.length > 0) {
      const prev = existingReq[0] as any;
      if (prev.status === 'pending') {
        res.status(409).json({
          success: false,
          message: 'You already have a pending request for this ride.'
        });
        return;
      }
      if (prev.status === 'accepted') {
        res.status(409).json({
          success: false,
          message: 'You are already an accepted passenger for this ride.'
        });
        return;
      }
      // If previous was rejected or cancelled, allow re-requesting by updating status to pending
      await db.query(
        "UPDATE ride_requests SET status = 'pending', updated_at = NOW() WHERE id = ?",
        [prev.id]
      );
      res.status(200).json({
        success: true,
        message: 'Your ride request has been re-submitted to the driver.',
        requestId: prev.id
      });
      return;
    }

    // 5. Insert new request
    const [result] = await db.query(
      "INSERT INTO ride_requests (ride_id, passenger_id, status) VALUES (?, ?, 'pending')",
      [rideId, req.user.id]
    );

    res.status(201).json({
      success: true,
      message: 'Ride request submitted successfully! The driver will be notified.',
      requestId: (result as any).insertId
    });
  } catch (error: any) {
    console.error('createRideRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit ride request.' });
  }
}

export async function getRideRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const rideId = Number(req.params.id);
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

    const [rows] = await db.query(
      `SELECT req.id, req.ride_id, req.passenger_id, req.status, req.created_at, req.updated_at,
              u.name AS passenger_name, u.email AS passenger_email, u.phone AS passenger_phone,
              u.student_id AS passenger_student_id
       FROM ride_requests req
       JOIN users u ON req.passenger_id = u.id
       WHERE req.ride_id = ?
       ORDER BY req.created_at DESC`,
      [rideId]
    );

    res.status(200).json({
      success: true,
      requests: rows
    });
  } catch (error: any) {
    console.error('getRideRequests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ride requests.' });
  }
}

export async function acceptRequest(req: AuthRequest, res: Response): Promise<void> {
  const conn = await db.getConnection();
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const requestId = Number(req.params.id);
    if (!requestId || isNaN(requestId)) {
      res.status(400).json({ success: false, message: 'Invalid request ID.' });
      return;
    }

    await conn.beginTransaction();

    // 1. Lock and fetch the ride request row to serialize concurrent operations on this request
    const [reqRows] = await conn.query(
      `SELECT id, ride_id, passenger_id, status FROM ride_requests WHERE id = ? FOR UPDATE`,
      [requestId]
    );

    const request = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!request) {
      await conn.rollback();
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    // 2. Lock and fetch the parent ride row to serialize concurrent seat allocations for this ride
    const [rideRows] = await conn.query(
      `SELECT id, driver_id, seats_total, seats_available, status FROM rides WHERE id = ? FOR UPDATE`,
      [request.ride_id]
    );

    const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;
    if (!ride) {
      await conn.rollback();
      res.status(404).json({ success: false, message: 'Associated ride not found.' });
      return;
    }

    // 3. Authorization check: Driver of the ride or admin
    if (ride.driver_id !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      res.status(403).json({ success: false, message: 'Only the driver can accept this request.' });
      return;
    }

    // 4. Request status check: Only pending requests can be accepted
    if (request.status !== 'pending') {
      await conn.rollback();
      res.status(409).json({
        success: false,
        message: `Cannot accept a request that is already ${request.status}.`
      });
      return;
    }

    // 5. Ride availability checks
    if (ride.status === 'cancelled' || ride.status === 'completed') {
      await conn.rollback();
      res.status(409).json({
        success: false,
        message: `Cannot accept request for a ride that is already ${ride.status}.`
      });
      return;
    }

    if (ride.seats_available <= 0) {
      await conn.rollback();
      res.status(409).json({
        success: false,
        message: 'No seats remaining on this ride to accept further passengers.'
      });
      return;
    }

    // 6. Atomically update seat inventory with strict condition and update status to 'full' if seats reach 0
    const [rideUpdateResult] = await conn.query(
      `UPDATE rides 
       SET seats_available = seats_available - 1,
           status = IF(seats_available - 1 = 0, 'full', status)
       WHERE id = ? AND seats_available > 0`,
      [ride.id]
    );

    const affectedRideRows = (rideUpdateResult as any)?.affectedRows;
    if (!affectedRideRows || affectedRideRows !== 1) {
      await conn.rollback();
      res.status(409).json({
        success: false,
        message: 'Seat inventory conflict: all available seats have just been reserved.'
      });
      return;
    }

    // 7. Update the ride request status to accepted within the same transaction
    const [reqUpdateResult] = await conn.query(
      `UPDATE ride_requests SET status = 'accepted', updated_at = NOW() WHERE id = ? AND status = 'pending'`,
      [requestId]
    );

    const affectedReqRows = (reqUpdateResult as any)?.affectedRows;
    if (!affectedReqRows || affectedReqRows !== 1) {
      await conn.rollback();
      res.status(409).json({
        success: false,
        message: 'Request status conflict: request is no longer in pending status.'
      });
      return;
    }

    // 8. Commit transaction
    await conn.commit();

    res.status(200).json({
      success: true,
      message: 'Passenger request accepted! Passenger can now view your contact details.'
    });
  } catch (error: any) {
    await conn.rollback();
    console.error('acceptRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept ride request.' });
  } finally {
    conn.release();
  }
}

export async function rejectRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const requestId = Number(req.params.id);

    const [reqRows] = await db.query(
      `SELECT req.id, req.ride_id, req.status, r.driver_id
       FROM ride_requests req
       JOIN rides r ON req.ride_id = r.id
       WHERE req.id = ?`,
      [requestId]
    );

    const request = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!request) {
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (request.driver_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only the driver can reject this request.' });
      return;
    }

    if (request.status !== 'pending') {
      res.status(400).json({
        success: false,
        message: `Cannot reject a request that is already ${request.status}.`
      });
      return;
    }

    await db.query("UPDATE ride_requests SET status = 'rejected', updated_at = NOW() WHERE id = ?", [requestId]);

    res.status(200).json({
      success: true,
      message: 'Ride request rejected.'
    });
  } catch (error: any) {
    console.error('rejectRequest error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject request.' });
  }
}

export async function cancelRequest(req: AuthRequest, res: Response): Promise<void> {
  const conn = await db.getConnection();
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const requestId = Number(req.params.id);

    await conn.beginTransaction();

    const [reqRows] = await conn.query(
      `SELECT req.id, req.ride_id, req.passenger_id, req.status,
              r.seats_available, r.seats_total, r.status AS ride_status
       FROM ride_requests req
       JOIN rides r ON req.ride_id = r.id
       WHERE req.id = ?`,
      [requestId]
    );

    const request = Array.isArray(reqRows) && reqRows.length > 0 ? (reqRows[0] as any) : null;
    if (!request) {
      await conn.rollback();
      res.status(404).json({ success: false, message: 'Request not found.' });
      return;
    }

    if (request.passenger_id !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      res.status(403).json({ success: false, message: 'You can only cancel your own ride requests.' });
      return;
    }

    if (request.status === 'cancelled' || request.status === 'rejected') {
      await conn.rollback();
      res.status(400).json({
        success: false,
        message: `Request is already ${request.status}.`
      });
      return;
    }

    const wasAccepted = request.status === 'accepted';

    // Update request to cancelled
    await conn.query("UPDATE ride_requests SET status = 'cancelled', updated_at = NOW() WHERE id = ?", [requestId]);

    // If request was accepted, restore seat count exactly once
    if (wasAccepted) {
      await conn.query('UPDATE rides SET seats_available = seats_available + 1 WHERE id = ?', [request.ride_id]);
    }

    await conn.commit();

    res.status(200).json({
      success: true,
      message: wasAccepted
        ? 'Ride booking cancelled. Seat has been restored.'
        : 'Pending request cancelled.'
    });
  } catch (error: any) {
    await conn.rollback();
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

    const [rows] = await db.query(
      `SELECT req.id, req.ride_id, req.passenger_id, req.status, req.created_at, req.updated_at,
              r.pickup_name, r.pickup_lat, r.pickup_lng,
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
       ORDER BY req.created_at DESC`,
      [req.user.id]
    );

    // Apply privacy rule F17: only show driver phone and vehicle plate if status === 'accepted'
    const safeRequests = (rows as any[]).map(r => ({
      ...r,
      driver_phone: r.status === 'accepted' ? r.driver_phone : null,
      driver_vehicle_plate: r.status === 'accepted' ? r.driver_vehicle_plate : null
    }));

    res.status(200).json({
      success: true,
      requests: safeRequests
    });
  } catch (error: any) {
    console.error('getMyRequests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your ride requests.' });
  }
}
