import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import {
  parseRideDateTime,
  formatDateToMySqlUtc,
  toUtcIsoString,
  resolveRideSearchDateBounds
} from '../utils/dateTime.ts';
import { isNonEmptyString, isPositiveIntId, isValidCoordinate } from '../utils/validators.ts';

export async function getRides(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { pickup, destination, date, date_start, date_end, tz_offset, time_zone, max_fare, vehicle_type } =
      req.query;

    let dateBounds = null;
    try {
      dateBounds = resolveRideSearchDateBounds({ date, date_start, date_end, tz_offset, time_zone });
    } catch {
      res.status(400).json({ success: false, message: 'Invalid date filter format.' });
      return;
    }

    let parsedMaxFare: number | null = null;
    if (max_fare !== undefined && String(max_fare).trim() !== '') {
      const nFare = Number(max_fare);
      if (!Number.isFinite(nFare) || nFare < 0) {
        res.status(400).json({ success: false, message: 'Invalid max_fare filter.' });
        return;
      }
      parsedMaxFare = nFare;
    }

    if (vehicle_type !== undefined && String(vehicle_type).trim() !== '' && vehicle_type !== 'bike' && vehicle_type !== 'car') {
      res.status(400).json({ success: false, message: 'Invalid vehicle_type filter.' });
      return;
    }

    let query = `
      SELECT r.id, r.driver_id, r.pickup_name, r.pickup_lat, r.pickup_lng,
             r.dest_name, r.dest_lat, r.dest_lng, r.departure_time, r.fare,
             r.seats_total, r.seats_available, r.vehicle_type, r.note, r.status, r.created_at,
             u.name AS driver_name, u.email AS driver_email, u.vehicle_model AS driver_vehicle_model,
             u.vehicle_plate AS driver_vehicle_plate
      FROM rides r
      JOIN users u ON r.driver_id = u.id
      WHERE r.status = 'open' AND r.departure_time > UTC_TIMESTAMP()
    `;
    const params: any[] = [];

    if (pickup && typeof pickup === 'string' && pickup.trim()) {
      query += ` AND r.pickup_name LIKE ?`;
      params.push(`%${pickup.trim().slice(0, 100)}%`);
    }

    if (destination && typeof destination === 'string' && destination.trim()) {
      query += ` AND r.dest_name LIKE ?`;
      params.push(`%${destination.trim().slice(0, 100)}%`);
    }

    if (dateBounds) {
      query += ` AND r.departure_time >= ? AND r.departure_time < ?`;
      params.push(dateBounds.startUtcSql, dateBounds.endUtcSql);
    }

    if (parsedMaxFare !== null) {
      query += ` AND r.fare <= ?`;
      params.push(parsedMaxFare);
    }

    if (vehicle_type === 'bike' || vehicle_type === 'car') {
      query += ` AND r.vehicle_type = ?`;
      params.push(vehicle_type);
    }

    query += ` ORDER BY r.departure_time ASC`;

    const [rows] = await db.query(query, params);
    const normalizedRides = (rows as any[]).map((r) => ({
      ...r,
      departure_time: toUtcIsoString(r.departure_time)
    }));

    res.status(200).json({
      success: true,
      count: normalizedRides.length,
      rides: normalizedRides
    });
  } catch (error: any) {
    console.error('getRides error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch campus rides.' });
  }
}

