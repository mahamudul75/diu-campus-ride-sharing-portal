import type { Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { generateToken, setAuthCookie, clearAuthCookie } from '../utils/jwt.ts';
import { isValidStudentId, isValidDiuEmail, isValidPhone, sanitizePhone, isNonEmptyString } from '../utils/validators.ts';
import { getUserExtendedFields } from '../utils/dbHelpers.ts';
import { formatDateToMySqlUtc, parseRideDateTime } from '../utils/dateTime.ts';
import { sendTransactionalEmail, isSmtpConfigured } from '../utils/mailer.ts';

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function getAppBaseUrl(): string {
  const raw = process.env.APP_URL || process.env.CORS_ORIGINS?.split(',')[0] || 'http://localhost:3000';
  return raw.trim().replace(/\/+$/, '');
}

async function createAuthToken(userId: number, purpose: 'email_verify' | 'password_reset', ttlMinutes: number): Promise<string | null> {
  try {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = formatDateToMySqlUtc(new Date(Date.now() + ttlMinutes * 60 * 1000));

    await db.query(
      'UPDATE auth_tokens SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
      [userId, purpose]
    );
    await db.query(
      'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [userId, purpose, tokenHash, expiresAt]
    );

    return rawToken;
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return null;
    throw err;
  }
}

export async function register(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, student_id, email, phone, password, confirm_password } = req.body ?? {};

    if (
      !isNonEmptyString(name, 2, 100) ||
      !isNonEmptyString(student_id, 5, 20) ||
      !isNonEmptyString(email, 5, 100) ||
      !isNonEmptyString(phone, 8, 25) ||
      typeof password !== 'string' ||
      typeof confirm_password !== 'string'
    ) {
      res.status(400).json({
        success: false,
        message: 'All fields are required with valid text lengths.'
      });
      return;
    }

    if (password !== confirm_password) {
      res.status(400).json({ success: false, message: 'Passwords do not match.' });
      return;
    }

    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ success: false, message: 'Password must be between 6 and 128 characters.' });
      return;
    }

    const cleanStudentId = student_id.trim();
    if (!isValidStudentId(cleanStudentId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid DIU student ID format. Expected format: 000-00-000 (e.g. 211-15-401).'
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!isValidDiuEmail(cleanEmail)) {
      const allowedDomain = process.env.DIU_EMAIL_DOMAIN || 'diu.edu.bd';
      res.status(400).json({
        success: false,
        message: `Only valid DIU student emails (@${allowedDomain}) are permitted.`
      });
      return;
    }

    const cleanPhone = sanitizePhone(phone);
    if (!isValidPhone(cleanPhone)) {
      res.status(400).json({
        success: false,
        message: 'Please provide a valid 11-digit Bangladesh phone number (e.g. 01712345678).'
      });
      return;
    }

    const [existingStudent] = await db.query('SELECT id FROM users WHERE student_id = ?', [cleanStudentId]);
    if (Array.isArray(existingStudent) && existingStudent.length > 0) {
      res.status(409).json({
        success: false,
        message: 'A student account with this DIU Student ID already exists.'
      });
      return;
    }

    const [existingEmail] = await db.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (Array.isArray(existingEmail) && existingEmail.length > 0) {
      res.status(409).json({
        success: false,
        message: 'An account with this DIU email address already exists.'
      });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      `INSERT INTO users 
        (student_id, name, email, phone, password_hash, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked) 
       VALUES (?, ?, ?, ?, ?, 'student', 'none', NULL, NULL, NULL, 0)`,
      [cleanStudentId, name.trim(), cleanEmail, cleanPhone, password_hash]
    );

    const newUserId = (result as any).insertId;

    // Issue email verification token and dispatch email ONLY if SMTP is configured
    let emailVerificationSent = false;
    const rawVerifyToken = await createAuthToken(newUserId, 'email_verify', 24 * 60);
    if (rawVerifyToken && isSmtpConfigured()) {
      const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(rawVerifyToken)}`;
      const emailRes = await sendTransactionalEmail({
        to: cleanEmail,
        subject: 'Verify your DIU Campus Ride Sharing email',
        text: `Hello ${name.trim()},\n\nVerify your DIU student email by opening:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
        html: `<p>Hello ${name.trim()},</p><p>Verify your DIU student email address by clicking below:</p><p><a href="${verifyUrl}">Verify DIU Email</a></p><p>This link expires in 24 hours.</p>`
      });
      emailVerificationSent = emailRes.delivered;
    }

    const userPayload = {
      id: newUserId,
      student_id: cleanStudentId,
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      role: 'student' as const,
      driver_status: 'none' as const,
      vehicle_type: null,
      vehicle_model: null,
      vehicle_plate: null,
      is_blocked: 0,
      email_verified: 0,
      student_verified: 0,
      avatar_url: null,
      show_phone_to_accepted: 1,
      bio: null
    };

    const token = generateToken({
      id: newUserId,
      email: cleanEmail,
      student_id: cleanStudentId,
      role: 'student',
      driver_status: 'none'
    });

    setAuthCookie(res, token);

    res.status(201).json({
      success: true,
      message: emailVerificationSent
        ? 'Student registration successful. A verification email has been sent to your DIU inbox.'
        : 'Student registration successful. Welcome to DIU Ride Sharing!',
      email_verification_sent: emailVerificationSent,
      user: userPayload
    });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({
        success: false,
        message: 'An account with this DIU email or Student ID already exists.'
      });
      return;
    }
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed due to a server error. Please try again.'
    });
  }
}

