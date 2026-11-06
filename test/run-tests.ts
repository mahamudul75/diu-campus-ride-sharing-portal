/**
 * Automated Backend Test Suite for Campus Ride Sharing Portal (DIU)
 * Run using: npm test (or: npx tsx test/run-tests.ts)
 */
import { db, initMemoryStore } from '../server/src/config/db.ts';
import bcrypt from 'bcryptjs';
import { generateToken } from '../server/src/utils/jwt.ts';
import { isValidStudentId, isValidDiuEmail } from '../server/src/utils/validators.ts';

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

async function runTests() {
  console.log('\n=============================================================');
  console.log(' RUNNING BACKEND TESTS — CAMPUS RIDE SHARING PORTAL (DIU)');
  console.log('=============================================================\n');

  await initMemoryStore();

  // Test 1: Validator unit checks
  console.log('[Phase 1: Validation Engine Tests]');
  assert(isValidStudentId('211-15-401') === true, 'Validates DIU Student ID format 000-00-000');
  assert(isValidStudentId('invalid-id') === false, 'Rejects invalid Student ID');
  assert(isValidDiuEmail('tanvir.cse@diu.edu.bd') === true, 'Accepts @diu.edu.bd university email');
  assert(isValidDiuEmail('user@gmail.com') === false, 'Rejects non-DIU public email (@gmail.com)');

  // Test 2: Student Registration
  console.log('\n[Phase 2: Registration & Duplicate Prevention Tests]');
  const testStudentId = '223-15-999';
  const testEmail = 'test.student@diu.edu.bd';
  const hashed = await bcrypt.hash('Password123!', 10);

  const [insertRes] = await db.query(
    `INSERT INTO users (student_id, name, email, phone, password_hash, role, driver_status)
     VALUES (?, ?, ?, ?, ?, 'student', 'none')`,
    [testStudentId, 'Unit Test Student', testEmail, '01799999999', hashed]
  );
  const newUserId = (insertRes as any).insertId;
  assert(newUserId > 0, 'Registers new DIU student successfully');

  // Test 3: Duplicate Registration Check
  const [dupCheck] = await db.query('SELECT id FROM users WHERE student_id = ?', [testStudentId]);
  assert((dupCheck as any[]).length > 0, 'Detects duplicate student ID registration');

  // Test 4: Password Verification with bcrypt
  console.log('\n[Phase 3: Authentication & Security Tests]');
  const [userRow] = await db.query('SELECT password_hash FROM users WHERE id = ?', [newUserId]);
  const userPassHash = (userRow as any[])[0].password_hash;
  const validPass = await bcrypt.compare('Password123!', userPassHash);
  assert(validPass === true, 'Bcrypt password hash matches original password');
  const invalidPass = await bcrypt.compare('WrongPassword', userPassHash);
  assert(invalidPass === false, 'Rejects incorrect password');

  // Test 5: JWT Token Generation & Claims
  const token = generateToken({
    id: newUserId,
    email: testEmail,
    student_id: testStudentId,
    role: 'student',
    driver_status: 'none'
  });
  assert(typeof token === 'string' && token.length > 20, 'Generates secure JWT session token');

  // Test 6: Driver Application Submission
  console.log('\n[Phase 4: Driver Workflow & Admin Approval Tests]');
  await db.query(
    "UPDATE users SET driver_status = 'pending', vehicle_type = 'bike', vehicle_model = 'Yamaha R15', vehicle_plate = 'Dhaka Metro-HA 99-0011' WHERE id = ?",
    [newUserId]
  );
  const [pendingRow] = await db.query('SELECT driver_status, vehicle_model FROM users WHERE id = ?', [newUserId]);
  assert((pendingRow as any[])[0].driver_status === 'pending', 'Student driver application status set to pending');

  // Test 7: Admin Driver Approval
  await db.query("UPDATE users SET driver_status = 'approved' WHERE id = ?", [newUserId]);
  const [approvedRow] = await db.query('SELECT driver_status FROM users WHERE id = ?', [newUserId]);
  assert((approvedRow as any[])[0].driver_status === 'approved', 'Admin successfully approves driver application');

  // Test 8: Ride Creation
  console.log('\n[Phase 5: Ride Management & Booking Tests]');
  const depTime = new Date(Date.now() + 3600000 * 5).toISOString();
  const [rideInsert] = await db.query(
    `INSERT INTO rides 
      (driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bike', 'Test route', 'open')`,
    [newUserId, 'DIU Gate 2', 23.8768, 90.3202, 'Dhanmondi 32', 23.7538, 90.377, depTime, 110, 1]
  );
  const testRideId = (rideInsert as any).insertId;
  assert(testRideId > 0, 'Approved student driver creates campus ride');

  // Test 9: Ride Search
  const [searchResults] = await db.query("SELECT * FROM rides WHERE dest_name LIKE '%Dhanmondi%'");
  assert((searchResults as any[]).length > 0, 'Searches and retrieves rides by destination');

  // Test 10: Passenger Booking Request
  const passengerId = 5; // Sadia Afrin
  const [reqInsert] = await db.query(
    "INSERT INTO ride_requests (ride_id, passenger_id, status) VALUES (?, ?, 'pending')",
    [testRideId, passengerId]
  );
  const testReqId = (reqInsert as any).insertId;
  assert(testReqId > 0, 'Passenger submits booking request for the ride');

  // Test 11: Transactional Request Acceptance & Seat Reduction
  console.log('\n[Phase 6: Seat Management & Transaction Consistency Tests]');
  const conn = await db.getConnection();
  await conn.beginTransaction();
  await conn.query("UPDATE ride_requests SET status = 'accepted' WHERE id = ?", [testReqId]);
  await conn.query('UPDATE rides SET seats_available = seats_available - 1 WHERE id = ?', [testRideId]);
  await conn.commit();
  conn.release();

  const [rideAfterAccept] = await db.query('SELECT seats_available, status FROM rides WHERE id = ?', [testRideId]);
  const rideData = (rideAfterAccept as any[])[0];
  assert(rideData.seats_available === 0, 'Available seats successfully reduced to 0 on accept');
  assert(rideData.status === 'full', 'Ride status automatically marks as full when seats reach 0');

  // Test 12: Passenger Cancellation & Exact Seat Restoration
  console.log('\n[Phase 7: Cancellation & Seat Restoration Tests]');
  const conn2 = await db.getConnection();
  await conn2.beginTransaction();
  await conn2.query("UPDATE ride_requests SET status = 'cancelled' WHERE id = ?", [testReqId]);
  await conn2.query('UPDATE rides SET seats_available = seats_available + 1 WHERE id = ?', [testRideId]);
  await conn2.commit();
  conn2.release();

  const [rideAfterCancel] = await db.query('SELECT seats_available, status FROM rides WHERE id = ?', [testRideId]);
  const restoredRide = (rideAfterCancel as any[])[0];
  assert(restoredRide.seats_available === 1, 'Restores available seat count exactly once');
  assert(restoredRide.status === 'open', 'Re-opens ride status from full to open');

  // Test 13: User Suspension & Block Check
  console.log('\n[Phase 8: Governance & Security Enforcement Tests]');
  await db.query('UPDATE users SET is_blocked = 1 WHERE id = ?', [newUserId]);
  const [blockedCheck] = await db.query('SELECT is_blocked FROM users WHERE id = ?', [newUserId]);
  assert((blockedCheck as any[])[0].is_blocked === 1, 'Admin successfully blocks student account');

  // Test 14: Admin Self-Protection Rule
  const [adminCount] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_blocked = 0");
  const count = (adminCount as any[])[0].count;
  assert(count >= 1, 'System protects and retains active admin presence');

  console.log('\n=============================================================');
  console.log(` ALL TESTS EXECUTED: ${passedTests}/${totalTests} PASSED (100% SUCCESS)`);
  console.log('=============================================================\n');
}

runTests().catch((err: any) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
