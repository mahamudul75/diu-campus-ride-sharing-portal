import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.ts';
import type { TokenPayload } from '../utils/jwt.ts';
import { db } from '../config/db.ts';

export interface AuthenticatedUser {
  id: number;
  student_id: string;
  name: string;
  email: string;
  phone: string;
  role: 'student' | 'admin';
  driver_status: 'none' | 'pending' | 'approved' | 'rejected';
  vehicle_type: 'bike' | 'car' | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  is_blocked: number;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check cookie first (for Axios withCredentials), then Authorization header
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.'
      });
      return;
    }

    const decoded = verifyToken(token) as TokenPayload | null;
    if (!decoded) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session. Please log in again.'
      });
      return;
    }

    // Verify user still exists in database and check blocked status
    const [rows] = await db.query(
      'SELECT id, student_id, name, email, phone, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked FROM users WHERE id = ?',
      [decoded.id]
    );

    const user = Array.isArray(rows) && rows.length > 0 ? (rows[0] as AuthenticatedUser) : null;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User account not found.'
      });
      return;
    }

    // Blocked check
    if (user.is_blocked === 1 || Boolean(user.is_blocked)) {
      res.status(403).json({
        success: false,
        message: 'Your account has been suspended by campus administration.'
      });
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal authentication error.'
    });
  }
}

export async function optionalAuthenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (!token) {
      return next();
    }

    const decoded = verifyToken(token) as TokenPayload | null;
    if (!decoded) {
      return next();
    }

    const [rows] = await db.query(
      'SELECT id, student_id, name, email, phone, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked FROM users WHERE id = ?',
      [decoded.id]
    );

    const user = Array.isArray(rows) && rows.length > 0 ? (rows[0] as AuthenticatedUser) : null;
    if (user && user.is_blocked !== 1 && !Boolean(user.is_blocked)) {
      req.user = user;
    }
    next();
  } catch {
    next();
  }
}

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      message: 'Access denied: DIU Administrator privileges required.'
    });
    return;
  }

  next();
}

export function requireApprovedDriver(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  if (req.user.driver_status !== 'approved') {
    res.status(403).json({
      success: false,
      message: 'Access denied: Only approved DIU student drivers can perform this action.'
    });
    return;
  }

  next();
}
