/**
 * Safe idempotent additive migration runner for Migration 003 (composite performance indexes).
 * Run manually when upgrading an existing TiDB / MySQL database:
 *   npm run migrate:indexes
 *
 * Strictly executes CREATE INDEX statements and skips duplicate key errors (ER_DUP_KEYNAME / 1061).
 * NEVER drops tables or modifies existing records.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function splitSqlStatements(rawSql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inLineComment = false;

  for (let i = 0; i < rawSql.length; i++) {
    const ch = rawSql[i];
    const next = rawSql[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch;
      }
      continue;
    }

    if (!inSingleQuote && ch === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === "'" && rawSql[i - 1] !== '\\') {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote && ch === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

function describeStatement(statement: string): string {
  const normalized = statement.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(CREATE\s+INDEX\s+`?\w+`?\s+ON\s+`?\w+`?)/i);
  if (match) {
    return match[1];
  }
  return normalized.slice(0, 60);
}

async function runMigration() {
  const {
    DB_HOST = 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    DB_PORT = '4000',
    DB_USER = 'root',
    DB_PASSWORD = '',
    DB_NAME = 'diu_campus_ride_sharing',
    DB_SSL_CA = ''
  } = process.env;

  const sslConfig: mysql.SslOptions = {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2'
  };

  const trimmedCa = DB_SSL_CA.trim();
  if (trimmedCa) {
    if (trimmedCa.includes('-----BEGIN CERTIFICATE-----')) {
      sslConfig.ca = trimmedCa.replace(/\\n/g, '\n');
    } else {
      const resolvedCaPath = path.resolve(trimmedCa);
      if (!fs.existsSync(resolvedCaPath)) {
        throw new Error(`Configured DB_SSL_CA file does not exist: ${resolvedCaPath}`);
      }
      sslConfig.ca = fs.readFileSync(resolvedCaPath, 'utf-8');
    }
  }

  const sqlPath = path.resolve(__dirname, 'migrations', '003_performance_indexes.sql');
  const rawSql = fs.readFileSync(sqlPath, 'utf-8');
  const statements = splitSqlStatements(rawSql);

  if (statements.length === 0) {
    throw new Error(`No SQL statements found in ${sqlPath}`);
  }

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: false,
    ssl: sslConfig
  });

  try {
    console.log(
      `Connected to ${DB_NAME}. Applying additive Migration 003 (${statements.length} index statements)...`
    );

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const label = describeStatement(stmt);
      const step = `[${i + 1}/${statements.length}]`;
      console.log(`${step} Executing: ${label}`);
      try {
        await conn.query(stmt);
        console.log(`✓ ${step} Created: ${label}`);
      } catch (err: any) {
        if (err?.code === 'ER_DUP_KEYNAME' || err?.errno === 1061) {
          console.log(`✓ ${step} Already exists (skipped): ${label}`);
          continue;
        }
        if (err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146) {
          throw new Error(
            `Prerequisite table missing while running "${label}". Run Migration 002 (npm run migrate) before Migration 003.`
          );
        }
        console.error(`✗ ${step} Failed: ${label} — ${err?.message || err}`);
        throw err;
      }
    }

    console.log('✓ Migration 003 completed cleanly without modifying existing data.');
  } finally {
    await conn.end();
  }
}

runMigration().catch((err) => {
  console.error('Migration 003 failed:', err?.message || err);
  process.exit(1);
});
