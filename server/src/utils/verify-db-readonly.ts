/**
 * Standalone Read-Only TiDB Cloud Verification Script
 *
 * Security & Privilege Boundary Notice:
 * 1. Code-Level Safety: This script strictly executes SELECT queries against
 *    information_schema metadata and the users table. It contains zero INSERT,
 *    UPDATE, DELETE, ALTER, DROP, CREATE, TRUNCATE, migration, or seeding commands.
 * 2. Database Privilege Distinction: Application-level SELECT-only logic does
 *    NOT enforce read-only database privileges at the engine level. The connection
 *    operates with whatever permissions are assigned to the DB_USER account on the
 *    database server.
 * 3. Recommended Least-Privilege Practice: When available on your TiDB cluster,
 *    supply credentials for an existing dedicated read-only database account
 *    (granted only SELECT privileges) via DB_USER and DB_PASSWORD. This script
 *    does not create users, alter grants, or modify permissions.
 *
 * Usage:
 *   npx tsx server/src/utils/verify-db-readonly.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

interface ExpectedIndexDefinition {
  table: string;
  indexName: string;
  expectedColumns: string[];
}

// 1. Baseline core tables (Prerequisite for Migration 002)
const BASELINE_TABLES: string[] = ['users', 'rides', 'ride_requests'];

// 2. Migration 002 additive platform feature tables (9 tables)
const MIGRATION_002_TABLES: string[] = [
  'auth_tokens',
  'driver_applications',
  'reviews',
  'notifications',
  'conversations',
  'messages',
  'emergency_contacts',
  'user_reports',
  'user_blocks'
];

// 3. Migration 002 extended columns on users
const REQUIRED_COLUMNS_USERS: string[] = [
  'email_verified',
  'student_verified',
  'avatar_url',
  'show_phone_to_accepted',
  'bio'
];

// 4. Columns required to audit admin presence safely
const REQUIRED_ADMIN_COLUMNS: string[] = [
  'role',
  'is_blocked',
  'password_hash',
  'email',
  'student_id'
];

// 5. Migration 003 composite performance indexes (16 total)
const REQUIRED_INDEXES: ExpectedIndexDefinition[] = [
  { table: 'rides', indexName: 'idx_rides_status_departure', expectedColumns: ['status', 'departure_time'] },
  { table: 'rides', indexName: 'idx_rides_driver_departure', expectedColumns: ['driver_id', 'departure_time'] },
  { table: 'ride_requests', indexName: 'idx_requests_passenger_created', expectedColumns: ['passenger_id', 'created_at'] },
  { table: 'ride_requests', indexName: 'idx_requests_passenger_status', expectedColumns: ['passenger_id', 'status'] },
  { table: 'ride_requests', indexName: 'idx_requests_ride_status', expectedColumns: ['ride_id', 'status'] },
  { table: 'notifications', indexName: 'idx_notifications_user_created', expectedColumns: ['user_id', 'created_at'] },
  { table: 'notifications', indexName: 'idx_notifications_user_type', expectedColumns: ['user_id', 'type'] },
  { table: 'conversations', indexName: 'idx_conv_driver_updated', expectedColumns: ['driver_id', 'updated_at'] },
  { table: 'conversations', indexName: 'idx_conv_passenger_updated', expectedColumns: ['passenger_id', 'updated_at'] },
  { table: 'reviews', indexName: 'idx_reviews_reviewee_created', expectedColumns: ['reviewee_id', 'created_at'] },
  { table: 'reviews', indexName: 'idx_reviews_reviewer_ride', expectedColumns: ['reviewer_id', 'ride_id'] },
  { table: 'user_reports', indexName: 'idx_reports_reporter_created', expectedColumns: ['reporter_id', 'created_at'] },
  { table: 'user_reports', indexName: 'idx_reports_status_created', expectedColumns: ['status', 'created_at'] },
  { table: 'user_reports', indexName: 'idx_reports_created', expectedColumns: ['created_at'] },
  { table: 'user_blocks', indexName: 'idx_blocks_blocker_created', expectedColumns: ['blocker_id', 'created_at'] },
  { table: 'driver_applications', indexName: 'idx_driver_apps_user_created', expectedColumns: ['user_id', 'created_at'] }
];

function buildStrictSslConfig(): mysql.SslOptions {
  const sslConfig: mysql.SslOptions = {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  };

  const rawCa = process.env.DB_SSL_CA?.trim();
  if (rawCa) {
    if (rawCa.includes('-----BEGIN CERTIFICATE-----')) {
      sslConfig.ca = rawCa.replace(/\\n/g, '\n');
    } else {
      const resolvedPath = path.resolve(rawCa);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Configured DB_SSL_CA file path does not exist: "${resolvedPath}"`);
      }
      sslConfig.ca = fs.readFileSync(resolvedPath, 'utf-8');
    }
  }

  return sslConfig;
}

function formatSafeDatabaseError(err: any): string {
  if (!err) return 'Unknown database error occurred.';
  const code = err.code || (err.errno ? `ERR_${err.errno}` : 'UNKNOWN_ERROR');
  switch (code) {
    case 'ER_ACCESS_DENIED_ERROR':
    case 1045:
      return `[${code}] Access denied: Authentication failed. Verify DB_USER, DB_PASSWORD, and cluster IP access filters.`;
    case 'ER_BAD_DB_ERROR':
    case 1049:
      return `[${code}] Unknown database: The specified DB_NAME does not exist on the database cluster.`;
    case 'ECONNREFUSED':
      return `[${code}] Connection refused: Unable to reach DB_HOST:DB_PORT. Verify network host and port settings.`;
    case 'ETIMEDOUT':
      return `[${code}] Connection timed out: Network connection to cluster timed out. Verify TiDB Cloud IP Traffic Filters.`;
    case 'ENOTFOUND':
      return `[${code}] Host not found: DNS lookup failed for DB_HOST.`;
    case 'PROTOCOL_CONNECTION_LOST':
      return `[${code}] Connection closed by remote server during protocol handshake.`;
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'CERT_HAS_EXPIRED':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      return `[${code}] TLS certificate verification failed. Check certificate authorities or DB_SSL_CA.`;
    default:
      return `[${code}] Database operation failed safely without disclosing parameters.`;
  }
}

async function verifyDatabase(): Promise<void> {
  console.log('================================================================');
  console.log(' DIU CAMPUS RIDE SHARING — READ-ONLY DATABASE AUDIT');
  console.log('================================================================');
  console.log('NOTICE: This utility executes SELECT queries only.');
  console.log('Application-level SELECT logic does not enforce database privilege');
  console.log('boundaries. For strict read-only enforcement, run with an existing');
  console.log('database user granted SELECT privileges only.\n');

  // 1. Strict Environment Validation (No Insecure Defaults)
  const missingVars: string[] = [];
  if (!process.env.DB_HOST?.trim()) missingVars.push('DB_HOST');
  if (!process.env.DB_USER?.trim()) missingVars.push('DB_USER');
  if (!process.env.DB_PASSWORD) missingVars.push('DB_PASSWORD');
  if (!process.env.DB_NAME?.trim()) missingVars.push('DB_NAME');

  if (missingVars.length > 0) {
    console.error(`❌ FATAL: Missing required environment variable(s): ${missingVars.join(', ')}.`);
    console.error('Please configure these in your local .env file before running verification.');
    process.exitCode = 1;
    return;
  }

  const host = process.env.DB_HOST!.trim();
  const port = Number(process.env.DB_PORT?.trim() || '4000');
  const user = process.env.DB_USER!.trim();
  const password = process.env.DB_PASSWORD!;
  const database = process.env.DB_NAME!.trim();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@diu.edu.bd').trim().toLowerCase();
  const adminStudentId = (process.env.ADMIN_STUDENT_ID || '000-00-001').trim();

  let sslConfig: mysql.SslOptions;
  try {
    sslConfig = buildStrictSslConfig();
  } catch (err: any) {
    console.error(`❌ FATAL: SSL configuration error: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  let conn: mysql.Connection | null = null;
  let baselineTablesPassed = true;
  let migration002TablesPassed = true;
  let columnsPassed = true;
  let enumPassed = true;
  let indexesPassed = true;
  let adminStatus: 'FOUND' | 'NOT SEEDED' | 'CONFLICT' | 'SKIPPED' = 'SKIPPED';
  let hasUsersTable = false;
  let hasRidesTable = false;
  let existingUserCols = new Set<string>();

  try {
    console.log(`Target Host:  ${host}:${port}`);
    console.log(`Database:     ${database}`);
    console.log(`TLS Security: Enabled (TLSv1.2+ strict verification)\n`);

    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      ssl: sslConfig,
      connectTimeout: 15000
    });

    console.log('✓ Secure connection established.\n');

    // Section 1: Server & Database Metadata
    const [metaRows]: any = await conn.query(
      'SELECT DATABASE() AS current_db, VERSION() AS db_version, NOW() AS server_time, CONNECTION_ID() AS conn_id'
    );
    console.log('--- 1. Cluster Identification ---');
    console.log(`  Active Database: ${metaRows[0]?.current_db}`);
    console.log(`  Database Engine: ${metaRows[0]?.db_version}`);
    console.log(`  Server Time:     ${metaRows[0]?.server_time}`);
    console.log(`  Connection ID:   ${metaRows[0]?.conn_id}\n`);

    // Section 2: Table Existence (Segregated: 3 Baseline + 9 Migration 002 = 12 Total)
    console.log('--- 2. Table Verification (12 Total Expected) ---');
    const [tableRows]: any = await conn.query(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
    );
    const existingTables = new Set<string>(tableRows.map((r: any) => String(r.TABLE_NAME || '').toLowerCase()));
    hasUsersTable = existingTables.has('users');
    hasRidesTable = existingTables.has('rides');

    console.log(' [A] Baseline Tables (Prerequisites):');
    for (const table of BASELINE_TABLES) {
      if (existingTables.has(table.toLowerCase())) {
        console.log(`    [✓ PASS] ${table}`);
      } else {
        console.error(`    [✗ FAIL] Missing Baseline: ${table}`);
        baselineTablesPassed = false;
      }
    }

    console.log(' [B] Migration 002 Tables (Platform Features):');
    for (const table of MIGRATION_002_TABLES) {
      if (existingTables.has(table.toLowerCase())) {
        console.log(`    [✓ PASS] ${table}`);
      } else {
        console.error(`    [✗ FAIL] Missing Feature Table: ${table}`);
        migration002TablesPassed = false;
      }
    }

    // Section 3: Migration 002 Schema (Columns & Enums)
    console.log('\n--- 3. Migration 002 Schema Verification ---');
    if (!hasUsersTable) {
      console.warn('  [⚠ SKIPPED] Cannot inspect users table columns (users table does not exist).');
      columnsPassed = false;
    } else {
      const [colRows]: any = await conn.query(
        `SELECT COLUMN_NAME 
         FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'`
      );
      existingUserCols = new Set<string>(colRows.map((r: any) => String(r.COLUMN_NAME || '').toLowerCase()));

      for (const col of REQUIRED_COLUMNS_USERS) {
        if (existingUserCols.has(col.toLowerCase())) {
          console.log(`  [✓ PASS] Column: users.${col}`);
        } else {
          console.error(`  [✗ FAIL] Missing Column: users.${col}`);
          columnsPassed = false;
        }
      }
    }

    if (!hasRidesTable) {
      console.warn('  [⚠ SKIPPED] Cannot inspect rides status enum (rides table does not exist).');
      enumPassed = false;
    } else {
      const [enumRows]: any = await conn.query(
        `SELECT COLUMN_TYPE 
         FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rides' AND COLUMN_NAME = 'status'`
      );
      const enumType = String(enumRows[0]?.COLUMN_TYPE || '');
      if (enumType.includes('scheduled') && enumType.includes('in_progress')) {
        console.log(`  [✓ PASS] Status Enum: rides.status includes 'scheduled' and 'in_progress'`);
      } else {
        console.error(`  [✗ FAIL] Status Enum: rides.status missing scheduled/in_progress (${enumType || 'NOT FOUND'})`);
        enumPassed = false;
      }
    }

    // Section 4: Migration 003 Composite Performance Indexes
    console.log('\n--- 4. Migration 003 Composite Index Verification (16 Expected) ---');
    const [idxRows]: any = await conn.query(
      `SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS cols
       FROM information_schema.STATISTICS 
       WHERE TABLE_SCHEMA = DATABASE() 
       GROUP BY TABLE_NAME, INDEX_NAME`
    );

    const existingIdxMap = new Map<string, string>();
    for (const row of idxRows) {
      const key = `${String(row.TABLE_NAME).toLowerCase()}:${String(row.INDEX_NAME).toLowerCase()}`;
      existingIdxMap.set(key, String(row.cols || '').toLowerCase());
    }

    for (const def of REQUIRED_INDEXES) {
      const key = `${def.table.toLowerCase()}:${def.indexName.toLowerCase()}`;
      const actualCols = existingIdxMap.get(key);
      const expectedColsStr = def.expectedColumns.join(',').toLowerCase();

      if (!actualCols) {
        console.error(`  [✗ FAIL] Missing Index: ${def.table}.${def.indexName} (Expected: [${def.expectedColumns.join(', ')}])`);
        indexesPassed = false;
      } else if (actualCols !== expectedColsStr) {
        console.error(
          `  [✗ FAIL] Column Mismatch on ${def.table}.${def.indexName} (Expected: [${def.expectedColumns.join(
            ', '
          )}], Actual: [${actualCols.split(',').join(', ')}])`
        );
        indexesPassed = false;
      } else {
        console.log(`  [✓ PASS] Index: ${def.table}.${def.indexName} -> (${def.expectedColumns.join(', ')})`);
      }
    }

    // Section 5: Administrator Provisioning Verification (Zero Personal Data Exposure)
    console.log('\n--- 5. Administrator Provisioning Verification ---');
    if (!hasUsersTable) {
      console.warn('  [⚠ SKIPPED] Cannot audit administrator account (users table does not exist).');
      adminStatus = 'SKIPPED';
    } else {
      const hasAllAdminCols = REQUIRED_ADMIN_COLUMNS.every((c) => existingUserCols.has(c));
      if (!hasAllAdminCols) {
        const missingAdminCols = REQUIRED_ADMIN_COLUMNS.filter((c) => !existingUserCols.has(c));
        console.warn(`  [⚠ SKIPPED] Cannot audit admin: required columns missing on users (${missingAdminCols.join(', ')}).`);
        adminStatus = 'SKIPPED';
      } else {
        const [adminRows]: any = await conn.query(
          `SELECT id, role, is_blocked, 
                  (password_hash IS NOT NULL AND LENGTH(password_hash) >= 50) AS has_valid_hash,
                  (LOWER(email) = ? OR student_id = ?) AS matches_configured_identity
           FROM users 
           WHERE role = 'admin' OR LOWER(email) = ? OR student_id = ?`,
          [adminEmail, adminStudentId, adminEmail, adminStudentId]
        );

        const records = Array.isArray(adminRows) ? (adminRows as any[]) : [];
        if (records.length === 0) {
          adminStatus = 'NOT SEEDED';
          console.warn('  [ℹ NOT SEEDED] No administrator account found in users table.');
        } else {
          const nonAdminConflict = records.find((r) => r.role !== 'admin' && Number(r.matches_configured_identity) === 1);
          const activeAdmins = records.filter((r) => r.role === 'admin' && Number(r.is_blocked) === 0 && Number(r.has_valid_hash) === 1);
          const suspendedAdmins = records.filter((r) => r.role === 'admin' && Number(r.is_blocked) === 1);

          if (nonAdminConflict) {
            adminStatus = 'CONFLICT';
            console.error('  [✗ CONFLICT] Configured admin identifier matches an existing account with non-admin role.');
          } else if (activeAdmins.length > 0) {
            adminStatus = 'FOUND';
            const matchesConfig = activeAdmins.some((a) => Number(a.matches_configured_identity) === 1);
            console.log(
              `  [✓ FOUND] Active Administrator confirmed (Count: ${activeAdmins.length}, Configured Identity Match: ${
                matchesConfig ? 'Yes' : 'Alternative admin account'
              }, Suspended: No)`
            );
          } else if (suspendedAdmins.length > 0) {
            adminStatus = 'CONFLICT';
            console.error('  [✗ CONFLICT] Administrator account exists but is marked as suspended/blocked.');
          } else {
            adminStatus = 'CONFLICT';
            console.error('  [✗ CONFLICT] Administrator record exists but lacks a valid password hash.');
          }
        }
      }
    }

    // Section 6: Comprehensive Readiness Evaluation
    console.log('\n================================================================');
    console.log(' AUDIT SCORECARD');
    console.log('================================================================');
    console.log(` Database Connection:             PASS`);
    console.log(` Baseline Tables (3/3):           ${baselineTablesPassed ? 'PASS' : 'FAIL'}`);
    console.log(` Migration 002 Tables (9/9):      ${migration002TablesPassed ? 'PASS' : 'FAIL'}`);
    console.log(` Migration 002 Columns (users):   ${columnsPassed ? 'PASS' : 'FAIL'}`);
    console.log(` Migration 002 Enum (rides):      ${enumPassed ? 'PASS' : 'FAIL'}`);
    console.log(` Migration 003 Indexes (16/16):   ${indexesPassed ? 'PASS' : 'FAIL'}`);
    console.log(` Administrator Account:           ${adminStatus}`);

    const isSchemaVerified =
      baselineTablesPassed &&
      migration002TablesPassed &&
      columnsPassed &&
      enumPassed &&
      indexesPassed &&
      adminStatus === 'FOUND';

    if (isSchemaVerified) {
      console.log('\n✅ RESULT: DATABASE SCHEMA AND ADMIN VERIFICATION PASSED');
      console.log('Notice: Automated audit covers database schema objects, composite indexes, and');
      console.log('administrator presence only. Operational prerequisites (automated TiDB backups/PITR,');
      console.log('Render egress networking, least-privilege user grants, and production environment');
      console.log('variables in the Render dashboard) are outside this script\'s scope.\n');
      process.exitCode = 0;
    } else {
      console.error('\n❌ RESULT: DATABASE VERIFICATION FAILED (INCOMPLETE SCHEMA)');
      
      const isMigration002Complete = migration002TablesPassed && columnsPassed && enumPassed;

      // Strictly ordered migration dependency recommendations
      if (!baselineTablesPassed) {
        console.error('  - CRITICAL: Baseline tables are missing (users, rides, ride_requests).');
        console.error('    Do NOT execute Migration 002 or Migration 003 yet.');
        console.error('    Review and complete baseline database schema initialization first.');
      } else if (!isMigration002Complete) {
        console.error('  - Required Action: Review and apply Migration 002 ("npm run migrate").');
        console.error('    Confirm baseline prerequisites and review migration statements against the target database first.');
        console.error('    Note: Migration 003 (performance indexes) must wait until Migration 002 is fully applied.');
      } else if (!indexesPassed) {
        console.error('  - Required Action: Execute Migration 003 ("npm run migrate:indexes") to create missing performance indexes.');
      }

      // Administrator provisioning recommendation
      if (adminStatus === 'NOT SEEDED') {
        console.error('  - Required Action: Provision Administrator ("npm run seed:admin") with ADMIN_PASSWORD.');
      } else if (adminStatus === 'CONFLICT') {
        console.error('  - Required Action: Resolve administrator identifier or suspension conflict manually.');
      } else if (adminStatus === 'SKIPPED') {
        console.error('  - Required Action: Administrator audit skipped; address missing users table/columns before verifying or seeding admin.');
      }

      process.exitCode = 1;
    }
    console.log('================================================================\n');
  } catch (err: any) {
    console.error('\n❌ FATAL: Database audit halted due to connection or execution error.');
    console.error(`Safe Error Details: ${formatSafeDatabaseError(err)}`);
    process.exitCode = 1;
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch {
        // Silently close on exit
      }
    }
  }
}

verifyDatabase();
