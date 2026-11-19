-- ============================================================================
-- Migration 004: Passenger-Initiated Ride Matching (Requests & Driver Offers)
-- Database Engine: MySQL 8.0+ / TiDB Cloud
-- File: server/src/database/migrations/004_passenger_ride_requests.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table 1: passenger_requests
-- Created first; accepted_offer_id is unconstrained to avoid circular FK
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS passenger_requests (
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
-- Table 2: driver_offers
-- Created second; references passenger_requests(id) and existing rides(id)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_offers (
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
