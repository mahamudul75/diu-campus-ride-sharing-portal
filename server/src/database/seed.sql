-- ============================================================================
-- CAMPUS RIDE SHARING PORTAL — DAFFODIL INTERNATIONAL UNIVERSITY (DIU)
-- Database Seed Data: server/src/database/seed.sql
-- Default Passwords:
--   Admin:   Admin123!    (Hash: $2b$10$zS3lqCszk9zI5U5Lq31q8eR69g41D1eT3Z1Q.nUuR6iI9n/7lPq4e)
--   Users:   Password123! (Hash: $2b$10$7ZkP9o6vW8eJ3R4T5Y6U7u8I9o0P1Q2R3S4T5U6V7W8X9Y0Z1A2B3C)
-- ============================================================================

USE diu_ride_sharing;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE ride_requests;
TRUNCATE TABLE rides;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- 1. Users
-- 1 Admin + 4 Students (2 Approved Drivers, 1 Pending Driver, 1 Regular Passenger)
-- ----------------------------------------------------------------------------
-- Note: bcrypt hash for 'Password123!' is $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
-- Note: bcrypt hash for 'Admin123!' is $2a$10$x8mO8zLhV2wWkC6YqYJjUeZtYfW9f9F.KxZ7YkE0f2u0QYdI0Pzma
INSERT INTO users (id, student_id, name, email, phone, password_hash, role, driver_status, vehicle_type, vehicle_model, vehicle_plate, is_blocked)
VALUES
  (1, '000-00-001', 'DIU Transport Admin', 'admin@diu.edu.bd', '01711000001', '$2a$10$x8mO8zLhV2wWkC6YqYJjUeZtYfW9f9F.KxZ7YkE0f2u0QYdI0Pzma', 'admin', 'none', NULL, NULL, NULL, 0),
  (2, '211-15-401', 'Tanvir Ahmed', 'tanvir.cse@diu.edu.bd', '01812345678', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', 'approved', 'bike', 'Yamaha FZ-S V3', 'Dhaka Metro-HA 45-8921', 0),
  (3, '212-15-502', 'Nusrat Jahan', 'nusrat.swe@diu.edu.bd', '01723456789', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', 'approved', 'car', 'Toyota Aqua 2018', 'Dhaka Metro-GA 19-3342', 0),
  (4, '213-15-603', 'Rahat Karim', 'rahat.eee@diu.edu.bd', '01934567890', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', 'pending', 'bike', 'Honda CB Trigger', 'Dhaka Metro-LA 12-4099', 0),
  (5, '221-15-704', 'Sadia Afrin', 'sadia.bba@diu.edu.bd', '01645678901', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', 'none', NULL, NULL, NULL, 0);

-- ----------------------------------------------------------------------------
-- 2. Sample Rides
-- 6 rides covering key DIU routes (Daffodil Smart City Ashulia, Dhanmondi, Mirpur 10, Uttara, etc.)
-- ----------------------------------------------------------------------------
INSERT INTO rides (id, driver_id, pickup_name, pickup_lat, pickup_lng, dest_name, dest_lat, dest_lng, departure_time, fare, seats_total, seats_available, vehicle_type, note, status)
VALUES
  (1, 2, 'DIU Smart City Gate 1 (Ashulia)', 23.8768000, 90.3202000, 'Dhanmondi 27 (Sobhanbag)', 23.7538000, 90.3770000, DATE_ADD(NOW(), INTERVAL 4 HOUR), 120.00, 1, 1, 'bike', 'Going via Birulia bridge to Dhanmondi campus. Pillion helmet provided.', 'open'),
  (2, 2, 'Mirpur 10 Circle', 23.8069000, 90.3687000, 'DIU Permanent Campus (Ashulia)', 23.8768000, 90.3202000, DATE_ADD(NOW(), INTERVAL 1 DAY), 90.00, 1, 1, 'bike', 'Morning shift class at 8:30 AM. Departure sharp at 7:45 AM.', 'open'),
  (3, 3, 'Uttara Sector 11 (House Building)', 23.8742000, 90.3980000, 'DIU Ashulia Main Academic Building', 23.8768000, 90.3202000, DATE_ADD(NOW(), INTERVAL 5 HOUR), 150.00, 3, 2, 'car', 'Air conditioned comfortable car. Please be on time near Mascot Plaza.', 'open'),
  (4, 3, 'DIU Daffodil Smart City', 23.8768000, 90.3202000, 'Mohakhali Wireless Gate', 23.7776000, 90.4054000, DATE_ADD(NOW(), INTERVAL 8 HOUR), 180.00, 3, 3, 'car', 'Returning after 4:00 PM lab exam. Friendly music and AC.', 'open'),
  (5, 2, 'Savar Thana Stand', 23.8583000, 90.2667000, 'DIU Ashulia Campus', 23.8768000, 90.3202000, DATE_ADD(NOW(), INTERVAL 2 DAY), 60.00, 1, 0, 'bike', 'Seat booked already for mid-term exam day.', 'full'),
  (6, 3, 'Farmgate Metro Station', 23.7561000, 90.3872000, 'DIU Daffodil Smart City (Ashulia)', 23.8768000, 90.3202000, DATE_SUB(NOW(), INTERVAL 1 DAY), 160.00, 3, 0, 'car', 'Past completed ride from yesterday.', 'completed');

-- ----------------------------------------------------------------------------
-- 3. Sample Ride Requests
-- Various statuses: pending, accepted, rejected, cancelled
-- ----------------------------------------------------------------------------
INSERT INTO ride_requests (id, ride_id, passenger_id, status, created_at, updated_at)
VALUES
  (1, 3, 5, 'accepted', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR)),
  (2, 1, 4, 'pending', DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
  (3, 5, 5, 'accepted', DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR)),
  (4, 2, 5, 'rejected', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR)),
  (5, 4, 4, 'cancelled', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR));
