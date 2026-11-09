import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';

export async function getRides(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { pickup, destination, date, max_fare, vehicle_type } = req.query;

    let query = `
      SELECT r.id, r.driver_id, r.pickup_name, r.pickup_lat, r.pickup_lng,
             r.dest_name, r.dest_lat, r.dest_lng, r.departure_time, r.fare,
             r.seats_total, r.seats_available, r.vehicle_type, r.note, r.status, r.created_at,
             u.name AS driver_name, u.email AS driver_email, u.vehicle_model AS driver_vehicle_model,
             u.vehicle_plate AS driver_vehicle_plate
      FROM rides r
      JOIN users u ON r.driver_id = u.id
      WHERE r.status = 'open' AND r.departure_time > NOW()
    `;
    const params: any[] = [];

    if (pickup && typeof pickup === 'string' && pickup.trim()) {
      query += ` AND r.pickup_name LIKE ?`;
      params.push(`%${pickup.trim()}%`);
    }

    if (destination && typeof destination === 'string' && destination.trim()) {
      query += ` AND r.dest_name LIKE ?`;
      params.push(`%${destination.trim()}%`);
    }

    if (date && typeof date === 'string' && date.trim()) {
      query += ` AND DATE(r.departure_time) = DATE(?)`;
      params.push(date.trim());
    }

    if (max_fare && !isNaN(Number(max_fare))) {
      query += ` AND r.fare <= ?`;
      params.push(Number(max_fare));
    }

    if (vehicle_type && (vehicle_type === 'bike' || vehicle_type === 'car')) {
      query += ` AND r.vehicle_type = ?`;
      params.push(vehicle_type);
    }

    query += ` ORDER BY r.departure_time ASC`;

    const [rows] = await db.query(query, params);

    res.status(200).json({
      success: true,
      count: (rows as any[]).length,
      rides: rows
    });
  } catch (error: any) {
    console.error('getRides error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch campus rides.' });
  }
}

export async function getRideById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rideId = Number(req.params.id);
    if (!rideId || isNaN(rideId)) {
      res.status(400).json({ success: false, message: 'Invalid ride ID.' });
      return;
    }

    const [rows] = await db.query(
      `SELECT r.id, r.driver_id, r.pickup_name, r.pickup_lat, r.pickup_lng,
              r.dest_name, r.dest_lat, r.dest_lng, r.departure_time, r.fare,
              r.seats_total, r.seats_available, r.vehicle_type, r.note, r.status, r.created_at,
              u.name AS driver_name, u.email AS driver_email, u.phone AS driver_phone,
              u.vehicle_model AS driver_vehicle_model, u.vehicle_plate AS driver_vehicle_plate
       FROM rides r
       JOIN users u ON r.driver_id = u.id
       WHERE r.id = ?`,
      [rideId]
    );

    const ride = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!ride) {
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    // Check if the requesting user has an existing request for this ride
    let userRequest = null;
    let isDriver = false;
    let isAccepted = false;

    if (req.user) {
      isDriver = req.user.id === ride.driver_id;
      const [reqRows] = await db.query(
        'SELECT id, status, created_at, updated_at FROM ride_requests WHERE ride_id = ? AND passenger_id = ?',
        [rideId, req.user.id]
      );
      if (Array.isArray(reqRows) && reqRows.length > 0) {
        userRequest = reqRows[0];
        isAccepted = userRequest.status === 'accepted';
      }
    }

    // Privacy rule F17: Driver phone & exact vehicle plate only shown to accepted passenger or driver
    const safeRide = {
      ...ride,
      driver_phone: isDriver || isAccepted ? ride.driver_phone : null,
      driver_vehicle_plate: isDriver || isAccepted ? ride.driver_vehicle_plate : null
    };

    res.status(200).json({
      success: true,
      ride: safeRide,
      userRequest,
      isDriver
    });
  } catch (error: any) {
    console.error('getRideById error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ride details.' });
  }
}

