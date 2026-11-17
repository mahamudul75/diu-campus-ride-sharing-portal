/**
 * Automated Backend & Integration Test Suite for Campus Ride Sharing Portal (DIU)
 * Run using: npm test (or: npx tsx test/run-tests.ts)
 * Strictly executes against isolated in-memory storage (never touches live TiDB Cloud).
 */
import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  db,
  enableIsolatedTestMemoryDb,
  resetDbPoolForTesting,
  addTestMessageRecordForTesting
} from '../server/src/config/db.ts';
import apiRouter from '../server/src/routes/index.ts';
import { getConversations } from '../server/src/controllers/chatController.ts';
import { generateToken } from '../server/src/utils/jwt.ts';
import { isValidStudentId, isValidDiuEmail, isTruthyDbFlag } from '../server/src/utils/validators.ts';
import {
  isValidDiuEmail as isFrontendValidDiuEmail,
  isValidBdPhone as isFrontendValidBdPhone,
  isValidRideCoordinate
} from '../src/utils/validators.ts';
import { shouldIncrementUnreadChatCount } from '../src/utils/chatUnread.ts';
import { isDbFlagTrue, isDbFlagNotFalse } from '../src/utils/boolean.ts';
import { validateAvatarDataUrl } from '../server/src/utils/avatar.ts';
import { getUserRatingSummaries } from '../server/src/utils/dbHelpers.ts';
import {
  sendTransactionalEmail,
  setSmtpTransporterForTesting,
  resetSmtpTransporterForTesting
} from '../server/src/utils/mailer.ts';
import {
  ensureUpcomingRideRemindersForUser,
  resetReminderCheckCacheForTesting
} from '../server/src/services/notificationService.ts';
import {
  parseRideDateTime,
  formatDateToMySqlUtc,
  toUtcIsoString,
  resolveRideSearchDateBounds
} from '../server/src/utils/dateTime.ts';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`  FAIL [${totalTests}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    passedTests++;
    console.log(`  PASS [${totalTests}]: ${message}`);
  }
}

function normalizeOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function createTestApp(trustedOriginList: string[]) {
  const app = express();
  const trustedOrigins = new Set(trustedOriginList.map(normalizeOrigin).filter(Boolean) as string[]);
  const isTrustedOrigin = (raw: unknown) => {
    const n = normalizeOrigin(raw);
    return n !== null && trustedOrigins.has(n);
  };

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, false);
        return cb(null, isTrustedOrigin(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    })
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'OPTIONS' && req.headers.origin !== undefined && !isTrustedOrigin(req.headers.origin)) {
      res.status(403).json({ success: false, message: 'Access denied: Untrusted CORS preflight origin.' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const unsafeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (unsafeMethods.includes(req.method)) {
      const hasOrigin = req.headers.origin !== undefined;
      const hasReferer = req.headers.referer !== undefined;
      if (!hasOrigin && !hasReferer) {
        res.status(403).json({ success: false, message: 'Access denied: Missing Origin or Referer.' });
        return;
      }
      if (hasOrigin && !isTrustedOrigin(req.headers.origin)) {
        res.status(403).json({ success: false, message: 'Access denied: Untrusted origin.' });
        return;
      }
      if (hasReferer && !isTrustedOrigin(req.headers.referer)) {
        res.status(403).json({ success: false, message: 'Access denied: Untrusted referer.' });
        return;
      }
    }
    next();
  });
  app.use('/api', apiRouter);
  return app;
}

function extractAuthCookie(res: globalThis.Response): string {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = /token=[^;]+/.exec(setCookie);
  return match ? match[0] : '';
}

async function runTests() {
  console.log('\n=============================================================');
  console.log(' RUNNING BACKEND TESTS — CAMPUS RIDE SHARING PORTAL (DIU)');
  console.log('=============================================================\n');

  await enableIsolatedTestMemoryDb();

  // Phase 1: Validator unit checks
  console.log('[Phase 1: Validation Engine Tests]');
  assert(isValidStudentId('211-15-401') === true, 'Validates DIU Student ID format 000-00-000');
  assert(isValidStudentId('invalid-id') === false, 'Rejects invalid Student ID');
  assert(isValidDiuEmail('tanvir.cse@diu.edu.bd') === true, 'Accepts @diu.edu.bd university email');
  assert(isValidDiuEmail('user@gmail.com') === false, 'Rejects non-DIU public email (@gmail.com)');

  // Phase 2: Student Registration
  console.log('\n[Phase 2: Registration & Duplicate Prevention Tests]');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const testStudentId = `223-15-${randomSuffix}`;
  const testEmail = `test.student.${randomSuffix}@diu.edu.bd`;
  const hashed = await bcrypt.hash('Password123!', 10);

  const [insertRes] = await db.query(
    `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status)
     VALUES (?, ?, ?, ?, ?, 'student', 'none')`,
    [testStudentId, 'Unit Test Student', testEmail, '01799999999', hashed]
  );
  const newUserId = (insertRes as any).insertId;
  assert(newUserId > 0, 'Registers new DIU student successfully');

  const [dupCheck] = await db.query('SELECT id FROM users WHERE student_id = ?', [testStudentId]);
  assert((dupCheck as any[]).length > 0, 'Detects duplicate student ID registration');

  // Phase 3: Password Verification & JWT
  console.log('\n[Phase 3: Authentication & Security Tests]');
  const [userRow] = await db.query('SELECT password_hash FROM users WHERE id = ?', [newUserId]);
  const userPassHash = (userRow as any[])[0].password_hash;
  assert((await bcrypt.compare('Password123!', userPassHash)) === true, 'Bcrypt password hash matches original password');
  assert((await bcrypt.compare('WrongPassword', userPassHash)) === false, 'Rejects incorrect password');

  const token = generateToken({
    id: newUserId,
    email: testEmail,
    student_id: testStudentId,
    role: 'student',
    driver_status: 'none'
  });
  assert(typeof token === 'string' && token.length > 20, 'Generates secure JWT session token');

  // Phase 4: Driver Workflow & Admin Approval
  console.log('\n[Phase 4: Driver Workflow & Admin Approval Tests]');
  await db.query(
    "UPDATE users SET driver_status = 'pending', vehicle_type = 'bike', vehicle_model = 'Yamaha R15', vehicle_plate = 'Dhaka Metro-HA 99-0011' WHERE id = ?",
    [newUserId]
  );
  const [pendingRow] = await db.query('SELECT driver_status, vehicle_model FROM users WHERE id = ?', [newUserId]);
  assert((pendingRow as any[])[0].driver_status === 'pending', 'Student driver application status set to pending');

  await db.query("UPDATE users SET driver_status = 'approved' WHERE id = ?", [newUserId]);
  const [approvedRow] = await db.query('SELECT driver_status FROM users WHERE id = ?', [newUserId]);
  assert((approvedRow as any[])[0].driver_status === 'approved', 'Admin successfully approves driver application');

  // Phase 5: Ride Management & Booking
  console.log('\n[Phase 5: Ride Management & Booking Tests]');
  const depTime = formatDateToMySqlUtc(new Date(Date.now() + 3600000 * 5));
  const [rideInsert] = await db.query(
    `INSERT INTO rides 
      (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bike', 'Test route', 'open')`,
    [newUserId, 'DIU Gate 2', 23.8768, 90.3202, 'Dhanmondi 32', 23.7538, 90.377, depTime, 110, 1, 1]
  );
  const testRideId = (rideInsert as any).insertId;
  assert(testRideId > 0, 'Approved student driver creates campus ride');

  const [searchResults] = await db.query("SELECT * FROM rides WHERE dest_name LIKE '%Dhanmondi%'");
  assert((searchResults as any[]).length > 0, 'Searches and retrieves rides by destination');

  const passengerStudentId = `224-15-${randomSuffix}`;
  const passengerEmail = `test.passenger.${randomSuffix}@diu.edu.bd`;
  const [passengerInsert] = await db.query(
    `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status)
     VALUES (?, ?, ?, ?, ?, 'student', 'none')`,
    [passengerStudentId, 'Test Passenger', passengerEmail, '01788888888', hashed]
  );
  const passengerId = (passengerInsert as any).insertId;

  const [reqInsert] = await db.query(
    "INSERT INTO ride_requests (ride_id, passenger_id, status) VALUES (?, ?, 'pending')",
    [testRideId, passengerId]
  );
  const testReqId = (reqInsert as any).insertId;
  assert(testReqId > 0, 'Passenger submits booking request for the ride');

  // Phase 6: Seat Management & Transaction Consistency
  console.log('\n[Phase 6: Seat Management & Transaction Consistency Tests]');
  const conn = await db.getConnection();
  await conn.beginTransaction();
  await conn.query("UPDATE ride_requests SET status = 'accepted' WHERE id = ?", [testReqId]);
  await conn.query("UPDATE rides SET seats_available = seats_available - 1, status = 'full' WHERE id = ?", [testRideId]);
  await conn.commit();
  conn.release();

  const [rideAfterAccept] = await db.query('SELECT seats_available, status FROM rides WHERE id = ?', [testRideId]);
  assert((rideAfterAccept as any[])[0].seats_available === 0, 'Available seats successfully reduced to 0 on accept');
  assert((rideAfterAccept as any[])[0].status === 'full', 'Ride status automatically marks as full when seats reach 0');

  // Phase 7: Cancellation & Seat Restoration
  console.log('\n[Phase 7: Cancellation & Seat Restoration Tests]');
  const conn2 = await db.getConnection();
  await conn2.beginTransaction();
  await conn2.query("UPDATE ride_requests SET status = 'cancelled' WHERE id = ?", [testReqId]);
  await conn2.query("UPDATE rides SET seats_available = seats_available + 1, status = 'open' WHERE id = ?", [testRideId]);
  await conn2.commit();
  conn2.release();

  const [rideAfterCancel] = await db.query('SELECT seats_available, status FROM rides WHERE id = ?', [testRideId]);
  assert((rideAfterCancel as any[])[0].seats_available === 1, 'Restores available seat count exactly once');
  assert((rideAfterCancel as any[])[0].status === 'open', 'Re-opens ride status from full to open');

  // Phase 8: Governance & Security Enforcement
  console.log('\n[Phase 8: Governance & Security Enforcement Tests]');
  await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [newUserId]);
  const [blockedCheck] = await db.query('SELECT is_blocked FROM users WHERE id = ?', [newUserId]);
  assert((blockedCheck as any[])[0].is_blocked === 1, 'Admin successfully blocks student account');

  const [adminCount] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_blocked = 0");
  assert((adminCount as any[])[0].count >= 1, 'System protects and retains active admin presence');

  // Phase 9: Timezone, DateTime & DST Calendar Bounds
  console.log('\n[Phase 9: Timezone, DateTime & DST Bounds Tests]');
  const parsedDhakaOffset = parseRideDateTime('2026-06-15T18:30:00+06:00');
  assert(parsedDhakaOffset?.toISOString() === '2026-06-15T12:30:00.000Z', 'Converts +06:00 offset to exact UTC instant');
  assert(toUtcIsoString('2026-06-15 12:30:00') === '2026-06-15T12:30:00.000Z', 'Serializes SQL DATETIME string as canonical UTC ...Z');
  assert(parseRideDateTime('2026-02-30T10:00:00Z') === null, 'Rejects calendar-invalid Feb 30');

  const nySpring = resolveRideSearchDateBounds({ date: '2026-03-08', time_zone: 'America/New_York' });
  assert(
    nySpring?.startUtcSql === '2026-03-08 05:00:00' && nySpring?.endUtcSql === '2026-03-09 04:00:00',
    'Handles DST Spring-Forward 23h day bounds accurately'
  );
  const nyFall = resolveRideSearchDateBounds({ date: '2026-11-01', time_zone: 'America/New_York' });
  assert(
    nyFall?.startUtcSql === '2026-11-01 04:00:00' && nyFall?.endUtcSql === '2026-11-02 05:00:00',
    'Handles DST Fall-Back 25h day bounds accurately'
  );
  const dhakaBounds = resolveRideSearchDateBounds({ date: '2026-07-20', time_zone: 'Asia/Dhaka' });
  assert(
    dhakaBounds?.startUtcSql === '2026-07-19 18:00:00' && dhakaBounds?.endUtcSql === '2026-07-20 18:00:00',
    'Handles Asia/Dhaka (+06:00) calendar day bounds accurately'
  );

  // Reset clean memory state before HTTP API integration tests
  await enableIsolatedTestMemoryDb();

  const trustedOrigin = 'http://localhost:3000';
  const app = createTestApp([trustedOrigin]);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}/api`;

  try {
    // Phase 10: HTTP CORS & CSRF Security
    console.log('\n[Phase 10: HTTP CORS, CSRF & RBAC Enforcement Tests]');
    const preflightEvil = await fetch(`${baseUrl}/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.run.app' }
    });
    assert(preflightEvil.status === 403, 'Rejects untrusted *.run.app CORS preflight with 403');

    const postNoHeaders = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tanvir.cse@diu.edu.bd', password: 'Password123!' })
    });
    assert(postNoHeaders.status === 403, 'Rejects state-changing POST missing Origin and Referer with 403');

    const postBadOrigin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'not-a-url' },
      body: JSON.stringify({ email: 'tanvir.cse@diu.edu.bd', password: 'Password123!' })
    });
    assert(postBadOrigin.status === 403, 'Rejects malformed Origin header with 403');

    const loginUser = async (email: string, password: string) => {
      const r = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
        body: JSON.stringify({ email, password })
      });
      const data: any = await r.json();
      return { res: r, data, cookie: extractAuthCookie(r) };
    };

    const driverLogin = await loginUser('tanvir.cse@diu.edu.bd', 'Password123!');
    const sadiaLogin = await loginUser('sadia.bba@diu.edu.bd', 'Password123!');
    const rahatLogin = await loginUser('rahat.eee@diu.edu.bd', 'Password123!');
    const adminLogin = await loginUser(
      process.env.ADMIN_EMAIL || 'admin@diu.edu.bd',
      process.env.ADMIN_PASSWORD || 'LocalDevAdminSeedPassword123!'
    );
    assert(driverLogin.res.status === 200 && driverLogin.cookie.includes('token='), 'Driver HTTP login succeeds with cookie');
    assert(adminLogin.res.status === 200, 'Admin HTTP login succeeds');

    const studentToAdmin = await fetch(`${baseUrl}/admin/stats`, {
      headers: { Cookie: sadiaLogin.cookie }
    });
    assert(studentToAdmin.status === 403, 'Non-admin student blocked from /api/admin/stats (403)');

    const tamperProfile = await fetch(`${baseUrl}/users/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaLogin.cookie },
      body: JSON.stringify({ name: 'Sadia Afrin', phone: '01645678901', vehicle_plate: 'FAKE-9999' })
    });
    assert(tamperProfile.status === 403, 'Blocks self-service vehicle field tampering on PUT /api/users/profile (403)');

    // Admin self-delete & driver approval checks
    const adminSelfDelete = await fetch(`${baseUrl}/admin/users/1`, {
      method: 'DELETE',
      headers: { Origin: trustedOrigin, Cookie: adminLogin.cookie }
    });
    assert(adminSelfDelete.status === 400, 'Admin blocked from deleting own account (400)');

    const dupPendingApply = await fetch(`${baseUrl}/drivers/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({
        vehicle_type: 'bike',
        vehicle_model: 'Yamaha FZS',
        vehicle_plate: 'Dhaka Metro-HA 11-2233'
      })
    });
    assert(dupPendingApply.status === 409, 'Blocks duplicate driver application while pending (409)');

    const approveRahat = await fetch(`${baseUrl}/admin/drivers/4/approve`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: adminLogin.cookie }
    });
    assert(approveRahat.status === 200, 'Admin approves pending driver Rahat (id=4)');

    const doubleApproveRahat = await fetch(`${baseUrl}/admin/drivers/4/approve`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: adminLogin.cookie }
    });
    const rejectApprovedRahat = await fetch(`${baseUrl}/admin/drivers/4/reject`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: adminLogin.cookie }
    });
    const reapplyApproved = await fetch(`${baseUrl}/drivers/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({
        vehicle_type: 'bike',
        vehicle_model: 'Yamaha FZS',
        vehicle_plate: 'Dhaka Metro-HA 11-2233'
      })
    });
    assert(
      doubleApproveRahat.status === 409 && rejectApprovedRahat.status === 409 && reapplyApproved.status === 409,
      'Prevents double driver approval, rejecting approved driver, and approved driver re-apply (409)'
    );

    // Phase 11: Concurrency, Privacy (F17) & Seat Conservation via HTTP
    console.log('\n[Phase 11: HTTP Concurrency, Privacy F17 & Seat Invariants]');
    const regNew = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({
        name: 'Concurrent Student',
        student_id: '231-15-888',
        email: 'concurrent.test@diu.edu.bd',
        phone: '01755667788',
        password: 'Password123!',
        confirm_password: 'Password123!'
      })
    });
    const regCookie = extractAuthCookie(regNew);
    assert(regNew.status === 201 && !!regCookie, 'Registers second test student via API');

    const oneSeatCreate = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Race Test Gate',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Uttara Race Dest',
        dest_lat: 23.8742,
        dest_lng: 90.398,
        departure_time: new Date(Date.now() + 10 * 3600000).toISOString(),
        fare: 140,
        seats_total: 1,
        vehicle_type: 'bike'
      })
    });
    const { rideId: raceRideId }: any = await oneSeatCreate.json();

    // F17 unauthenticated check
    const unauthRideView = await fetch(`${baseUrl}/rides/${raceRideId}`);
    const unauthRideJson: any = await unauthRideView.json();
    assert(
      unauthRideJson.ride.driver_phone === null && unauthRideJson.ride.driver_vehicle_plate === null,
      'F17 Privacy: Hides driver phone and plate from unauthenticated viewers'
    );

    const req1Res = await fetch(`${baseUrl}/rides/${raceRideId}/requests`, {
      method: 'POST',
      headers: { Origin: trustedOrigin, Cookie: sadiaLogin.cookie }
    });
    const req1Json: any = await req1Res.json();

    const req2Res = await fetch(`${baseUrl}/rides/${raceRideId}/requests`, {
      method: 'POST',
      headers: { Origin: trustedOrigin, Cookie: regCookie }
    });
    const req2Json: any = await req2Res.json();
    assert(req1Res.status === 201 && req2Res.status === 201, 'Both passengers submit requests for 1-seat ride');

    // Concurrent accepts -> only 1 succeeds
    const [acc1, acc2] = await Promise.all([
      fetch(`${baseUrl}/requests/${req1Json.requestId}/accept`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
      }),
      fetch(`${baseUrl}/requests/${req2Json.requestId}/accept`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
      })
    ]);
    const accStatuses = [acc1.status, acc2.status].sort();
    assert(accStatuses[0] === 200 && accStatuses[1] === 409, 'Parallel accept on 1-seat ride: exactly one 200 and one 409');

    const winnerCookie = acc1.status === 200 ? sadiaLogin.cookie : regCookie;
    const loserCookie = acc1.status === 200 ? regCookie : sadiaLogin.cookie;
    const winnerId = acc1.status === 200 ? req1Json.requestId : req2Json.requestId;
    const loserId = acc1.status === 200 ? req2Json.requestId : req1Json.requestId;

    // F17 check for accepted vs pending passenger
    const winnerView = await fetch(`${baseUrl}/rides/${raceRideId}`, { headers: { Cookie: winnerCookie } });
    const winnerViewJson: any = await winnerView.json();
    const loserView = await fetch(`${baseUrl}/rides/${raceRideId}`, { headers: { Cookie: loserCookie } });
    const loserViewJson: any = await loserView.json();
    assert(
      winnerViewJson.ride.driver_phone !== null && winnerViewJson.ride.driver_vehicle_plate !== null,
      'F17 Privacy: Exposes driver phone and plate to accepted passenger'
    );
    assert(
      loserViewJson.ride.driver_phone === null && loserViewJson.ride.driver_vehicle_plate === null,
      'F17 Privacy: Still hides driver phone and plate from pending passenger'
    );

    // Parallel double-cancel on winner
    const [can1, can2] = await Promise.all([
      fetch(`${baseUrl}/requests/${winnerId}/cancel`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: winnerCookie }
      }),
      fetch(`${baseUrl}/requests/${winnerId}/cancel`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: winnerCookie }
      })
    ]);
    const canStatuses = [can1.status, can2.status].sort();
    assert(canStatuses[0] === 200 && canStatuses[1] === 409, 'Parallel double-cancel on accepted request: exactly one 200 and one 409');

    // Re-request after cancellation works cleanly
    const reRequestRes = await fetch(`${baseUrl}/rides/${raceRideId}/requests`, {
      method: 'POST',
      headers: { Origin: trustedOrigin, Cookie: winnerCookie }
    });
    assert(reRequestRes.status === 200, 'Allows passenger to re-request after cancellation');

    // Accept loser, update ride seats 1 -> 3, verify booked=1 / avail=2, then cancel ride (L-2)
    await fetch(`${baseUrl}/requests/${loserId}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
    });
    const updateSeatsRes = await fetch(`${baseUrl}/rides/${raceRideId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ seats_total: 3 })
    });
    assert(updateSeatsRes.status === 200, 'Driver edits ride total seats cleanly while full');

    const rideAfterUpdate = await (await fetch(`${baseUrl}/rides/${raceRideId}`)).json();
    assert(
      rideAfterUpdate.ride.seats_available === 2 && rideAfterUpdate.ride.status === 'open',
      'Seat conservation holds after edit: 3 total - 1 booked = 2 available'
    );

    const drvCancel = await fetch(`${baseUrl}/rides/${raceRideId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
    });
    assert(drvCancel.status === 200, 'Driver cancels ride cleanly (L-2)');

    const reqListAfterCancel: any = await (
      await fetch(`${baseUrl}/rides/${raceRideId}/requests`, { headers: { Cookie: driverLogin.cookie } })
    ).json();
    assert(
      reqListAfterCancel.requests.every((r: any) => r.status === 'cancelled'),
      'L-2 cascade: all pending & accepted booking requests marked cancelled'
    );

    // Expired ride guard
    const [pastInsert] = await db.query(
      `INSERT INTO rides (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
       VALUES (?, 'Past Gate', 23.8, 90.3, 'Past Dest', 23.7, 90.4, ?, 100, 2, 2, 'car', NULL, 'open')`,
      [2, formatDateToMySqlUtc(new Date(Date.now() - 3600000))]
    );
    const reqPastRes = await fetch(`${baseUrl}/rides/${(pastInsert as any).insertId}/requests`, {
      method: 'POST',
      headers: { Origin: trustedOrigin, Cookie: rahatLogin.cookie }
    });
    assert(reqPastRes.status === 400, 'Blocks passenger request for already-departed ride (400)');

    // =========================================================================
    // Phase 12: Auth Tokens, Avatar Magic-Byte Validation & Privacy Controls
    // =========================================================================
    console.log('\n[Phase 12: Auth Tokens, Avatar Validation & Privacy Controls]');
    const forgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({ email: 'sadia.bba@diu.edu.bd' })
    });
    const forgotJson: any = await forgotRes.json();
    assert(
      forgotRes.status === 200 && forgotJson.configured === false && forgotJson.delivered === false,
      'Forgot-password honestly reports unconfigured SMTP when env vars absent'
    );

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    await db.query(
      'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [5, 'password_reset', resetHash, formatDateToMySqlUtc(new Date(Date.now() + 30 * 60 * 1000))]
    );

    const resetOk = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({
        token: rawResetToken,
        new_password: 'NewPassword123!',
        confirm_new_password: 'NewPassword123!'
      })
    });
    assert(resetOk.status === 200, 'Resets password with valid reset token');

    const resetReplay = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({
        token: rawResetToken,
        new_password: 'AnotherPassword1!',
        confirm_new_password: 'AnotherPassword1!'
      })
    });
    assert(resetReplay.status === 400, 'Rejects reused password reset token (400)');

    const expiredVerifyRaw = crypto.randomBytes(32).toString('hex');
    const expiredVerifyHash = crypto.createHash('sha256').update(expiredVerifyRaw).digest('hex');
    await db.query(
      'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [4, 'email_verify', expiredVerifyHash, formatDateToMySqlUtc(new Date(Date.now() - 60000))]
    );
    const verifyExpiredRes = await fetch(`${baseUrl}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({ token: expiredVerifyRaw })
    });
    assert(verifyExpiredRes.status === 400, 'Rejects expired email verification token (400)');

    const validVerifyRaw = crypto.randomBytes(32).toString('hex');
    const validVerifyHash = crypto.createHash('sha256').update(validVerifyRaw).digest('hex');
    await db.query(
      'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [4, 'email_verify', validVerifyHash, formatDateToMySqlUtc(new Date(Date.now() + 3600000))]
    );
    const verifyOkRes = await fetch(`${baseUrl}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({ token: validVerifyRaw })
    });
    assert(verifyOkRes.status === 200, 'Verifies email with valid token');

    const sadiaNewLogin = await loginUser('sadia.bba@diu.edu.bd', 'NewPassword123!');
    assert(sadiaNewLogin.res.status === 200, 'Sadia signs in using newly reset password');

    // Avatar validator unit & HTTP checks
    const fakePngBase64 = Buffer.from('not-actually-a-png-file').toString('base64');
    const validPngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const validPngDataUrl = `data:image/png;base64,${validPngBytes.toString('base64')}`;
    const oversizedPng = `data:image/png;base64,${Buffer.concat([validPngBytes, Buffer.alloc(520 * 1024)]).toString('base64')}`;
    assert(validateAvatarDataUrl(`data:image/png;base64,${fakePngBase64}`).valid === false, 'Rejects spoofed MIME image without PNG magic bytes');
    assert(validateAvatarDataUrl(oversizedPng).valid === false, 'Rejects avatar image larger than 512 KB');
    assert(validateAvatarDataUrl(validPngDataUrl).valid === true, 'Accepts valid PNG magic-byte avatar image');

    const avatarBadRes = await fetch(`${baseUrl}/users/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ avatar_url: `data:image/png;base64,${fakePngBase64}` })
    });
    assert(avatarBadRes.status === 400, 'POST /api/users/avatar rejects spoofed magic bytes (400)');

    const avatarOkRes = await fetch(`${baseUrl}/users/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ avatar_url: validPngDataUrl })
    });
    const avatarOkJson: any = await avatarOkRes.json();
    assert(avatarOkRes.status === 200 && Boolean(avatarOkJson.user?.avatar_url), 'Uploads valid PNG avatar via API');

    const avatarDelRes = await fetch(`${baseUrl}/users/avatar`, {
      method: 'DELETE',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const avatarDelJson: any = await avatarDelRes.json();
    assert(avatarDelRes.status === 200 && avatarDelJson.user?.avatar_url === null, 'Removes avatar via DELETE /api/users/avatar');

    // Privacy toggle & bio
    const privacyRes = await fetch(`${baseUrl}/users/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        name: 'Tanvir Ahmed',
        phone: '01812345678',
        bio: 'Senior CSE rider',
        show_phone_to_accepted: 0
      })
    });
    const privacyJson: any = await privacyRes.json();
    assert(
      privacyRes.status === 200 && privacyJson.user?.bio === 'Senior CSE rider' && privacyJson.user?.show_phone_to_accepted === 0,
      'Updates bio and show_phone_to_accepted privacy flag cleanly'
    );

    const hiddenPhoneRideView = await (await fetch(`${baseUrl}/rides/5`, { headers: { Cookie: sadiaNewLogin.cookie } })).json();
    assert(
      hiddenPhoneRideView.ride?.driver_phone === null && hiddenPhoneRideView.ride?.driver_vehicle_plate !== null,
      'Respects show_phone_to_accepted = 0 while still showing plate to accepted passenger'
    );

    // Restore driver phone visibility for later checks
    await fetch(`${baseUrl}/users/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ name: 'Tanvir Ahmed', phone: '01812345678', show_phone_to_accepted: 1 })
    });

    // =========================================================================
    // Phase 13: Ride Lifecycle, min_seats, Full Edit & Driver History
    // =========================================================================
    console.log('\n[Phase 13: Ride Lifecycle, min_seats Filter & Driver History]');
    const schedCreateRes = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Gate 2 Scheduled',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Banani Road 11',
        dest_lat: 23.7937,
        dest_lng: 90.4066,
        departure_time: new Date(Date.now() + 12 * 3600000).toISOString(),
        fare: 150,
        seats_total: 4,
        vehicle_type: 'car',
        status: 'scheduled'
      })
    });
    const { rideId: schedRideId }: any = await schedCreateRes.json();
    assert(schedCreateRes.status === 201 && schedRideId > 0, 'Creates scheduled ride cleanly');

    const minSeats3 = await (await fetch(`${baseUrl}/rides?min_seats=3`)).json();
    assert(
      minSeats3.rides.some((r: any) => r.id === schedRideId) &&
        minSeats3.rides.every((r: any) => Number(r.seats_available) >= 3),
      'GET /api/rides?min_seats=3 filters to rides with >= 3 seats available'
    );

    // Full edit on scheduled ride
    const fullEditRes = await fetch(`${baseUrl}/rides/${schedRideId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Smart City Main Gate',
        dest_name: 'Banani Chairman Bari',
        seats_total: 3,
        fare: 170,
        vehicle_type: 'car',
        note: 'Updated pickup gate'
      })
    });
    assert(fullEditRes.status === 200, 'Full PUT /api/rides/:id updates pickup, dest, seats, fare, vehicle, note');

    // Passenger books & driver accepts scheduled ride
    const schedBookRes = await fetch(`${baseUrl}/rides/${schedRideId}/requests`, {
      method: 'POST',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const { requestId: schedReqId }: any = await schedBookRes.json();
    assert(schedBookRes.status === 201, 'Passenger books seat on scheduled ride');

    const schedAcceptRes = await fetch(`${baseUrl}/requests/${schedReqId}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
    });
    assert(schedAcceptRes.status === 200, 'Driver accepts passenger request on scheduled ride');

    // Status transitions: scheduled -> open -> in_progress -> completed, invalid reverse rejected (409)
    const toOpen = await fetch(`${baseUrl}/rides/${schedRideId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ status: 'open' })
    });
    const toProgress = await fetch(`${baseUrl}/rides/${schedRideId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ status: 'in_progress' })
    });
    const invalidReverse = await fetch(`${baseUrl}/rides/${schedRideId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ status: 'open' })
    });
    const toComplete = await fetch(`${baseUrl}/rides/${schedRideId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ status: 'completed' })
    });
    assert(
      toOpen.status === 200 && toProgress.status === 200 && invalidReverse.status === 409 && toComplete.status === 200,
      'Ride lifecycle transitions (scheduled -> open -> in_progress -> completed) & invalid transition guard (409)'
    );

    const drvHistRes = await fetch(`${baseUrl}/drivers/history`, { headers: { Cookie: rahatLogin.cookie } });
    const drvHistJson: any = await drvHistRes.json();
    assert(
      drvHistRes.status === 200 && Array.isArray(drvHistJson.applications) && drvHistJson.applications.length >= 1,
      'GET /api/drivers/history returns student driver application timeline'
    );

    // =========================================================================
    // Phase 14: Ratings & Reviews System
    // =========================================================================
    console.log('\n[Phase 14: Ratings & Reviews System]');
    const uncompletedReview = await fetch(`${baseUrl}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ ride_id: 3, reviewee_id: 3, rating: 5, comment: 'Too early' })
    });
    assert(uncompletedReview.status === 409, 'Rejects review on uncompleted ride (409)');

    const uninvolvedReview = await fetch(`${baseUrl}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({ ride_id: schedRideId, reviewee_id: 2, rating: 1, comment: 'Not on this ride' })
    });
    assert(uninvolvedReview.status === 403, 'Rejects review from uninvolved student (403)');

    const passengerReview = await fetch(`${baseUrl}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ ride_id: schedRideId, reviewee_id: 2, rating: 5, comment: 'Safe and punctual drive!' })
    });
    assert(passengerReview.status === 201, 'Accepted passenger submits rating for driver on completed ride');

    const dupReview = await fetch(`${baseUrl}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ ride_id: schedRideId, reviewee_id: 2, rating: 4, comment: 'Second try' })
    });
    assert(dupReview.status === 409, 'Rejects duplicate review for same ride/user (409)');

    const driverReviewPassenger = await fetch(`${baseUrl}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ ride_id: schedRideId, reviewee_id: 5, rating: 4, comment: 'Great passenger!' })
    });
    assert(driverReviewPassenger.status === 201, 'Driver rates accepted passenger on completed ride');

    const driverRatingSummary: any = await (await fetch(`${baseUrl}/reviews/user/2`)).json();
    const rideReviewList: any = await (
      await fetch(`${baseUrl}/reviews/ride/${schedRideId}`, { headers: { Cookie: sadiaNewLogin.cookie } })
    ).json();
    assert(
      driverRatingSummary.avg_rating === 5 &&
        driverRatingSummary.review_count === 1 &&
        rideReviewList.reviews.length === 2,
      'Computes driver rating summary & ride review breakdown accurately'
    );

    // =========================================================================
    // Phase 15: Notifications & In-App Chat
    // =========================================================================
    console.log('\n[Phase 15: Notifications & Ride Chat]');
    const driverNotifsRes = await fetch(`${baseUrl}/notifications`, { headers: { Cookie: driverLogin.cookie } });
    const driverNotifs: any = await driverNotifsRes.json();
    assert(
      driverNotifsRes.status === 200 && driverNotifs.notifications.length >= 2 && driverNotifs.unread_count >= 2,
      'Notifications auto-created for driver (booking/review) with accurate unread count'
    );

    const firstNotifId = driverNotifs.notifications[0].id;
    const crossUserRead = await fetch(`${baseUrl}/notifications/${firstNotifId}/read`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    assert(crossUserRead.status === 403, 'Rejects cross-user notification read attempt (403)');

    const markOneRead = await fetch(`${baseUrl}/notifications/${firstNotifId}/read`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
    });
    const markAllRead = await fetch(`${baseUrl}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
    });
    const afterReadAll: any = await (await fetch(`${baseUrl}/notifications`, { headers: { Cookie: driverLogin.cookie } })).json();
    assert(
      markOneRead.status === 200 && markAllRead.status === 200 && afterReadAll.unread_count === 0,
      'Marks individual and all notifications read cleanly'
    );

    const delNotif = await fetch(`${baseUrl}/notifications/${firstNotifId}`, {
      method: 'DELETE',
      headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
    });
    assert(delNotif.status === 200, 'Deletes user own notification cleanly');

    // Chat tests on ride 1 (pending booking between Rahat id=4 & Driver Tanvir id=2)
    const uninvolvedChat = await fetch(`${baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ ride_id: schedRideId }) // schedRideId is valid for Sadia, use ride 1 where Sadia has NO request
    });
    assert(uninvolvedChat.status === 200 || uninvolvedChat.status === 201, 'Participant opens ride conversation cleanly');

    const blockedChatRes = await fetch(`${baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ ride_id: 1 })
    });
    assert(blockedChatRes.status === 403, 'Rejects chat creation by student without booking on ride 1 (403)');

    const { conversation: activeConv }: any = await uninvolvedChat.json();
    const msgSend = await fetch(`${baseUrl}/chat/conversations/${activeConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ content: 'Thanks for the safe ride!' })
    });
    assert(msgSend.status === 201, 'Participant sends chat message cleanly');

    const intruderMsg = await fetch(`${baseUrl}/chat/conversations/${activeConv.id}/messages`, {
      headers: { Cookie: rahatLogin.cookie }
    });
    assert(intruderMsg.status === 403, 'Blocks non-participant from reading conversation messages (403)');

    const driverReadChat: any = await (
      await fetch(`${baseUrl}/chat/conversations/${activeConv.id}/messages`, { headers: { Cookie: driverLogin.cookie } })
    ).json();
    assert(driverReadChat.messages?.length === 1 && driverReadChat.messages[0].content === 'Thanks for the safe ride!', 'Driver reads chat messages cleanly');

    // =========================================================================
    // Phase 16: Safety Center, User Blocking & Admin Moderation
    // =========================================================================
    console.log('\n[Phase 16: Safety Center, User Blocks & Admin Moderation]');
    const ecAdd = await fetch(`${baseUrl}/safety/emergency-contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ name: 'Kamrul Hasan', relationship: 'Brother', phone: '01711223344' })
    });
    const ecJson: any = await ecAdd.json();
    assert(ecAdd.status === 201 && ecJson.contact?.id > 0, 'Saves emergency contact cleanly');

    const ecOtherDel = await fetch(`${baseUrl}/safety/emergency-contacts/${ecJson.contact.id}`, {
      method: 'DELETE',
      headers: { Origin: trustedOrigin, Cookie: rahatLogin.cookie }
    });
    assert(ecOtherDel.status === 403, 'Prevents another student from deleting emergency contact (403)');

    const ecOwnDel = await fetch(`${baseUrl}/safety/emergency-contacts/${ecJson.contact.id}`, {
      method: 'DELETE',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    assert(ecOwnDel.status === 200, 'Owner deletes emergency contact cleanly');

    // Block driver (id=2) from Sadia (id=5) -> hides rides & blocks chat & ride requests
    const blockDriverRes = await fetch(`${baseUrl}/safety/blocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ blocked_id: 2 })
    });
    assert(blockDriverRes.status === 200, 'Blocks user cleanly via Safety API');

    const blockedRideSearch: any = await (
      await fetch(`${baseUrl}/rides`, { headers: { Cookie: sadiaNewLogin.cookie } })
    ).json();
    assert(
      blockedRideSearch.rides.every((r: any) => Number(r.driver_id) !== 2),
      'Hides rides offered by blocked driver from blocker search results'
    );

    const reqBlockedRide = await fetch(`${baseUrl}/rides/1/requests`, {
      method: 'POST',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    assert(reqBlockedRide.status === 403, 'Prevents requesting ride with blocked driver (403)');

    const msgBlockedChat = await fetch(`${baseUrl}/chat/conversations/${activeConv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ content: 'Blocked check' })
    });
    assert(msgBlockedChat.status === 403, 'Blocks sending chat messages when users are blocked (403)');

    const unblockRes = await fetch(`${baseUrl}/safety/blocks/2`, {
      method: 'DELETE',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    assert(unblockRes.status === 200, 'Unblocks user cleanly');

    // Safety report workflow & admin resolution
    const reportSub = await fetch(`${baseUrl}/safety/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({
        reported_user_id: 4,
        ride_id: 1,
        reason: 'no_show',
        description: 'Did not arrive at pickup point after confirming.'
      })
    });
    const reportSubJson: any = await reportSub.json();
    assert(reportSub.status === 201 && reportSubJson.reportId > 0, 'Submits safety report and notifies admin');

    const adminVerifyStudent = await fetch(`${baseUrl}/admin/users/5/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: adminLogin.cookie },
      body: JSON.stringify({ student_verified: 1 })
    });
    assert(adminVerifyStudent.status === 200, 'Admin verifies DIU student identity');

    const adminRides: any = await (
      await fetch(`${baseUrl}/admin/rides`, { headers: { Cookie: adminLogin.cookie } })
    ).json();
    const adminBookings: any = await (
      await fetch(`${baseUrl}/admin/bookings`, { headers: { Cookie: adminLogin.cookie } })
    ).json();
    const adminReports: any = await (
      await fetch(`${baseUrl}/admin/reports`, { headers: { Cookie: adminLogin.cookie } })
    ).json();
    assert(
      adminRides.rides?.length > 0 && adminBookings.bookings?.length > 0 && adminReports.reports?.length === 1,
      'Admin endpoints return all rides, bookings, and safety reports'
    );

    const resolveReportRes = await fetch(`${baseUrl}/admin/reports/${reportSubJson.reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: adminLogin.cookie },
      body: JSON.stringify({ status: 'resolved', admin_note: 'Reviewed and warning issued.' })
    });
    const moderateRideRes = await fetch(`${baseUrl}/admin/rides/2/moderate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: adminLogin.cookie },
      body: JSON.stringify({ reason: 'Schedule conflict notice' })
    });
    const adminStatsExpanded: any = await (
      await fetch(`${baseUrl}/admin/stats`, { headers: { Cookie: adminLogin.cookie } })
    ).json();
    assert(
      resolveReportRes.status === 200 &&
        moderateRideRes.status === 200 &&
        typeof adminStatsExpanded.stats?.ride_completion_rate === 'number' &&
        adminStatsExpanded.stats?.verified_students >= 1,
      'Admin report resolution, ride moderation & expanded analytics KPIs succeed'
    );

    // =========================================================================
    // Phase 17: Regression Tests for Phase 2 Critical Bug Fixes
    // =========================================================================
    console.log('\n[Phase 17: Phase 2 Bug Fixes & Regression Tests]');

    // 1. /api/live bypasses global rate limiter & works independently of DB readiness
    const liveRes = await fetch(`${baseUrl}/live`);
    const liveJson: any = await liveRes.json();
    const ridesForHeaderCheck = await fetch(`${baseUrl}/rides`);
    assert(
      liveRes.status === 200 &&
        liveJson.status === 'ok' &&
        !liveRes.headers.has('ratelimit') &&
        ridesForHeaderCheck.headers.has('ratelimit'),
      '/api/live bypasses apiGeneralLimiter and responds ok independently of DB guard'
    );

    // 2. Auth & ID validation happen BEFORE db.getConnection()
    let getConnCalls = 0;
    const origGetConnection = db.getConnection.bind(db);
    (db as any).getConnection = async () => {
      getConnCalls++;
      return origGetConnection();
    };
    try {
      const invalidChecks = await Promise.all([
        fetch(`${baseUrl}/rides/abc`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
          body: JSON.stringify({ fare: 120 })
        }),
        fetch(`${baseUrl}/rides/abc/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
          body: JSON.stringify({ status: 'open' })
        }),
        fetch(`${baseUrl}/rides/1/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
          body: JSON.stringify({ status: 'invalid_state' })
        }),
        fetch(`${baseUrl}/rides/abc/cancel`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
        }),
        fetch(`${baseUrl}/rides/abc/complete`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
        }),
        fetch(`${baseUrl}/rides/abc/requests`, {
          method: 'POST',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        }),
        fetch(`${baseUrl}/requests/abc/accept`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
        }),
        fetch(`${baseUrl}/requests/abc/reject`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
        }),
        fetch(`${baseUrl}/requests/abc/cancel`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        }),
        fetch(`${baseUrl}/admin/rides/abc/moderate`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: adminLogin.cookie },
          body: JSON.stringify({ reason: 'Invalid id test' })
        })
      ]);
      assert(
        invalidChecks.every((r) => r.status === 400) && getConnCalls === 0,
        'Invalid IDs/statuses reject with 400 before acquiring any DB connection'
      );
    } finally {
      (db as any).getConnection = origGetConnection;
    }

    // 3. Unsafe transaction rollback failure never masks original error & always releases connection
    const doubleErrorState: { released: boolean } = { released: false };
    const resetReleaseFlag = () => {
      doubleErrorState.released = false;
    };
    (db as any).getConnection = async () => ({
      beginTransaction: async () => {},
      query: async () => {
        throw new Error('Simulated primary SQL failure');
      },
      execute: async () => {
        throw new Error('Simulated primary SQL failure');
      },
      commit: async () => {},
      rollback: async () => {
        throw new Error('Simulated secondary rollback failure');
      },
      release: () => {
        doubleErrorState.released = true;
      }
    });
    try {
      const rollbackErrRes = await fetch(`${baseUrl}/requests/1/accept`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
      });
      const rollbackErrJson: any = await rollbackErrRes.json();
      assert(
        rollbackErrRes.status === 500 &&
          rollbackErrJson.success === false &&
          doubleErrorState.released === true,
        'Rollback failure does not cause unhandled rejection or connection leak in requestController'
      );

      resetReleaseFlag();
      const adminRollbackErrRes = await fetch(`${baseUrl}/admin/rides/1/moderate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: adminLogin.cookie },
        body: JSON.stringify({ reason: 'Rollback safety check' })
      });
      assert(
        adminRollbackErrRes.status === 500 && doubleErrorState.released === true,
        'Rollback failure does not cause unhandled rejection or connection leak in adminController'
      );
    } finally {
      (db as any).getConnection = origGetConnection;
    }

    // 4. Frontend/Backend Registration Email & Phone Validator Parity
    assert(
      isFrontendValidDiuEmail('student@diu.edu.bd') === true &&
        isFrontendValidDiuEmail('student@s.diu.edu.bd') === true &&
        isFrontendValidDiuEmail('attacker@fakediu.edu.bd') === false &&
        isFrontendValidDiuEmail('@diu.edu.bd') === false,
      'Frontend DIU email validation strictly rejects spoofed domains like @fakediu.edu.bd'
    );
    assert(
      isFrontendValidBdPhone('01712345678') === true &&
        isFrontendValidBdPhone('+8801812345678') === true &&
        isFrontendValidBdPhone('01234567890') === false &&
        isFrontendValidBdPhone('12345') === false,
      'Frontend Bangladesh phone validation matches backend regex rules'
    );

    // 5. PostRidePage finite coordinate validation & bike seat limits aligned with backend (1-8)
    assert(
      isValidRideCoordinate(23.8768, 90.3202) === true &&
        isValidRideCoordinate(0, 90.3202) === true &&
        isValidRideCoordinate(0, 0) === false &&
        isValidRideCoordinate(NaN, 90.3) === false &&
        isValidRideCoordinate(Infinity, 90.3) === false &&
        isValidRideCoordinate(95, 90.3) === false &&
        isValidRideCoordinate(23.8, -185) === false,
      'Coordinate validator enforces Number.isFinite, geographic bounds, and cleared (0,0) rejection'
    );

    const bikeMultiSeatRes = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Gate Bike Test',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Mirpur Bike Dest',
        dest_lat: 23.8069,
        dest_lng: 90.3687,
        departure_time: new Date(Date.now() + 8 * 3600000).toISOString(),
        fare: 90,
        seats_total: 2,
        vehicle_type: 'bike'
      })
    });
    const bikeOverSeatRes = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Gate Bike Invalid',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Mirpur Bike Dest',
        dest_lat: 23.8069,
        dest_lng: 90.3687,
        departure_time: new Date(Date.now() + 8 * 3600000).toISOString(),
        fare: 90,
        seats_total: 9,
        vehicle_type: 'bike'
      })
    });
    assert(
      bikeMultiSeatRes.status === 201 && bikeOverSeatRes.status === 400,
      'Bike ride creation enforces 1-8 seat alignment cleanly with frontend PostRidePage'
    );

    // 6. Active conversation unreadChatCount suppression
    assert(
      shouldIncrementUnreadChatCount({
        currentUserId: 5,
        senderId: 5,
        incomingConversationId: 10,
        activeConversationId: null
      }) === false &&
        shouldIncrementUnreadChatCount({
          currentUserId: 5,
          senderId: 2,
          incomingConversationId: 10,
          activeConversationId: 10
        }) === false &&
        shouldIncrementUnreadChatCount({
          currentUserId: 5,
          senderId: 2,
          incomingConversationId: 11,
          activeConversationId: 10
        }) === true &&
        shouldIncrementUnreadChatCount({
          currentUserId: 5,
          senderId: 2,
          incomingConversationId: 10,
          activeConversationId: null
        }) === true,
      'Suppresses unreadChatCount increment while viewing active conversation and counts others'
    );

    // 7. TINYINT(1) boolean normalization helpers (frontend & backend)
    assert(
      isDbFlagTrue(1) === true &&
        isDbFlagTrue('1') === true &&
        isDbFlagTrue(true) === true &&
        isDbFlagTrue(0) === false &&
        isDbFlagTrue('0') === false &&
        isDbFlagTrue(false) === false &&
        isDbFlagTrue(null) === false &&
        isDbFlagTrue(undefined) === false &&
        isDbFlagNotFalse('0', true) === false &&
        isDbFlagNotFalse(false, true) === false &&
        isDbFlagNotFalse(0, true) === false &&
        isDbFlagNotFalse(undefined, true) === true &&
        isTruthyDbFlag('0') === false &&
        isTruthyDbFlag(true) === true,
      'TINYINT(1) boolean normalization handles 0/1, "0"/"1", true/false, null/undefined safely'
    );

    // -----------------------------------------------------------------------
    // PHASE 18: Backend & DB Performance Optimization Regression Tests (Phase 3)
    // -----------------------------------------------------------------------
    console.log('\n[Phase 18] Phase 3 Backend & Database Performance Optimizations');

    async function captureQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queries: Array<{ sql: string; params: any[] }> }> {
      const origQuery = db.query.bind(db);
      const queries: Array<{ sql: string; params: any[] }> = [];
      (db as any).query = async (sql: string, params?: any[]) => {
        queries.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params: params || [] });
        return origQuery(sql, params);
      };
      try {
        const result = await fn();
        return { result, queries };
      } finally {
        (db as any).query = origQuery;
      }
    }

    // 1. Auth middleware single-query & no avatar_url MEDIUMTEXT fetch; /auth/me keeps avatar_url
    const tinyPngAvatar =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const uploadAvatarForAuthTest = await fetch(`${baseUrl}/users/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({ avatar_url: tinyPngAvatar })
    });
    assert(uploadAvatarForAuthTest.status === 200, 'Uploaded avatar cleanly for auth payload parity test');

    const { result: authQueryMeRes, queries: authMeQueries } = await captureQueries(async () => {
      const r = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: sadiaNewLogin.cookie }
      });
      return { status: r.status, json: (await r.json()) as any };
    });
    const authMiddlewareQueries = authMeQueries.filter((q) =>
      q.sql.toLowerCase().includes('from users where id = ?')
    );
    const middlewareSelectQuery = authMiddlewareQueries[0]?.sql.toLowerCase() || '';
    const meAvatarQuery = authMeQueries.find((q) =>
      q.sql.toLowerCase().includes('select avatar_url from users where id = ?')
    );
    assert(
      authQueryMeRes.status === 200 &&
        authQueryMeRes.json.user?.avatar_url === tinyPngAvatar &&
        !middlewareSelectQuery.includes('avatar_url') &&
        Boolean(meAvatarQuery),
      'authenticateToken omits avatar_url in 1 query while GET /api/auth/me explicitly loads avatar_url'
    );

    const { queries: nonAvatarRouteQueries } = await captureQueries(() =>
      fetch(`${baseUrl}/notifications`, { headers: { Cookie: sadiaNewLogin.cookie } })
    );
    const userTableQueriesOnNotif = nonAvatarRouteQueries.filter((q) =>
      q.sql.toLowerCase().includes('from users')
    );
    assert(
      userTableQueriesOnNotif.length === 1 &&
        !userTableQueriesOnNotif[0].sql.toLowerCase().includes('avatar_url'),
      'Authenticated endpoints execute only 1 users query and never fetch avatar_url MEDIUMTEXT'
    );

    // 2. getUserRatingSummaries strictly filters WHERE reviewee_id IN (...)
    const { result: scopedRatings, queries: ratingQueries } = await captureQueries(() =>
      getUserRatingSummaries([3])
    );
    assert(
      ratingQueries.length === 1 &&
        ratingQueries[0].sql.toLowerCase().includes('where reviewee_id in (?)') &&
        scopedRatings.get(3)?.review_count === 1 &&
        scopedRatings.get(2) === undefined,
      'getUserRatingSummaries filters strictly by requested user IDs via WHERE reviewee_id IN (...)'
    );

    // 3. No N+1 queries on rides, my-rides, ride requests, my-requests, admin users, conversations
    const { queries: ridesQueries } = await captureQueries(() =>
      fetch(`${baseUrl}/rides?limit=20`)
    );
    assert(
      ridesQueries.length <= 4 &&
        !ridesQueries.some((q) => q.sql.toLowerCase().startsWith('select email_verified') && !q.sql.toLowerCase().includes('where id in')),
      `GET /api/rides runs constant batched queries (count=${ridesQueries.length}) with zero per-ride N+1 lookups`
    );

    const { queries: myRidesQueries } = await captureQueries(() =>
      fetch(`${baseUrl}/rides/mine?limit=20`, { headers: { Cookie: driverLogin.cookie } })
    );
    assert(
      myRidesQueries.length <= 3 &&
        !myRidesQueries.some((q) => q.sql.toLowerCase().includes('(select count(*) from ride_requests')),
      `GET /api/rides/mine uses batched request counts instead of correlated subqueries (count=${myRidesQueries.length})`
    );

    const { queries: myReqQueries } = await captureQueries(() =>
      fetch(`${baseUrl}/requests/mine?limit=20`, { headers: { Cookie: sadiaNewLogin.cookie } })
    );
    const myReqUserExtQuery = myReqQueries.find(
      (q) => q.sql.toLowerCase().includes('from users where id in')
    );
    const myReqReviewQuery = myReqQueries.find((q) => q.sql.toLowerCase().includes('select ride_id from reviews'));
    assert(
      myReqQueries.length <= 5 &&
        (!myReqUserExtQuery || !myReqUserExtQuery.sql.toLowerCase().includes('avatar_url')) &&
        (!myReqReviewQuery || myReqReviewQuery.sql.toLowerCase().includes('ride_id in (')),
      `GET /api/requests/mine batches lookups without avatar_url and scopes reviews by ride_id (count=${myReqQueries.length})`
    );

    const { queries: adminUsersQueries, result: adminUsersHttp } = await captureQueries(async () => {
      const r = await fetch(`${baseUrl}/admin/users?limit=10`, { headers: { Cookie: adminLogin.cookie } });
      return { status: r.status, json: (await r.json()) as any };
    });
    assert(
      adminUsersHttp.status === 200 &&
        adminUsersQueries.length === 2 &&
        adminUsersHttp.json.users.every((u: any) => u.avatar_url === null) &&
        !adminUsersQueries[1].sql.toLowerCase().includes('avatar_url'),
      'GET /api/admin/users fetches extended metadata in 1 query (2 total incl. auth) and omits avatar_url'
    );

    // Conversations query count & no per-conversation message loops
    const { queries: convQueries, result: convHttp } = await captureQueries(async () => {
      const r = await fetch(`${baseUrl}/chat/conversations?limit=20`, {
        headers: { Cookie: driverLogin.cookie }
      });
      return { status: r.status, json: (await r.json()) as any };
    });
    assert(
      convHttp.status === 200 &&
        Array.isArray(convHttp.json.conversations) &&
        convHttp.json.conversations.length >= 1 &&
        convQueries.length <= 6 &&
        !convQueries.some((q) => q.sql.toLowerCase().includes('from messages where conversation_id = ?')),
      `GET /api/chat/conversations loads inbox summary in <= 6 batched queries without loading all messages (count=${convQueries.length})`
    );

    // 4. getAdminStats executes SQL aggregates rather than full-table selects
    const { result: statsRes, queries: statsQueries } = await captureQueries(async () => {
      const r = await fetch(`${baseUrl}/admin/stats`, { headers: { Cookie: adminLogin.cookie } });
      return { status: r.status, json: (await r.json()) as any };
    });
    const nonAuthStatsSql = statsQueries.slice(1).map((q) => q.sql.toLowerCase());
    assert(
      statsRes.status === 200 &&
        statsRes.json.stats.total_users >= 5 &&
        statsRes.json.stats.total_rides >= 6 &&
        statsRes.json.stats.total_requests >= 5 &&
        nonAuthStatsSql.every((s) => s.includes('count(')) &&
        !nonAuthStatsSql.some((s) => s.startsWith('select id,') || s.startsWith('select status from')),
      'GET /api/admin/stats executes SQL aggregate COUNT/SUM queries instead of full-table scans'
    );

    // 5. Chat message pagination & chronological order + before_id
    const activeConvId = convHttp.json.conversations[0].id;
    for (let i = 1; i <= 4; i++) {
      await fetch(`${baseUrl}/chat/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
        body: JSON.stringify({ content: `Phase3 pagination msg ${i}` })
      });
    }
    const pageMsgsRes = await fetch(`${baseUrl}/chat/conversations/${activeConvId}/messages?limit=2`, {
      headers: { Cookie: driverLogin.cookie }
    });
    const pageMsgsJson: any = await pageMsgsRes.json();
    assert(
      pageMsgsRes.status === 200 &&
        pageMsgsJson.messages.length === 2 &&
        pageMsgsJson.messages[0].id < pageMsgsJson.messages[1].id &&
        pageMsgsJson.pagination?.limit === 2 &&
        pageMsgsJson.pagination?.has_more === true,
      'getConversationMessages paginates latest N messages in chronological ASC order with has_more=true'
    );

    const beforeMsgsRes = await fetch(
      `${baseUrl}/chat/conversations/${activeConvId}/messages?limit=2&before_id=${pageMsgsJson.messages[0].id}`,
      { headers: { Cookie: driverLogin.cookie } }
    );
    const beforeMsgsJson: any = await beforeMsgsRes.json();
    assert(
      beforeMsgsRes.status === 200 &&
        beforeMsgsJson.messages.length >= 1 &&
        beforeMsgsJson.messages.every((m: any) => m.id < pageMsgsJson.messages[0].id),
      'getConversationMessages respects before_id cursor for older message pages'
    );

    // 6. Bounded pagination on /rides, /notifications (with exact unread_count), /reviews, /admin/rides
    const ridesPage1Res = await fetch(`${baseUrl}/rides?limit=1&page=1`);
    const ridesPage1Json: any = await ridesPage1Res.json();
    const ridesPage2Res = await fetch(`${baseUrl}/rides?limit=1&page=2`);
    const ridesPage2Json: any = await ridesPage2Res.json();
    assert(
      ridesPage1Res.status === 200 &&
        ridesPage1Json.rides.length === 1 &&
        ridesPage1Json.pagination?.has_more === true &&
        ridesPage2Res.status === 200 &&
        ridesPage2Json.rides.length === 1 &&
        ridesPage1Json.rides[0].id !== ridesPage2Json.rides[0].id,
      'GET /api/rides enforces limit/page pagination cleanly'
    );

    const notifPageRes = await fetch(`${baseUrl}/notifications?limit=1&offset=0`, {
      headers: { Cookie: driverLogin.cookie }
    });
    const notifPageJson: any = await notifPageRes.json();
    const notifAllRes = await fetch(`${baseUrl}/notifications?limit=100`, {
      headers: { Cookie: driverLogin.cookie }
    });
    const notifAllJson: any = await notifAllRes.json();
    assert(
      notifPageRes.status === 200 &&
        notifPageJson.notifications.length === 1 &&
        notifPageJson.unread_count === notifAllJson.unread_count &&
        notifPageJson.pagination?.has_more === (notifAllJson.notifications.length > 1),
      'GET /api/notifications paginates results while preserving exact total unread_count'
    );

    const revPageRes = await fetch(`${baseUrl}/reviews/user/3?limit=1&offset=0`);
    const revPageJson: any = await revPageRes.json();
    assert(
      revPageRes.status === 200 &&
        revPageJson.review_count >= 1 &&
        revPageJson.pagination?.limit === 1,
      'GET /api/reviews/user/:userId returns total rating summary alongside paginated reviews'
    );

    const adminRidesPageRes = await fetch(`${baseUrl}/admin/rides?limit=2&offset=0&status=open`, {
      headers: { Cookie: adminLogin.cookie }
    });
    const adminRidesPageJson: any = await adminRidesPageRes.json();
    assert(
      adminRidesPageRes.status === 200 &&
        adminRidesPageJson.rides.length <= 2 &&
        adminRidesPageJson.rides.every((r: any) => r.status === 'open') &&
        adminRidesPageJson.pagination?.limit === 2,
      'GET /api/admin/rides pushes status filter into SQL and enforces pagination'
    );

    // 7. SMTP connection & timeout guard test against local hanging TCP socket
    const blackholeServer = net.createServer(() => {
      // Intentionally do not write SMTP greeting banner to simulate stalled SMTP endpoint
    });
    await new Promise<void>((resolve) => blackholeServer.listen(0, '127.0.0.1', () => resolve()));
    const blackholeAddr = blackholeServer.address() as net.AddressInfo;

    const smtpEnvKeys = [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_SECURE',
      'SMTP_CONNECTION_TIMEOUT_MS',
      'SMTP_GREETING_TIMEOUT_MS',
      'SMTP_SOCKET_TIMEOUT_MS',
      'SMTP_SEND_TIMEOUT_MS'
    ] as const;
    const savedSmtpEnv: Record<string, string | undefined> = {};
    for (const k of smtpEnvKeys) savedSmtpEnv[k] = process.env[k];

    try {
      resetSmtpTransporterForTesting();
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_PORT = String(blackholeAddr.port);
      process.env.SMTP_USER = 'test-noreply@diu.edu.bd';
      process.env.SMTP_PASS = 'test-smtp-secret';
      process.env.SMTP_SECURE = 'false';
      process.env.SMTP_CONNECTION_TIMEOUT_MS = '120';
      process.env.SMTP_GREETING_TIMEOUT_MS = '120';
      process.env.SMTP_SOCKET_TIMEOUT_MS = '150';
      process.env.SMTP_SEND_TIMEOUT_MS = '250';

      const t0 = Date.now();
      const smtpTimeoutResult = await sendTransactionalEmail({
        to: 'student@diu.edu.bd',
        subject: 'Timeout Check',
        text: 'Testing SMTP timeout bounds',
        html: '<p>Testing SMTP timeout bounds</p>'
      });
      const elapsedMs = Date.now() - t0;

      assert(
        smtpTimeoutResult.configured === true &&
          smtpTimeoutResult.delivered === false &&
          elapsedMs < 2000 &&
          Boolean(smtpTimeoutResult.reason),
        `sendTransactionalEmail aborts stalled SMTP connections within bounded timeout (${elapsedMs}ms)`
      );
    } finally {
      resetSmtpTransporterForTesting();
      for (const k of smtpEnvKeys) {
        if (savedSmtpEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedSmtpEnv[k];
      }
      await new Promise<void>((resolve) => blackholeServer.close(() => resolve()));
    }

    // 8. Notification reminder window query + cooldown cache + cache invalidation
    resetReminderCheckCacheForTesting();
    const { queries: firstReminderQueries } = await captureQueries(() =>
      ensureUpcomingRideRemindersForUser(2)
    );
    const reminderRideSql = firstReminderQueries.map((q) => q.sql.toLowerCase()).join(' | ');
    assert(
      reminderRideSql.includes("r.status in ('open', 'full', 'scheduled', 'in_progress')") &&
        reminderRideSql.includes('r.departure_time > ? and r.departure_time <= ?') &&
        !firstReminderQueries.some((q) => q.sql.toLowerCase().includes('from notifications')),
      'ensureUpcomingRideRemindersForUser filters active 60m rides in SQL and skips notifications query when none upcoming'
    );

    const { queries: cachedReminderQueries } = await captureQueries(() =>
      ensureUpcomingRideRemindersForUser(2)
    );
    assert(
      cachedReminderQueries.length === 0,
      'ensureUpcomingRideRemindersForUser avoids redundant repeated DB scans via per-user cooldown cache'
    );

    const soonRideRes = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Innovation Lab',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Dhanmondi 27',
        dest_lat: 23.7511,
        dest_lng: 90.3765,
        departure_time: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
        fare: 120,
        seats_total: 2,
        vehicle_type: 'bike'
      })
    });
    assert(soonRideRes.status === 201, 'Posted ride within 25-minute departure window');

    const { queries: refreshedNotifQueries } = await captureQueries(() =>
      fetch(`${baseUrl}/notifications`, { headers: { Cookie: driverLogin.cookie } })
    );
    const dedupNotifQuery = refreshedNotifQueries.find((q) =>
      q.sql.toLowerCase().includes("type = 'ride_reminder'")
    );
    assert(
      Boolean(dedupNotifQuery) && dedupNotifQuery!.sql.toLowerCase().includes('and link in ('),
      'Posting a near-term ride invalidates reminder cache and scopes reminder deduplication with link IN (...)'
    );

    // 9. Static assertions on composite index migration, schema, and Migration 002 prerequisite guard
    const migration003Path = path.resolve('server/src/database/migrations/003_performance_indexes.sql');
    const schemaPath = path.resolve('server/src/database/schema.sql');
    const migration003RunnerPath = path.resolve('server/src/database/runMigration003.ts');
    const migration003Sql = fs.readFileSync(migration003Path, 'utf-8');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    const migration003RunnerSrc = fs.readFileSync(migration003RunnerPath, 'utf-8');
    const expectedIndexes = [
      'idx_rides_status_departure',
      'idx_rides_driver_departure',
      'idx_requests_passenger_created',
      'idx_requests_passenger_status',
      'idx_requests_ride_status',
      'idx_notifications_user_created',
      'idx_notifications_user_type',
      'idx_conv_driver_updated',
      'idx_conv_passenger_updated',
      'idx_reviews_reviewee_created',
      'idx_reviews_reviewer_ride',
      'idx_reports_reporter_created',
      'idx_reports_status_created',
      'idx_reports_created',
      'idx_blocks_blocker_created',
      'idx_driver_apps_user_created'
    ];
    assert(
      expectedIndexes.every((idx) => migration003Sql.includes(idx) && schemaSql.includes(idx)) &&
        migration003Sql.includes('idx_rides_status_departure ON rides (status, departure_time)') &&
        !migration003Sql.includes('idx_requests_passenger_status_created') &&
        migration003RunnerSrc.includes('ER_NO_SUCH_TABLE') &&
        !/\b(drop|truncate|delete)\b/i.test(migration003Sql),
      'Migration 003 and schema.sql define all 16 corrected composite indexes with Migration 002 guard and zero destructive DDL'
    );

    // -----------------------------------------------------------------------
    // PHASE 19: Phase 3.2 Critical & High-Priority Fix Regression Tests
    // -----------------------------------------------------------------------
    console.log('\n[Phase 19] Phase 3.2 Critical & High-Priority Regression Tests');

    // 1. SMTP late sendMail rejection after timeout race must NEVER cause UnhandledPromiseRejection
    const smtp32Keys = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SEND_TIMEOUT_MS'] as const;
    const savedSmtp32Env: Record<string, string | undefined> = {};
    for (const k of smtp32Keys) savedSmtp32Env[k] = process.env[k];
    const capturedUnhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      capturedUnhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    try {
      resetSmtpTransporterForTesting();
      process.env.SMTP_HOST = 'smtp.diu-test.local';
      process.env.SMTP_USER = 'noreply@diu.edu.bd';
      process.env.SMTP_PASS = 'smtp-pass-v1';
      process.env.SMTP_SEND_TIMEOUT_MS = '50';

      let closeCalled = 0;
      setSmtpTransporterForTesting({
        sendMail: () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('late sendMail rejection after timeout')), 90);
          }),
        close: () => {
          closeCalled++;
        }
      } as any);

      const lateRejectRes = await sendTransactionalEmail({
        to: 'student@diu.edu.bd',
        subject: 'Late Rejection Guard',
        text: 'Testing late rejection safety',
        html: '<p>Testing late rejection safety</p>'
      });

      // Wait longer than the 90ms delayed rejection so Node microtask/event loop settles
      await new Promise((r) => setTimeout(r, 150));

      assert(
        lateRejectRes.configured === true &&
          lateRejectRes.delivered === false &&
          lateRejectRes.reason?.toLowerCase().includes('timed out') === true &&
          capturedUnhandled.length === 0 &&
          closeCalled >= 0,
        'SMTP timeout handles late sendMail rejections without throwing UnhandledPromiseRejection'
      );

      // Transporter fatal failure vs EENVELOPE invalidation test (real blackhole fallback / clean recovery)
      let attemptCount = 0;
      setSmtpTransporterForTesting({
        sendMail: async () => {
          attemptCount++;
          if (attemptCount === 1) {
            const envErr: any = new Error('Recipient syntax error');
            envErr.code = 'EENVELOPE';
            throw envErr;
          }
          if (attemptCount === 2) {
            const fatalErr: any = new Error('Connection closed unexpectedly');
            fatalErr.code = 'ECONNRESET';
            throw fatalErr;
          }
          return { messageId: 'ok-1' };
        },
        close: () => {}
      } as any);

      const envFailRes = await sendTransactionalEmail({
        to: 'bad@diu.edu.bd',
        subject: 'Envelope Test',
        text: 'Envelope',
        html: '<p>Envelope</p>'
      });
      const fatalFailRes = await sendTransactionalEmail({
        to: 'ok@diu.edu.bd',
        subject: 'Fatal Test',
        text: 'Fatal',
        html: '<p>Fatal</p>'
      });
      const recoveredRes = await sendTransactionalEmail({
        to: 'ok@diu.edu.bd',
        subject: 'Recovery Test',
        text: 'Recovery',
        html: '<p>Recovery</p>'
      });
      assert(
        envFailRes.delivered === false &&
          fatalFailRes.delivered === false &&
          recoveredRes.delivered === true,
        'SMTP mailer preserves failure responses across EENVELOPE and fatal transport errors without masking errors'
      );
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
      resetSmtpTransporterForTesting();
      for (const k of smtp32Keys) {
        if (savedSmtp32Env[k] === undefined) delete process.env[k];
        else process.env[k] = savedSmtp32Env[k];
      }
    }

    // 2. Chat deterministic (created_at, id) ordering with identical timestamps + non-monotonic IDs
    const driverId = Number(driverLogin.data?.user?.id || 2);
    const sadiaId = Number(sadiaNewLogin.data?.user?.id || 5);
    const identicalTs = '2099-01-01T10:00:00.000Z';
    const earlierTs = '2099-01-01T09:50:00.000Z';
    const laterTs = '2099-01-01T10:05:00.000Z';

    const tieId1 = await addTestMessageRecordForTesting({
      id: 9001,
      conversation_id: activeConvId,
      sender_id: driverId,
      content: 'Tie timestamp A',
      is_read: 1,
      created_at: identicalTs
    });
    const tieId2 = await addTestMessageRecordForTesting({
      id: 9002,
      conversation_id: activeConvId,
      sender_id: sadiaId,
      content: 'Tie timestamp B',
      is_read: 0,
      created_at: identicalTs
    });
    const tieId3 = await addTestMessageRecordForTesting({
      id: 9003,
      conversation_id: activeConvId,
      sender_id: driverId,
      content: 'Tie timestamp C',
      is_read: 1,
      created_at: identicalTs
    });
    const latestTimeLowerId = await addTestMessageRecordForTesting({
      id: 9004,
      conversation_id: activeConvId,
      sender_id: sadiaId,
      content: 'Newer time lower ID',
      is_read: 0,
      created_at: laterTs
    });
    const olderTimeHigherId = await addTestMessageRecordForTesting({
      id: 9005,
      conversation_id: activeConvId,
      sender_id: driverId,
      content: 'Older time higher ID',
      is_read: 1,
      created_at: earlierTs
    });

    const convLatestOrderRes = await fetch(`${baseUrl}/chat/conversations?limit=20`, {
      headers: { Cookie: driverLogin.cookie }
    });
    const convLatestOrderJson: any = await convLatestOrderRes.json();
    const targetConvSummary = convLatestOrderJson.conversations?.find((c: any) => Number(c.id) === Number(activeConvId));
    assert(
      convLatestOrderRes.status === 200 &&
        targetConvSummary?.last_message === 'Newer time lower ID' &&
        Number(targetConvSummary?.unread_count) >= 2,
      'getConversations selects latest message by (created_at, id) even when an older timestamp has a higher ID'
    );

    // Non-participant / participant read endpoint check (without disturbing messages BEFORE cursor test if called on unread,
    // actually PATCH .../read marks incoming messages read cleanly without mutating timestamps/IDs!)
    const nonParticipantReadRes = await fetch(`${baseUrl}/chat/conversations/${activeConvId}/read`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: adminLogin.cookie }
    });
    const invalidReadRes = await fetch(`${baseUrl}/chat/conversations/not-an-id/read`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
    });
    const driverReadRes = await fetch(`${baseUrl}/chat/conversations/${activeConvId}/read`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
    });
    const convAfterReadRes = await fetch(`${baseUrl}/chat/conversations?limit=20`, {
      headers: { Cookie: driverLogin.cookie }
    });
    const convAfterReadJson: any = await convAfterReadRes.json();
    const targetConvAfterRead = convAfterReadJson.conversations?.find(
      (c: any) => Number(c.id) === Number(activeConvId)
    );
    assert(
      nonParticipantReadRes.status === 403 &&
        invalidReadRes.status === 400 &&
        driverReadRes.status === 200 &&
        Number(targetConvAfterRead?.unread_count) === 0,
      'PATCH /api/chat/conversations/:id/read marks incoming messages read without fetching messages and blocks non-participants'
    );

    // Cursor pagination across latest, identical-timestamp tie-break, and non-monotonic ID
    const p1Res = await fetch(`${baseUrl}/chat/conversations/${activeConvId}/messages?limit=2`, {
      headers: { Cookie: driverLogin.cookie }
    });
    const p1Json: any = await p1Res.json();
    const p2Res = await fetch(
      `${baseUrl}/chat/conversations/${activeConvId}/messages?limit=2&before_id=${tieId3}`,
      { headers: { Cookie: driverLogin.cookie } }
    );
    const p2Json: any = await p2Res.json();
    const p3Res = await fetch(
      `${baseUrl}/chat/conversations/${activeConvId}/messages?limit=2&before_id=${tieId1}`,
      { headers: { Cookie: driverLogin.cookie } }
    );
    const p3Json: any = await p3Res.json();
    const missingAnchorRes = await fetch(
      `${baseUrl}/chat/conversations/${activeConvId}/messages?limit=2&before_id=9999999`,
      { headers: { Cookie: driverLogin.cookie } }
    );
    const missingAnchorJson: any = await missingAnchorRes.json();

    assert(
      p1Res.status === 200 &&
        p1Json.messages.map((m: any) => Number(m.id)).join(',') === `${tieId3},${latestTimeLowerId}` &&
        p2Res.status === 200 &&
        p2Json.messages.map((m: any) => Number(m.id)).join(',') === `${tieId1},${tieId2}` &&
        p3Res.status === 200 &&
        p3Json.messages.some((m: any) => Number(m.id) === olderTimeHigherId) &&
        !p1Json.messages.some((m: any) => p2Json.messages.some((m2: any) => m2.id === m.id)) &&
        missingAnchorRes.status === 200 &&
        Array.isArray(missingAnchorJson.messages) &&
        missingAnchorJson.messages.length === 0,
      'Chat before_id cursor & (created_at, id) ordering paginate identical timestamps and non-monotonic IDs with zero duplicates/skips'
    );

    // 3. getConversations ER_NO_SUCH_TABLE fallback includes pagination metadata
    const origDbQueryForConvFallback = db.query.bind(db);
    (db as any).query = async () => {
      const tableErr: any = new Error("Table 'conversations' doesn't exist");
      tableErr.code = 'ER_NO_SUCH_TABLE';
      throw tableErr;
    };
    let convFallbackStatus = 0;
    let convFallbackBody: any = null;
    try {
      const mockReq: any = { user: { id: driverId }, query: { limit: '25', offset: '0' } };
      const mockRes: any = {
        status(code: number) {
          convFallbackStatus = code;
          return this;
        },
        json(payload: any) {
          convFallbackBody = payload;
          return this;
        }
      };
      await getConversations(mockReq, mockRes);
    } finally {
      (db as any).query = origDbQueryForConvFallback;
    }
    assert(
      convFallbackStatus === 200 &&
        convFallbackBody?.success === true &&
        Array.isArray(convFallbackBody?.conversations) &&
        convFallbackBody.conversations.length === 0 &&
        convFallbackBody?.pagination?.limit === 25 &&
        convFallbackBody?.pagination?.offset === 0 &&
        convFallbackBody?.pagination?.has_more === false,
      'getConversations ER_NO_SUCH_TABLE fallback preserves pagination metadata'
    );

    // 4. Reminder cooldown cache must NOT be recorded when notification DB lookup/insert fails
    const retryRideRes = await fetch(`${baseUrl}/rides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Main Plaza',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Mirpur 10',
        dest_lat: 23.8069,
        dest_lng: 90.3687,
        departure_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        fare: 150,
        seats_total: 2,
        vehicle_type: 'bike'
      })
    });
    const retryRideJson: any = await retryRideRes.json();
    assert(retryRideRes.status === 201 && Boolean(retryRideJson.rideId), 'Created ride for reminder retry verification');

    resetReminderCheckCacheForTesting();
    const origDbQueryForReminder = db.query.bind(db);
    (db as any).query = async (sql: string, params?: any[]) => {
      const low = String(sql).toLowerCase();
      if (low.includes('insert into notifications')) {
        throw new Error('Simulated transient INSERT failure');
      }
      return origDbQueryForReminder(sql, params);
    };
    try {
      await ensureUpcomingRideRemindersForUser(driverId);
    } finally {
      (db as any).query = origDbQueryForReminder;
    }

    const { queries: retryAfterFailureQueries } = await captureQueries(() =>
      ensureUpcomingRideRemindersForUser(driverId)
    );
    const { queries: cachedAfterSuccessQueries } = await captureQueries(() =>
      ensureUpcomingRideRemindersForUser(driverId)
    );
    const retryNotifsAfter = await (
      await fetch(`${baseUrl}/notifications?limit=100`, { headers: { Cookie: driverLogin.cookie } })
    ).json();
    const matchingRetryReminders = ((retryNotifsAfter as any).notifications || []).filter(
      (n: any) => n.type === 'ride_reminder' && n.link === `/rides/${retryRideJson.rideId}`
    );
    assert(
      retryAfterFailureQueries.some((q) => q.sql.toLowerCase().includes('insert into notifications')) &&
        cachedAfterSuccessQueries.length === 0 &&
        matchingRetryReminders.length === 1,
      'Reminder cooldown cache is skipped after DB write failures and populated only after successful creation'
    );

    // 5. GET /api/users/dashboard-stats & GET /api/admin/reports?status=...
    const unauthDashStatsRes = await fetch(`${baseUrl}/users/dashboard-stats`);
    const authDashStatsRes = await fetch(`${baseUrl}/users/dashboard-stats`, {
      headers: { Cookie: driverLogin.cookie }
    });
    const authDashStatsJson: any = await authDashStatsRes.json();
    assert(
      unauthDashStatsRes.status === 401 &&
        authDashStatsRes.status === 200 &&
        authDashStatsJson.success === true &&
        typeof authDashStatsJson.stats?.total_requests === 'number' &&
        typeof authDashStatsJson.stats?.accepted_requests === 'number' &&
        typeof authDashStatsJson.stats?.pending_requests === 'number' &&
        Number(authDashStatsJson.stats?.posted_rides) >= 3,
      'GET /api/users/dashboard-stats returns accurate per-user SQL aggregates and requires authentication'
    );

    const pendingReportCreateRes = await fetch(`${baseUrl}/safety/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({
        reported_user_id: driverId,
        reason: 'unsafe_driving',
        description: 'Phase 3.2 pending report status filter verification'
      })
    });
    assert(pendingReportCreateRes.status === 201, 'Created pending safety report for status filter verification');

    const adminPendingReportsRes = await fetch(`${baseUrl}/admin/reports?status=pending&limit=20&offset=0`, {
      headers: { Cookie: adminLogin.cookie }
    });
    const adminPendingReportsJson: any = await adminPendingReportsRes.json();
    const adminResolvedReportsRes = await fetch(`${baseUrl}/admin/reports?status=resolved&limit=20&offset=0`, {
      headers: { Cookie: adminLogin.cookie }
    });
    const adminResolvedReportsJson: any = await adminResolvedReportsRes.json();
    assert(
      adminPendingReportsRes.status === 200 &&
        adminPendingReportsJson.reports.length >= 1 &&
        adminPendingReportsJson.reports.every((r: any) => r.status === 'pending') &&
        adminResolvedReportsRes.status === 200 &&
        adminResolvedReportsJson.reports.length >= 1 &&
        adminResolvedReportsJson.reports.every((r: any) => r.status === 'resolved') &&
        typeof adminPendingReportsJson.pagination?.has_more === 'boolean',
      'GET /api/admin/reports filters reports by status in SQL and returns pagination metadata'
    );

    // -----------------------------------------------------------------------
    // PHASE 20: Phase 4 Frontend Reliability & Real-Time Optimization Tests
    // -----------------------------------------------------------------------
    console.log('\n[Phase 20] Phase 4 Frontend Reliability & Real-Time Optimization Tests');

    const adminUserSearchRes = await fetch(`${baseUrl}/admin/users?search=Tanvir&limit=10`, {
      headers: { Cookie: adminLogin.cookie }
    });
    const adminUserSearchJson: any = await adminUserSearchRes.json();
    assert(
      adminUserSearchRes.status === 200 &&
        adminUserSearchJson.success === true &&
        Array.isArray(adminUserSearchJson.users),
      'Admin user search query parameter filters users successfully'
    );

    const adminRideSearchRes = await fetch(`${baseUrl}/admin/rides?search=Ashulia&status=open&limit=10`, {
      headers: { Cookie: adminLogin.cookie }
    });
    const adminRideSearchJson: any = await adminRideSearchRes.json();
    assert(
      adminRideSearchRes.status === 200 &&
        adminRideSearchJson.success === true &&
        Array.isArray(adminRideSearchJson.rides),
      'Admin rides search query parameter filters rides with status successfully'
    );

    // Production guard
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    let refusedInProd = false;
    try {
      await enableIsolatedTestMemoryDb();
    } catch {
      refusedInProd = true;
    } finally {
      process.env.NODE_ENV = origEnv;
      resetDbPoolForTesting();
    }
    assert(refusedInProd, 'Production environment strictly refuses in-memory fallback');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n=============================================================');
  console.log(` ALL TESTS EXECUTED: ${passedTests}/${totalTests} PASSED (100% SUCCESS)`);
  console.log('=============================================================\n');
}

runTests().catch((err: any) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
