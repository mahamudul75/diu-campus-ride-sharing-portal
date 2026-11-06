import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';

export async function applyForDriver(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { vehicle_type, vehicle_model, vehicle_plate } = req.body;

    if (!vehicle_type || !vehicle_model || !vehicle_plate) {
      res.status(400).json({
        success: false,
        message: 'Vehicle type (bike/car), vehicle model, and registration plate are required.'
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

    // Update user record
    await db.query(
      `UPDATE users 
       SET driver_status = 'pending', vehicle_type = ?, vehicle_model = ?, vehicle_plate = ? 
       WHERE id = ?`,
      [vehicle_type, vehicle_model.trim(), vehicle_plate.trim(), req.user.id]
    );

    const [rows] = await db.query(
      `SELECT id, student_id, name, email, phone, role, driver_status, 
              vehicle_type, vehicle_model, vehicle_plate, is_blocked 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      message: 'Driver application submitted successfully. Pending campus admin verification.',
      user: (rows as any[])[0]
    });
  } catch (error: any) {
    console.error('applyForDriver error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit driver application.'
    });
  }
}
