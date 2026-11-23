-- ============================================================================
-- CAMPUS RIDE SHARING PORTAL — DAFFODIL INTERNATIONAL UNIVERSITY (DIU)
-- Database: MySQL 8.0+ / TiDB Cloud
-- Schema Definition: server/src/database/schema.sql
--
-- WARNING: FRESH DATABASE INITIALIZATION SCRIPT ONLY
-- This file contains destructive DROP TABLE IF EXISTS statements and resets
-- all tables. NEVER execute this script against an existing or live database.
-- For existing databases, apply incremental scripts under migrations/ instead.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS diu_campus_ride_sharing
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE diu_campus_ride_sharing;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS driver_offers;
DROP TABLE IF EXISTS passenger_requests;
DROP TABLE IF EXISTS user_blocks;
DROP TABLE IF EXISTS user_reports;
DROP TABLE IF EXISTS emergency_contacts;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS driver_applications;
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS ride_requests;
DROP TABLE IF EXISTS rides;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- Table: users
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
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  student_verified TINYINT(1) NOT NULL DEFAULT 0,
  avatar_url MEDIUMTEXT NULL DEFAULT NULL,
  show_phone_to_accepted TINYINT(1) NOT NULL DEFAULT 1,
  bio VARCHAR(300) NULL DEFAULT NULL,
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
  status ENUM('open','full','completed','cancelled','scheduled','in_progress') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rides_driver FOREIGN KEY (driver_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_seats_non_negative CHECK (seats_available >= 0),
  INDEX idx_rides_driver (driver_id),
  INDEX idx_rides_status (status),
  INDEX idx_rides_departure (departure_time),
  INDEX idx_rides_fare (fare),
  INDEX idx_rides_status_departure (status, departure_time),
  INDEX idx_rides_driver_departure (driver_id, departure_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: ride_requests
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
  INDEX idx_requests_status (status),
  INDEX idx_requests_passenger_created (passenger_id, created_at),
  INDEX idx_requests_passenger_status (passenger_id, status),
  INDEX idx_requests_ride_status (ride_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: auth_tokens (email verification & password reset)
-- ----------------------------------------------------------------------------
CREATE TABLE auth_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  purpose ENUM('email_verify', 'password_reset') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_auth_tokens_hash (token_hash),
  INDEX idx_auth_tokens_user_purpose (user_id, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: driver_applications
-- ----------------------------------------------------------------------------
CREATE TABLE driver_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  vehicle_type ENUM('bike', 'car') NOT NULL,
  vehicle_model VARCHAR(100) NOT NULL,
  vehicle_plate VARCHAR(50) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(500) NULL DEFAULT NULL,
  reviewed_by INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_driver_apps_user FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_driver_apps_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  INDEX idx_driver_apps_user (user_id),
  INDEX idx_driver_apps_status (status),
  INDEX idx_driver_apps_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: reviews
-- ----------------------------------------------------------------------------
CREATE TABLE reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ride_id INT NOT NULL,
  reviewer_id INT NOT NULL,
  reviewee_id INT NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reviews_ride FOREIGN KEY (ride_id)
    REFERENCES rides (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_reviews_reviewer FOREIGN KEY (reviewer_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_reviews_reviewee FOREIGN KEY (reviewee_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT uq_reviews_ride_pair UNIQUE (ride_id, reviewer_id, reviewee_id),
  CONSTRAINT chk_reviews_rating CHECK (rating >= 1 AND rating <= 5),
  INDEX idx_reviews_reviewee (reviewee_id),
  INDEX idx_reviews_ride (ride_id),
  INDEX idx_reviews_reviewee_created (reviewee_id, created_at),
  INDEX idx_reviews_reviewer_ride (reviewer_id, ride_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: notifications
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(255) NULL DEFAULT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_notifications_user_read (user_id, is_read),
  INDEX idx_notifications_created (created_at),
  INDEX idx_notifications_user_created (user_id, created_at),
  INDEX idx_notifications_user_type (user_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: conversations & messages
-- ----------------------------------------------------------------------------
CREATE TABLE conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ride_id INT NOT NULL,
  driver_id INT NOT NULL,
  passenger_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_conv_ride FOREIGN KEY (ride_id)
    REFERENCES rides (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_conv_driver FOREIGN KEY (driver_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_conv_passenger FOREIGN KEY (passenger_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT uq_conv_ride_passenger UNIQUE (ride_id, passenger_id),
  INDEX idx_conv_driver (driver_id),
  INDEX idx_conv_passenger (passenger_id),
  INDEX idx_conv_driver_updated (driver_id, updated_at),
  INDEX idx_conv_passenger_updated (passenger_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_conv FOREIGN KEY (conversation_id)
    REFERENCES conversations (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_messages_conv_created (conversation_id, created_at),
  INDEX idx_messages_unread (conversation_id, sender_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: emergency_contacts, user_reports, user_blocks
-- ----------------------------------------------------------------------------
CREATE TABLE emergency_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  relationship VARCHAR(60) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_emergency_user FOREIGN KEY (user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX idx_emergency_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reporter_id INT NOT NULL,
  reported_user_id INT NOT NULL,
  ride_id INT NULL DEFAULT NULL,
  reason VARCHAR(80) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('pending', 'under_review', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(500) NULL DEFAULT NULL,
  reviewed_by INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_reports_reported FOREIGN KEY (reported_user_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_reports_ride FOREIGN KEY (ride_id)
    REFERENCES rides (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_reports_reviewer FOREIGN KEY (reviewed_by)
    REFERENCES users (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  INDEX idx_reports_status (status),
  INDEX idx_reports_reporter (reporter_id),
  INDEX idx_reports_reported (reported_user_id),
  INDEX idx_reports_reporter_created (reporter_id, created_at),
  INDEX idx_reports_status_created (status, created_at),
  INDEX idx_reports_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_blocks_blocker FOREIGN KEY (blocker_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_blocks_blocked FOREIGN KEY (blocked_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT uq_blocks_pair UNIQUE (blocker_id, blocked_id),
  INDEX idx_blocks_blocker (blocker_id),
  INDEX idx_blocks_blocked (blocked_id),
  INDEX idx_blocks_blocker_created (blocker_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: passenger_requests (Passenger-Initiated Ride Matching)
-- ----------------------------------------------------------------------------
CREATE TABLE passenger_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  passenger_id INT NOT NULL,
  pickup_name VARCHAR(255) NOT NULL,
  pickup_lat DECIMAL(10, 7) NOT NULL,
  pickup_lng DECIMAL(10, 7) NOT NULL,
  dest_name VARCHAR(255) NOT NULL,
  dest_lat DECIMAL(10, 7) NOT NULL,
  dest_lng DECIMAL(10, 7) NOT NULL,
  departure_time DATETIME NOT NULL,
  seats_needed INT NOT NULL DEFAULT 1,
  max_fare DECIMAL(10, 2) NULL DEFAULT NULL,
  vehicle_type ENUM('any', 'bike', 'car') NOT NULL DEFAULT 'any',
  note TEXT NULL DEFAULT NULL,
  status ENUM('open', 'matched', 'cancelled', 'expired') NOT NULL DEFAULT 'open',
  accepted_offer_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pass_req_passenger FOREIGN KEY (passenger_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT chk_pass_req_seats CHECK (seats_needed = 1),
  CONSTRAINT chk_pass_req_max_fare CHECK (max_fare IS NULL OR max_fare >= 0),
  INDEX idx_pass_req_passenger (passenger_id),
  INDEX idx_pass_req_status (status),
  INDEX idx_pass_req_departure (departure_time),
  INDEX idx_pass_req_status_departure (status, departure_time),
  INDEX idx_pass_req_passenger_status (passenger_id, status),
  INDEX idx_pass_req_accepted_offer (accepted_offer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Table: driver_offers (Driver Bids on Passenger Requests)
-- ----------------------------------------------------------------------------
CREATE TABLE driver_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  driver_id INT NOT NULL,
  fare DECIMAL(10, 2) NOT NULL,
  seats_offered INT NOT NULL DEFAULT 1,
  vehicle_type ENUM('bike', 'car') NOT NULL,
  pickup_time DATETIME NOT NULL,
  message VARCHAR(500) NULL DEFAULT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'withdrawn', 'expired') NOT NULL DEFAULT 'pending',
  confirmed_ride_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_driver_offers_request FOREIGN KEY (request_id)
    REFERENCES passenger_requests (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_driver_offers_driver FOREIGN KEY (driver_id)
    REFERENCES users (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_driver_offers_confirmed_ride FOREIGN KEY (confirmed_ride_id)
    REFERENCES rides (id)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT uq_driver_request_offer UNIQUE (request_id, driver_id),
  CONSTRAINT chk_offers_fare CHECK (fare >= 0),
  CONSTRAINT chk_offers_seats CHECK (seats_offered >= 1 AND seats_offered <= 4),
  INDEX idx_offers_request (request_id),
  INDEX idx_offers_driver (driver_id),
  INDEX idx_offers_status (status),
  INDEX idx_offers_confirmed_ride (confirmed_ride_id),
  INDEX idx_offers_request_status (request_id, status),
  INDEX idx_offers_driver_status (driver_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
