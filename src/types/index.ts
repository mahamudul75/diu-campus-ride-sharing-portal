export type UserRole = 'student' | 'admin';
export type DriverStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type VehicleType = 'bike' | 'car';
export type RideStatus = 'scheduled' | 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'dismissed';

export interface User {
  id: number;
  student_id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  driver_status: DriverStatus;
  vehicle_type: VehicleType | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  is_blocked: number;
  email_verified?: number;
  student_verified?: number;
  avatar_url?: string | null;
  show_phone_to_accepted?: number;
  bio?: string | null;
  avg_rating?: number | null;
  review_count?: number;
  created_at?: string;
}

export interface Ride {
  id: number;
  driver_id: number;
  pickup_name: string;
  pickup_lat: number;
  pickup_lng: number;
  dest_name: string;
  dest_lat: number;
  dest_lng: number;
  departure_time: string;
  fare: number;
  seats_total: number;
  seats_available: number;
  vehicle_type: VehicleType;
  note: string | null;
  status: RideStatus;
  created_at: string;
  driver_name?: string;
  driver_email?: string;
  driver_phone?: string | null;
  driver_student_id?: string;
  driver_vehicle_model?: string;
  driver_vehicle_plate?: string | null;
  driver_status?: DriverStatus;
  driver_avg_rating?: number | null;
  driver_review_count?: number;
  driver_student_verified?: number;
  driver_email_verified?: number;
  driver_avatar_url?: string | null;
  distance_km?: number;
  estimated_minutes?: number;
  pending_requests_count?: number;
  accepted_requests_count?: number;
}

export interface RideRequest {
  id: number;
  ride_id: number;
  passenger_id: number;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  passenger_name?: string;
  passenger_email?: string;
  passenger_phone?: string | null;
  passenger_student_id?: string;
  passenger_student_verified?: number;
  passenger_email_verified?: number;
  passenger_avatar_url?: string | null;
  passenger_avg_rating?: number | null;
  passenger_review_count?: number;
  driver_id?: number;
  pickup_name?: string;
  pickup_lat?: number;
  pickup_lng?: number;
  dest_name?: string;
  dest_lat?: number;
  dest_lng?: number;
  departure_time?: string;
  fare?: number;
  seats_available?: number;
  seats_total?: number;
  vehicle_type?: VehicleType;
  ride_status?: RideStatus;
  driver_name?: string;
  driver_email?: string;
  driver_phone?: string | null;
  driver_vehicle_model?: string;
  driver_vehicle_plate?: string | null;
  driver_avg_rating?: number | null;
  driver_review_count?: number;
  driver_student_verified?: number;
  distance_km?: number | null;
  estimated_minutes?: number | null;
  has_reviewed?: boolean;
}

export interface Review {
  id: number;
  ride_id: number;
  reviewer_id: number;
  reviewee_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name?: string;
  reviewee_name?: string;
  pickup_name?: string;
  dest_name?: string;
}

export interface EligibleReviewTarget {
  user_id: number;
  name: string;
  role: 'driver' | 'passenger';
  already_reviewed: boolean;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: number;
  created_at: string;
}

export interface Conversation {
  id: number;
  ride_id: number;
  driver_id: number;
  passenger_id: number;
  pickup_name: string;
  dest_name: string;
  departure_time: string;
  ride_status: RideStatus;
  peer_id: number;
  peer_name: string;
  peer_avatar_url?: string | null;
  peer_student_verified?: number;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
  is_blocked_pair: boolean;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name?: string;
  content: string;
  is_read: number;
  created_at: string;
}

export interface EmergencyContact {
  id: number;
  user_id: number;
  name: string;
  relationship: string;
  phone: string;
  created_at?: string;
}

export interface UserReport {
  id: number;
  reporter_id: number;
  reported_user_id: number;
  ride_id: number | null;
  reason: string;
  description: string;
  status: ReportStatus;
  admin_note: string | null;
  reviewed_by?: number | null;
  created_at: string;
  updated_at: string;
  reporter_name?: string;
  reporter_student_id?: string;
  reported_user_name?: string;
  reported_student_id?: string;
  reported_is_blocked?: number;
}

export interface UserBlock {
  id: number;
  blocked_id: number;
  blocked_name: string;
  blocked_student_id: string;
  created_at: string;
}

export interface DriverApplication {
  id: number;
  user_id: number;
  vehicle_type: VehicleType;
  vehicle_model: string;
  vehicle_plate: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  reviewed_by: number | null;
  reviewer_name?: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface AdminStats {
  total_users: number;
  approved_drivers: number;
  pending_drivers: number;
  total_rides: number;
  total_requests: number;
  active_rides?: number;
  completed_rides?: number;
  cancelled_rides?: number;
  bike_rides?: number;
  car_rides?: number;
  accepted_requests?: number;
  pending_requests?: number;
  rejected_requests?: number;
  cancelled_requests?: number;
  pending_reports?: number;
  total_reports?: number;
  verified_students?: number;
  total_reviews?: number;
  ride_completion_rate?: number;
}
