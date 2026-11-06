-- ============================================================================
-- CAMPUS RIDE SHARING PORTAL — DAFFODIL INTERNATIONAL UNIVERSITY (DIU)
-- Database: MySQL 8.0+
-- Schema Definition: server/src/database/schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS diu_ride_sharing
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE diu_ride_sharing;

-- Disable foreign key checks during schema re-creation if needed
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS ride_requests;
DROP TABLE IF EXISTS rides;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- Table: users
-- All users are DIU students. Role can be 'student' or 'admin'.
-- Driver status tracks driver application flow.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  driver_status ENUM('none', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'none',
  vehicle_type ENUM('bike', 'car') NULL DEFAULT NULL,
  vehicle_model VARCHAR(100) NULL DEFAULT NULL,
  vehicle_plate VARCHAR(50) NULL DEFAULT NULL,
  is_blocked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_student_id UNIQUE (student_id),
  CONSTRAINT uq_users_email UNIQUE (email),
  INDEX idx_users_role (role),
  INDEX idx_users_driver_status (driver_status),
  INDEX idx_users_is_blocked (is_blocked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: rides
-- Rides posted by approved student drivers.
-- ----------------------------------------------------------------------------
CREATE TABLE rides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id INT NOT NULL,
  pickup_name VARCHAR(255) NOT NULL,
  pickup_lat DECIMAL(10, 7) NOT NULL,
  pickup_lng DECIMAL(10, 7) NOT NULL,
  dest_name VARCHAR(255) NOT NULL,
  dest_lat DECIMAL(10, 7) NOT NULL,
  dest_lng DECIMAL(10, 7) NOT NULL,
  departure_time DATETIME NOT NULL,
  fare DECIMAL(10, 2) NOT NULL,
  seats_total INT NOT NULL,
  seats_available INT NOT NULL,
  vehicle_type ENUM('bike', 'car') NOT NULL,
  note TEXT NULL DEFAULT NULL,
  status ENUM('open', 'full', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rides_driver FOREIGN KEY (driver_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_seats_non_negative CHECK (seats_available >= 0),
  INDEX idx_rides_driver (driver_id),
  INDEX idx_rides_status (status),
  INDEX idx_rides_departure (departure_time),
  INDEX idx_rides_fare (fare)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: ride_requests
-- Requests submitted by student passengers for specific rides.
-- ----------------------------------------------------------------------------
CREATE TABLE ride_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ride_id INT NOT NULL,
  passenger_id INT NOT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_requests_ride FOREIGN KEY (ride_id)
    REFERENCES rides (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_requests_passenger FOREIGN KEY (passenger_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT uq_ride_passenger UNIQUE (ride_id, passenger_id),
  INDEX idx_requests_ride (ride_id),
  INDEX idx_requests_passenger (passenger_id),
  INDEX idx_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
