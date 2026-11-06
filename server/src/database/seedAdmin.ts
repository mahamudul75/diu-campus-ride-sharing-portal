import dotenv from 'dotenv';

// Guarantee environment variables are parsed before the database module is loaded
dotenv.config();

import bcrypt from 'bcryptjs';

async function seedAdmin(): Promise<void> {
  console.log('--- Initial DIU Admin Seeding ---');

  const {
    ADMIN_NAME = 'DIU Transport Admin',
    ADMIN_EMAIL = 'admin@diu.edu.bd',
    ADMIN_PASSWORD,
    ADMIN_STUDENT_ID = '000-00-001',
    ADMIN_PHONE = '01711000001'
  } = process.env;

  if (!ADMIN_PASSWORD) {
    console.error('❌ Error: ADMIN_PASSWORD environment variable is missing.');
    process.exitCode = 1;
    return;
  }

  const cleanEmail = ADMIN_EMAIL.trim().toLowerCase();
  const cleanStudentId = ADMIN_STUDENT_ID.trim();
  const cleanName = ADMIN_NAME.trim();
  const cleanPhone = ADMIN_PHONE.trim();

  let pool: any = null;

  try {
    // Dynamic import ensures db.ts reads the already-populated process.env
    const { db, getDbPool } = await import('../config/db.ts');
    pool = await getDbPool();

    // Check for existing user records matching the admin's email or student ID
    const [existingRows] = await db.query(
      'SELECT id, student_id, email, role FROM users WHERE email = ? OR student_id = ?',
      [cleanEmail, cleanStudentId]
    );

    const existingUsers = Array.isArray(existingRows) ? (existingRows as any[]) : [];

    if (existingUsers.length > 0) {
      // 1. Conflict guard: If email or student ID belongs to a non-admin, abort and protect that account
      const nonAdminConflict = existingUsers.find((u) => u.role !== 'admin');
      if (nonAdminConflict) {
        console.error(
          `❌ Conflict: An account with email "${cleanEmail}" or student ID "${cleanStudentId}" already belongs to a non-admin (${nonAdminConflict.role}). Account will not be modified.`
        );
        process.exitCode = 1;
        return;
      }

      // 2. Idempotency guard: If already an admin, exit cleanly without creating duplicates
      const adminUser = existingUsers.find((u) => u.role === 'admin');
      console.log(
        `ℹ️ Administrator account already exists (ID: ${adminUser.id}, Email: ${adminUser.email}). Exiting safely without creating duplicate.`
      );
      process.exitCode = 0;
      return;
    }

    // Hash password with bcrypt using 10 salt rounds (never log plaintext or hash)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

    // Insert new administrator into the live TiDB Cloud database
    const [result] = await db.query(
      `INSERT INTO users 
        (student_id, name, email, phone, password_hash, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'admin', 'none', NULL, NULL, NULL, 0)`,
      [cleanStudentId, cleanName, cleanEmail, cleanPhone, passwordHash]
    );

    const newAdminId = (result as any).insertId;
    console.log(
      `✅ SUCCESS: Initial DIU Administrator created successfully (ID: ${newAdminId}, Email: ${cleanEmail}, Student ID: ${cleanStudentId}).`
    );
    process.exitCode = 0;
  } catch (error: any) {
    console.error('❌ Failed to seed initial admin:', error.message);
    process.exitCode = 1;
  } finally {
    // Guaranteed pool closure ensures the process exits cleanly without hanging
    if (pool && typeof pool.end === 'function') {
      try {
        await pool.end();
      } catch {
        // Pool end error ignored on shutdown
      }
    }
  }
}

seedAdmin();
