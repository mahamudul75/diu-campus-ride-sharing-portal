import jwt from 'jsonwebtoken';
import { Response } from 'express';

const JWT_SECRET: string = process.env.JWT_SECRET!;
if (!JWT_SECRET || typeof JWT_SECRET !== 'string' || JWT_SECRET.trim() === '') {
  console.error('FATAL: JWT_SECRET environment variable is missing or empty. Server startup aborted.');
  process.exit(1);
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';

export interface TokenPayload {
  id: number;
  email: string;
  student_id: string;
  role: 'student' | 'admin';
  driver_status: 'none' | 'pending' | 'approved' | 'rejected';
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie('token', token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie('token', {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax'
  });
}
