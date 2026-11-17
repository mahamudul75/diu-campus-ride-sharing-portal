-- ============================================================================
-- Migration 003: Backward-Compatible Composite Performance Indexes
-- Database: MySQL 8.0+ / TiDB Cloud
-- Prerequisites: Migration 002 (notifications, conversations, reviews,
--   driver_applications, user_reports, user_blocks tables must already exist).
-- Strictly additive CREATE INDEX statements only (zero data modification).
-- Existing single-column base indexes are preserved intentionally for additive
-- backward compatibility.
-- ============================================================================

-- Rides search & driver dashboard lookups
-- (seats_available omitted after range column departure_time)
CREATE INDEX idx_rides_status_departure ON rides (status, departure_time);
CREATE INDEX idx_rides_driver_departure ON rides (driver_id, departure_time);

-- Ride requests counts, passenger history & active reminders
-- Split into passenger timeline (getMyRequests) + passenger+status (reminders)
CREATE INDEX idx_requests_passenger_created ON ride_requests (passenger_id, created_at);
CREATE INDEX idx_requests_passenger_status ON ride_requests (passenger_id, status);
CREATE INDEX idx_requests_ride_status ON ride_requests (ride_id, status);

-- Notifications inbox pagination & reminder deduplication
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at);
CREATE INDEX idx_notifications_user_type ON notifications (user_id, type);

-- Conversations inbox sorting (enables TiDB index-merge for driver_id OR passenger_id)
CREATE INDEX idx_conv_driver_updated ON conversations (driver_id, updated_at);
CREATE INDEX idx_conv_passenger_updated ON conversations (passenger_id, updated_at);

-- Reviews profile pagination & passenger review eligibility lookup
CREATE INDEX idx_reviews_reviewee_created ON reviews (reviewee_id, created_at);
CREATE INDEX idx_reviews_reviewer_ride ON reviews (reviewer_id, ride_id);

-- User reports (filtered + unfiltered admin sorting), blocks, & driver application history
CREATE INDEX idx_reports_reporter_created ON user_reports (reporter_id, created_at);
CREATE INDEX idx_reports_status_created ON user_reports (status, created_at);
CREATE INDEX idx_reports_created ON user_reports (created_at);
CREATE INDEX idx_blocks_blocker_created ON user_blocks (blocker_id, created_at);
CREATE INDEX idx_driver_apps_user_created ON driver_applications (user_id, created_at);