export async function getRideById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rideId = isPositiveIntId(req.params.id);
    if (!rideId) {
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
      departure_time: toUtcIsoString(ride.departure_time),
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
    } = req.body ?? {};

    // Validation
    if (
      !isNonEmptyString(pickup_name, 2, 255) ||
      !isNonEmptyString(dest_name, 2, 255) ||
      !departure_time ||
      fare === undefined ||
      seats_total === undefined ||
      !vehicle_type
    ) {
      res.status(400).json({
        success: false,
        message: 'All ride details (pickup, destination, departure time, fare, seats, vehicle) are required.'
      });
      return;
    }

    if (vehicle_type !== 'bike' && vehicle_type !== 'car') {
      res.status(400).json({
        success: false,
        message: 'Vehicle type must be either "bike" or "car".'
      });
      return;
    }

    const seats = Number(seats_total);
    if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
      res.status(400).json({
        success: false,
        message: 'Available seats must be an integer between 1 and 8.'
      });
      return;
    }

    const numFare = Number(fare);
    if (!Number.isFinite(numFare) || numFare < 0 || numFare > 50000) {
      res.status(400).json({
        success: false,
        message: 'Fare must be between 0 and 50,000 BDT.'
      });
      return;
    }

    const pickupCoords =
      pickup_lat === undefined && pickup_lng === undefined
        ? { lat: 23.8768, lng: 90.3202 }
        : isValidCoordinate(pickup_lat, pickup_lng);
    if (!pickupCoords) {
      res.status(400).json({
        success: false,
        message: 'Invalid pickup coordinates.'
      });
      return;
    }

    const destCoords =
      dest_lat === undefined && dest_lng === undefined
        ? { lat: 23.7538, lng: 90.377 }
        : isValidCoordinate(dest_lat, dest_lng);
    if (!destCoords) {
      res.status(400).json({
        success: false,
        message: 'Invalid destination coordinates.'
      });
      return;
    }

    if (note !== undefined && note !== null && (typeof note !== 'string' || note.trim().length > 1000)) {
      res.status(400).json({
        success: false,
        message: 'Ride note must be text of at most 1000 characters.'
      });
      return;
    }

    const depDate = parseRideDateTime(departure_time);
    if (!depDate) {
      res.status(400).json({
        success: false,
        message: 'Invalid departure time format.'
      });
      return;
    }

    if (depDate.getTime() < Date.now() - 5 * 60 * 1000) {
      res.status(400).json({
        success: false,
        message: 'Departure time must be in the future.'
      });
      return;
    }

    const formattedDepartureTime = formatDateToMySqlUtc(depDate);

    const [result] = await db.query(
      `INSERT INTO rides 
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [
        req.user.id,
        pickup_name.trim(),
        pickupCoords.lat,
        pickupCoords.lng,
        dest_name.trim(),
        destCoords.lat,
        destCoords.lng,
        formattedDepartureTime,
        numFare,
        seats,
        seats,
        vehicle_type,
        typeof note === 'string' && note.trim() ? note.trim() : null
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
  const conn = await db.getConnection();
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

    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [rideId]);
    const ride = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!ride) {
      await conn.rollback();
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.driver_id !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      res.status(403).json({ success: false, message: 'You can only edit rides you created.' });
      return;
    }

    if (ride.status === 'cancelled' || ride.status === 'completed') {
      await conn.rollback();
      res.status(409).json({ success: false, message: `Cannot edit a ride that is ${ride.status}.` });
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
    } = req.body ?? {};

    let nextPickupName = ride.pickup_name;
    if (pickup_name !== undefined) {
      if (!isNonEmptyString(pickup_name, 2, 255)) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Invalid pickup location name.' });
        return;
      }
      nextPickupName = pickup_name.trim();
    }

    let nextDestName = ride.dest_name;
    if (dest_name !== undefined) {
      if (!isNonEmptyString(dest_name, 2, 255)) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Invalid destination location name.' });
        return;
      }
      nextDestName = dest_name.trim();
    }

    let nextPickupLat = Number(ride.pickup_lat);
    let nextPickupLng = Number(ride.pickup_lng);
    if (pickup_lat !== undefined || pickup_lng !== undefined) {
      const coords = isValidCoordinate(
        pickup_lat !== undefined ? pickup_lat : nextPickupLat,
        pickup_lng !== undefined ? pickup_lng : nextPickupLng
      );
      if (!coords) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Invalid pickup coordinates.' });
        return;
      }
      nextPickupLat = coords.lat;
      nextPickupLng = coords.lng;
    }

    let nextDestLat = Number(ride.dest_lat);
    let nextDestLng = Number(ride.dest_lng);
    if (dest_lat !== undefined || dest_lng !== undefined) {
      const coords = isValidCoordinate(
        dest_lat !== undefined ? dest_lat : nextDestLat,
        dest_lng !== undefined ? dest_lng : nextDestLng
      );
      if (!coords) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Invalid destination coordinates.' });
        return;
      }
      nextDestLat = coords.lat;
      nextDestLng = coords.lng;
    }

    let nextFare = Number(ride.fare);
    if (fare !== undefined) {
      const parsedFare = Number(fare);
      if (!Number.isFinite(parsedFare) || parsedFare < 0 || parsedFare > 50000) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Fare must be between 0 and 50,000 BDT.' });
        return;
      }
      nextFare = parsedFare;
    }

    let nextVehicleType = ride.vehicle_type;
    if (vehicle_type !== undefined) {
      if (vehicle_type !== 'bike' && vehicle_type !== 'car') {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Vehicle type must be either "bike" or "car".' });
        return;
      }
      nextVehicleType = vehicle_type;
    }

    const bookedSeats = Math.max(0, Number(ride.seats_total) - Number(ride.seats_available));
    let nextSeatsTotal = Number(ride.seats_total);
    if (seats_total !== undefined) {
      const parsedSeats = Number(seats_total);
      if (!Number.isInteger(parsedSeats) || parsedSeats < 1 || parsedSeats > 8) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Total seats must be an integer between 1 and 8.' });
        return;
      }
      if (parsedSeats < bookedSeats) {
        await conn.rollback();
        res.status(409).json({
          success: false,
          message: `Cannot reduce total seats below ${bookedSeats} already booked seat(s).`
        });
        return;
      }
      nextSeatsTotal = parsedSeats;
    }
    const nextSeatsAvailable = nextSeatsTotal - bookedSeats;
    const nextStatus = nextSeatsAvailable === 0 ? 'full' : 'open';

    let nextNote = ride.note;
    if (note !== undefined) {
      if (note !== null && (typeof note !== 'string' || note.trim().length > 1000)) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Ride note must be text of at most 1000 characters.' });
        return;
      }
      nextNote = typeof note === 'string' && note.trim() ? note.trim() : null;
    }

    let formattedDepartureTime: string;
    if (departure_time !== undefined && departure_time !== null && String(departure_time).trim() !== '') {
      const parsedDep = parseRideDateTime(departure_time);
      if (!parsedDep) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Invalid departure time format.' });
        return;
      }
      if (parsedDep.getTime() < Date.now() - 5 * 60 * 1000) {
        await conn.rollback();
        res.status(400).json({ success: false, message: 'Departure time must be in the future.' });
        return;
      }
      formattedDepartureTime = formatDateToMySqlUtc(parsedDep);
    } else {
      const existingDep = parseRideDateTime(ride.departure_time);
      formattedDepartureTime = existingDep ? formatDateToMySqlUtc(existingDep) : ride.departure_time;
    }

    await conn.query(
      `UPDATE rides 
       SET pickup_name = ?, pickup_lat = ?, pickup_lng = ?, dest_name = ?, dest_lat = ?, dest_lng = ?,
           departure_time = ?, fare = ?, seats_total = ?, seats_available = ?, status = ?, vehicle_type = ?, note = ?
       WHERE id = ?`,
      [
        nextPickupName,
        nextPickupLat,
        nextPickupLng,
        nextDestName,
        nextDestLat,
        nextDestLng,
        formattedDepartureTime,
        nextFare,
        nextSeatsTotal,
        nextSeatsAvailable,
        nextStatus,
        nextVehicleType,
        nextNote,
        rideId
      ]
    );

    await conn.commit();

    res.status(200).json({
      success: true,
      message: 'Ride details updated successfully.'
    });
  } catch (error: any) {
    await conn.rollback();
    console.error('updateRide error:', error);
    res.status(500).json({ success: false, message: 'Failed to update ride.' });
  } finally {
    conn.release();
  }
}

export async function cancelRide(req: AuthRequest, res: Response): Promise<void> {
  const conn = await db.getConnection();
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
  const conn = await db.getConnection();
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

    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [rideId]);
    const ride = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!ride) {
      await conn.rollback();
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.driver_id !== req.user.id && req.user.role !== 'admin') {
      await conn.rollback();
      res.status(403).json({ success: false, message: 'You can only mark your own rides as completed.' });
      return;
    }

    if (ride.status === 'cancelled' || ride.status === 'completed') {
      await conn.rollback();
      res.status(409).json({ success: false, message: `Ride is already ${ride.status}.` });
      return;
    }

    await conn.query("UPDATE rides SET status = 'completed' WHERE id = ?", [rideId]);
    await conn.commit();

    res.status(200).json({
      success: true,
      message: 'Ride marked as completed. Thank you for driving fellow DIU students!'
    });
  } catch (error: any) {
    await conn.rollback();
    console.error('completeRide error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete ride.' });
  } finally {
    conn.release();
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

    const normalizedRides = (rows as any[]).map((r) => ({
      ...r,
      departure_time: toUtcIsoString(r.departure_time)
    }));

    res.status(200).json({
      success: true,
      rides: normalizedRides
    });
  } catch (error: any) {
    console.error('getMyRides error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your rides.' });
  }
}
