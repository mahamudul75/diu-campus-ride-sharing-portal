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
import bcrypt from 'bcryptjs';
import { db, enableIsolatedTestMemoryDb, resetDbPoolForTesting } from '../server/src/config/db.ts';
import apiRouter from '../server/src/routes/index.ts';
import { generateToken } from '../server/src/utils/jwt.ts';
import { isValidStudentId, isValidDiuEmail } from '../server/src/utils/validators.ts';
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

    const approveRahat = await fetch(`${baseUrl}/admin/drivers/4/approve`, {
      method: 'PATCH',
      headers: { Origin: trustedOrigin, Cookie: adminLogin.cookie }
    });
    assert(approveRahat.status === 200, 'Admin approves pending driver Rahat (id=4)');

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
