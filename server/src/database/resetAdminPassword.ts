/**
 * One-time transactional admin password reset script.
 * Reads ADMIN_PASSWORD from environment, updates admin@diu.edu.bd, and verifies via bcrypt.compare().
 * 
 * Target: admin@diu.edu.bd (Role: admin)
 * Run command: npx tsx server/src/database/resetAdminPassword.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { db, closeDbPool } from '../config/db.ts';

const ADMIN_TARGET_EMAIL = 'admin@diu.edu.bd';
const BCRYPT_SALT_ROUNDS = 10;

async function resetAdminPassword(): Promise<void> {
  console.log('--- DIU Admin Password Reset (One-Time Execution) ---');

  const newAdminPassword = process.env.ADMIN_PASSWORD;
  if (!newAdminPassword || typeof newAdminPassword !== 'string' || newAdminPassword.trim().length === 0) {
    console.error('❌ Aborted: ADMIN_PASSWORD environment variable is missing or empty.');
    process.exitCode = 1;
    return;
  }

  let conn: any = null;

  try {
    conn = await db.getConnection();

    // Start the database transaction before checking the admin account
    await conn.beginTransaction();

    // 1. Verify account exists exactly once and possesses the 'admin' role
    const [existingRows] = await conn.query(
      'SELECT id, email, role FROM users WHERE email = ?',
      [ADMIN_TARGET_EMAIL]
    );

    const users = Array.isArray(existingRows) ? existingRows : [];

    if (users.length === 0) {
      await conn.rollback();
      console.error(`❌ Aborted: No account found for email "${ADMIN_TARGET_EMAIL}". Transaction rolled back.`);
      process.exitCode = 1;
      return;
    }

    if (users.length > 1) {
      await conn.rollback();
      console.error(`❌ Aborted: Multiple accounts found for email "${ADMIN_TARGET_EMAIL}". Database state must be inspected manually. Transaction rolled back.`);
      process.exitCode = 1;
      return;
    }

    const adminUser = users[0];
    if (adminUser.role !== 'admin') {
      await conn.rollback();
      console.error(`❌ Aborted: Account with email "${ADMIN_TARGET_EMAIL}" has role "${adminUser.role}", not "admin". Refusing to modify. Transaction rolled back.`);
      process.exitCode = 1;
      return;
    }

    console.log(`✓ Verified existing administrator account (ID: ${adminUser.id}, Email: ${adminUser.email}).`);

    // 2. Hash password using project-standard bcryptjs with 10 salt rounds
    const newHash = await bcrypt.hash(newAdminPassword, BCRYPT_SALT_ROUNDS);
    console.log(`✓ Generated bcrypt password hash using ${BCRYPT_SALT_ROUNDS} salt rounds.`);

    // 3. Execute update inside the active transaction
    const [updateResult] = await conn.query(
      'UPDATE users SET password_hash = ? WHERE id = ? AND email = ? AND role = ?',
      [newHash, adminUser.id, ADMIN_TARGET_EMAIL, 'admin']
    );

    const affectedRows = updateResult?.affectedRows ?? 0;
    if (affectedRows !== 1) {
      await conn.rollback();
      console.error(`❌ Aborted: Expected exactly 1 updated row, but got ${affectedRows}. Transaction rolled back.`);
      process.exitCode = 1;
      return;
    }

    // 4. Retrieve stored hash to verify actual persistence in TiDB Cloud
    const [verifyRows] = await conn.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [adminUser.id]
    );

    const verifiedRecord = Array.isArray(verifyRows) && verifyRows.length > 0 ? verifyRows[0] : null;
    if (!verifiedRecord || !verifiedRecord.password_hash) {
      await conn.rollback();
      console.error('❌ Aborted: Unable to retrieve updated password record for verification. Transaction rolled back.');
      process.exitCode = 1;
      return;
    }

    // 5. Test password verification using bcrypt.compare (exact logic as login controller)
    const isMatch = await bcrypt.compare(newAdminPassword, verifiedRecord.password_hash);
    if (!isMatch) {
      await conn.rollback();
      console.error('❌ Aborted: Password verification comparison failed. Transaction rolled back.');
      process.exitCode = 1;
      return;
    }

    await conn.commit();
    console.log('✓ Successfully committed transaction to TiDB Cloud.');
    console.log('✅ SUCCESS: Admin password for admin@diu.edu.bd has been updated and verified against TiDB Cloud.');
    process.exitCode = 0;
  } catch (error: any) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {
        // Rollback error ignored
      }
    }
    console.error('❌ Error executing password reset:', error?.message || error);
    process.exitCode = 1;
  } finally {
    if (conn && typeof conn.release === 'function') {
      try {
        conn.release();
      } catch {
        // Release error ignored
      }
    }
    await closeDbPool().catch(() => {});
    console.log('✓ Database connection closed safely.');
  }
}

resetAdminPassword();