export async function login(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body ?? {};

    if (!isNonEmptyString(email, 3, 120) || typeof password !== 'string' || password.length === 0 || password.length > 128) {
      res.status(400).json({ success: false, message: 'Valid email and password are required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    const [rows] = await db.query(
      `SELECT id, student_id, name, email, phone, password_hash, role, driver_status, 
              vehicle_type, vehicle_model, vehicle_plate, is_blocked 
       FROM users WHERE email = ?`,
      [cleanEmail]
    );

    const user = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid DIU credentials.' });
      return;
    }

    if (user.is_blocked === 1 || Boolean(user.is_blocked)) {
      res.status(403).json({
        success: false,
        message: 'Your account has been suspended by campus administration.'
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({ success: false, message: 'Invalid DIU credentials.' });
      return;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      student_id: user.student_id,
      role: user.role,
      driver_status: user.driver_status
    });

    setAuthCookie(res, token);

    const ext = await getUserExtendedFields(user.id);

    const safeUser = {
      id: user.id,
      student_id: user.student_id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      driver_status: user.driver_status,
      vehicle_type: user.vehicle_type,
      vehicle_model: user.vehicle_model,
      vehicle_plate: user.vehicle_plate,
      is_blocked: user.is_blocked,
      ...ext
    };

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: safeUser
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed due to a server error.' });
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  clearAuthCookie(res);
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  res.status(200).json({ success: true, user: req.user });
}

export async function requestPasswordReset(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email } = req.body ?? {};
    if (!isNonEmptyString(email, 5, 120) || !isValidDiuEmail(email.trim().toLowerCase())) {
      const allowedDomain = process.env.DIU_EMAIL_DOMAIN || 'diu.edu.bd';
      res.status(400).json({
        success: false,
        message: `Please enter a valid DIU email address (@${allowedDomain}).`
      });
      return;
    }

    if (!isSmtpConfigured()) {
      res.status(200).json({
        success: false,
        configured: false,
        delivered: false,
        message: 'Outbound email (SMTP) is not configured on this server, so password reset links cannot be emailed automatically. Please contact DIU Transport Administration for account recovery.'
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const [rows] = await db.query(
      'SELECT id, name, email, is_blocked FROM users WHERE email = ?',
      [cleanEmail]
    );
    const user = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (user && !user.is_blocked) {
      const rawToken = await createAuthToken(user.id, 'password_reset', 30);
      if (rawToken) {
        const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
        await sendTransactionalEmail({
          to: user.email,
          subject: 'DIU Campus Ride Sharing — Password Reset',
          text: `Hello ${user.name},\n\nReset your password using this link (valid for 30 minutes):\n${resetUrl}`,
          html: `<p>Hello ${user.name},</p><p>Click below to reset your password (expires in 30 minutes):</p><p><a href="${resetUrl}">Reset Password</a></p>`
        });
      }
    }

    res.status(200).json({
      success: true,
      configured: true,
      delivered: true,
      message: 'If an active DIU account exists for this email, a password reset link has been sent.'
    });
  } catch (error: any) {
    console.error('requestPasswordReset error:', error);
    res.status(500).json({ success: false, message: 'Failed to process password reset request.' });
  }
}

export async function resetPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { token, new_password, confirm_new_password } = req.body ?? {};
    if (
      !isNonEmptyString(token, 16, 256) ||
      typeof new_password !== 'string' ||
      typeof confirm_new_password !== 'string'
    ) {
      res.status(400).json({ success: false, message: 'Reset token and matching new password are required.' });
      return;
    }

    if (new_password !== confirm_new_password) {
      res.status(400).json({ success: false, message: 'New passwords do not match.' });
      return;
    }

    if (new_password.length < 6 || new_password.length > 128) {
      res.status(400).json({ success: false, message: 'Password must be between 6 and 128 characters.' });
      return;
    }

    const tokenHash = hashToken(token.trim());
    const [rows] = await db.query(
      `SELECT id, user_id, expires_at FROM auth_tokens
       WHERE token_hash = ? AND purpose = 'password_reset' AND used_at IS NULL`,
      [tokenHash]
    );

    const record = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!record) {
      res.status(400).json({ success: false, message: 'Invalid or already used password reset token.' });
      return;
    }

    const expiresAt = parseRideDateTime(record.expires_at);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      res.status(400).json({ success: false, message: 'This password reset token has expired.' });
      return;
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, record.user_id]);
    await db.query('UPDATE auth_tokens SET used_at = NOW() WHERE id = ?', [record.id]);

    res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully. You can now sign in.'
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Password reset storage requires Migration 002.' });
      return;
    }
    console.error('resetPassword error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
}

