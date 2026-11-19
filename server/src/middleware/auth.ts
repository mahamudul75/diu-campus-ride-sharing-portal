import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.ts';
import type { TokenPayload } from '../utils/jwt.ts';
import { db } from '../config/db.ts';
import { isTruthyDbFlag } from '../utils/validators.ts';

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
  email_verified?: number;
  student_verified?: number;
  avatar_url?: string | null;
  show_phone_to_accepted?: number;
  bio?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

const AUTH_USER_QUERY_WITH_EXT = `
  SELECT id, student_id, name, email, phone, role, driver_status,
         vehicle_type, vehicle_model, vehicle_plate, is_blocked,
         email_verified, student_verified, show_phone_to_accepted, bio
  FROM users WHERE id = ?
`;

const AUTH_USER_QUERY_BASE = `
  SELECT id, student_id, name, email, phone, role, driver_status,
         vehicle_type, vehicle_model, vehicle_plate, is_blocked
  FROM users WHERE id = ?
`;

async function fetchAuthUserById(userId: number): Promise<AuthenticatedUser | null> {
  try {
    const [rows] = await db.query(AUTH_USER_QUERY_WITH_EXT, [userId]);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0] as any;
    return {
      id: Number(row.id),
      student_id: row.student_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      driver_status: row.driver_status,
      vehicle_type: row.vehicle_type ?? null,
      vehicle_model: row.vehicle_model ?? null,
      vehicle_plate: row.vehicle_plate ?? null,
      is_blocked: row.is_blocked,
      email_verified: Number(row.email_verified || 0),
      student_verified: Number(row.student_verified || 0),
      show_phone_to_accepted:
        row.show_phone_to_accepted === undefined ? 1 : Number(row.show_phone_to_accepted),
      bio: row.bio || null
    };
  } catch (err: any) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err;
    const [rows] = await db.query(AUTH_USER_QUERY_BASE, [userId]);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0] as any;
    return {
      id: Number(row.id),
      student_id: row.student_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      driver_status: row.driver_status,
      vehicle_type: row.vehicle_type ?? null,
      vehicle_model: row.vehicle_model ?? null,
      vehicle_plate: row.vehicle_plate ?? null,
      is_blocked: row.is_blocked,
      email_verified: 0,
      student_verified: 0,
      show_phone_to_accepted: 1,
      bio: null
    };
  }
}

export async function authenticateToken(
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

    const user = await fetchAuthUserById(decoded.id);

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User account not found.'
      });
      return;
    }

    if (isTruthyDbFlag(user.is_blocked)) {
      res.status(403).json({
        success: false,
        message: 'Your account has been suspended by campus administration.'
      });
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error?.isDatabaseUnavailable || error?.status === 503) {
      res.status(503).json({
        success: false,
        message: error.message || 'Database service is temporarily unavailable. Please try again shortly.'
      });
      return;
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal authentication error.'
    });
  }
}

export async function optionalAuthenticateToken(
  req: AuthRequest,
  _res: Response,
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

    const user = await fetchAuthUserById(decoded.id);
    if (user && !isTruthyDbFlag(user.is_blocked)) {
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