export async function createRide(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
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
      fare,
      seats_total,
      vehicle_type,
      note
    } = req.body;

    // Validation
    if (!pickup_name || !dest_name || !departure_time || fare === undefined || !seats_total || !vehicle_type) {
      res.status(400).json({
        success: false,
        message: 'All ride details (pickup, destination, departure time, fare, seats, vehicle) are required.'
      });
      return;
    }

    const seats = Number(seats_total);
    if (isNaN(seats) || seats < 1 || seats > 8) {
      res.status(400).json({
        success: false,
        message: 'Available seats must be between 1 and 8.'
      });
      return;
    }

    const numFare = Number(fare);
    if (isNaN(numFare) || numFare < 0) {
      res.status(400).json({
        success: false,
        message: 'Fare must be a positive number in BDT.'
      });
      return;
    }

    const depDate = new Date(departure_time);
    if (isNaN(depDate.getTime()) || depDate.getTime() < Date.now() - 5 * 60 * 1000) {
      res.status(400).json({
        success: false,
        message: 'Departure time must be in the future.'
      });
      return;
    }

    const [result] = await db.query(
      `INSERT INTO rides 
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [
        req.user.id,
        pickup_name.trim(),
        Number(pickup_lat) || 23.8768,
        Number(pickup_lng) || 90.3202,
        dest_name.trim(),
        Number(dest_lat) || 23.7538,
        Number(dest_lng) || 90.377,
        departure_time,
        numFare,
        seats,
        seats,
        vehicle_type,
        note ? note.trim() : null
      ]
    );

    const newRideId = (result as any).insertId;

    res.status(201).json({
      success: true,
      message: 'Campus ride published successfully!',
      rideId: newRideId
    });
  } catch (error: any) {
    console.error('createRide error:', error);
    res.status(500).json({ success: false, message: 'Failed to create ride.' });
  }
}

export async function updateRide(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const rideId = Number(req.params.id);
    const [rows] = await db.query('SELECT * FROM rides WHERE id = ?', [rideId]);
    const ride = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!ride) {
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.driver_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'You can only edit rides you created.' });
      return;
    }

    if (ride.status !== 'open') {
      res.status(400).json({ success: false, message: `Cannot edit a ride that is ${ride.status}.` });
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
      fare,
      seats_total,
      vehicle_type,
      note
    } = req.body;

    await db.query(
      `UPDATE rides 
       SET pickup_name = ?, pickup_lat = ?, pickup_lng = ?, dest_name = ?, dest_lat = ?, dest_lng = ?,
           departure_time = ?, fare = ?, seats_total = ?, vehicle_type = ?, note = ?
       WHERE id = ?`,
      [
        pickup_name || ride.pickup_name,
        pickup_lat !== undefined ? Number(pickup_lat) : ride.pickup_lat,
        pickup_lng !== undefined ? Number(pickup_lng) : ride.pickup_lng,
        dest_name || ride.dest_name,
        dest_lat !== undefined ? Number(dest_lat) : ride.dest_lat,
        dest_lng !== undefined ? Number(dest_lng) : ride.dest_lng,
        departure_time || ride.departure_time,
        fare !== undefined ? Number(fare) : ride.fare,
        seats_total !== undefined ? Number(seats_total) : ride.seats_total,
        vehicle_type || ride.vehicle_type,
        note !== undefined ? note : ride.note,
        rideId
      ]
    );

    res.status(200).json({
      success: true,
      message: 'Ride details updated successfully.'
    });
  } catch (error: any) {
    console.error('updateRide error:', error);
    res.status(500).json({ success: false, message: 'Failed to update ride.' });
  }
}

export async function cancelRide(req: AuthRequest, res: Response): Promise<void> {
  const conn = await db.getConnection();
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

    await conn.beginTransaction();

    // 1. Lock and fetch target ride row using SELECT FOR UPDATE
    const [rows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [rideId]);
    const ride = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!ride) {
      await conn.rollback();
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    // 2. Authorization check
    if (ride.driver_id !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      res.status(403).json({ success: false, message: 'You can only cancel your own rides.' });
      return;
    }

    // 3. Status check
    if (ride.status === 'cancelled') {
      await conn.rollback();
      res.status(409).json({ success: false, message: 'Ride is already cancelled.' });
      return;
    }

    if (ride.status === 'completed') {
      await conn.rollback();
      res.status(409).json({ success: false, message: 'Cannot cancel a completed ride.' });
      return;
    }

    // 4. Update ride status to cancelled
    await conn.query("UPDATE rides SET status = 'cancelled' WHERE id = ?", [rideId]);

    // 5. Cascade cancellation to all associated passenger requests that are still pending or accepted
    await conn.query(
      "UPDATE ride_requests SET status = 'cancelled', updated_at = NOW() WHERE ride_id = ? AND status IN ('pending', 'accepted')",
      [rideId]
    );

    // 6. Commit transaction
    await conn.commit();

    res.status(200).json({
      success: true,
      message: 'Ride cancelled successfully. Associated booking requests have been cancelled.'
    });
  } catch (error: any) {
    await conn.rollback();
    console.error('cancelRide error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel ride.' });
  } finally {
    conn.release();
  }
}

export async function completeRide(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const rideId = Number(req.params.id);
    const [rows] = await db.query('SELECT * FROM rides WHERE id = ?', [rideId]);
    const ride = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!ride) {
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.driver_id !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'You can only mark your own rides as completed.' });
      return;
    }

    await db.query("UPDATE rides SET status = 'completed' WHERE id = ?", [rideId]);

    res.status(200).json({
      success: true,
      message: 'Ride marked as completed. Thank you for driving fellow DIU students!'
    });
  } catch (error: any) {
    console.error('completeRide error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete ride.' });
  }
}

export async function getMyRides(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const [rows] = await db.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM ride_requests req WHERE req.ride_id = r.id AND req.status = 'pending') AS pending_requests_count,
        (SELECT COUNT(*) FROM ride_requests req WHERE req.ride_id = r.id AND req.status = 'accepted') AS accepted_requests_count
       FROM rides r
       WHERE r.driver_id = ?
       ORDER BY r.departure_time DESC`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      rides: rows
    });
  } catch (error: any) {
    console.error('getMyRides error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your rides.' });
  }
}