export async function resendVerificationEmail(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const ext = await getUserExtendedFields(req.user.id);
    if (ext.email_verified === 1) {
      res.status(200).json({
        success: true,
        already_verified: true,
        message: 'Your DIU email address is already verified.'
      });
      return;
    }

    if (!isSmtpConfigured()) {
      res.status(200).json({
        success: false,
        configured: false,
        delivered: false,
        message: 'Outbound email (SMTP) is not configured on this server. A DIU Transport Admin can verify your account manually.'
      });
      return;
    }

    const rawToken = await createAuthToken(req.user.id, 'email_verify', 24 * 60);
    if (!rawToken) {
      res.status(503).json({ success: false, message: 'Verification tokens require Migration 002.' });
      return;
    }

    const verifyUrl = `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const result = await sendTransactionalEmail({
      to: req.user.email,
      subject: 'Verify your DIU Campus Ride Sharing email',
      text: `Hello ${req.user.name},\n\nClick to verify your email:\n${verifyUrl}`,
      html: `<p>Hello ${req.user.name},</p><p><a href="${verifyUrl}">Verify DIU Email</a></p>`
    });

    res.status(200).json({
      success: result.delivered,
      configured: result.configured,
      delivered: result.delivered,
      message: result.delivered
        ? 'Verification link sent to your DIU email address.'
        : 'Unable to send verification email via SMTP right now.'
    });
  } catch (error: any) {
    console.error('resendVerificationEmail error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend verification email.' });
  }
}

export async function verifyEmail(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawToken = req.body?.token ?? req.query?.token;
    if (!isNonEmptyString(rawToken, 16, 256)) {
      res.status(400).json({ success: false, message: 'Valid verification token is required.' });
      return;
    }

    const tokenHash = hashToken(rawToken.trim());
    const [rows] = await db.query(
      `SELECT id, user_id, expires_at FROM auth_tokens
       WHERE token_hash = ? AND purpose = 'email_verify' AND used_at IS NULL`,
      [tokenHash]
    );

    const record = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!record) {
      res.status(400).json({ success: false, message: 'Invalid or already used verification token.' });
      return;
    }

    const expiresAt = parseRideDateTime(record.expires_at);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      res.status(400).json({ success: false, message: 'This verification token has expired.' });
      return;
    }

    await db.query('UPDATE users SET email_verified = 1 WHERE id = ?', [record.user_id]);
    await db.query('UPDATE auth_tokens SET used_at = NOW() WHERE id = ?', [record.id]);

    res.status(200).json({
      success: true,
      message: 'Your DIU email address has been verified!'
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR') {
      res.status(503).json({ success: false, message: 'Email verification requires Migration 002.' });
      return;
    }
    console.error('verifyEmail error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify email.' });
  }
}
