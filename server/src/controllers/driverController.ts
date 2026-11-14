import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isNonEmptyString } from '../utils/validators.ts';
import { getUserExtendedFields } from '../utils/dbHelpers.ts';

export async function applyForDriver(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { vehicle_type, vehicle_model, vehicle_plate } = req.body ?? {};

    if (!isNonEmptyString(vehicle_model, 2, 100) || !isNonEmptyString(vehicle_plate, 3, 50)) {
      res.status(400).json({
        success: false,
        message: 'Vehicle model (2-100 chars) and registration plate (3-50 chars) are required.'
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

    const cleanModel = vehicle_model.trim();
    const cleanPlate = vehicle_plate.trim();

    await db.query(
      `UPDATE users 
       SET driver_status = 'pending', vehicle_type = ?, vehicle_model = ?, vehicle_plate = ? 
       WHERE id = ?`,
      [vehicle_type, cleanModel, cleanPlate, req.user.id]
    );

    try {
      await db.query(
        `INSERT INTO driver_applications (user_id, vehicle_type, vehicle_model, vehicle_plate, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [req.user.id, vehicle_type, cleanModel, cleanPlate]
      );
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    const [rows] = await db.query(
      `SELECT id, student_id, name, email, phone, role, driver_status, 
              vehicle_type, vehicle_model, vehicle_plate, is_blocked 
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    const ext = await getUserExtendedFields(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Driver application submitted successfully. Pending campus admin verification.',
      user: { ...(rows as any[])[0], ...ext }
    });
  } catch (error: any) {
    console.error('applyForDriver error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit driver application.'
    });
  }
}

export async function getDriverApplicationHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    try {
      const [rows] = await db.query(
        `SELECT da.id, da.user_id, da.vehicle_type, da.vehicle_model, da.vehicle_plate,
                da.status, da.admin_note, da.reviewed_by, da.created_at, da.reviewed_at,
                u.name AS reviewer_name
         FROM driver_applications da
         LEFT JOIN users u ON da.reviewed_by = u.id
         WHERE da.user_id = ?
         ORDER BY da.created_at DESC`,
        [req.user.id]
      );
      res.status(200).json({ success: true, applications: rows });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        res.status(200).json({ success: true, applications: [] });
        return;
      }
      throw err;
    }
  } catch (error: any) {
    console.error('getDriverApplicationHistory error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch driver application history.' });
  }
}
