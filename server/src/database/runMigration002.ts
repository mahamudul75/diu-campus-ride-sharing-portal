/**
 * Safe idempotent additive migration runner for Migration 002.
 * Run manually when upgrading an existing TiDB / MySQL database:
 *   npm run migrate
 *
 * NEVER drops tables or deletes records.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const {
    DB_HOST = 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    DB_PORT = '4000',
    DB_USER = 'root',
    DB_PASSWORD = '',
    DB_NAME = 'diu_campus_ride_sharing',
    DB_SSL_CA = ''
  } = process.env;

  const sslConfig: any = {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  };
  if (DB_SSL_CA) {
    if (DB_SSL_CA.startsWith('-----BEGIN CERTIFICATE-----')) {
      sslConfig.ca = DB_SSL_CA;
    } else if (fs.existsSync(DB_SSL_CA)) {
      sslConfig.ca = fs.readFileSync(DB_SSL_CA).toString();
    }
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true,
    ssl: sslConfig
  });

  try {
    console.log(`Connected to ${DB_NAME}. Applying additive Migration 002...`);
    const sqlPath = path.resolve(__dirname, 'migrations', '002_full_platform_features.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    await conn.query(sql);
    console.log('✓ Migration 002 applied cleanly without modifying existing records.');
  } finally {
    await conn.end();
  }
}

runMigration().catch((err) => {
  console.error('Migration 002 failed:', err?.message || err);
  process.exit(1);
});
