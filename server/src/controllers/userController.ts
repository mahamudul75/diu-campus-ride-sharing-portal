import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isValidPhone, sanitizePhone } from '../utils/validators.ts';

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

    const { name, phone, vehicle_type, vehicle_model, vehicle_plate } = req.body;

    if (!name || !phone) {
      res.status(400).json({ success: false, message: 'Name and phone are required.' });
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

    const validVehicleType = vehicle_type === 'bike' || vehicle_type === 'car' ? vehicle_type : null;

    await db.query(
      `UPDATE users 
       SET name = ?, phone = ?, vehicle_type = ?, vehicle_model = ?, vehicle_plate = ? 
       WHERE id = ?`,
      [
        name.trim(),
        cleanPhone,
        validVehicleType,
        vehicle_model ? vehicle_model.trim() : null,
        vehicle_plate ? vehicle_plate.trim() : null,
        req.user.id
      ]
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

    const { current_password, new_password, confirm_new_password } = req.body;

    if (!current_password || !new_password) {
      res.status(400).json({ success: false, message: 'Current and new password are required.' });
      return;
    }

    if (new_password !== confirm_new_password) {
      res.status(400).json({ success: false, message: 'New passwords do not match.' });
      return;
    }

    if (new_password.length < 6) {
      res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
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
