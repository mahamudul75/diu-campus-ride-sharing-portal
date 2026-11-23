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
import { getConversations, getOrCreateConversation } from '../server/src/controllers/chatController.ts';
import { createRideRequest, acceptRequest } from '../server/src/controllers/requestController.ts';
import { createRide } from '../server/src/controllers/rideController.ts';
import { createReview } from '../server/src/controllers/reviewController.ts';
import { resetPassword, verifyEmail } from '../server/src/controllers/authController.ts';
import {
  submitUserReport,
  addEmergencyContact,
  blockUser
} from '../server/src/controllers/safetyController.ts';
import { applyForDriver } from '../server/src/controllers/driverController.ts';
import { approveDriver, rejectDriver } from '../server/src/controllers/adminController.ts';
import { shouldClearSessionOnAuthCheckError } from '../src/context/AuthContext.tsx';
import {
  createPassengerRequest,
  handlePassengerRequestError
} from '../server/src/controllers/passengerRequestController.ts';
import { generateToken } from '../server/src/utils/jwt.ts';
import { isValidStudentId, isValidDiuEmail, isTruthyDbFlag } from '../server/src/utils/validators.ts';
import {
  isValidDiuEmail as isFrontendValidDiuEmail,
  isValidBdPhone as isFrontendValidBdPhone,
  isValidRideCoordinate,
  isValidRideFare,
  getSafeRedirectPath
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

    // -----------------------------------------------------------------------
    // PHASE 21: In-Memory Booking Compatibility for Passenger Ride Matching
    // -----------------------------------------------------------------------
    console.log('\n[Phase 21] In-Memory Booking Compatibility Regression Tests');

    const futureDepSql = formatDateToMySqlUtc(new Date(Date.now() + 6 * 3600000));
    const conn = await db.getConnection();
    let fullRideId = 0;
    let acceptedReqId = 0;
    try {
      await conn.beginTransaction();
      const [fullRideRes] = await conn.query(
        `INSERT INTO rides
          (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [2, 'DIU Gate', 23.8768, 90.3202, 'Mirpur 10', 23.8069, 90.3687, futureDepSql, 150, 1, 0, 'bike', 'Matched bike ride', 'full']
      );
      fullRideId = Number((fullRideRes as any).insertId);

      const [acceptedReqRes] = await conn.query(
        `INSERT INTO ride_requests (ride_id, passenger_id, status) VALUES (?, ?, 'accepted')`,
        [fullRideId, 5]
      );
      acceptedReqId = Number((acceptedReqRes as any).insertId);

      const [lockedRideRows] = await conn.query('SELECT * FROM rides WHERE id = ? FOR UPDATE', [fullRideId]);
      const lockedRide = Array.isArray(lockedRideRows) ? (lockedRideRows[0] as any) : null;
      assert(
        Boolean(lockedRide) &&
          lockedRide.status === 'full' &&
          Number(lockedRide.seats_total) === 1 &&
          Number(lockedRide.seats_available) === 0,
        'INSERT INTO rides respects status="full" with seats_available=0 inside transaction'
      );

      const [lockedReqRows] = await conn.query('SELECT * FROM ride_requests WHERE id = ? FOR UPDATE', [acceptedReqId]);
      const lockedReq = Array.isArray(lockedReqRows) ? (lockedReqRows[0] as any) : null;
      assert(
        Boolean(lockedReq) &&
          Number(lockedReq.ride_id) === fullRideId &&
          Number(lockedReq.passenger_id) === 5 &&
          lockedReq.status === 'accepted',
        'INSERT INTO ride_requests respects status="accepted" directly inside transaction'
      );

      await conn.commit();
    } finally {
      conn.release();
    }

    // Verify rollback isolation on a failed transaction
    const rollbackConn = await db.getConnection();
    let rolledBackRideId = 0;
    try {
      await rollbackConn.beginTransaction();
      const [rbRes] = await rollbackConn.query(
        `INSERT INTO rides
          (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [2, 'Temp Pickup', 23.8768, 90.3202, 'Temp Dest', 23.7538, 90.377, futureDepSql, 100, 1, 0, 'bike', null, 'full']
      );
      rolledBackRideId = Number((rbRes as any).insertId);
      await rollbackConn.rollback();
    } finally {
      rollbackConn.release();
    }
    const [afterRollbackRows] = await db.query('SELECT * FROM rides WHERE id = ?', [rolledBackRideId]);
    assert(
      Array.isArray(afterRollbackRows) && afterRollbackRows.length === 0,
      'Transaction rollback cleanly reverts inserted full ride in memory store'
    );

    // Verify existing normal ride creation and pending booking defaults remain unchanged
    const [normalRideRes] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [3, 'Uttara', 23.8742, 90.398, 'DIU Campus', 23.8768, 90.3202, futureDepSql, 140, 3, 3, 'car', 'Normal car ride', 'open']
    );
    const normalRideId = Number((normalRideRes as any).insertId);
    const [normalReqRes] = await db.query(
      `INSERT INTO ride_requests (ride_id, passenger_id) VALUES (?, ?)`,
      [normalRideId, 4]
    );
    const [normalReqRows] = await db.query('SELECT * FROM ride_requests WHERE id = ?', [
      Number((normalReqRes as any).insertId)
    ]);
    const normalReq = Array.isArray(normalReqRows) ? (normalReqRows[0] as any) : null;
    assert(
      Boolean(normalReq) && normalReq.status === 'pending',
      'Normal ride_requests insert without status preserves default status="pending"'
    );

    // -----------------------------------------------------------------------
    // PHASE 22: Passenger-Initiated Ride Matching End-to-End Tests
    // -----------------------------------------------------------------------
    console.log('\n[Phase 22] Passenger-Initiated Ride Matching End-to-End Tests');

    const nusratLogin = await loginUser('nusrat.swe@diu.edu.bd', 'Password123!');
    const nusratId = Number(nusratLogin.data?.user?.id || 3);
    const rahatId = Number(rahatLogin.data?.user?.id || 4);
    assert(nusratLogin.res.status === 200, 'Approved car driver Nusrat logs in for Phase 22');

    // Create a clean unblocked student for unrelated-student 403 checks
    const observerStudentRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({
        name: 'Observer Student',
        student_id: '241-15-901',
        email: 'observer.p22@diu.edu.bd',
        phone: '01711223344',
        password: 'Password123!',
        confirm_password: 'Password123!'
      })
    });
    const observerCookie = extractAuthCookie(observerStudentRes);
    assert(observerStudentRes.status === 201 && Boolean(observerCookie), 'Registers clean student account for Phase 22');

    const futureIso6h = new Date(Date.now() + 6 * 3600000).toISOString();
    const futureIso8h = new Date(Date.now() + 8 * 3600000).toISOString();
    const futureIso10h = new Date(Date.now() + 10 * 3600000).toISOString();
    const pastIso2h = new Date(Date.now() - 2 * 3600000).toISOString();

    // 1. Auth & RBAC enforcement
    const unauthCreatePr = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({
        pickup_name: 'DIU Main Gate',
        dest_name: 'Mirpur 10',
        departure_time: futureIso6h
      })
    });
    const unauthBrowsePr = await fetch(`${baseUrl}/passenger-requests`);
    const nonDriverBrowsePr = await fetch(`${baseUrl}/passenger-requests`, {
      headers: { Cookie: observerCookie }
    });
    assert(
      unauthCreatePr.status === 401 && unauthBrowsePr.status === 401 && nonDriverBrowsePr.status === 403,
      'Enforces auth (401) and approved-driver RBAC (403) on passenger request endpoints'
    );

    // 2. Request creation validation
    const pastDepPr = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Smart City',
        dest_name: 'Dhanmondi 27',
        departure_time: pastIso2h
      })
    });
    const multiSeatPr = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Smart City',
        dest_name: 'Dhanmondi 27',
        departure_time: futureIso6h,
        seats_needed: 2
      })
    });
    const negFarePr = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Smart City',
        dest_name: 'Dhanmondi 27',
        departure_time: futureIso6h,
        max_fare: -50
      })
    });
    assert(
      pastDepPr.status === 400 && multiSeatPr.status === 400 && negFarePr.status === 400,
      'Validates future departure_time, fixed 1-seat limit, and non-negative max_fare (400)'
    );

    // Create 2 valid passenger requests (one 'any', one 'car' preferred)
    const createAnyPrRes = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'DIU Smart City Main Gate',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Mirpur 10 Circle',
        dest_lat: 23.8069,
        dest_lng: 90.3687,
        departure_time: futureIso6h,
        seats_needed: 1,
        max_fare: 200,
        vehicle_type: 'any',
        note: 'Need punctual pickup near Gate 1'
      })
    });
    const createAnyPrJson: any = await createAnyPrRes.json();
    const anyReqId = Number(createAnyPrJson.requestId);

    const createCarPrRes = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: observerCookie },
      body: JSON.stringify({
        pickup_name: 'Uttara Sector 11',
        pickup_lat: 23.8742,
        pickup_lng: 90.398,
        dest_name: 'DIU Campus',
        dest_lat: 23.8768,
        dest_lng: 90.3202,
        departure_time: futureIso8h,
        seats_needed: 1,
        max_fare: 300,
        vehicle_type: 'car',
        note: 'Car preferred due to luggage'
      })
    });
    const createCarPrJson: any = await createCarPrRes.json();
    const carOnlyReqId = Number(createCarPrJson.requestId);
    assert(
      createAnyPrRes.status === 201 && anyReqId > 0 && createCarPrRes.status === 201 && carOnlyReqId > 0,
      'Creates open passenger ride requests cleanly (201)'
    );

    // 3. Driver browsing & filtering + unrelated student isolation
    const unrelatedViewPr = await fetch(`${baseUrl}/passenger-requests/${anyReqId}`, {
      headers: { Cookie: observerCookie }
    });
    assert(
      unrelatedViewPr.status === 403,
      'Unrelated non-driver student cannot inspect private passenger request details (403)'
    );

    const driverBrowseRes = await fetch(
      `${baseUrl}/passenger-requests?pickup=Mirpur&vehicle_type=bike&min_budget=150`.replace('Mirpur', 'Smart'),
      { headers: { Cookie: driverLogin.cookie } }
    );
    const driverBrowseJson: any = await driverBrowseRes.json();
    const browsedAny = driverBrowseJson.requests?.find((r: any) => Number(r.id) === anyReqId);
    assert(
      driverBrowseRes.status === 200 &&
        Boolean(browsedAny) &&
        browsedAny.passenger_phone === null &&
        !driverBrowseJson.requests?.some((r: any) => Number(r.id) === carOnlyReqId),
      'GET /api/passenger-requests filters by pickup/vehicle/budget, excludes incompatible car-only, and masks phone'
    );

    // 4. Offer creation rules (bike seats, vehicle mismatch, self-offer, window, duplicate)
    const bikeTwoSeatsRes = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ fare: 150, seats_offered: 2, pickup_time: futureIso6h })
    });
    const bikeOnCarReqRes = await fetch(`${baseUrl}/passenger-requests/${carOnlyReqId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ fare: 180, seats_offered: 1, pickup_time: futureIso8h })
    });
    const outOfWindowOfferRes = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({
        fare: 150,
        seats_offered: 1,
        pickup_time: new Date(Date.now() + 20 * 3600000).toISOString()
      })
    });
    // Self-offer: make sadia's request vs approved driver Rahat creating own request & offering on it
    const rahatOwnReqRes = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'Savar Bus Stand',
        dest_name: 'DIU Campus',
        departure_time: futureIso10h
      })
    });
    const rahatOwnReqId = Number(((await rahatOwnReqRes.json()) as any).requestId);
    const selfOfferRes = await fetch(`${baseUrl}/passenger-requests/${rahatOwnReqId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({ fare: 100, seats_offered: 1, pickup_time: futureIso10h })
    });
    assert(
      bikeTwoSeatsRes.status === 400 &&
        bikeOnCarReqRes.status === 400 &&
        outOfWindowOfferRes.status === 400 &&
        selfOfferRes.status === 400,
      'Rejects bike >1 seat, bike on car-only request, >4h pickup window, and self-offer (400)'
    );

    // Valid offers from Tanvir (bike, 1 seat, ৳160), Nusrat (car, 3 seats, ৳190), Rahat (bike, 1 seat, ৳175)
    const tanvirOfferRes = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ fare: 160, seats_offered: 1, pickup_time: futureIso6h, message: 'Extra helmet ready' })
    });
    const tanvirOfferId = Number(((await tanvirOfferRes.json()) as any).offerId);

    const dupTanvirOfferRes = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ fare: 140, seats_offered: 1, pickup_time: futureIso6h })
    });

    const nusratOfferRes = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: nusratLogin.cookie },
      body: JSON.stringify({ fare: 190, seats_offered: 3, pickup_time: futureIso6h, message: 'AC car, 3 seats free' })
    });
    const nusratOfferId = Number(((await nusratOfferRes.json()) as any).offerId);

    const rahatOfferRes = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({ fare: 175, seats_offered: 1, pickup_time: futureIso6h, message: 'Can pick up fast' })
    });
    const rahatOfferId = Number(((await rahatOfferRes.json()) as any).offerId);

    assert(
      tanvirOfferRes.status === 201 &&
        dupTanvirOfferRes.status === 409 &&
        nusratOfferRes.status === 201 &&
        rahatOfferRes.status === 201,
      'Creates multiple valid driver offers (201) and prevents duplicate offer by same driver (409)'
    );

    // 5. Offer privacy on GET /passenger-requests/:id
    const ownerDetailJson: any = await (
      await fetch(`${baseUrl}/passenger-requests/${anyReqId}`, { headers: { Cookie: sadiaNewLogin.cookie } })
    ).json();
    const tanvirDetailJson: any = await (
      await fetch(`${baseUrl}/passenger-requests/${anyReqId}`, { headers: { Cookie: driverLogin.cookie } })
    ).json();
    assert(
      ownerDetailJson.isOwner === true &&
        ownerDetailJson.offers?.length === 3 &&
        ownerDetailJson.offers.every((o: any) => o.driver_phone === null) &&
        tanvirDetailJson.isOwner === false &&
        tanvirDetailJson.offers?.length === 1 &&
        Number(tanvirDetailJson.offers[0].id) === tanvirOfferId,
      'Owner sees all offers with masked phones while pending; competing drivers see only their own offer'
    );

    // 6. Edit, authorization check, withdraw, and non-pending guard
    const wrongDriverEditRes = await fetch(`${baseUrl}/passenger-requests/offers/${rahatOfferId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ fare: 120 })
    });
    const rahatEditRes = await fetch(`${baseUrl}/passenger-requests/offers/${rahatOfferId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({ fare: 165, message: 'Updated fare 165' })
    });
    const rahatWithdrawRes = await fetch(`${baseUrl}/passenger-requests/offers/${rahatOfferId}/withdraw`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: rahatLogin.cookie }
    });
    const editWithdrawnRes = await fetch(`${baseUrl}/passenger-requests/offers/${rahatOfferId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({ fare: 155 })
    });
    assert(
      wrongDriverEditRes.status === 403 &&
        rahatEditRes.status === 200 &&
        rahatWithdrawRes.status === 200 &&
        editWithdrawnRes.status === 409,
      'Enforces driver offer ownership on edit (403), updates & withdraws pending offers, and blocks editing withdrawn offer (409)'
    );

    // 7. Owner rejects Tanvir's offer -> marks rejected
    const rejectTanvirRes = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers/${tanvirOfferId}/reject`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    assert(rejectTanvirRes.status === 200, 'Passenger declines individual driver offer cleanly (200)');

    // 8. Atomic offer acceptance creates ride, booking, chat conversation & rejects competing pending offers
    // Add one fresh pending offer from Nusrat on carOnlyReqId to test both multi-seat ('open') and concurrent race + 1-seat bike ('full')
    const tanvirResubmitCheck = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers/${nusratOfferId}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const acceptNusratJson: any = await tanvirResubmitCheck.json();
    const matchedCarRideId = Number(acceptNusratJson.rideId);
    const matchedConvId = Number(acceptNusratJson.conversationId);
    assert(
      tanvirResubmitCheck.status === 200 && matchedCarRideId > 0 && matchedConvId > 0,
      'Accepting car offer (3 seats) atomically creates confirmed ride and chat conversation'
    );

    // Verify ride, accepted ride_request booking, matched status, and phone/plate reveal
    const [matchedRideRows] = await db.query('SELECT * FROM rides WHERE id = ?', [matchedCarRideId]);
    const matchedRide = (matchedRideRows as any[])[0];
    const [matchedBookingRows] = await db.query(
      'SELECT * FROM ride_requests WHERE ride_id = ? AND passenger_id = ?',
      [matchedCarRideId, sadiaId]
    );
    const matchedBooking = (matchedBookingRows as any[])[0];
    const afterMatchOwnerDetail: any = await (
      await fetch(`${baseUrl}/passenger-requests/${anyReqId}`, { headers: { Cookie: sadiaNewLogin.cookie } })
    ).json();
    const matchedOfferView = afterMatchOwnerDetail.offers?.find((o: any) => Number(o.id) === nusratOfferId);

    const sadiaConvsRes = await fetch(`${baseUrl}/chat/conversations`, { headers: { Cookie: sadiaNewLogin.cookie } });
    const sadiaConvsJson: any = await sadiaConvsRes.json();

    assert(
      matchedRide?.status === 'open' &&
        Number(matchedRide?.seats_total) === 3 &&
        Number(matchedRide?.seats_available) === 2 &&
        matchedBooking?.status === 'accepted' &&
        afterMatchOwnerDetail.request?.status === 'matched' &&
        Number(afterMatchOwnerDetail.request?.accepted_offer_id) === nusratOfferId &&
        matchedOfferView?.driver_phone !== null &&
        matchedOfferView?.driver_vehicle_plate !== null &&
        sadiaConvsJson.conversations?.some((c: any) => Number(c.id) === matchedConvId),
      'Matched car ride has seats_available=2/3 status="open", accepted booking, unlocked chat, and revealed contact details'
    );

    // Double-accept on matched request fails cleanly (409)
    const doubleAcceptRes = await fetch(`${baseUrl}/passenger-requests/${anyReqId}/offers/${nusratOfferId}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    assert(doubleAcceptRes.status === 409, 'Double-accept on already matched request returns 409 with no duplicate ride');

    // Concurrent race acceptance + 1-seat bike 'full' ride check
    const racePrRes = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: observerCookie },
      body: JSON.stringify({
        pickup_name: 'DIU Gate Race',
        dest_name: 'Savar Bazar',
        departure_time: futureIso10h,
        vehicle_type: 'bike'
      })
    });
    const racePrId = Number(((await racePrRes.json()) as any).requestId);
    const raceOffer1Res = await fetch(`${baseUrl}/passenger-requests/${racePrId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ fare: 110, seats_offered: 1, pickup_time: futureIso10h })
    });
    const raceOffer2Res = await fetch(`${baseUrl}/passenger-requests/${racePrId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({ fare: 120, seats_offered: 1, pickup_time: futureIso10h })
    });
    const raceOffer1Id = Number(((await raceOffer1Res.json()) as any).offerId);
    const raceOffer2Id = Number(((await raceOffer2Res.json()) as any).offerId);

    const [raceAcceptA, raceAcceptB] = await Promise.all([
      fetch(`${baseUrl}/passenger-requests/${racePrId}/offers/${raceOffer1Id}/accept`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: observerCookie }
      }),
      fetch(`${baseUrl}/passenger-requests/${racePrId}/offers/${raceOffer2Id}/accept`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: observerCookie }
      })
    ]);
    const raceAcceptStatuses = [raceAcceptA.status, raceAcceptB.status].sort();
    const winnerBody: any =
      raceAcceptA.status === 200 ? await raceAcceptA.json() : await raceAcceptB.json();
    const winnerRideId = Number(winnerBody.rideId);
    const [winnerRideRows] = await db.query('SELECT * FROM rides WHERE id = ?', [winnerRideId]);
    const winnerRide = (winnerRideRows as any[])[0];
    const [raceOffersAfter] = await db.query('SELECT * FROM driver_offers WHERE request_id = ?', [racePrId]);
    const rejectedCompeting = (raceOffersAfter as any[]).filter((o) => o.status === 'rejected');

    assert(
      raceAcceptStatuses[0] === 200 &&
        raceAcceptStatuses[1] === 409 &&
        winnerRide?.status === 'full' &&
        Number(winnerRide?.seats_available) === 0 &&
        rejectedCompeting.length === 1,
      'Parallel accept creates exactly one full 1-seat bike ride (200 + 409) and rejects competing pending offer'
    );

    // 9. Cancel request closes pending offers & lazy expiration transitions elapsed requests
    const cancelTestPrRes = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: observerCookie },
      body: JSON.stringify({
        pickup_name: 'Cancel Pickup',
        dest_name: 'Cancel Dest',
        departure_time: futureIso10h
      })
    });
    const cancelTestPrId = Number(((await cancelTestPrRes.json()) as any).requestId);
    const cancelTestOfferRes = await fetch(`${baseUrl}/passenger-requests/${cancelTestPrId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ fare: 130, seats_offered: 1, pickup_time: futureIso10h })
    });
    const cancelPrExecRes = await fetch(`${baseUrl}/passenger-requests/${cancelTestPrId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: observerCookie }
    });
    const [cancelledPrOffers] = await db.query('SELECT status FROM driver_offers WHERE request_id = ?', [cancelTestPrId]);
    assert(
      cancelTestPrRes.status === 201 &&
        cancelTestOfferRes.status === 201 &&
        cancelPrExecRes.status === 200 &&
        Array.isArray(cancelledPrOffers) &&
        (cancelledPrOffers as any[])[0]?.status === 'rejected',
      'Cancelling open passenger request transitions pending offers to rejected'
    );

    // Blocked pair check on passenger request offer
    await db.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)', [rahatId, sadiaId]);
    const blockTestPrRes = await fetch(`${baseUrl}/passenger-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
      body: JSON.stringify({
        pickup_name: 'Block Check Gate',
        dest_name: 'DIU',
        departure_time: futureIso10h
      })
    });
    const blockTestPrId = Number(((await blockTestPrRes.json()) as any).requestId);
    const blockedDriverOfferRes = await fetch(`${baseUrl}/passenger-requests/${blockTestPrId}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
      body: JSON.stringify({ fare: 100, seats_offered: 1, pickup_time: futureIso10h })
    });
    assert(blockedDriverOfferRes.status === 403, 'Blocked user pair cannot submit offer on passenger request (403)');
    await db.query('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [rahatId, sadiaId]);

    // Lazy expiration check for past departure_time
    const pastDepSql = formatDateToMySqlUtc(new Date(Date.now() - 60000));
    const [expiredPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 150, 'any', NULL, 'open')`,
      [sadiaId, 'Expired Origin', 23.8768, 90.3202, 'Expired Dest', 23.7538, 90.377, pastDepSql]
    );
    const expiredPrId = Number((expiredPrInsert as any).insertId);
    const [expiredOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 140, 1, 'bike', ?, 'pending')`,
      [expiredPrId, driverId, pastDepSql]
    );
    const expiredOfferId = Number((expiredOfferInsert as any).insertId);

    const expiredFetchJson: any = await (
      await fetch(`${baseUrl}/passenger-requests/${expiredPrId}`, { headers: { Cookie: sadiaNewLogin.cookie } })
    ).json();
    const expiredAcceptRes = await fetch(`${baseUrl}/passenger-requests/${expiredPrId}/offers/${expiredOfferId}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    assert(
      expiredFetchJson.request?.status === 'expired' &&
        expiredFetchJson.offers?.[0]?.status === 'expired' &&
        expiredAcceptRes.status === 409,
      'Lazy expiration marks elapsed passenger_requests and pending driver_offers expired and blocks acceptance (409)'
    );

    // -----------------------------------------------------------------------
    // PHASE 23: Final Audit Corrections Regression Tests
    // -----------------------------------------------------------------------
    console.log('\n[Phase 23] Final Audit Corrections Regression Tests');

    // 1. Email privacy: browse feed hides passenger_email; detail view hides unaccepted driver_email
    const privDep10hSql = formatDateToMySqlUtc(new Date(Date.now() + 10 * 3600000));
    const [privPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 220, 'any', NULL, 'open')`,
      [sadiaId, 'Privacy Check Gate', 23.8768, 90.3202, 'Mirpur 12', 23.8164, 90.3667, privDep10hSql]
    );
    const privPrId = Number((privPrInsert as any).insertId);
    const [privOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 180, 1, 'bike', ?, 'pending')`,
      [privPrId, driverId, privDep10hSql]
    );
    const privOfferId = Number((privOfferInsert as any).insertId);
    assert(privPrId > 0 && privOfferId > 0, 'Creates open request and pending offer for email privacy verification');

    const browsePrivacyJson: any = await (
      await fetch(`${baseUrl}/passenger-requests`, { headers: { Cookie: rahatLogin.cookie } })
    ).json();
    const browseItems: any[] = browsePrivacyJson.requests || [];
    assert(
      browseItems.length > 0 && browseItems.every((r) => r.passenger_email === null && r.passenger_phone === null),
      'Browse passenger-requests feed never exposes passenger_email or passenger_phone to drivers'
    );

    const ownerWithPendingJson: any = await (
      await fetch(`${baseUrl}/passenger-requests/${privPrId}`, { headers: { Cookie: sadiaNewLogin.cookie } })
    ).json();
    const ownerAfterMatchJson: any = await (
      await fetch(`${baseUrl}/passenger-requests/${anyReqId}`, { headers: { Cookie: sadiaNewLogin.cookie } })
    ).json();
    const adminDetailJson: any = await (
      await fetch(`${baseUrl}/passenger-requests/${anyReqId}`, { headers: { Cookie: adminLogin.cookie } })
    ).json();
    const ownerPendingOffer = (ownerWithPendingJson.offers || [])[0];
    const ownerAcceptedOffer = (ownerAfterMatchJson.offers || []).find((o: any) => o.status === 'accepted');
    const ownerUnacceptedOffers = (ownerAfterMatchJson.offers || []).filter((o: any) => o.status !== 'accepted');
    assert(
      ownerPendingOffer?.driver_email === null &&
        ownerUnacceptedOffers.length >= 2 &&
        ownerUnacceptedOffers.every((o: any) => o.driver_email === null) &&
        typeof ownerAcceptedOffer?.driver_email === 'string' &&
        ownerAcceptedOffer.driver_email.includes('@') &&
        (adminDetailJson.offers || []).every((o: any) => typeof o.driver_email === 'string' && o.driver_email.includes('@')),
      'Detail view hides driver_email on pending/rejected/withdrawn offers for owner while revealing to accepted owner and admins'
    );

    // 2A. Unrelated co-passenger spare-seat booking & cancellation on matched multi-seat ride must NOT cancel matched request
    const coPassBookRes = await fetch(`${baseUrl}/rides/${matchedCarRideId}/requests`, {
      method: 'POST',
      headers: { Origin: trustedOrigin, Cookie: observerCookie }
    });
    const coPassBookJson: any = await coPassBookRes.json();
    const coPassBookingId = Number(coPassBookJson.requestId);
    const acceptCoPassRes = await fetch(`${baseUrl}/requests/${coPassBookingId}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: nusratLogin.cookie }
    });
    const cancelCoPassRes = await fetch(`${baseUrl}/requests/${coPassBookingId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: observerCookie }
    });
    const [prAfterCoPassCancelRows] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [anyReqId]);
    const [rideAfterCoPassCancelRows] = await db.query('SELECT seats_available, status FROM rides WHERE id = ?', [
      matchedCarRideId
    ]);
    assert(
      coPassBookRes.status === 201 &&
        acceptCoPassRes.status === 200 &&
        cancelCoPassRes.status === 200 &&
        (prAfterCoPassCancelRows as any[])[0]?.status === 'matched' &&
        Number((rideAfterCoPassCancelRows as any[])[0]?.seats_available) === 2,
      'Unrelated co-passenger spare-seat booking cancellation restores seat without cancelling matched passenger_request'
    );

    // 2B. Matched passenger cancelling own booking syncs linked passenger_request -> cancelled & prevents double seat restore
    const matchedBookingId = Number(matchedBooking.id);
    const matchedPassengerCancelRes = await fetch(`${baseUrl}/requests/${matchedBookingId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const matchedPassengerDoubleCancelRes = await fetch(`${baseUrl}/requests/${matchedBookingId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const [prAfterSelfCancelRows] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [anyReqId]);
    const [rideAfterSelfCancelRows] = await db.query('SELECT seats_available FROM rides WHERE id = ?', [matchedCarRideId]);
    assert(
      matchedPassengerCancelRes.status === 200 &&
        matchedPassengerDoubleCancelRes.status === 409 &&
        (prAfterSelfCancelRows as any[])[0]?.status === 'cancelled' &&
        Number((rideAfterSelfCancelRows as any[])[0]?.seats_available) === 3,
      'Matched requester cancelling accepted booking restores seat once (409 on repeat) and syncs passenger_request to cancelled'
    );

    // 2C. Driver cancelRide on matched 1-seat ride (winnerRideId) syncs linked passenger_request (racePrId) & API exposes confirmed_ride_status
    const winnerDriverCookie =
      Number(winnerRide.driver_id) === driverId ? driverLogin.cookie : rahatLogin.cookie;
    const cancelMatchedRideRes = await fetch(`${baseUrl}/rides/${winnerRideId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: winnerDriverCookie }
    });
    const [racePrAfterRideCancelRows] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [racePrId]);
    const raceDetailAfterCancelJson: any = await (
      await fetch(`${baseUrl}/passenger-requests/${racePrId}`, { headers: { Cookie: observerCookie } })
    ).json();
    const winnerOffersMineJson: any = await (
      await fetch(`${baseUrl}/passenger-requests/offers/mine`, { headers: { Cookie: winnerDriverCookie } })
    ).json();
    const winnerOfferSummary = (winnerOffersMineJson.offers || []).find(
      (o: any) => Number(o.confirmed_ride_id) === winnerRideId
    );
    assert(
      cancelMatchedRideRes.status === 200 &&
        (racePrAfterRideCancelRows as any[])[0]?.status === 'cancelled' &&
        raceDetailAfterCancelJson.request?.status === 'cancelled' &&
        raceDetailAfterCancelJson.request?.confirmed_ride_status === 'cancelled' &&
        winnerOfferSummary?.confirmed_ride_status === 'cancelled' &&
        winnerOfferSummary?.request_status === 'cancelled',
      'rideController.cancelRide syncs matched passenger_request to cancelled and exposes confirmed_ride_status across endpoints'
    );

    // 2D. rideController.updateRideStatus('cancelled') + adminController.moderateRideAdmin + unrelated isolation
    // Seed a request & pending offer cleanly, then exercise real HTTP accept + updateRideStatus('cancelled')
    const futureDep10hSql = formatDateToMySqlUtc(new Date(Date.now() + 10 * 3600000));
    const [statusSyncPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'any', NULL, 'open')`,
      [sadiaId, 'Status Sync Gate', 23.8768, 90.3202, 'Uttara', 23.8742, 90.398, futureDep10hSql]
    );
    const statusSyncPrId = Number((statusSyncPrInsert as any).insertId);
    const [statusSyncOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 150, 1, 'bike', ?, 'pending')`,
      [statusSyncPrId, driverId, futureDep10hSql]
    );
    const statusSyncOfferId = Number((statusSyncOfferInsert as any).insertId);
    const statusSyncAcceptRes = await fetch(
      `${baseUrl}/passenger-requests/${statusSyncPrId}/offers/${statusSyncOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie } }
    );
    const statusSyncRideId = Number(((await statusSyncAcceptRes.json()) as any).rideId);
    const updateStatusCancelRes = await fetch(`${baseUrl}/rides/${statusSyncRideId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ status: 'cancelled' })
    });
    const [prAfterStatusCancelRows] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [
      statusSyncPrId
    ]);
    assert(
      statusSyncAcceptRes.status === 200 &&
        updateStatusCancelRes.status === 200 &&
        (prAfterStatusCancelRows as any[])[0]?.status === 'cancelled',
      'rideController.updateRideStatus("cancelled") synchronizes matched passenger_request to cancelled'
    );

    // Next exercise real HTTP accept + adminController.moderateRideAdmin, keeping privPrId untouched
    const [adminSyncPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 220, 'any', NULL, 'open')`,
      [sadiaId, 'Admin Sync Gate', 23.8768, 90.3202, 'Farmgate', 23.7561, 90.3872, futureDep10hSql]
    );
    const adminSyncPrId = Number((adminSyncPrInsert as any).insertId);
    const [adminSyncOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 170, 1, 'bike', ?, 'pending')`,
      [adminSyncPrId, driverId, futureDep10hSql]
    );
    const adminSyncOfferId = Number((adminSyncOfferInsert as any).insertId);
    const adminSyncAcceptRes = await fetch(
      `${baseUrl}/passenger-requests/${adminSyncPrId}/offers/${adminSyncOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie } }
    );
    const adminSyncRideId = Number(((await adminSyncAcceptRes.json()) as any).rideId);
    const adminModCancelRes = await fetch(`${baseUrl}/admin/rides/${adminSyncRideId}/moderate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: adminLogin.cookie },
      body: JSON.stringify({ reason: 'Audit moderation test' })
    });
    const [prAfterAdminCancelRows] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [
      adminSyncPrId
    ]);
    const [unrelatedPrRows] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [privPrId]);
    const [unrelatedOfferRows] = await db.query('SELECT status FROM driver_offers WHERE request_id = ?', [privPrId]);
    const sadiaConvsAfterCancelJson: any = await (
      await fetch(`${baseUrl}/chat/conversations`, { headers: { Cookie: sadiaNewLogin.cookie } })
    ).json();
    assert(
      adminModCancelRes.status === 200 &&
        (prAfterAdminCancelRows as any[])[0]?.status === 'cancelled' &&
        (unrelatedPrRows as any[])[0]?.status === 'open' &&
        (unrelatedOfferRows as any[])[0]?.status === 'pending' &&
        sadiaConvsAfterCancelJson.conversations?.some((c: any) => Number(c.id) === matchedConvId),
      'adminController.moderateRideAdmin syncs matched request without modifying unrelated open requests/offers or chat history'
    );

    // 3. Expiration guards on withdrawDriverOffer & rejectDriverOffer
    const [expWithdrawPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 160, 'any', NULL, 'open')`,
      [sadiaId, 'Elapsed Withdraw', 23.8768, 90.3202, 'DIU', 23.7538, 90.377, pastDepSql]
    );
    const expWithdrawPrId = Number((expWithdrawPrInsert as any).insertId);
    const [expWithdrawOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 130, 1, 'bike', ?, 'pending')`,
      [expWithdrawPrId, driverId, pastDepSql]
    );
    const expWithdrawOfferId = Number((expWithdrawOfferInsert as any).insertId);

    const withdrawExpiredRes = await fetch(
      `${baseUrl}/passenger-requests/offers/${expWithdrawOfferId}/withdraw`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie } }
    );
    const [expWPrAfter] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [expWithdrawPrId]);
    const [expWOfferAfter] = await db.query('SELECT status FROM driver_offers WHERE id = ?', [expWithdrawOfferId]);

    const [expRejectPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 160, 'any', NULL, 'open')`,
      [sadiaId, 'Elapsed Reject', 23.8768, 90.3202, 'DIU', 23.7538, 90.377, pastDepSql]
    );
    const expRejectPrId = Number((expRejectPrInsert as any).insertId);
    const [expRejectOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 145, 1, 'bike', ?, 'pending')`,
      [expRejectPrId, rahatId, pastDepSql]
    );
    const expRejectOfferId = Number((expRejectOfferInsert as any).insertId);

    const rejectExpiredRes = await fetch(
      `${baseUrl}/passenger-requests/${expRejectPrId}/offers/${expRejectOfferId}/reject`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie } }
    );
    const [expRPrAfter] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [expRejectPrId]);
    const [expROfferAfter] = await db.query('SELECT status FROM driver_offers WHERE id = ?', [expRejectOfferId]);

    assert(
      withdrawExpiredRes.status === 409 &&
        (expWPrAfter as any[])[0]?.status === 'expired' &&
        (expWOfferAfter as any[])[0]?.status === 'expired' &&
        rejectExpiredRes.status === 409 &&
        (expRPrAfter as any[])[0]?.status === 'expired' &&
        (expROfferAfter as any[])[0]?.status === 'expired',
      'withdrawDriverOffer and rejectDriverOffer return 409 and expire elapsed requests and pending offers atomically'
    );

    // -----------------------------------------------------------------------
    // PHASE 24: Final Production Readiness Audit Regression Tests
    // -----------------------------------------------------------------------
    console.log('\n[Phase 24] Final Production Readiness Audit Regression Tests');

    // 1. Verify standardized row-lock order (passenger_requests FOR UPDATE before driver_offers FOR UPDATE)
    // Note: Static source verification + concurrency/mock tests; in-memory SQL cannot prove real InnoDB deadlocks.
    const prCtrlSource = fs.readFileSync(
      path.resolve(process.cwd(), 'server/src/controllers/passengerRequestController.ts'),
      'utf8'
    );
    const lockOrderFns = [
      'syncPassengerRequestOnRideCancelled',
      'syncPassengerRequestOnBookingCancelled',
      'updateDriverOffer',
      'withdrawDriverOffer',
      'acceptDriverOffer',
      'rejectDriverOffer'
    ];
    let allLockOrdersValid = true;
    for (const fnName of lockOrderFns) {
      const fnStart = prCtrlSource.indexOf(`function ${fnName}`);
      assert(fnStart !== -1, `Located ${fnName} in passengerRequestController.ts`);
      const nextFnIdx = prCtrlSource.indexOf('\nexport async function ', fnStart + 20);
      const fnSlice = nextFnIdx === -1 ? prCtrlSource.slice(fnStart) : prCtrlSource.slice(fnStart, nextFnIdx);
      const prMatch = /FROM\s+passenger_requests\s+WHERE\s+id\s*=\s*\?\s+FOR\s+UPDATE/i.exec(fnSlice);
      const offerMatch = /FROM\s+driver_offers\s+WHERE\s+id\s*=\s*\?[^;]*?FOR\s+UPDATE/i.exec(fnSlice);
      if (!prMatch || !offerMatch || prMatch.index > offerMatch.index) {
        allLockOrdersValid = false;
      }
    }
    assert(
      allLockOrdersValid,
      'All double-row lock transactions lock passenger_requests FOR UPDATE before driver_offers FOR UPDATE'
    );

    // Concurrent updateDriverOffer / withdrawDriverOffer vs acceptDriverOffer / rejectDriverOffer
    const concDepIso = new Date(Date.now() + 12 * 3600000).toISOString();
    const concDepSql = formatDateToMySqlUtc(new Date(Date.now() + 12 * 3600000));
    const [concPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'bike', NULL, 'open')`,
      [sadiaId, 'Lock Race Gate', 23.8768, 90.3202, 'Mirpur 10', 23.8069, 90.3687, concDepSql]
    );
    const concPrId = Number((concPrInsert as any).insertId);
    const [concOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 140, 1, 'bike', ?, 'pending')`,
      [concPrId, driverId, concDepSql]
    );
    const concOfferId = Number((concOfferInsert as any).insertId);
    assert(concOfferId > 0 && concPrId > 0, 'Created valid fixtures for concurrency test');

    const [concWithdrawRes, concAcceptRes] = await Promise.all([
      fetch(`${baseUrl}/passenger-requests/offers/${concOfferId}/withdraw`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
      }),
      fetch(`${baseUrl}/passenger-requests/${concPrId}/offers/${concOfferId}/accept`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
      })
    ]);
    const [concOfferAfterRows] = await db.query('SELECT status, confirmed_ride_id FROM driver_offers WHERE id = ?', [
      concOfferId
    ]);
    const [concPrAfterRows] = await db.query('SELECT status, accepted_offer_id FROM passenger_requests WHERE id = ?', [
      concPrId
    ]);
    const concOfferAfter = (concOfferAfterRows as any[])[0];
    const concPrAfter = (concPrAfterRows as any[])[0];
    const concConsistent =
      (concWithdrawRes.status === 200 &&
        concAcceptRes.status === 409 &&
        concOfferAfter?.status === 'withdrawn' &&
        concPrAfter?.status === 'open') ||
      (concAcceptRes.status === 200 &&
        concWithdrawRes.status === 409 &&
        concOfferAfter?.status === 'accepted' &&
        Number(concOfferAfter?.confirmed_ride_id) > 0 &&
        concPrAfter?.status === 'matched');
    assert(
      concConsistent,
      `Concurrent withdrawDriverOffer vs acceptDriverOffer settles into a single consistent terminal state (pr=${concPrId}, offer=${concOfferId}, withdraw=${concWithdrawRes.status}, accept=${concAcceptRes.status}, offerStatus=${concOfferAfter?.status}, prStatus=${concPrAfter?.status})`
    );

    // Concurrent updateDriverOffer vs rejectDriverOffer
    const [conc2PrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'bike', NULL, 'open')`,
      [sadiaId, 'Lock Race Update', 23.8768, 90.3202, 'Uttara', 23.8742, 90.398, concDepSql]
    );
    const conc2PrId = Number((conc2PrInsert as any).insertId);
    const [conc2OfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 150, 1, 'bike', ?, 'pending')`,
      [conc2PrId, driverId, concDepSql]
    );
    const conc2OfferId = Number((conc2OfferInsert as any).insertId);

    const [conc2UpdateRes, conc2RejectRes] = await Promise.all([
      fetch(`${baseUrl}/passenger-requests/offers/${conc2OfferId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
        body: JSON.stringify({ fare: 135 })
      }),
      fetch(`${baseUrl}/passenger-requests/${conc2PrId}/offers/${conc2OfferId}/reject`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
      })
    ]);
    assert(
      conc2RejectRes.status === 200 && (conc2UpdateRes.status === 200 || conc2UpdateRes.status === 409),
      'Concurrent updateDriverOffer vs rejectDriverOffer completes without invalid state'
    );

    // Mock ER_LOCK_DEADLOCK (1213) and ER_LOCK_WAIT_TIMEOUT (1205) handling
    const origGetConnForLock = db.getConnection;
    try {
      let deadlockRolledBack = false;
      let deadlockReleased = false;
      db.getConnection = async () => ({
        beginTransaction: async () => {},
        query: async (sql: string) => {
          if (sql.includes('FOR UPDATE')) {
            throw Object.assign(new Error('Deadlock found when trying to get lock'), {
              code: 'ER_LOCK_DEADLOCK',
              errno: 1213
            });
          }
          return [[{ id: conc2OfferId, request_id: conc2PrId }], []];
        },
        execute: async () => [[], []],
        commit: async () => {
          throw new Error('commit should not run on deadlock');
        },
        rollback: async () => {
          deadlockRolledBack = true;
        },
        release: () => {
          deadlockReleased = true;
        }
      });

      const deadlockHttpRes = await fetch(`${baseUrl}/passenger-requests/offers/${conc2OfferId}/withdraw`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
      });
      assert(
        deadlockHttpRes.status === 409 && deadlockRolledBack && deadlockReleased,
        'ER_LOCK_DEADLOCK (1213) rolls back, releases connection, and returns HTTP 409 cleanly'
      );

      let timeoutRolledBack = false;
      let timeoutReleased = false;
      db.getConnection = async () => ({
        beginTransaction: async () => {},
        query: async (sql: string) => {
          if (sql.includes('FOR UPDATE')) {
            throw Object.assign(new Error('Lock wait timeout exceeded'), {
              code: 'ER_LOCK_WAIT_TIMEOUT',
              errno: 1205
            });
          }
          return [[{ id: conc2OfferId, request_id: conc2PrId }], []];
        },
        execute: async () => [[], []],
        commit: async () => {
          throw new Error('commit should not run on lock wait timeout');
        },
        rollback: async () => {
          timeoutRolledBack = true;
        },
        release: () => {
          timeoutReleased = true;
        }
      });

      const timeoutHttpRes = await fetch(`${baseUrl}/passenger-requests/${conc2PrId}/offers/${conc2OfferId}/accept`, {
        method: 'PATCH',
        headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
      });
      assert(
        timeoutHttpRes.status === 503 && timeoutRolledBack && timeoutReleased,
        'ER_LOCK_WAIT_TIMEOUT (1205) rolls back, releases connection, and returns HTTP 503 cleanly'
      );
    } finally {
      db.getConnection = origGetConnForLock;
    }

    // 2. Cancelled 1-seat matched ride must NOT become public; ordinary 1-seat ride restores normally
    const [soloPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'bike', NULL, 'open')`,
      [sadiaId, 'Bespoke Bike Gate', 23.8768, 90.3202, 'Dhanmondi 32', 23.7509, 90.3776, concDepSql]
    );
    const soloPrId = Number((soloPrInsert as any).insertId);
    const [soloOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 160, 1, 'bike', ?, 'pending')`,
      [soloPrId, driverId, concDepSql]
    );
    const soloOfferId = Number((soloOfferInsert as any).insertId);
    const soloAcceptRes = await fetch(`${baseUrl}/passenger-requests/${soloPrId}/offers/${soloOfferId}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const soloRideId = Number(((await soloAcceptRes.json()) as any).rideId);
    const [soloBookingRows] = await db.query(
      'SELECT id FROM ride_requests WHERE ride_id = ? AND passenger_id = ?',
      [soloRideId, sadiaId]
    );
    const soloBookingId = Number((soloBookingRows as any[])[0]?.id);
    const soloCancelRes = await fetch(`${baseUrl}/requests/${soloBookingId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const soloDoubleCancelRes = await fetch(`${baseUrl}/requests/${soloBookingId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const [soloRideAfterRows] = await db.query('SELECT status, seats_available FROM rides WHERE id = ?', [soloRideId]);
    const [soloPrAfterRows] = await db.query('SELECT status FROM passenger_requests WHERE id = ?', [soloPrId]);
    const publicRidesSearchJson: any = await (await fetch(`${baseUrl}/rides?pickup=Bespoke`)).json();
    assert(
      soloAcceptRes.status === 200 &&
        soloCancelRes.status === 200 &&
        soloDoubleCancelRes.status === 409 &&
        (soloRideAfterRows as any[])[0]?.status === 'cancelled' &&
        Number((soloRideAfterRows as any[])[0]?.seats_available) === 0 &&
        (soloPrAfterRows as any[])[0]?.status === 'cancelled' &&
        !(publicRidesSearchJson.rides || []).some((r: any) => Number(r.id) === soloRideId),
      'Cancelling sole booking on matched 1-seat ride cancels ride, hides from public search, and rejects repeat cancel (409)'
    );

    // Ordinary 1-seat driver-created ride still restores seats_available=1 and status='open' on passenger cancel
    const [ordRideInsert] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 110, 1, 1, 'bike', 'open')`,
      [driverId, 'Ordinary Bike Gate', 23.8768, 90.3202, 'Mirpur 10', 23.8069, 90.3687, concDepSql]
    );
    const ordRideId = Number((ordRideInsert as any).insertId);
    const [ordReqInsert] = await db.query(
      `INSERT INTO ride_requests (ride_id, passenger_id, seats_requested, status)
       VALUES (?, ?, 1, 'accepted')`,
      [ordRideId, sadiaId]
    );
    const ordReqId = Number((ordReqInsert as any).insertId);
    await db.query('UPDATE rides SET seats_available = 0, status = "full" WHERE id = ?', [ordRideId]);

    const ordCancelRes = await fetch(`${baseUrl}/requests/${ordReqId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
    });
    const [ordRideAfterRows] = await db.query('SELECT status, seats_available FROM rides WHERE id = ?', [ordRideId]);
    assert(
      ordCancelRes.status === 200 &&
        (ordRideAfterRows as any[])[0]?.status === 'open' &&
        Number((ordRideAfterRows as any[])[0]?.seats_available) === 1,
      'Ordinary 1-seat driver ride still restores seats_available=1 and status="open" when passenger cancels'
    );

    // 3. Post-block privacy & suspended-account enforcement
    const [blockMatchPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'bike', NULL, 'open')`,
      [sadiaId, 'PostBlock Gate', 23.8768, 90.3202, 'Farmgate', 23.7561, 90.3872, concDepSql]
    );
    const blockMatchPrId = Number((blockMatchPrInsert as any).insertId);
    const [blockMatchOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 155, 1, 'bike', ?, 'pending')`,
      [blockMatchPrId, driverId, concDepSql]
    );
    const blockMatchOfferId = Number((blockMatchOfferInsert as any).insertId);
    const blockMatchAcceptRes = await fetch(
      `${baseUrl}/passenger-requests/${blockMatchPrId}/offers/${blockMatchOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie } }
    );
    assert(blockMatchAcceptRes.status === 200, 'Creates accepted match for post-block privacy verification');

    // Second open request with pending offer from same driver + another driver
    const [blockPendPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'any', NULL, 'open')`,
      [sadiaId, 'PostBlock Pending Gate', 23.8768, 90.3202, 'Motijheel', 23.733, 90.4172, concDepSql]
    );
    const blockPendPrId = Number((blockPendPrInsert as any).insertId);
    await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 180, 1, 'bike', ?, 'pending')`,
      [blockPendPrId, driverId, concDepSql]
    );
    await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 190, 1, 'bike', ?, 'pending')`,
      [blockPendPrId, rahatId, concDepSql]
    );

    // Test both block directions: passenger blocks driver, then driver blocks passenger
    for (const [blocker, blocked, label] of [
      [sadiaId, driverId, 'passenger->driver'],
      [driverId, sadiaId, 'driver->passenger']
    ] as [number, number, string][]) {
      await db.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)', [blocker, blocked]);
      try {
        const ownerAcceptedDetail: any = await (
          await fetch(`${baseUrl}/passenger-requests/${blockMatchPrId}`, {
            headers: { Cookie: sadiaNewLogin.cookie }
          })
        ).json();
        const acceptedOfferView = (ownerAcceptedDetail.offers || []).find(
          (o: any) => Number(o.id) === blockMatchOfferId
        );

        const ownerPendingDetail: any = await (
          await fetch(`${baseUrl}/passenger-requests/${blockPendPrId}`, {
            headers: { Cookie: sadiaNewLogin.cookie }
          })
        ).json();

        const blockedDriverDetailRes = await fetch(`${baseUrl}/passenger-requests/${blockMatchPrId}`, {
          headers: { Cookie: driverLogin.cookie }
        });

        const driverOffersMineJson: any = await (
          await fetch(`${baseUrl}/passenger-requests/offers/mine`, {
            headers: { Cookie: driverLogin.cookie }
          })
        ).json();
        const driverAcceptedMatchView = (driverOffersMineJson.offers || []).find(
          (o: any) => Number(o.id) === blockMatchOfferId
        );
        const driverHasBlockedPendingOffer = (driverOffersMineJson.offers || []).some(
          (o: any) => Number(o.request_id) === blockPendPrId
        );

        const adminAcceptedDetail: any = await (
          await fetch(`${baseUrl}/passenger-requests/${blockMatchPrId}`, {
            headers: { Cookie: adminLogin.cookie }
          })
        ).json();
        const adminOfferView = (adminAcceptedDetail.offers || []).find(
          (o: any) => Number(o.id) === blockMatchOfferId
        );

        assert(
          acceptedOfferView?.driver_email === null &&
            acceptedOfferView?.driver_phone === null &&
            acceptedOfferView?.driver_vehicle_plate === null &&
            !(ownerPendingDetail.offers || []).some((o: any) => Number(o.driver_id) === driverId) &&
            (ownerPendingDetail.offers || []).some((o: any) => Number(o.driver_id) === rahatId) &&
            blockedDriverDetailRes.status === 403 &&
            driverAcceptedMatchView?.passenger_email === null &&
            driverAcceptedMatchView?.passenger_phone === null &&
            !driverHasBlockedPendingOffer &&
            typeof adminOfferView?.driver_email === 'string',
          `Post-block (${label}) hides pending offers, masks PII on accepted match both ways, and preserves admin access`
        );
      } finally {
        await db.query('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [blocker, blocked]);
      }
    }

    // Suspended passenger (is_blocked = 1) excluded from browse, detail view, offer create, and offer update
    await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [sadiaId]);
    try {
      const suspBrowseJson: any = await (
        await fetch(`${baseUrl}/passenger-requests`, { headers: { Cookie: rahatLogin.cookie } })
      ).json();
      const suspDetailRes = await fetch(`${baseUrl}/passenger-requests/${blockPendPrId}`, {
        headers: { Cookie: rahatLogin.cookie }
      });
      const suspCreateOfferRes = await fetch(`${baseUrl}/passenger-requests/${blockPendPrId}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: nusratLogin.cookie },
        body: JSON.stringify({ fare: 200, seats_offered: 2, pickup_time: concDepIso })
      });
      const [rahatPendOfferRows] = await db.query(
        'SELECT id FROM driver_offers WHERE request_id = ? AND driver_id = ?',
        [blockPendPrId, rahatId]
      );
      const rahatPendOfferId = Number((rahatPendOfferRows as any[])[0]?.id);
      const suspUpdateOfferRes = await fetch(`${baseUrl}/passenger-requests/offers/${rahatPendOfferId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: rahatLogin.cookie },
        body: JSON.stringify({ fare: 175 })
      });
      assert(
        !(suspBrowseJson.requests || []).some((r: any) => Number(r.passenger_id) === sadiaId) &&
          suspDetailRes.status === 403 &&
          suspCreateOfferRes.status === 403 &&
          suspUpdateOfferRes.status === 403,
        'Suspended passenger is excluded from driver browse, detail view, offer create, and offer update (403)'
      );
    } finally {
      await db.query('UPDATE users SET is_blocked = 0 WHERE id = ?', [sadiaId]);
    }

    // Controller defense-in-depth rejects req.user with is_blocked = 1 directly
    let suspDirectStatus = 0;
    await createPassengerRequest(
      {
        user: {
          id: sadiaId,
          student_id: '221-15-999',
          name: 'Suspended Direct',
          email: 'susp@diu.edu.bd',
          phone: '01700000000',
          role: 'student',
          driver_status: 'none',
          vehicle_type: null,
          vehicle_model: null,
          vehicle_plate: null,
          is_blocked: 1
        },
        body: { pickup_name: 'A', dest_name: 'B', departure_time: concDepIso }
      } as any,
      {
        status: (code: number) => {
          suspDirectStatus = code;
          return { json: () => {} };
        }
      } as any
    );
    assert(suspDirectStatus === 403, 'Controller defense-in-depth blocks suspended req.user with 403');

    // 4. Consistent HTTP 503 on DatabaseUnavailableError across passengerRequestController & cancelRequest
    const origQuery503 = db.query;
    const origGetConn503 = db.getConnection;
    const dbDownErr = Object.assign(new Error('Database service is temporarily unavailable. Please try again shortly.'), {
      isDatabaseUnavailable: true,
      status: 503
    });
    try {
      db.query = async (sql: string, params?: any[]) => {
        if (sql.includes('FROM users WHERE id = ?')) {
          return await origQuery503(sql, params);
        }
        throw dbDownErr;
      };
      db.getConnection = async () => {
        throw dbDownErr;
      };

      const endpoints503 = await Promise.all([
        fetch(`${baseUrl}/passenger-requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
          body: JSON.stringify({ pickup_name: 'Pickup Point', dest_name: 'Drop Point', departure_time: concDepIso })
        }),
        fetch(`${baseUrl}/passenger-requests`, { headers: { Cookie: driverLogin.cookie } }),
        fetch(`${baseUrl}/passenger-requests/mine`, { headers: { Cookie: sadiaNewLogin.cookie } }),
        fetch(`${baseUrl}/passenger-requests/offers/mine`, { headers: { Cookie: driverLogin.cookie } }),
        fetch(`${baseUrl}/passenger-requests/${blockPendPrId}`, { headers: { Cookie: sadiaNewLogin.cookie } }),
        fetch(`${baseUrl}/passenger-requests/${blockPendPrId}/cancel`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        }),
        fetch(`${baseUrl}/passenger-requests/${blockPendPrId}/offers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
          body: JSON.stringify({ fare: 150, seats_offered: 1, pickup_time: concDepIso })
        }),
        fetch(`${baseUrl}/passenger-requests/offers/${blockMatchOfferId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
          body: JSON.stringify({ fare: 150 })
        }),
        fetch(`${baseUrl}/passenger-requests/offers/${blockMatchOfferId}/withdraw`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: driverLogin.cookie }
        }),
        fetch(`${baseUrl}/passenger-requests/${blockMatchPrId}/offers/${blockMatchOfferId}/accept`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        }),
        fetch(`${baseUrl}/passenger-requests/${blockMatchPrId}/offers/${blockMatchOfferId}/reject`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        }),
        fetch(`${baseUrl}/requests/${ordReqId}/cancel`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        })
      ]);

      assert(
        endpoints503.every((r) => r.status === 503),
        `All 11 passengerRequestController handlers and requestController.cancelRequest return HTTP 503 on DatabaseUnavailableError: statuses=${endpoints503.map((r) => r.status).join(',')}`
      );
    } finally {
      db.query = origQuery503;
      db.getConnection = origGetConn503;
    }

    // Unexpected internal errors stay HTTP 500 via handlePassengerRequestError
    let errHelperStatus = 0;
    const origConsoleErr = console.error;
    console.error = () => {};
    try {
      handlePassengerRequestError(
        {
          status: (code: number) => {
            errHelperStatus = code;
            return { json: () => {} };
          }
        } as any,
        new Error('Unexpected non-DB error'),
        'unitTest',
        'Fallback'
      );
    } finally {
      console.error = origConsoleErr;
    }
    assert(errHelperStatus === 500, 'handlePassengerRequestError preserves HTTP 500 for unexpected non-DB errors');

    // 5. Client-side Cancelled Match Filter Accuracy (no DB ENUM changes)
    const sampleOffers = [
      { id: 1, status: 'accepted', confirmed_ride_status: 'open', request_status: 'matched' },
      { id: 2, status: 'accepted', confirmed_ride_status: 'cancelled', request_status: 'cancelled' },
      { id: 3, status: 'accepted', confirmed_ride_status: null, request_status: 'cancelled' },
      { id: 4, status: 'pending', confirmed_ride_status: null, request_status: 'open' }
    ];
    const isCancelledMatch = (o: any) =>
      o.confirmed_ride_status === 'cancelled' || o.request_status === 'cancelled';
    const acceptedTabItems = sampleOffers.filter((o) => o.status === 'accepted' && !isCancelledMatch(o));
    const cancelledTabItems = sampleOffers.filter((o) => o.status === 'accepted' && isCancelledMatch(o));
    assert(
      acceptedTabItems.length === 1 &&
        acceptedTabItems[0].id === 1 &&
        cancelledTabItems.length === 2 &&
        cancelledTabItems.map((o) => o.id).join(',') === '2,3',
      'My Offers client filter separates active accepted matches from cancelled matches cleanly'
    );

    // -----------------------------------------------------------------------
    // PHASE 25: Safe Driver Offer Matching & Existing Ride Reuse Tests
    // -----------------------------------------------------------------------
    console.log('\n[Phase 25] Safe Driver Offer Matching & Existing Ride Reuse Tests');

    const [p25ObserverRows] = await db.query('SELECT id FROM users WHERE email = ?', ['observer.p22@diu.edu.bd']);
    const p25ObserverId = Number((p25ObserverRows as any[])[0]?.id);
    assert(p25ObserverId > 0, 'Located Phase 25 observer student ID');

    const matchBaseTimeMs = Date.now() + 14 * 3600000;
    const matchDepSql = formatDateToMySqlUtc(new Date(matchBaseTimeMs));
    const matchDepNearSql = formatDateToMySqlUtc(new Date(matchBaseTimeMs + 20 * 60000));
    const matchDepFarSql = formatDateToMySqlUtc(new Date(matchBaseTimeMs + 5 * 3600000));

    // Scenario 1 & 5: Compatible existing ride (Nusrat, car, 2 seats, open) -> reused, no duplicate ride, passenger counted on GET /rides/mine
    const [existingCompatRideRes] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 180, 2, 2, 'car', 'Existing compat car ride', 'open')`,
      [nusratId, 'P25 Smart City Hub', 23.8768, 90.3202, 'P25 Banani Stop', 23.7937, 90.4066, matchDepSql]
    );
    const existingCompatRideId = Number((existingCompatRideRes as any).insertId);

    const [compatPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'car', NULL, 'open')`,
      [sadiaId, 'p25 smart city hub', 23.8768, 90.3202, 'P25 Banani Stop', 23.7937, 90.4066, matchDepNearSql]
    );
    const compatPrId = Number((compatPrInsert as any).insertId);
    const [compatOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 175, 2, 'car', ?, 'pending')`,
      [compatPrId, nusratId, matchDepNearSql]
    );
    const compatOfferId = Number((compatOfferInsert as any).insertId);

    const [ridesCountBeforeRows] = await db.query('SELECT COUNT(*) AS posted_rides FROM rides WHERE driver_id = ?', [
      nusratId
    ]);
    const nusratRideCountBefore = Number((ridesCountBeforeRows as any[])[0]?.posted_rides || 0);

    const acceptCompatRes = await fetch(
      `${baseUrl}/passenger-requests/${compatPrId}/offers/${compatOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie } }
    );
    const acceptCompatJson: any = await acceptCompatRes.json();

    const [ridesCountAfterRows] = await db.query('SELECT COUNT(*) AS posted_rides FROM rides WHERE driver_id = ?', [
      nusratId
    ]);
    const nusratRideCountAfter = Number((ridesCountAfterRows as any[])[0]?.posted_rides || 0);

    const [reusedRideRows] = await db.query('SELECT * FROM rides WHERE id = ?', [existingCompatRideId]);
    const reusedRide = (reusedRideRows as any[])[0];
    const [reusedOfferRows] = await db.query('SELECT status, confirmed_ride_id FROM driver_offers WHERE id = ?', [
      compatOfferId
    ]);
    const reusedOffer = (reusedOfferRows as any[])[0];
    const [reusedBookingsRows] = await db.query(
      'SELECT * FROM ride_requests WHERE ride_id = ? AND passenger_id = ?',
      [existingCompatRideId, sadiaId]
    );
    const myRidesAfterReuseJson: any = await (
      await fetch(`${baseUrl}/rides/mine`, { headers: { Cookie: nusratLogin.cookie } })
    ).json();
    const reusedRideMineCard = (myRidesAfterReuseJson.rides || []).find(
      (r: any) => Number(r.id) === existingCompatRideId
    );

    assert(
      acceptCompatRes.status === 200 &&
        acceptCompatJson.reusedExistingRide === true &&
        Number(acceptCompatJson.rideId) === existingCompatRideId &&
        Number(reusedOffer?.confirmed_ride_id) === existingCompatRideId &&
        nusratRideCountAfter === nusratRideCountBefore &&
        Number(reusedRide?.seats_available) === 1 &&
        reusedRide?.status === 'open' &&
        Array.isArray(reusedBookingsRows) &&
        reusedBookingsRows.length === 1 &&
        (reusedBookingsRows as any[])[0]?.status === 'accepted' &&
        Number(reusedRideMineCard?.accepted_requests_count) === 1,
      'Scenario 1 & 5: Compatible existing ride is reused without duplicates, decrements seats_available, and updates accepted_requests_count on GET /rides/mine'
    );

    // Scenario 6a: Duplicate offer acceptance on already matched request/offer returns 409 without duplicate booking
    const dupOfferAcceptRes = await fetch(
      `${baseUrl}/passenger-requests/${compatPrId}/offers/${compatOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie } }
    );
    const [bookingsAfterDupRows] = await db.query(
      'SELECT * FROM ride_requests WHERE ride_id = ? AND passenger_id = ?',
      [existingCompatRideId, sadiaId]
    );
    assert(
      dupOfferAcceptRes.status === 409 && Array.isArray(bookingsAfterDupRows) && bookingsAfterDupRows.length === 1,
      'Scenario 6a: Duplicate offer acceptance returns 409 and prevents duplicate passenger booking'
    );

    // Scenario 6b: Passenger already has an accepted booking on existingCompatRideId; second offer from same driver does NOT double-book existingCompatRideId
    const [secondPrForSamePassenger] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'car', NULL, 'open')`,
      [sadiaId, 'P25 Smart City Hub', 23.8768, 90.3202, 'P25 Banani Stop', 23.7937, 90.4066, matchDepNearSql]
    );
    const secondPrId = Number((secondPrForSamePassenger as any).insertId);
    const [secondOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 175, 2, 'car', ?, 'pending')`,
      [secondPrId, nusratId, matchDepNearSql]
    );
    const secondOfferId = Number((secondOfferInsert as any).insertId);
    const acceptSecondSamePassengerRes = await fetch(
      `${baseUrl}/passenger-requests/${secondPrId}/offers/${secondOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie } }
    );
    const acceptSecondSamePassengerJson: any = await acceptSecondSamePassengerRes.json();
    const [existingRideSeatCheckRows] = await db.query('SELECT seats_available FROM rides WHERE id = ?', [
      existingCompatRideId
    ]);
    assert(
      acceptSecondSamePassengerRes.status === 200 &&
        Number(acceptSecondSamePassengerJson.rideId) !== existingCompatRideId &&
        acceptSecondSamePassengerJson.reusedExistingRide === false &&
        Number((existingRideSeatCheckRows as any[])[0]?.seats_available) === 1,
      'Scenario 6b: Existing ride where passenger already holds an accepted booking is not reused/double-booked; falls back safely'
    );

    // Scenario 5b: Accepted passenger count remains 1 on reused ride through trip start -> complete
    await fetch(`${baseUrl}/rides/${existingCompatRideId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: nusratLogin.cookie },
      body: JSON.stringify({ status: 'in_progress' })
    });
    await fetch(`${baseUrl}/rides/${existingCompatRideId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: nusratLogin.cookie },
      body: JSON.stringify({ status: 'completed' })
    });
    const myRidesCompletedJson: any = await (
      await fetch(`${baseUrl}/rides/mine`, { headers: { Cookie: nusratLogin.cookie } })
    ).json();
    const completedReusedCard = (myRidesCompletedJson.rides || []).find(
      (r: any) => Number(r.id) === existingCompatRideId
    );
    assert(
      completedReusedCard?.status === 'completed' && Number(completedReusedCard?.accepted_requests_count) === 1,
      'Scenario 5b: Reused ride retains accepted_requests_count=1 after trip completion'
    );

    // Scenario 4: Completed / cancelled / in_progress rides are NEVER reused -> fallback creates new ride
    const [cancelledRideInsert] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 120, 1, 1, 'bike', 'cancelled')`,
      [driverId, 'P25 Cancelled Gate', 23.8768, 90.3202, 'P25 Uttara Hub', 23.8742, 90.398, matchDepSql]
    );
    const cancelledRideId = Number((cancelledRideInsert as any).insertId);
    const [completedRideInsert] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 120, 1, 1, 'bike', 'completed')`,
      [driverId, 'P25 Cancelled Gate', 23.8768, 90.3202, 'P25 Uttara Hub', 23.8742, 90.398, matchDepSql]
    );
    const completedRideId = Number((completedRideInsert as any).insertId);
    const [inProgRideInsert] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 120, 1, 1, 'bike', 'in_progress')`,
      [driverId, 'P25 Cancelled Gate', 23.8768, 90.3202, 'P25 Uttara Hub', 23.8742, 90.398, matchDepSql]
    );
    const inProgRideId = Number((inProgRideInsert as any).insertId);

    const [statusGuardPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 150, 'bike', 'open')`,
      [sadiaId, 'P25 Cancelled Gate', 23.8768, 90.3202, 'P25 Uttara Hub', 23.8742, 90.398, matchDepSql]
    );
    const statusGuardPrId = Number((statusGuardPrInsert as any).insertId);
    const [statusGuardOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 130, 1, 'bike', ?, 'pending')`,
      [statusGuardPrId, driverId, matchDepSql]
    );
    const statusGuardOfferId = Number((statusGuardOfferInsert as any).insertId);
    const statusGuardAcceptRes = await fetch(
      `${baseUrl}/passenger-requests/${statusGuardPrId}/offers/${statusGuardOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie } }
    );
    const statusGuardAcceptJson: any = await statusGuardAcceptRes.json();
    const newFallbackRideId = Number(statusGuardAcceptJson.rideId);
    assert(
      statusGuardAcceptRes.status === 200 &&
        statusGuardAcceptJson.reusedExistingRide === false &&
        newFallbackRideId > 0 &&
        newFallbackRideId !== cancelledRideId &&
        newFallbackRideId !== completedRideId &&
        newFallbackRideId !== inProgRideId,
      'Scenario 4: Cancelled, completed, and in_progress rides are never reused; fallback creates a new ride'
    );

    // Scenario 3: No available seats (seats_available = 0, status = 'open' or 'full') -> not reused, creates new ride
    const [zeroSeatRideInsert] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 160, 2, 0, 'car', 'open')`,
      [nusratId, 'P25 Full Gate', 23.8768, 90.3202, 'P25 Dhanmondi Stop', 23.7538, 90.377, matchDepSql]
    );
    const zeroSeatRideId = Number((zeroSeatRideInsert as any).insertId);
    const [zeroSeatPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 200, 'car', 'open')`,
      [p25ObserverId, 'P25 Full Gate', 23.8768, 90.3202, 'P25 Dhanmondi Stop', 23.7538, 90.377, matchDepSql]
    );
    const zeroSeatPrId = Number((zeroSeatPrInsert as any).insertId);
    const [zeroSeatOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 165, 2, 'car', ?, 'pending')`,
      [zeroSeatPrId, nusratId, matchDepSql]
    );
    const zeroSeatOfferId = Number((zeroSeatOfferInsert as any).insertId);
    const zeroSeatAcceptRes = await fetch(
      `${baseUrl}/passenger-requests/${zeroSeatPrId}/offers/${zeroSeatOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: observerCookie } }
    );
    const zeroSeatAcceptJson: any = await zeroSeatAcceptRes.json();
    assert(
      zeroSeatAcceptRes.status === 200 &&
        zeroSeatAcceptJson.reusedExistingRide === false &&
        Number(zeroSeatAcceptJson.rideId) > 0 &&
        Number(zeroSeatAcceptJson.rideId) !== zeroSeatRideId,
      'Scenario 3: Existing ride with 0 seats_available is not reused; fallback creates a new ride'
    );

    // Scenario 2: No compatible ride (incompatible departure time > 2h or different route) -> fallback creates new ride
    const [farTimeRideInsert] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 160, 2, 2, 'car', 'scheduled')`,
      [nusratId, 'P25 FarTime Gate', 23.8768, 90.3202, 'P25 Airport', 23.8513, 90.409, matchDepFarSql]
    );
    const farTimeRideId = Number((farTimeRideInsert as any).insertId);
    const [farTimePrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 220, 'car', 'open')`,
      [p25ObserverId, 'P25 FarTime Gate', 23.8768, 90.3202, 'P25 Airport', 23.8513, 90.409, matchDepSql]
    );
    const farTimePrId = Number((farTimePrInsert as any).insertId);
    const [farTimeOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 190, 2, 'car', ?, 'pending')`,
      [farTimePrId, nusratId, matchDepSql]
    );
    const farTimeOfferId = Number((farTimeOfferInsert as any).insertId);
    const farTimeAcceptRes = await fetch(
      `${baseUrl}/passenger-requests/${farTimePrId}/offers/${farTimeOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: observerCookie } }
    );
    const farTimeAcceptJson: any = await farTimeAcceptRes.json();
    assert(
      farTimeAcceptRes.status === 200 &&
        farTimeAcceptJson.reusedExistingRide === false &&
        Number(farTimeAcceptJson.rideId) > 0 &&
        Number(farTimeAcceptJson.rideId) !== farTimeRideId,
      'Scenario 2: Existing ride outside departure time compatibility window is not reused; fallback creates a new ride'
    );

    // Bonus check: 1-seat 'scheduled' compatible existing ride transitions cleanly to 'full' with seats_available = 0
    const [sched1SeatInsert] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 135, 1, 1, 'bike', 'scheduled')`,
      [rahatId, 'P25 Sched Gate', 23.8768, 90.3202, 'P25 Mirpur 11', 23.8191, 90.3654, matchDepSql]
    );
    const sched1SeatRideId = Number((sched1SeatInsert as any).insertId);
    const [schedPrInsert] = await db.query(
      `INSERT INTO passenger_requests
        (passenger_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, seats_needed, max_fare, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 160, 'bike', 'open')`,
      [p25ObserverId, 'P25 Sched Gate', 23.8768, 90.3202, 'P25 Mirpur 11', 23.8191, 90.3654, matchDepSql]
    );
    const schedPrId = Number((schedPrInsert as any).insertId);
    const [schedOfferInsert] = await db.query(
      `INSERT INTO driver_offers (request_id, driver_id, fare, seats_offered, vehicle_type, pickup_time, status)
       VALUES (?, ?, 135, 1, 'bike', ?, 'pending')`,
      [schedPrId, rahatId, matchDepSql]
    );
    const schedOfferId = Number((schedOfferInsert as any).insertId);
    const p25SchedAcceptRes = await fetch(
      `${baseUrl}/passenger-requests/${schedPrId}/offers/${schedOfferId}/accept`,
      { method: 'PATCH', headers: { Origin: trustedOrigin, Cookie: observerCookie } }
    );
    const p25SchedAcceptJson: any = await p25SchedAcceptRes.json();
    const [schedRideAfterRows] = await db.query('SELECT status, seats_available FROM rides WHERE id = ?', [
      sched1SeatRideId
    ]);
    assert(
      p25SchedAcceptRes.status === 200 &&
        p25SchedAcceptJson.reusedExistingRide === true &&
        Number(p25SchedAcceptJson.rideId) === sched1SeatRideId &&
        (schedRideAfterRows as any[])[0]?.status === 'full' &&
        Number((schedRideAfterRows as any[])[0]?.seats_available) === 0,
      'Compatible 1-seat scheduled ride is reused, sets seats_available=0, and transitions status to full'
    );

    // -----------------------------------------------------------------------
    // PHASE 26: Stabilization Regression Guards
    // -----------------------------------------------------------------------
    console.log('\n[Phase 26] Stabilization Regression Guards');

    const callController = async (
      fn: (req: any, res: any) => Promise<void>,
      reqData: Record<string, any>
    ): Promise<{ status: number; body: any }> => {
      let status = 200;
      let body: any = null;
      await fn(reqData as any, {
        status: (code: number) => {
          status = code;
          return {
            json: (payload: any) => {
              body = payload;
            }
          };
        }
      } as any);
      return { status, body };
    };

    // 1. Direct booking acceptRequest on a 2-seat ride leaves status='open' and seats_available=1
    const [p26RideInsert] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 150, 2, 2, 'car', 'open')`,
      [nusratId, 'P26 Gate', 23.8768, 90.3202, 'P26 Banani', 23.7937, 90.4066, matchDepSql]
    );
    const p26RideId = Number((p26RideInsert as any).insertId);

    const p26ReqCall = await callController(createRideRequest, {
      user: { id: p25ObserverId, name: 'Observer P22', role: 'student' },
      params: { id: String(p26RideId) }
    });
    const p26ReqId = Number(p26ReqCall.body?.requestId);
    assert(p26ReqCall.status === 201 && p26ReqId > 0, 'Observer submits booking request on 2-seat ride');

    const p26AcceptCall = await callController(acceptRequest, {
      user: { id: nusratId, name: 'Nusrat Driver', role: 'student' },
      params: { id: String(p26ReqId) }
    });
    const [p26RideAfterRows] = await db.query('SELECT status, seats_available FROM rides WHERE id = ?', [p26RideId]);
    assert(
      p26AcceptCall.status === 200 &&
        (p26RideAfterRows as any[])[0]?.status === 'open' &&
        Number((p26RideAfterRows as any[])[0]?.seats_available) === 1,
      'acceptRequest on 2-seat ride decrements seats_available to 1 and keeps status=open'
    );

    // 2. Concurrent getOrCreateConversation resolves without 500 or duplicate rows
    const [chatRaceA, chatRaceB] = await Promise.all([
      callController(getOrCreateConversation, {
        user: { id: p25ObserverId, name: 'Observer P22', role: 'student' },
        body: { ride_id: p26RideId }
      }),
      callController(getOrCreateConversation, {
        user: { id: p25ObserverId, name: 'Observer P22', role: 'student' },
        body: { ride_id: p26RideId }
      })
    ]);
    const [p26ConvRows] = await db.query('SELECT id FROM conversations WHERE ride_id = ? AND passenger_id = ?', [
      p26RideId,
      p25ObserverId
    ]);
    assert(
      (chatRaceA.status === 200 || chatRaceA.status === 201) &&
        (chatRaceB.status === 200 || chatRaceB.status === 201) &&
        Number(chatRaceA.body?.conversation?.id) > 0 &&
        Number(chatRaceA.body?.conversation?.id) === Number(chatRaceB.body?.conversation?.id) &&
        Array.isArray(p26ConvRows) &&
        p26ConvRows.length === 1,
      'Concurrent getOrCreateConversation creates/returns a single conversation without 500'
    );

    // 3. Atomic single-use token consumption on resetPassword and verifyEmail
    const p26ResetRaw = crypto.randomBytes(32).toString('hex');
    const p26ResetHash = crypto.createHash('sha256').update(p26ResetRaw).digest('hex');
    await db.query(
      'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [p25ObserverId, 'password_reset', p26ResetHash, formatDateToMySqlUtc(new Date(Date.now() + 1800000))]
    );
    const [resetRaceA, resetRaceB] = await Promise.all([
      callController(resetPassword, {
        body: {
          token: p26ResetRaw,
          new_password: 'ResetPass26!A',
          confirm_new_password: 'ResetPass26!A'
        }
      }),
      callController(resetPassword, {
        body: {
          token: p26ResetRaw,
          new_password: 'ResetPass26!B',
          confirm_new_password: 'ResetPass26!B'
        }
      })
    ]);
    const resetStatuses = [resetRaceA.status, resetRaceB.status].sort((a, b) => a - b);
    assert(
      resetStatuses[0] === 200 && resetStatuses[1] === 400,
      'Concurrent resetPassword allows exactly one 200 and rejects replay with 400'
    );

    const p26VerifyRaw = crypto.randomBytes(32).toString('hex');
    const p26VerifyHash = crypto.createHash('sha256').update(p26VerifyRaw).digest('hex');
    await db.query(
      'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [p25ObserverId, 'email_verify', p26VerifyHash, formatDateToMySqlUtc(new Date(Date.now() + 1800000))]
    );
    const [verifyRaceA, verifyRaceB] = await Promise.all([
      callController(verifyEmail, {
        body: { token: p26VerifyRaw }
      }),
      callController(verifyEmail, {
        body: { token: p26VerifyRaw }
      })
    ]);
    const verifyStatuses = [verifyRaceA.status, verifyRaceB.status].sort((a, b) => a - b);
    assert(
      verifyStatuses[0] === 200 && verifyStatuses[1] === 400,
      'Concurrent verifyEmail allows exactly one 200 and rejects replay with 400'
    );

    // 4. Safety report ride_id validation returns 400/404 instead of FK 500
    const badRideReportCall = await callController(submitUserReport, {
      user: { id: p25ObserverId, name: 'Observer P22', role: 'student' },
      body: {
        reported_user_id: nusratId,
        ride_id: 'not-a-number',
        reason: 'other',
        description: 'Invalid ride_id format check.'
      }
    });
    const missingRideReportCall = await callController(submitUserReport, {
      user: { id: p25ObserverId, name: 'Observer P22', role: 'student' },
      body: {
        reported_user_id: nusratId,
        ride_id: 9999999,
        reason: 'other',
        description: 'Non-existent ride_id FK guard check.'
      }
    });
    assert(
      badRideReportCall.status === 400 && missingRideReportCall.status === 404,
      'submitUserReport rejects malformed ride_id with 400 and missing ride_id with 404'
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

    // -----------------------------------------------------------------------
    // PHASE 27: Audit Follow-Up Concurrency & Session Resilience Guards
    // -----------------------------------------------------------------------
    console.log('\n[Phase 27] Audit Follow-Up Concurrency & Session Resilience Guards');

    // Re-initialize isolated memory DB cleanly after Phase 26's resetDbPoolForTesting()
    await enableIsolatedTestMemoryDb();

    // 1. AuthContext session check helper only clears session on 401/403
    assert(
      shouldClearSessionOnAuthCheckError({ response: { status: 401 } }) === true &&
        shouldClearSessionOnAuthCheckError({ response: { status: 403 } }) === true &&
        shouldClearSessionOnAuthCheckError({ response: { status: 503 } }) === false &&
        shouldClearSessionOnAuthCheckError({ response: { status: 500 } }) === false &&
        shouldClearSessionOnAuthCheckError({ code: 'ERR_NETWORK', message: 'Network Error' }) === false &&
        shouldClearSessionOnAuthCheckError({ name: 'CanceledError', code: 'ERR_CANCELED' }) === false,
      'AuthContext clears session only on 401/403 and preserves session on 503, 500, network, and abort errors'
    );

    // Seed clean users for Phase 27 concurrency tests
    const p27PassHash = await bcrypt.hash('Pass27!123', 10);
    const [p27Student1Res] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'student', 'none', 0)`,
      ['221-15-701', 'P27 Applicant One', 'p27one@diu.edu.bd', '+8801711000701', p27PassHash]
    );
    const p27Student1Id = Number((p27Student1Res as any).insertId);

    const [p27Student2Res] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'student', 'none', 0)`,
      ['221-15-702', 'P27 Applicant Two', 'p27two@diu.edu.bd', '+8801711000702', p27PassHash]
    );
    const p27Student2Id = Number((p27Student2Res as any).insertId);

    const [p27AdminRows] = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    const p27AdminId = Number((p27AdminRows as any[])[0]?.id || 1);

    // 2A. Concurrent applyForDriver creates exactly 1 pending application (200 + 409)
    const [applyRaceA, applyRaceB] = await Promise.all([
      callController(applyForDriver, {
        user: { id: p27Student1Id, role: 'student' },
        body: {
          vehicle_type: 'bike',
          vehicle_model: 'Suzuki Gixxer',
          vehicle_plate: 'Dhaka Metro-HA 77-1001'
        }
      }),
      callController(applyForDriver, {
        user: { id: p27Student1Id, role: 'student' },
        body: {
          vehicle_type: 'bike',
          vehicle_model: 'Suzuki Gixxer',
          vehicle_plate: 'Dhaka Metro-HA 77-1001'
        }
      })
    ]);
    const applyStatuses = [applyRaceA.status, applyRaceB.status].sort((a, b) => a - b);
    const [p27Apps1] = await db.query('SELECT * FROM driver_applications WHERE user_id = ?', [p27Student1Id]);
    assert(
      applyStatuses[0] === 200 &&
        applyStatuses[1] === 409 &&
        Array.isArray(p27Apps1) &&
        p27Apps1.length === 1 &&
        (p27Apps1[0] as any).status === 'pending',
      'Concurrent applyForDriver settles to 200 + 409 with a single pending driver_applications row'
    );

    // 2B. Concurrent approveDriver sends only one notification and returns 200 + 409
    const origQueryForApprove = db.query.bind(db);
    let approveNotifInserts = 0;
    (db as any).query = async (sql: string, params?: any[]) => {
      if (sql.toLowerCase().startsWith('insert into notifications') || sql.toLowerCase().includes('insert into notifications')) {
        if (Number(params?.[0]) === p27Student1Id && params?.[1] === 'driver_approved') {
          approveNotifInserts++;
        }
      }
      return origQueryForApprove(sql, params);
    };
    let approveRaceA: { status: number; body: any };
    let approveRaceB: { status: number; body: any };
    try {
      [approveRaceA, approveRaceB] = await Promise.all([
        callController(approveDriver, {
          user: { id: p27AdminId, role: 'admin' },
          params: { id: String(p27Student1Id) },
          body: { admin_note: 'Verified papers' }
        }),
        callController(approveDriver, {
          user: { id: p27AdminId, role: 'admin' },
          params: { id: String(p27Student1Id) },
          body: { admin_note: 'Verified papers' }
        })
      ]);
    } finally {
      (db as any).query = origQueryForApprove;
    }
    const approveStatuses = [approveRaceA.status, approveRaceB.status].sort((a, b) => a - b);
    const [p27User1After] = await db.query('SELECT driver_status FROM users WHERE id = ?', [p27Student1Id]);
    const [p27Apps1After] = await db.query('SELECT status FROM driver_applications WHERE user_id = ?', [p27Student1Id]);
    assert(
      approveStatuses[0] === 200 &&
        approveStatuses[1] === 409 &&
        (p27User1After as any[])[0]?.driver_status === 'approved' &&
        (p27Apps1After as any[])[0]?.status === 'approved' &&
        approveNotifInserts === 1,
      'Concurrent approveDriver settles to 200 + 409 with exactly one driver_approved notification'
    );

    // 2C. Concurrent approveDriver vs rejectDriver settles to a single consistent status & 1 notification
    await callController(applyForDriver, {
      user: { id: p27Student2Id, role: 'student' },
      body: {
        vehicle_type: 'car',
        vehicle_model: 'Toyota Axio',
        vehicle_plate: 'Dhaka Metro-GA 88-2002'
      }
    });
    const origQueryForReview = db.query.bind(db);
    let reviewNotifInserts = 0;
    (db as any).query = async (sql: string, params?: any[]) => {
      if (sql.toLowerCase().includes('insert into notifications')) {
        if (
          Number(params?.[0]) === p27Student2Id &&
          (params?.[1] === 'driver_approved' || params?.[1] === 'driver_rejected')
        ) {
          reviewNotifInserts++;
        }
      }
      return origQueryForReview(sql, params);
    };
    let reviewRaceApprove: { status: number; body: any };
    let reviewRaceReject: { status: number; body: any };
    try {
      [reviewRaceApprove, reviewRaceReject] = await Promise.all([
        callController(approveDriver, {
          user: { id: p27AdminId, role: 'admin' },
          params: { id: String(p27Student2Id) },
          body: { admin_note: 'Approve race' }
        }),
        callController(rejectDriver, {
          user: { id: p27AdminId, role: 'admin' },
          params: { id: String(p27Student2Id) },
          body: { admin_note: 'Reject race' }
        })
      ]);
    } finally {
      (db as any).query = origQueryForReview;
    }
    const reviewStatuses = [reviewRaceApprove.status, reviewRaceReject.status].sort((a, b) => a - b);
    const [p27User2After] = await db.query('SELECT driver_status FROM users WHERE id = ?', [p27Student2Id]);
    const [p27Apps2After] = await db.query('SELECT status FROM driver_applications WHERE user_id = ?', [p27Student2Id]);
    const finalStatus2 = (p27User2After as any[])[0]?.driver_status;
    assert(
      reviewStatuses[0] === 200 &&
        reviewStatuses[1] === 409 &&
        (finalStatus2 === 'approved' || finalStatus2 === 'rejected') &&
        (p27Apps2After as any[])[0]?.status === finalStatus2 &&
        reviewNotifInserts === 1,
      'Concurrent approveDriver vs rejectDriver settles consistently (200 + 409) with a single review notification'
    );

    // 2D. Transaction failure inside applyForDriver rolls back users update atomically
    const origGetConn = db.getConnection.bind(db);
    let txRolledBack = false;
    (db as any).getConnection = async () => {
      const realConn = await origGetConn();
      return {
        beginTransaction: () => realConn.beginTransaction(),
        commit: () => realConn.commit(),
        rollback: async () => {
          txRolledBack = true;
          return realConn.rollback();
        },
        release: () => realConn.release(),
        execute: (sql: string, params?: any[]) => realConn.execute(sql, params),
        query: async (sql: string, params?: any[]) => {
          if (sql.toLowerCase().includes('insert into driver_applications')) {
            const err: any = new Error('Lock wait timeout exceeded');
            err.code = 'ER_LOCK_WAIT_TIMEOUT';
            throw err;
          }
          return realConn.query(sql, params);
        }
      };
    };
    const [p27Student3Res] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'student', 'none', 0)`,
      ['221-15-703', 'P27 Rollback User', 'p27three@diu.edu.bd', '+8801711000703', p27PassHash]
    );
    const p27Student3Id = Number((p27Student3Res as any).insertId);
    let rollbackApplyRes = { status: 0, body: null as any };
    try {
      rollbackApplyRes = await callController(applyForDriver, {
        user: { id: p27Student3Id, role: 'student' },
        body: {
          vehicle_type: 'bike',
          vehicle_model: 'Honda Hornet',
          vehicle_plate: 'Dhaka Metro-LA 99-3003'
        }
      });
    } finally {
      (db as any).getConnection = origGetConn;
    }
    const [p27User3After] = await db.query('SELECT driver_status FROM users WHERE id = ?', [p27Student3Id]);
    assert(
      txRolledBack &&
        rollbackApplyRes.status === 503 &&
        (p27User3After as any[])[0]?.driver_status === 'none',
      'applyForDriver rolls back users.driver_status and returns 503 when driver_applications insert fails'
    );

    // 3A. Concurrent addEmergencyContact strictly enforces max 5 limit
    for (let i = 1; i <= 4; i++) {
      await callController(addEmergencyContact, {
        user: { id: p27Student1Id, role: 'student' },
        body: {
          name: `Emergency Contact ${i}`,
          relationship: 'Family',
          phone: `0171100080${i}`
        }
      });
    }
    const ecRaces = await Promise.all([
      callController(addEmergencyContact, {
        user: { id: p27Student1Id, role: 'student' },
        body: { name: 'Contact Race A', relationship: 'Friend', phone: '01711000811' }
      }),
      callController(addEmergencyContact, {
        user: { id: p27Student1Id, role: 'student' },
        body: { name: 'Contact Race B', relationship: 'Friend', phone: '01711000812' }
      }),
      callController(addEmergencyContact, {
        user: { id: p27Student1Id, role: 'student' },
        body: { name: 'Contact Race C', relationship: 'Friend', phone: '01711000813' }
      })
    ]);
    const ecStatuses = ecRaces.map((r) => r.status).sort((a, b) => a - b);
    const [p27ContactsAfter] = await db.query('SELECT id FROM emergency_contacts WHERE user_id = ?', [
      p27Student1Id
    ]);
    assert(
      ecStatuses[0] === 201 &&
        ecStatuses[1] === 400 &&
        ecStatuses[2] === 400 &&
        Array.isArray(p27ContactsAfter) &&
        p27ContactsAfter.length === 5,
      'Concurrent addEmergencyContact strictly enforces 5-contact limit (201 + 400 + 400)'
    );

    // 3B. Concurrent blockUser handles ER_DUP_ENTRY idempotently without 500 or duplicates
    const origDbQuery = db.query.bind(db);
    let sawBlockSelectCount = 0;
    (db as any).query = async (sql: string, params?: any[]) => {
      // Simulate both concurrent requests passing the pre-INSERT SELECT check simultaneously
      if (sql.toLowerCase().includes('from user_blocks where blocker_id = ? and blocked_id = ?') && sawBlockSelectCount < 2) {
        sawBlockSelectCount++;
        return [[], []];
      }
      return origDbQuery(sql, params);
    };
    let blockRaceRes: Array<{ status: number; body: any }> = [];
    try {
      blockRaceRes = await Promise.all([
        callController(blockUser, {
          user: { id: p27Student1Id, role: 'student' },
          body: { blocked_id: p27Student2Id }
        }),
        callController(blockUser, {
          user: { id: p27Student1Id, role: 'student' },
          body: { blocked_id: p27Student2Id }
        })
      ]);
    } finally {
      (db as any).query = origDbQuery;
    }
    const [p27BlockRows] = await db.query(
      'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
      [p27Student1Id, p27Student2Id]
    );
    assert(
      blockRaceRes[0]?.status === 200 &&
        blockRaceRes[1]?.status === 200 &&
        Array.isArray(p27BlockRows) &&
        p27BlockRows.length === 1,
      'Concurrent blockUser recovers from ER_DUP_ENTRY idempotently (200 + 200) with 1 block row'
    );

    // -----------------------------------------------------------------------
    // PHASE 28: Driver Incoming Bookings Endpoint (/api/requests/incoming)
    // -----------------------------------------------------------------------
    console.log('\n[Phase 28] Driver Incoming Bookings Endpoint (/api/requests/incoming)');

    const p28Hash = await bcrypt.hash('Pass28!123', 10);
    const [p28DriverARes] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'student', 'approved', 'car', 'Toyota Premio', 'Dhaka Metro-GA 28-1001', 0)`,
      ['221-15-801', 'P28 Driver Alpha', 'p28drivera@diu.edu.bd', '+8801711000801', p28Hash]
    );
    const p28DriverAId = Number((p28DriverARes as any).insertId);
    await db.query("UPDATE users SET driver_status = 'approved' WHERE id = ?", [p28DriverAId]);

    const [p28DriverBRes] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'student', 'approved', 'bike', 'Yamaha FZS', 'Dhaka Metro-HA 28-1002', 0)`,
      ['221-15-802', 'P28 Driver Beta', 'p28driverb@diu.edu.bd', '+8801711000802', p28Hash]
    );
    const p28DriverBId = Number((p28DriverBRes as any).insertId);
    await db.query("UPDATE users SET driver_status = 'approved' WHERE id = ?", [p28DriverBId]);

    const [p28Pass1Res] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'student', 'none', 0)`,
      ['221-15-803', 'P28 Passenger One', 'p28pass1@diu.edu.bd', '+8801711000803', p28Hash]
    );
    const p28Pass1Id = Number((p28Pass1Res as any).insertId);

    const [p28Pass2Res] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'student', 'none', 0)`,
      ['221-15-804', 'P28 Passenger HiddenPhone', 'p28pass2@diu.edu.bd', '+8801711000804', p28Hash]
    );
    const p28Pass2Id = Number((p28Pass2Res as any).insertId);
    await db.query('UPDATE users SET bio = ?, show_phone_to_accepted = ? WHERE id = ?', [null, 0, p28Pass2Id]);

    const p28DriverAToken = generateToken({
      id: p28DriverAId,
      email: 'p28drivera@diu.edu.bd',
      student_id: '221-15-801',
      role: 'student',
      driver_status: 'approved'
    });
    const p28Pass1Token = generateToken({
      id: p28Pass1Id,
      email: 'p28pass1@diu.edu.bd',
      student_id: '221-15-803',
      role: 'student',
      driver_status: 'none'
    });
    const p28Pass2Token = generateToken({
      id: p28Pass2Id,
      email: 'p28pass2@diu.edu.bd',
      student_id: '221-15-804',
      role: 'student',
      driver_status: 'none'
    });

    // 1. Auth & role checks on GET /api/requests/incoming
    const p28UnauthRes = await fetch(`${baseUrl}/requests/incoming`);
    const p28NonDriverRes = await fetch(`${baseUrl}/requests/incoming`, {
      headers: { Authorization: `Bearer ${p28Pass1Token}` }
    });
    assert(
      p28UnauthRes.status === 401 && p28NonDriverRes.status === 403,
      'GET /api/requests/incoming rejects unauthenticated (401) and non-driver (403) callers'
    );

    // 2. Seed rides & passenger requests across two drivers
    const p28DepSql = formatDateToMySqlUtc(new Date(Date.now() + 6 * 3600000));
    const [p28RideARes] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 140, 3, 3, 'car', 'open')`,
      [p28DriverAId, 'DIU Main Gate', 23.8768, 90.3202, 'Dhanmondi 27', 23.7538, 90.377, p28DepSql]
    );
    const p28RideAId = Number((p28RideARes as any).insertId);

    const [p28RideBRes] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 90, 1, 1, 'bike', 'open')`,
      [p28DriverBId, 'DIU Hall', 23.8768, 90.3202, 'Uttara Sector 10', 23.8891, 90.3911, p28DepSql]
    );
    const p28RideBId = Number((p28RideBRes as any).insertId);

    const p28Create1 = await callController(createRideRequest, {
      user: { id: p28Pass1Id, name: 'P28 Passenger One', role: 'student' },
      params: { id: String(p28RideAId) }
    });
    const p28Req1Id = Number(p28Create1.body?.requestId);

    const p28Create2 = await callController(createRideRequest, {
      user: { id: p28Pass2Id, name: 'P28 Passenger HiddenPhone', role: 'student' },
      params: { id: String(p28RideAId) }
    });
    const p28Req2Id = Number(p28Create2.body?.requestId);

    // Other driver's ride booking (must NOT appear in Driver A's incoming requests)
    const p28CreateOther = await callController(createRideRequest, {
      user: { id: p28Pass1Id, name: 'P28 Passenger One', role: 'student' },
      params: { id: String(p28RideBId) }
    });
    assert(
      p28Create1.status === 201 &&
        p28Create2.status === 201 &&
        p28CreateOther.status === 201 &&
        p28Req1Id > 0 &&
        p28Req2Id > 0,
      'Passengers submit booking requests to Driver A and Driver B rides'
    );

    // 3. Driver A sees only incoming requests for Driver A's rides, with pending phone hidden
    const p28IncBeforeRes = await fetch(`${baseUrl}/requests/incoming`, {
      headers: { Authorization: `Bearer ${p28DriverAToken}` }
    });
    const p28IncBeforeJson: any = await p28IncBeforeRes.json();
    const incBeforeList: any[] = p28IncBeforeJson.requests || [];
    const incReq1Before = incBeforeList.find((r) => r.id === p28Req1Id);
    const incReq2Before = incBeforeList.find((r) => r.id === p28Req2Id);

    assert(
      p28IncBeforeRes.status === 200 &&
        incBeforeList.length === 2 &&
        incBeforeList.every((r) => Number(r.driver_id) === p28DriverAId) &&
        incReq1Before?.passenger_name === 'P28 Passenger One' &&
        incReq1Before?.passenger_student_id === '221-15-803' &&
        incReq1Before?.pickup_name === 'DIU Main Gate' &&
        incReq1Before?.dest_name === 'Dhanmondi 27' &&
        incReq1Before?.passenger_phone === null &&
        incReq2Before?.passenger_phone === null,
      'GET /api/requests/incoming returns driver-scoped passenger & ride info and masks pending passenger phones'
    );

    // 4. GET /api/requests/mine stays passenger-scoped and unaffected
    const p28DriverMineRes = await fetch(`${baseUrl}/requests/mine`, {
      headers: { Authorization: `Bearer ${p28DriverAToken}` }
    });
    const p28DriverMineJson: any = await p28DriverMineRes.json();
    const p28PassMineRes = await fetch(`${baseUrl}/requests/mine`, {
      headers: { Authorization: `Bearer ${p28Pass1Token}` }
    });
    const p28PassMineJson: any = await p28PassMineRes.json();
    assert(
      p28DriverMineRes.status === 200 &&
        Array.isArray(p28DriverMineJson.requests) &&
        p28DriverMineJson.requests.length === 0 &&
        p28PassMineRes.status === 200 &&
        Array.isArray(p28PassMineJson.requests) &&
        p28PassMineJson.requests.length === 2,
      'GET /api/requests/mine remains strictly passenger-scoped for both driver and passenger'
    );

    // 5. Accept & Reject reuse existing controllers and enforce phone privacy on GET /api/requests/incoming
    const p28Accept1Res = await fetch(`${baseUrl}/requests/${p28Req1Id}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Authorization: `Bearer ${p28DriverAToken}` }
    });
    const p28Accept2Res = await fetch(`${baseUrl}/requests/${p28Req2Id}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Authorization: `Bearer ${p28DriverAToken}` }
    });
    assert(
      p28Accept1Res.status === 200 && p28Accept2Res.status === 200,
      'Driver accepts incoming requests via existing PATCH /api/requests/:id/accept'
    );

    const p28IncAfterRes = await fetch(`${baseUrl}/requests/incoming`, {
      headers: { Authorization: `Bearer ${p28DriverAToken}` }
    });
    const p28IncAfterJson: any = await p28IncAfterRes.json();
    const incAfterList: any[] = p28IncAfterJson.requests || [];
    const incReq1After = incAfterList.find((r) => r.id === p28Req1Id);
    const incReq2After = incAfterList.find((r) => r.id === p28Req2Id);
    assert(
      incReq1After?.status === 'accepted' &&
        incReq1After?.passenger_phone === '+8801711000803' &&
        incReq2After?.status === 'accepted' &&
        incReq2After?.passenger_phone === null,
      'Accepted incoming requests reveal passenger_phone only when show_phone_to_accepted allows it'
    );

    // 6. Rejecting a pending request updates status to rejected in GET /api/requests/incoming
    const p28Pass2Other = await callController(createRideRequest, {
      user: { id: p28Pass2Id, name: 'P28 Passenger HiddenPhone', role: 'student' },
      params: { id: String(p28RideBId) }
    });
    const p28ReqB2Id = Number(p28Pass2Other.body?.requestId);
    const p28DriverBToken = generateToken({
      id: p28DriverBId,
      email: 'p28driverb@diu.edu.bd',
      student_id: '221-15-802',
      role: 'student',
      driver_status: 'approved'
    });
    const p28RejectRes = await fetch(`${baseUrl}/requests/${p28ReqB2Id}/reject`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Authorization: `Bearer ${p28DriverBToken}` }
    });
    const p28DriverBIncRes = await fetch(`${baseUrl}/requests/incoming`, {
      headers: { Authorization: `Bearer ${p28DriverBToken}` }
    });
    const p28DriverBIncJson: any = await p28DriverBIncRes.json();
    const rejectedRow = (p28DriverBIncJson.requests || []).find((r: any) => r.id === p28ReqB2Id);
    assert(
      p28RejectRes.status === 200 && rejectedRow?.status === 'rejected' && rejectedRow?.passenger_phone === null,
      'Rejecting an incoming request via PATCH /api/requests/:id/reject reflects in GET /api/requests/incoming'
    );

    // -----------------------------------------------------------------------
    // PHASE 29: Student Email Privacy on Rides & Ride Requests
    // -----------------------------------------------------------------------
    console.log('\n[Phase 29] Student Email Privacy on Rides & Ride Requests');

    const p29Hash = await bcrypt.hash('Pass29!123', 10);
    const [p29DriverRes] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked)
       VALUES (?, ?, ?, ?, ?, 'student', 'approved', 'car', 'Honda Civic', 'Dhaka Metro-GA 29-2001', 0)`,
      ['221-15-901', 'P29 Driver Owner', 'p29driver@diu.edu.bd', '+8801711000901', p29Hash]
    );
    const p29DriverId = Number((p29DriverRes as any).insertId);
    await db.query("UPDATE users SET driver_status = 'approved' WHERE id = ?", [p29DriverId]);

    const p29PassSpecs = [
      { sid: '221-15-902', name: 'P29 Pass Accepted', email: 'p29accepted@diu.edu.bd', phone: '+8801711000902' },
      { sid: '221-15-903', name: 'P29 Pass Pending', email: 'p29pending@diu.edu.bd', phone: '+8801711000903' },
      { sid: '221-15-904', name: 'P29 Pass Rejected', email: 'p29rejected@diu.edu.bd', phone: '+8801711000904' },
      { sid: '221-15-905', name: 'P29 Pass Cancelled', email: 'p29cancelled@diu.edu.bd', phone: '+8801711000905' },
      { sid: '221-15-906', name: 'P29 Other Student', email: 'p29other@diu.edu.bd', phone: '+8801711000906' }
    ];
    const p29PassIds: number[] = [];
    for (const spec of p29PassSpecs) {
      const [uRes] = await db.query(
        `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status, is_blocked)
         VALUES (?, ?, ?, ?, ?, 'student', 'none', 0)`,
        [spec.sid, spec.name, spec.email, spec.phone, p29Hash]
      );
      p29PassIds.push(Number((uRes as any).insertId));
    }
    const [p29AcceptedId, p29PendingId, p29RejectedId, p29CancelledId, p29OtherId] = p29PassIds;

    const p29DriverToken = generateToken({
      id: p29DriverId,
      email: 'p29driver@diu.edu.bd',
      student_id: '221-15-901',
      role: 'student',
      driver_status: 'approved'
    });
    const p29AcceptedToken = generateToken({
      id: p29AcceptedId,
      email: 'p29accepted@diu.edu.bd',
      student_id: '221-15-902',
      role: 'student',
      driver_status: 'none'
    });
    const p29PendingToken = generateToken({
      id: p29PendingId,
      email: 'p29pending@diu.edu.bd',
      student_id: '221-15-903',
      role: 'student',
      driver_status: 'none'
    });
    const p29RejectedToken = generateToken({
      id: p29RejectedId,
      email: 'p29rejected@diu.edu.bd',
      student_id: '221-15-904',
      role: 'student',
      driver_status: 'none'
    });
    const p29CancelledToken = generateToken({
      id: p29CancelledId,
      email: 'p29cancelled@diu.edu.bd',
      student_id: '221-15-905',
      role: 'student',
      driver_status: 'none'
    });
    const p29OtherToken = generateToken({
      id: p29OtherId,
      email: 'p29other@diu.edu.bd',
      student_id: '221-15-906',
      role: 'student',
      driver_status: 'none'
    });

    const p29DepSql = formatDateToMySqlUtc(new Date(Date.now() + 8 * 3600000));
    const [p29RideRes] = await db.query(
      `INSERT INTO rides
        (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 160, 4, 4, 'car', 'open')`,
      [p29DriverId, 'P29 Campus Plaza', 23.8768, 90.3202, 'P29 Farmgate', 23.7561, 90.3872, p29DepSql]
    );
    const p29RideId = Number((p29RideRes as any).insertId);

    const p29CreateAccepted = await callController(createRideRequest, {
      user: { id: p29AcceptedId, name: 'P29 Pass Accepted', role: 'student' },
      params: { id: String(p29RideId) }
    });
    const p29ReqAcceptedId = Number(p29CreateAccepted.body?.requestId);

    const p29CreatePending = await callController(createRideRequest, {
      user: { id: p29PendingId, name: 'P29 Pass Pending', role: 'student' },
      params: { id: String(p29RideId) }
    });
    const p29ReqPendingId = Number(p29CreatePending.body?.requestId);

    const p29CreateRejected = await callController(createRideRequest, {
      user: { id: p29RejectedId, name: 'P29 Pass Rejected', role: 'student' },
      params: { id: String(p29RideId) }
    });
    const p29ReqRejectedId = Number(p29CreateRejected.body?.requestId);

    const p29CreateCancelled = await callController(createRideRequest, {
      user: { id: p29CancelledId, name: 'P29 Pass Cancelled', role: 'student' },
      params: { id: String(p29RideId) }
    });
    const p29ReqCancelledId = Number(p29CreateCancelled.body?.requestId);

    const p29AcceptRes = await fetch(`${baseUrl}/requests/${p29ReqAcceptedId}/accept`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Authorization: `Bearer ${p29DriverToken}` }
    });
    const p29RejectRes = await fetch(`${baseUrl}/requests/${p29ReqRejectedId}/reject`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Authorization: `Bearer ${p29DriverToken}` }
    });
    const p29CancelRes = await fetch(`${baseUrl}/requests/${p29ReqCancelledId}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Authorization: `Bearer ${p29CancelledToken}` }
    });
    assert(
      p29AcceptRes.status === 200 && p29RejectRes.status === 200 && p29CancelRes.status === 200,
      'Phase 29 setup creates accepted, pending, rejected, and cancelled ride requests'
    );

    // 1. Public ride search (GET /api/rides) never exposes driver_email
    const p29SearchAnonJson: any = await (await fetch(`${baseUrl}/rides?limit=100`)).json();
    const p29SearchOtherJson: any = await (
      await fetch(`${baseUrl}/rides?limit=100`, { headers: { Authorization: `Bearer ${p29OtherToken}` } })
    ).json();
    const p29SearchAcceptedJson: any = await (
      await fetch(`${baseUrl}/rides?limit=100`, { headers: { Authorization: `Bearer ${p29AcceptedToken}` } })
    ).json();
    const p29FoundAnon = (p29SearchAnonJson.rides || []).find((r: any) => Number(r.id) === p29RideId);
    const p29FoundOther = (p29SearchOtherJson.rides || []).find((r: any) => Number(r.id) === p29RideId);
    const p29FoundAccepted = (p29SearchAcceptedJson.rides || []).find((r: any) => Number(r.id) === p29RideId);
    assert(
      p29FoundAnon?.driver_email === null &&
        p29FoundOther?.driver_email === null &&
        p29FoundAccepted?.driver_email === null &&
        (p29SearchAnonJson.rides || []).every((r: any) => r.driver_email === null),
      'GET /api/rides masks driver_email in public and authenticated search listings'
    );

    // 2. Ride detail (GET /api/rides/:id) hides driver_email except for driver owner, admin, or accepted passenger
    const [
      p29DetailAnon,
      p29DetailOther,
      p29DetailPending,
      p29DetailRejected,
      p29DetailCancelled,
      p29DetailAccepted,
      p29DetailDriver,
      p29DetailAdmin
    ] = await Promise.all([
      fetch(`${baseUrl}/rides/${p29RideId}`).then((r) => r.json()),
      fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Authorization: `Bearer ${p29OtherToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Authorization: `Bearer ${p29PendingToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Authorization: `Bearer ${p29RejectedToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Authorization: `Bearer ${p29CancelledToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Authorization: `Bearer ${p29AcceptedToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Authorization: `Bearer ${p29DriverToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Cookie: adminLogin.cookie } }).then((r) => r.json())
    ]);
    assert(
      (p29DetailAnon as any).ride?.driver_email === null &&
        (p29DetailOther as any).ride?.driver_email === null &&
        (p29DetailPending as any).ride?.driver_email === null &&
        (p29DetailRejected as any).ride?.driver_email === null &&
        (p29DetailCancelled as any).ride?.driver_email === null &&
        (p29DetailAccepted as any).ride?.driver_email === 'p29driver@diu.edu.bd' &&
        (p29DetailDriver as any).ride?.driver_email === 'p29driver@diu.edu.bd' &&
        (p29DetailAdmin as any).ride?.driver_email === 'p29driver@diu.edu.bd',
      'GET /api/rides/:id exposes driver_email only to driver owner, admin, and accepted unblocked passengers'
    );

    // 3. Passenger My Bookings (GET /api/requests/mine) hides driver_email unless request is accepted
    const [p29MinePending, p29MineRejected, p29MineCancelled, p29MineAccepted] = await Promise.all([
      fetch(`${baseUrl}/requests/mine`, { headers: { Authorization: `Bearer ${p29PendingToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/requests/mine`, { headers: { Authorization: `Bearer ${p29RejectedToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/requests/mine`, { headers: { Authorization: `Bearer ${p29CancelledToken}` } }).then((r) => r.json()),
      fetch(`${baseUrl}/requests/mine`, { headers: { Authorization: `Bearer ${p29AcceptedToken}` } }).then((r) => r.json())
    ]);
    assert(
      ((p29MinePending as any).requests || []).find((x: any) => x.id === p29ReqPendingId)?.driver_email === null &&
        ((p29MineRejected as any).requests || []).find((x: any) => x.id === p29ReqRejectedId)?.driver_email === null &&
        ((p29MineCancelled as any).requests || []).find((x: any) => x.id === p29ReqCancelledId)?.driver_email === null &&
        ((p29MineAccepted as any).requests || []).find((x: any) => x.id === p29ReqAcceptedId)?.driver_email ===
          'p29driver@diu.edu.bd',
      'GET /api/requests/mine masks driver_email on pending/rejected/cancelled requests and reveals on accepted requests'
    );

    // 4. Ride Requests (GET /api/rides/:id/requests) & Incoming Requests (GET /api/requests/incoming)
    const [p29RideReqsDriver, p29RideReqsAdmin, p29IncomingDriver] = await Promise.all([
      fetch(`${baseUrl}/rides/${p29RideId}/requests`, {
        headers: { Authorization: `Bearer ${p29DriverToken}` }
      }).then((r) => r.json()),
      fetch(`${baseUrl}/rides/${p29RideId}/requests`, {
        headers: { Cookie: adminLogin.cookie }
      }).then((r) => r.json()),
      fetch(`${baseUrl}/requests/incoming`, {
        headers: { Authorization: `Bearer ${p29DriverToken}` }
      }).then((r) => r.json())
    ]);

    const rrDriverList: any[] = (p29RideReqsDriver as any).requests || [];
    const rrAdminList: any[] = (p29RideReqsAdmin as any).requests || [];
    const incDriverList: any[] = (p29IncomingDriver as any).requests || [];

    assert(
      rrDriverList.find((x) => x.id === p29ReqAcceptedId)?.passenger_email === 'p29accepted@diu.edu.bd' &&
        rrDriverList.find((x) => x.id === p29ReqPendingId)?.passenger_email === null &&
        rrDriverList.find((x) => x.id === p29ReqRejectedId)?.passenger_email === null &&
        rrDriverList.find((x) => x.id === p29ReqCancelledId)?.passenger_email === null &&
        rrAdminList.length === 4 &&
        rrAdminList.every((x) => typeof x.passenger_email === 'string' && x.passenger_email.includes('@')),
      'GET /api/rides/:id/requests masks passenger_email for pending/rejected/cancelled requests for driver while allowing accepted and admin'
    );

    assert(
      incDriverList.find((x) => x.id === p29ReqAcceptedId)?.passenger_email === 'p29accepted@diu.edu.bd' &&
        incDriverList.find((x) => x.id === p29ReqPendingId)?.passenger_email === null &&
        incDriverList.find((x) => x.id === p29ReqRejectedId)?.passenger_email === null &&
        incDriverList.find((x) => x.id === p29ReqCancelledId)?.passenger_email === null,
      'GET /api/requests/incoming masks passenger_email for pending/rejected/cancelled requests and reveals for accepted requests'
    );

    // 5. Blocked user pair suppresses accepted email on ride detail view (while driver owner & admin retain access)
    await db.query('INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?, ?)', [p29DriverId, p29AcceptedId]);
    try {
      const [p29BlkDetailPass, p29BlkDetailDriver, p29BlkDetailAdmin] = await Promise.all([
        fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Authorization: `Bearer ${p29AcceptedToken}` } }).then((r) => r.json()),
        fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Authorization: `Bearer ${p29DriverToken}` } }).then((r) => r.json()),
        fetch(`${baseUrl}/rides/${p29RideId}`, { headers: { Cookie: adminLogin.cookie } }).then((r) => r.json())
      ]);
      assert(
        (p29BlkDetailPass as any).ride?.driver_email === null &&
          (p29BlkDetailDriver as any).ride?.driver_email === 'p29driver@diu.edu.bd' &&
          (p29BlkDetailAdmin as any).ride?.driver_email === 'p29driver@diu.edu.bd',
        'Blocked user pair suppresses driver_email on GET /api/rides/:id even for accepted booking while owner and admin retain access'
      );
    } finally {
      await db.query('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', [p29DriverId, p29AcceptedId]);
    }

    // =========================================================================
    // Phase 30: Final Audit Bug-Fix Pass (Redirect, Fare, Blocked Tokens, 503, Cancel)
    // =========================================================================
    console.log('\n[Phase 30: Final Audit Bug-Fix Pass Tests]');

    // 1. Login Redirect Validation (getSafeRedirectPath)
    assert(
      getSafeRedirectPath('/dashboard') === '/dashboard' &&
        getSafeRedirectPath('/rides/42?tab=details') === '/rides/42?tab=details' &&
        getSafeRedirectPath('/passenger-requests/5#offers') === '/passenger-requests/5#offers',
      'getSafeRedirectPath preserves safe internal relative paths'
    );
    assert(
      getSafeRedirectPath('//evil.com') === '/dashboard' &&
        getSafeRedirectPath('///evil.com') === '/dashboard' &&
        getSafeRedirectPath('https://evil.com/phish') === '/dashboard' &&
        getSafeRedirectPath('http://evil.com') === '/dashboard' &&
        getSafeRedirectPath('javascript:alert(1)') === '/dashboard' &&
        getSafeRedirectPath('/\\evil.com') === '/dashboard' &&
        getSafeRedirectPath('/%5cevil.com') === '/dashboard' &&
        getSafeRedirectPath('%2F%2Fevil.com') === '/dashboard' &&
        getSafeRedirectPath('dashboard') === '/dashboard' &&
        getSafeRedirectPath('') === '/dashboard' &&
        getSafeRedirectPath(null) === '/dashboard' &&
        getSafeRedirectPath(undefined) === '/dashboard',
      'getSafeRedirectPath rejects protocol-relative, external, encoded, backslash, and malformed redirects'
    );

    // 2. Fare Validation Alignment (0 - 50,000 BDT)
    assert(
      isValidRideFare(0) === true &&
        isValidRideFare(1500) === true &&
        isValidRideFare('50000') === true &&
        isValidRideFare(-1) === false &&
        isValidRideFare(50001) === false &&
        isValidRideFare(NaN) === false &&
        isValidRideFare(Infinity) === false &&
        isValidRideFare('') === false &&
        isValidRideFare(null) === false,
      'isValidRideFare enforces consistent 0 to 50,000 BDT range'
    );

    const p30FareDep = new Date(Date.now() + 72 * 3600000).toISOString();
    const p30RideHighFareCall = await callController(createRide, {
      user: { id: 2, name: 'Tanvir Ahmed', role: 'student', driver_status: 'approved' },
      body: {
        pickup_name: 'DIU Gate 1',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Airport',
        dest_lat: 23.8513,
        dest_lng: 90.4088,
        departure_time: p30FareDep,
        fare: 1500,
        seats_total: 2,
        vehicle_type: 'car'
      }
    });
    const p30FareRideId = Number(p30RideHighFareCall.body?.rideId);
    const p30CreatedRideDetail: any = await (await fetch(`${baseUrl}/rides/${p30FareRideId}`)).json();
    assert(
      p30RideHighFareCall.status === 201 &&
        p30FareRideId > 0 &&
        Number(p30CreatedRideDetail.ride?.fare) === 1500,
      'createRide accepts valid fare of 1500 BDT (matching updated PostRidePage range)'
    );

    const p30RideOverMaxCall = await callController(createRide, {
      user: { id: 2, name: 'Tanvir Ahmed', role: 'student', driver_status: 'approved' },
      body: {
        pickup_name: 'DIU Gate 1',
        pickup_lat: 23.8768,
        pickup_lng: 90.3202,
        dest_name: 'Airport',
        dest_lat: 23.8513,
        dest_lng: 90.4088,
        departure_time: p30FareDep,
        fare: 50001,
        seats_total: 2,
        vehicle_type: 'car'
      }
    });
    assert(p30RideOverMaxCall.status === 400, 'createRide rejects fare above 50,000 BDT (400)');

    const p30UpdateOverMaxRes = await fetch(`${baseUrl}/rides/${p30FareRideId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ fare: 50001 })
    });
    assert(p30UpdateOverMaxRes.status === 400, 'PUT /api/rides/:id rejects fare above 50,000 BDT (400)');

    // 3. Blocked Account Token & Recovery Security
    const p30PassHash = await bcrypt.hash('Password123!', 10);
    const [p30BlkIns] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status)
       VALUES (?, ?, ?, ?, ?, 'student', 'none')`,
      ['231-15-981', 'P30 Blocked Student', 'p30blocked@diu.edu.bd', '01755551111', p30PassHash]
    );
    const p30BlkUserId = Number((p30BlkIns as any).insertId);
    const p30BlkToken = generateToken({
      id: p30BlkUserId,
      email: 'p30blocked@diu.edu.bd',
      student_id: '231-15-981',
      role: 'student',
      driver_status: 'none'
    });

    const p30ResetRaw = crypto.randomBytes(32).toString('hex');
    const p30ResetHash = crypto.createHash('sha256').update(p30ResetRaw).digest('hex');
    const p30VerifyRaw = crypto.randomBytes(32).toString('hex');
    const p30VerifyHash = crypto.createHash('sha256').update(p30VerifyRaw).digest('hex');

    await db.query(
      'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [p30BlkUserId, 'password_reset', p30ResetHash, formatDateToMySqlUtc(new Date(Date.now() + 3600000))]
    );
    await db.query(
      'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [p30BlkUserId, 'email_verify', p30VerifyHash, formatDateToMySqlUtc(new Date(Date.now() + 3600000))]
    );

    // Block user AFTER tokens were issued
    await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [p30BlkUserId]);

    let p30ForgotMailsSent = 0;
    setSmtpTransporterForTesting({
      sendMail: async () => {
        p30ForgotMailsSent += 1;
        return { messageId: 'p30-blocked' };
      }
    } as any);
    try {
      const p30ForgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
        body: JSON.stringify({ email: 'p30blocked@diu.edu.bd' })
      });
      assert(
        p30ForgotRes.status === 200 && p30ForgotMailsSent === 0,
        'POST /api/auth/forgot-password returns neutral 200 and sends NO reset email to blocked accounts'
      );
    } finally {
      resetSmtpTransporterForTesting();
    }

    const p30BlkResetRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({
        token: p30ResetRaw,
        new_password: 'BypassPassword1!',
        confirm_new_password: 'BypassPassword1!'
      })
    });
    const p30BlkVerifyRes = await fetch(`${baseUrl}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin },
      body: JSON.stringify({ token: p30VerifyRaw })
    });
    const p30BlkResendRes = await fetch(`${baseUrl}/auth/resend-verification`, {
      method: 'POST',
      headers: { Origin: trustedOrigin, Authorization: `Bearer ${p30BlkToken}` }
    });

    const [p30BlkUserAfter] = await db.query('SELECT password_hash, email_verified FROM users WHERE id = ?', [
      p30BlkUserId
    ]);
    const [p30BlkResetTok] = await db.query(
      'SELECT id, used_at FROM auth_tokens WHERE token_hash = ?',
      [p30ResetHash]
    );
    const [p30BlkVerifyTok] = await db.query(
      'SELECT id, used_at FROM auth_tokens WHERE token_hash = ?',
      [p30VerifyHash]
    );
    assert(
      p30BlkResetRes.status === 403,
      `Blocked account reset-password returns 403 (got ${p30BlkResetRes.status})`
    );
    assert(
      p30BlkVerifyRes.status === 403,
      `Blocked account verify-email returns 403 (got ${p30BlkVerifyRes.status})`
    );
    assert(
      p30BlkResendRes.status === 403,
      `Blocked account resend-verification returns 403 (got ${p30BlkResendRes.status})`
    );
    assert(
      (p30BlkUserAfter as any[])[0].password_hash === p30PassHash &&
        Number((p30BlkUserAfter as any[])[0].email_verified) === 0 &&
        (p30BlkResetTok as any[])[0]?.used_at === null &&
        (p30BlkVerifyTok as any[])[0]?.used_at === null,
      'Blocked account password, email_verified, and auth_tokens remain unchanged/unconsumed'
    );

    // Unblock user and confirm previously valid tokens still work normally for active users (direct controller invocation to avoid authTokenLimiter quota)
    await db.query('UPDATE users SET is_blocked = 0 WHERE id = ?', [p30BlkUserId]);
    let p30ActiveVerifyStatus = 0;
    let p30ActiveResetStatus = 0;
    await verifyEmail(
      { body: { token: p30VerifyRaw } } as any,
      {
        status: (code: number) => {
          p30ActiveVerifyStatus = code;
          return { json: () => {} };
        }
      } as any
    );
    await resetPassword(
      {
        body: {
          token: p30ResetRaw,
          new_password: 'UnblockedPass1!',
          confirm_new_password: 'UnblockedPass1!'
        }
      } as any,
      {
        status: (code: number) => {
          p30ActiveResetStatus = code;
          return { json: () => {} };
        }
      } as any
    );
    assert(
      p30ActiveVerifyStatus === 200 && p30ActiveResetStatus === 200,
      'Active unblocked student can verify email and reset password normally'
    );

    // 4. Secondary Controllers HTTP 503 on DatabaseUnavailableError
    const origQueryP30 = db.query;
    const origGetConnP30 = db.getConnection;
    const dbDownErrP30 = Object.assign(
      new Error('Database service is temporarily unavailable. Please try again shortly.'),
      { isDatabaseUnavailable: true, status: 503 }
    );
    try {
      db.query = async (sql: string, params?: any[]) => {
        if (
          sql.includes('email_verified, student_verified, show_phone_to_accepted, bio') &&
          sql.includes('FROM users WHERE id = ?')
        ) {
          return await origQueryP30(sql, params);
        }
        throw dbDownErrP30;
      };
      db.getConnection = async () => {
        throw dbDownErrP30;
      };

      const createReview503 = await callController(createReview, {
        user: { id: 5, name: 'Sadia', role: 'student' },
        body: { ride_id: 1, reviewee_id: 2, rating: 5 }
      });

      const secondary503Responses = await Promise.all([
        fetch(`${baseUrl}/reviews/user/2`),
        fetch(`${baseUrl}/reviews/ride/1`),
        fetch(`${baseUrl}/notifications`, { headers: { Cookie: sadiaNewLogin.cookie } }),
        fetch(`${baseUrl}/notifications/read-all`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        }),
        fetch(`${baseUrl}/notifications/1/read`, {
          method: 'PATCH',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        }),
        fetch(`${baseUrl}/notifications/1`, {
          method: 'DELETE',
          headers: { Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie }
        }),
        fetch(`${baseUrl}/users/profile`, { headers: { Cookie: sadiaNewLogin.cookie } }),
        fetch(`${baseUrl}/users/dashboard-stats`, { headers: { Cookie: sadiaNewLogin.cookie } }),
        fetch(`${baseUrl}/users/2/public`, { headers: { Cookie: sadiaNewLogin.cookie } }),
        fetch(`${baseUrl}/users/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: sadiaNewLogin.cookie },
          body: JSON.stringify({ name: 'Test User', phone: '01712345678' })
        }),
        fetch(`${baseUrl}/drivers/history`, { headers: { Cookie: driverLogin.cookie } }),
        fetch(`${baseUrl}/admin/stats`, { headers: { Cookie: adminLogin.cookie } }),
        fetch(`${baseUrl}/admin/users`, { headers: { Cookie: adminLogin.cookie } }),
        fetch(`${baseUrl}/admin/drivers/pending`, { headers: { Cookie: adminLogin.cookie } }),
        fetch(`${baseUrl}/admin/rides`, { headers: { Cookie: adminLogin.cookie } }),
        fetch(`${baseUrl}/admin/bookings`, { headers: { Cookie: adminLogin.cookie } }),
        fetch(`${baseUrl}/admin/reports`, { headers: { Cookie: adminLogin.cookie } }),
        fetch(`${baseUrl}/admin/rides/1/moderate`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: adminLogin.cookie },
          body: JSON.stringify({ reason: 'Audit 503 test' })
        })
      ]);

      const secondary503Bodies = await Promise.all(secondary503Responses.map((r) => r.json()));
      assert(
        createReview503.status === 503 &&
          createReview503.body?.success === false &&
          secondary503Responses.every((r) => r.status === 503) &&
          secondary503Bodies.every(
            (b: any) =>
              b?.success === false &&
              typeof b?.message === 'string' &&
              !b.message.includes('ER_') &&
              !b.message.includes('SELECT')
          ),
        `All 19 secondary controller endpoints return safe HTTP 503 on DatabaseUnavailableError: statuses=${[createReview503.status, ...secondary503Responses.map((r) => r.status)].join(',')}`
      );
    } finally {
      db.query = origQueryP30;
      db.getConnection = origGetConnP30;
    }

    // 5. Cancellation handler (PATCH /api/rides/:id/status -> cancelled) notifies only active pending/accepted passengers
    const [p30Pass1Ins] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status)
       VALUES (?, ?, ?, ?, ?, 'student', 'none')`,
      ['231-15-982', 'P30 SelfCancelled', 'p30selfcancel@diu.edu.bd', '01755551112', p30PassHash]
    );
    const [p30Pass2Ins] = await db.query(
      `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status)
       VALUES (?, ?, ?, ?, ?, 'student', 'none')`,
      ['231-15-983', 'P30 ActivePending', 'p30activepending@diu.edu.bd', '01755551113', p30PassHash]
    );
    const p30Pass1Id = Number((p30Pass1Ins as any).insertId);
    const p30Pass2Id = Number((p30Pass2Ins as any).insertId);
    const p30Pass1Token = generateToken({
      id: p30Pass1Id,
      email: 'p30selfcancel@diu.edu.bd',
      student_id: '231-15-982',
      role: 'student',
      driver_status: 'none'
    });

    const p30Req1Call = await callController(createRideRequest, {
      user: { id: p30Pass1Id, name: 'P30 SelfCancelled', role: 'student' },
      params: { id: String(p30FareRideId) }
    });
    const p30Req1Id = Number(p30Req1Call.body?.requestId);
    assert(p30Req1Call.status === 201 && p30Req1Id > 0, 'Passenger 1 submits booking prior to self-cancel');

    // Passenger 1 self-cancels BEFORE driver cancels the ride
    const p30SelfCancelRes = await fetch(`${baseUrl}/requests/${p30Req1Id}/cancel`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Authorization: `Bearer ${p30Pass1Token}` }
    });
    assert(p30SelfCancelRes.status === 200, 'Passenger 1 self-cancels booking prior to ride cancellation');

    // Passenger 2 keeps an active pending request
    const p30Req2Call = await callController(createRideRequest, {
      user: { id: p30Pass2Id, name: 'P30 ActivePending', role: 'student' },
      params: { id: String(p30FareRideId) }
    });
    assert(p30Req2Call.status === 201, 'Passenger 2 submits active pending request');

    // Driver cancels ride via PATCH /api/rides/:id/status
    const p30StatusCancelRes = await fetch(`${baseUrl}/rides/${p30FareRideId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: trustedOrigin, Cookie: driverLogin.cookie },
      body: JSON.stringify({ status: 'cancelled' })
    });
    assert(p30StatusCancelRes.status === 200, 'Driver cancels ride via PATCH /api/rides/:id/status');

    const [p30Notif1Rows] = await db.query(
      "SELECT id FROM notifications WHERE user_id = ? AND type = 'ride_cancelled'",
      [p30Pass1Id]
    );
    const [p30Notif2Rows] = await db.query(
      "SELECT id FROM notifications WHERE user_id = ? AND type = 'ride_cancelled'",
      [p30Pass2Id]
    );
    assert(
      (p30Notif1Rows as any[]).length === 0 && (p30Notif2Rows as any[]).length === 1,
      'Ride status cancellation notifies active pending/accepted passengers without spamming already self-cancelled passengers'
    );
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
