import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isValidPhone, sanitizePhone, isNonEmptyString } from '../utils/validators.ts';

export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const [rows] = await db.query(
      `SELECT id, student_id, name, email, phone, role, driver_status, 
              vehicle_type, vehicle_model, vehicle_plate, is_blocked, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      user: rows[0]
    });
  } catch (error: any) {
    console.error('getProfile error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve profile.' });
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { name, phone, vehicle_type, vehicle_model, vehicle_plate } = req.body ?? {};

    if (!isNonEmptyString(name, 2, 100) || !isNonEmptyString(phone, 8, 25)) {
      res.status(400).json({ success: false, message: 'Valid name (2-100 chars) and phone are required.' });
      return;
    }

    const cleanPhone = sanitizePhone(phone);
    if (!isValidPhone(cleanPhone)) {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid 11-digit phone number.'
      });
      return;
    }

    // Prevent unauthorized modification of verified vehicle credentials or driver_status via profile updates
    if (vehicle_type !== undefined || vehicle_model !== undefined || vehicle_plate !== undefined) {
      const requestedType = vehicle_type ?? null;
      const requestedModel = typeof vehicle_model === 'string' ? vehicle_model.trim() || null : vehicle_model ?? null;
      const requestedPlate = typeof vehicle_plate === 'string' ? vehicle_plate.trim() || null : vehicle_plate ?? null;
      const hasChangedVehicle =
        requestedType !== req.user.vehicle_type ||
        requestedModel !== req.user.vehicle_model ||
        requestedPlate !== req.user.vehicle_plate;

      if (hasChangedVehicle) {
        res.status(403).json({
          success: false,
          message: 'Vehicle credentials require admin verification. Please submit or update them via the Driver Application page.'
        });
        return;
      }
    }

    await db.query(
      `UPDATE users 
       SET name = ?, phone = ? 
       WHERE id = ?`,
      [name.trim(), cleanPhone, req.user.id]
    );

    // Fetch updated user
    const [rows] = await db.query(
      `SELECT id, student_id, name, email, phone, role, driver_status, 
              vehicle_type, vehicle_model, vehicle_plate, is_blocked 
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: (rows as any[])[0]
    });
  } catch (error: any) {
    console.error('updateProfile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
}

export async function updatePassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { current_password, new_password, confirm_new_password } = req.body ?? {};

    if (
      typeof current_password !== 'string' ||
      current_password.length === 0 ||
      current_password.length > 128 ||
      typeof new_password !== 'string' ||
      typeof confirm_new_password !== 'string'
    ) {
      res.status(400).json({ success: false, message: 'Current and new password are required.' });
      return;
    }

    if (new_password !== confirm_new_password) {
      res.status(400).json({ success: false, message: 'New passwords do not match.' });
      return;
    }

    if (new_password.length < 6 || new_password.length > 128) {
      res.status(400).json({ success: false, message: 'New password must be between 6 and 128 characters.' });
      return;
    }

    // Verify current password
    const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const user = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      return;
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (error: any) {
    console.error('updatePassword error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
}
