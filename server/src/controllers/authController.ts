import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { generateToken, setAuthCookie, clearAuthCookie } from '../utils/jwt.ts';
import { isValidStudentId, isValidDiuEmail, isValidPhone, sanitizePhone } from '../utils/validators.ts';

export async function register(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, student_id, email, phone, password, confirm_password } = req.body;

    // 1. Validation checks
    if (!name || !student_id || !email || !phone || !password) {
      res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
      return;
    }

    if (password !== confirm_password) {
      res.status(400).json({
        success: false,
        message: 'Passwords do not match.'
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.'
      });
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

    // 2. Check duplicate student ID or email
    const [existingStudent] = await db.query(
      'SELECT id FROM users WHERE student_id = ?',
      [cleanStudentId]
    );
    if (Array.isArray(existingStudent) && existingStudent.length > 0) {
      res.status(409).json({
        success: false,
        message: 'A student account with this DIU Student ID already exists.'
      });
      return;
    }

    const [existingEmail] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [cleanEmail]
    );
    if (Array.isArray(existingEmail) && existingEmail.length > 0) {
      res.status(409).json({
        success: false,
        message: 'An account with this DIU email address already exists.'
      });
      return;
    }

    // 3. Hash password with bcrypt
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // 4. Insert into database
    const [result] = await db.query(
      `INSERT INTO users 
        (student_id, name, email, phone, password_hash, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked) 
       VALUES (?, ?, ?, ?, ?, 'student', 'none', NULL, NULL, NULL, 0)`,
      [cleanStudentId, name.trim(), cleanEmail, cleanPhone, password_hash]
    );

    const newUserId = (result as any).insertId;

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
      is_blocked: 0
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
      message: 'Student registration successful. Welcome to DIU Ride Sharing!',
      user: userPayload,
      token
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed due to a server error. Please try again.'
    });
  }
}

export async function login(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user by email
    const [rows] = await db.query(
      `SELECT id, student_id, name, email, phone, password_hash, role, driver_status, 
              vehicle_type, vehicle_model, vehicle_plate, is_blocked 
       FROM users WHERE email = ?`,
      [cleanEmail]
    );

    const user = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid DIU credentials. Account not found.'
      });
      return;
    }

    // Check blocked status
    if (user.is_blocked === 1 || Boolean(user.is_blocked)) {
      res.status(403).json({
        success: false,
        message: 'Your account has been suspended by campus administration.'
      });
      return;
    }

    // Verify bcrypt password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid DIU credentials. Please check your password.'
      });
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
      is_blocked: user.is_blocked
    };

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: safeUser,
      token
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed due to a server error.'
    });
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  clearAuthCookie(res);
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Not authenticated.' });
    return;
  }

  res.status(200).json({
    success: true,
    user: req.user
  });
}
