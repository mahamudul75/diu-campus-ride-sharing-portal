export type UserRole = 'student' | 'admin';
export type DriverStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type VehicleType = 'bike' | 'car';
export type RideStatus = 'open' | 'full' | 'completed' | 'cancelled';
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

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
  driver_vehicle_model?: string;
  driver_vehicle_plate?: string | null;
  driver_status?: DriverStatus;
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
  passenger_phone?: string;
  passenger_student_id?: string;
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
}

export interface AdminStats {
  total_users: number;
  approved_drivers: number;
  pending_drivers: number;
  total_rides: number;
  total_requests: number;
}
