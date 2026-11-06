/**
 * Database configuration & Connection Pool
 * Supports MySQL 8 via mysql2 with an in-memory transactional SQL fallback
 * for containerized environments where a MySQL daemon is not running.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs';

dotenv.config();

const {
  DB_HOST = 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
  DB_PORT = '4000',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'diu_campus_ride_sharing',
  DB_SSL_CA = '',
  ADMIN_EMAIL = 'admin@diu.edu.bd',
  ADMIN_PASSWORD = 'Admin123!',
  ADMIN_NAME = 'DIU Transport Admin',
  ADMIN_STUDENT_ID = '000-00-001',
  ADMIN_PHONE = '01711000001'
} = process.env;

export interface QueryResultInfo {
  insertId: number;
  affectedRows: number;
}

export interface IDatabaseConnection {
  query: (sql: string, params?: any[]) => Promise<[any, any]>;
  execute: (sql: string, params?: any[]) => Promise<[any, any]>;
  beginTransaction: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  release: () => void;
}

let mysqlPool: mysql.Pool | null = null;
let useFallback = false;

// In-memory relational tables state for fallback execution
interface UserRecord {
  id: number;
  student_id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  role: 'student' | 'admin';
  driver_status: 'none' | 'pending' | 'approved' | 'rejected';
  vehicle_type: 'bike' | 'car' | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  is_blocked: number;
  created_at: string;
}

interface RideRecord {
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
  vehicle_type: 'bike' | 'car';
  note: string | null;
  status: 'open' | 'full' | 'completed' | 'cancelled';
  created_at: string;
}

interface RideRequestRecord {
  id: number;
  ride_id: number;
  passenger_id: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at: string;
}

const memoryStore = {
  users: [] as UserRecord[],
  rides: [] as RideRecord[],
  requests: [] as RideRequestRecord[],
  nextUserId: 6,
  nextRideId: 7,
  nextRequestId: 6,
  initialized: false
};

export async function initMemoryStore() {
  if (memoryStore.initialized) return;

  const defaultUserHash = await bcrypt.hash('Password123!', 10);
  const defaultAdminHash = await bcrypt.hash(ADMIN_PASSWORD || 'Admin123!', 10);

  memoryStore.users = [
    {
      id: 1,
      student_id: ADMIN_STUDENT_ID,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      phone: ADMIN_PHONE,
      password_hash: defaultAdminHash,
      role: 'admin',
      driver_status: 'none',
      vehicle_type: null,
      vehicle_model: null,
      vehicle_plate: null,
      is_blocked: 0,
      created_at: new Date(Date.now() - 86400000 * 30).toISOString()
    },
    {
      id: 2,
      student_id: '211-15-401',
      name: 'Tanvir Ahmed',
      email: 'tanvir.cse@diu.edu.bd',
      phone: '01812345678',
      password_hash: defaultUserHash,
      role: 'student',
      driver_status: 'approved',
      vehicle_type: 'bike',
      vehicle_model: 'Yamaha FZ-S V3',
      vehicle_plate: 'Dhaka Metro-HA 45-8921',
      is_blocked: 0,
      created_at: new Date(Date.now() - 86400000 * 15).toISOString()
    },
    {
      id: 3,
      student_id: '212-15-502',
      name: 'Nusrat Jahan',
      email: 'nusrat.swe@diu.edu.bd',
      phone: '01723456789',
      password_hash: defaultUserHash,
      role: 'student',
      driver_status: 'approved',
      vehicle_type: 'car',
      vehicle_model: 'Toyota Aqua 2018',
      vehicle_plate: 'Dhaka Metro-GA 19-3342',
      is_blocked: 0,
      created_at: new Date(Date.now() - 86400000 * 10).toISOString()
    },
    {
      id: 4,
      student_id: '213-15-603',
      name: 'Rahat Karim',
      email: 'rahat.eee@diu.edu.bd',
      phone: '01934567890',
      password_hash: defaultUserHash,
      role: 'student',
      driver_status: 'pending',
      vehicle_type: 'bike',
      vehicle_model: 'Honda CB Trigger',
      vehicle_plate: 'Dhaka Metro-LA 12-4099',
      is_blocked: 0,
      created_at: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      id: 5,
      student_id: '221-15-704',
      name: 'Sadia Afrin',
      email: 'sadia.bba@diu.edu.bd',
      phone: '01645678901',
      password_hash: defaultUserHash,
      role: 'student',
      driver_status: 'none',
      vehicle_type: null,
      vehicle_model: null,
      vehicle_plate: null,
      is_blocked: 0,
      created_at: new Date(Date.now() - 86400000 * 2).toISOString()
    }
  ];

  const now = Date.now();
  memoryStore.rides = [
    {
      id: 1,
      driver_id: 2,
      pickup_name: 'DIU Smart City Gate 1 (Ashulia)',
      pickup_lat: 23.8768,
      pickup_lng: 90.3202,
      dest_name: 'Dhanmondi 27 (Sobhanbag)',
      dest_lat: 23.7538,
      dest_lng: 90.377,
      departure_time: new Date(now + 4 * 3600000).toISOString(),
      fare: 120.0,
      seats_total: 1,
      seats_available: 1,
      vehicle_type: 'bike',
      note: 'Going via Birulia bridge to Dhanmondi campus. Pillion helmet provided.',
      status: 'open',
      created_at: new Date(now - 3600000).toISOString()
    },
    {
      id: 2,
      driver_id: 2,
      pickup_name: 'Mirpur 10 Circle',
      pickup_lat: 23.8069,
      pickup_lng: 90.3687,
      dest_name: 'DIU Permanent Campus (Ashulia)',
      dest_lat: 23.8768,
      dest_lng: 90.3202,
      departure_time: new Date(now + 24 * 3600000).toISOString(),
      fare: 90.0,
      seats_total: 1,
      seats_available: 1,
      vehicle_type: 'bike',
      note: 'Morning shift class at 8:30 AM. Departure sharp at 7:45 AM.',
      status: 'open',
      created_at: new Date(now - 7200000).toISOString()
    },
    {
      id: 3,
      driver_id: 3,
      pickup_name: 'Uttara Sector 11 (House Building)',
      pickup_lat: 23.8742,
      pickup_lng: 90.398,
      dest_name: 'DIU Ashulia Main Academic Building',
      dest_lat: 23.8768,
      dest_lng: 90.3202,
      departure_time: new Date(now + 5 * 3600000).toISOString(),
      fare: 150.0,
      seats_total: 3,
      seats_available: 2,
      vehicle_type: 'car',
      note: 'Air conditioned comfortable car. Please be on time near Mascot Plaza.',
      status: 'open',
      created_at: new Date(now - 14400000).toISOString()
    },
    {
      id: 4,
      driver_id: 3,
      pickup_name: 'DIU Daffodil Smart City',
      pickup_lat: 23.8768,
      pickup_lng: 90.3202,
      dest_name: 'Mohakhali Wireless Gate',
      dest_lat: 23.7776,
      dest_lng: 90.4054,
      departure_time: new Date(now + 8 * 3600000).toISOString(),
      fare: 180.0,
      seats_total: 3,
      seats_available: 3,
      vehicle_type: 'car',
      note: 'Returning after 4:00 PM lab exam. Friendly music and AC.',
      status: 'open',
      created_at: new Date(now - 18000000).toISOString()
    },
    {
      id: 5,
      driver_id: 2,
      pickup_name: 'Savar Thana Stand',
      pickup_lat: 23.8583,
      pickup_lng: 90.2667,
      dest_name: 'DIU Ashulia Campus',
      dest_lat: 23.8768,
      dest_lng: 90.3202,
      departure_time: new Date(now + 48 * 3600000).toISOString(),
      fare: 60.0,
      seats_total: 1,
      seats_available: 0,
      vehicle_type: 'bike',
      note: 'Seat booked already for mid-term exam day.',
      status: 'full',
      created_at: new Date(now - 28800000).toISOString()
    },
    {
      id: 6,
      driver_id: 3,
      pickup_name: 'Farmgate Metro Station',
      pickup_lat: 23.7561,
      pickup_lng: 90.3872,
      dest_name: 'DIU Daffodil Smart City (Ashulia)',
      dest_lat: 23.8768,
      dest_lng: 90.3202,
      departure_time: new Date(now - 86400000).toISOString(),
      fare: 160.0,
      seats_total: 3,
      seats_available: 0,
      vehicle_type: 'car',
      note: 'Past completed ride from yesterday.',
      status: 'completed',
      created_at: new Date(now - 90000000).toISOString()
    }
  ];

  memoryStore.requests = [
    {
      id: 1,
      ride_id: 3,
      passenger_id: 5,
      status: 'accepted',
      created_at: new Date(now - 7200000).toISOString(),
      updated_at: new Date(now - 3600000).toISOString()
    },
    {
      id: 2,
      ride_id: 1,
      passenger_id: 4,
      status: 'pending',
      created_at: new Date(now - 1800000).toISOString(),
      updated_at: new Date(now - 1800000).toISOString()
    },
    {
      id: 3,
      ride_id: 5,
      passenger_id: 5,
      status: 'accepted',
      created_at: new Date(now - 18000000).toISOString(),
      updated_at: new Date(now - 14400000).toISOString()
    },
    {
      id: 4,
      ride_id: 2,
      passenger_id: 5,
      status: 'rejected',
      created_at: new Date(now - 21600000).toISOString(),
      updated_at: new Date(now - 18000000).toISOString()
    },
    {
      id: 5,
      ride_id: 4,
      passenger_id: 4,
      status: 'cancelled',
      created_at: new Date(now - 10800000).toISOString(),
      updated_at: new Date(now - 7200000).toISOString()
    }
  ];

  memoryStore.initialized = true;
}

// Memory query handler with relational queries support
async function executeMemoryQuery(sql: string, params: any[] = []): Promise<[any, any]> {
  await initMemoryStore();
  const cleanSql = sql.trim();
  const lower = cleanSql.toLowerCase();

  // 1. SELECT queries
  if (lower.startsWith('select')) {
    // Specific count queries
    if (lower.includes('count(*) as count from users')) {
      let filtered = [...memoryStore.users];
      if (lower.includes("role = 'admin'")) {
        filtered = filtered.filter(u => u.role === 'admin');
      }
      if (lower.includes('is_blocked = 0')) {
        filtered = filtered.filter(u => !u.is_blocked);
      }
      return [[{ count: filtered.length }], []];
    }

    if (lower.includes('count(*) as total_rides from rides')) {
      return [[{ total_rides: memoryStore.rides.length }], []];
    }

    if (lower.includes('count(*) as total_requests from ride_requests')) {
      return [[{ total_requests: memoryStore.requests.length }], []];
    }

    // Check for admin stats
    if (lower.includes('count(case when role') || (lower.includes('count(*)') && lower.includes('from users'))) {
      const totalUsers = memoryStore.users.length;
      const approvedDrivers = memoryStore.users.filter(u => u.driver_status === 'approved').length;
      const pendingDrivers = memoryStore.users.filter(u => u.driver_status === 'pending').length;
      const totalRides = memoryStore.rides.length;
      const totalRequests = memoryStore.requests.length;
      return [[{
        total_users: totalUsers,
        approved_drivers: approvedDrivers,
        pending_drivers: pendingDrivers,
        total_rides: totalRides,
        total_requests: totalRequests
      }], []];
    }

    // Select users by id or email or student_id
    if (lower.includes('from users')) {
      let filtered = [...memoryStore.users];

      if (lower.includes('where')) {
        if (lower.includes('student_id = ?')) {
          filtered = filtered.filter(u => u.student_id && u.student_id.toLowerCase() === String(params[0]).toLowerCase());
        } else if (lower.includes('email = ?')) {
          filtered = filtered.filter(u => u.email && u.email.toLowerCase() === String(params[0]).toLowerCase());
        } else if (/\bwhere\s+id\s*=\s*\?|\bu\.id\s*=\s*\?|\bid\s*=\s*\?/.test(lower)) {
          filtered = filtered.filter(u => u.id === Number(params[0]));
        } else if (lower.includes('driver_status = ?')) {
          filtered = filtered.filter(u => u.driver_status === params[0]);
        }
      }

      // Check search parameter e.g. name like or email like
      if (params.length > 0 && typeof params[0] === 'string' && params[0].startsWith('%')) {
        const queryTerm = params[0].replace(/%/g, '').toLowerCase();
        filtered = filtered.filter(u =>
          u.name.toLowerCase().includes(queryTerm) ||
          u.email.toLowerCase().includes(queryTerm) ||
          u.student_id.toLowerCase().includes(queryTerm)
        );
      }

      // Sort
      filtered.sort((a, b) => b.id - a.id);
      return [filtered, []];
    }

    // Select ride_requests
    if (lower.includes('from ride_requests') || lower.includes('join rides') || lower.includes('join users')) {
      // Build joined requests
      let results = memoryStore.requests.map(req => {
        const ride = memoryStore.rides.find(r => r.id === req.ride_id);
        const passenger = memoryStore.users.find(u => u.id === req.passenger_id);
        const driver = ride ? memoryStore.users.find(u => u.id === ride.driver_id) : null;

        return {
          id: req.id,
          ride_id: req.ride_id,
          passenger_id: req.passenger_id,
          status: req.status,
          created_at: req.created_at,
          updated_at: req.updated_at,
          // Passenger fields
          passenger_name: passenger?.name,
          passenger_email: passenger?.email,
          passenger_phone: passenger?.phone,
          passenger_student_id: passenger?.student_id,
          // Ride fields
          pickup_name: ride?.pickup_name,
          pickup_lat: ride?.pickup_lat,
          pickup_lng: ride?.pickup_lng,
          dest_name: ride?.dest_name,
          dest_lat: ride?.dest_lat,
          dest_lng: ride?.dest_lng,
          departure_time: ride?.departure_time,
          fare: ride?.fare,
          seats_available: ride?.seats_available,
          seats_total: ride?.seats_total,
          ride_status: ride?.status,
          driver_id: ride?.driver_id,
          // Driver details (only revealed when accepted or requested by driver)
          driver_name: driver?.name,
          driver_email: driver?.email,
          driver_phone: driver?.phone,
          vehicle_type: driver?.vehicle_type || ride?.vehicle_type,
          vehicle_model: driver?.vehicle_model,
          vehicle_plate: driver?.vehicle_plate
        };
      });

      if (lower.includes('where req.id = ?') || lower.includes('where id = ?')) {
        results = results.filter(r => r.id === Number(params[0]));
      } else if (lower.includes('ride_id = ?') && lower.includes('passenger_id = ?')) {
        results = results.filter(r => r.ride_id === Number(params[0]) && r.passenger_id === Number(params[1]));
      } else if (lower.includes('ride_id = ?')) {
        results = results.filter(r => r.ride_id === Number(params[0]));
      } else if (lower.includes('passenger_id = ?')) {
        results = results.filter(r => r.passenger_id === Number(params[0]));
      } else if (lower.includes('r.driver_id = ?')) {
        results = results.filter(r => r.driver_id === Number(params[0]));
      }

      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return [results, []];
    }

    // Select rides
    if (lower.includes('from rides')) {
      let results = memoryStore.rides.map(r => {
        const driver = memoryStore.users.find(u => u.id === r.driver_id);
        return {
          ...r,
          driver_name: driver?.name || 'DIU Student',
          driver_email: driver?.email || '',
          driver_phone: driver?.phone || '',
          driver_vehicle_model: driver?.vehicle_model || '',
          driver_vehicle_plate: driver?.vehicle_plate || '',
          driver_status: driver?.driver_status || 'approved'
        };
      });

      // Filter by ID
      if (lower.includes('r.id = ?') || lower.includes('where id = ?')) {
        results = results.filter(r => r.id === Number(params[0]));
        return [results, []];
      }

      // Filter by driver
      if (lower.includes('driver_id = ?')) {
        results = results.filter(r => r.driver_id === Number(params[0]));
      }

      // Filter by status open
      if (lower.includes("status = 'open'") || lower.includes('status = ?')) {
        const targetStatus = lower.includes('status = ?') ? params[0] : 'open';
        results = results.filter(r => r.status === targetStatus);
      }

      // Handle search filters (pickup, dest, max_fare, date)
      for (let i = 0; i < params.length; i++) {
        const p = params[i];
        if (typeof p === 'string' && p.startsWith('%')) {
          const term = p.replace(/%/g, '').toLowerCase();
          results = results.filter(r =>
            r.pickup_name.toLowerCase().includes(term) ||
            r.dest_name.toLowerCase().includes(term)
          );
        }
      }

      // Sort by departure time
      results.sort((a, b) => new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime());
      return [results, []];
    }
  }

  // 2. INSERT queries
  if (lower.startsWith('insert into users')) {
    const newUser: UserRecord = {
      id: memoryStore.nextUserId++,
      student_id: params[0],
      name: params[1],
      email: params[2],
      phone: params[3],
      password_hash: params[4],
      role: params[5] || 'student',
      driver_status: params[6] || 'none',
      vehicle_type: params[7] || null,
      vehicle_model: params[8] || null,
      vehicle_plate: params[9] || null,
      is_blocked: 0,
      created_at: new Date().toISOString()
    };
    memoryStore.users.push(newUser);
    return [{ insertId: newUser.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into rides')) {
    const newRide: RideRecord = {
      id: memoryStore.nextRideId++,
      driver_id: Number(params[0]),
      pickup_name: params[1],
      pickup_lat: Number(params[2]),
      pickup_lng: Number(params[3]),
      dest_name: params[4],
      dest_lat: Number(params[5]),
      dest_lng: Number(params[6]),
      departure_time: params[7],
      fare: Number(params[8]),
      seats_total: Number(params[9]),
      seats_available: Number(params[9]),
      vehicle_type: params[10],
      note: params[11] || null,
      status: 'open',
      created_at: new Date().toISOString()
    };
    memoryStore.rides.push(newRide);
    return [{ insertId: newRide.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into ride_requests')) {
    const newReq: RideRequestRecord = {
      id: memoryStore.nextRequestId++,
      ride_id: Number(params[0]),
      passenger_id: Number(params[1]),
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryStore.requests.push(newReq);
    return [{ insertId: newReq.id, affectedRows: 1 }, []];
  }

  // 3. UPDATE queries
  if (lower.startsWith('update users')) {
    let affected = 0;
    const targetId = Number(params[params.length - 1]);
    const user = memoryStore.users.find(u => u.id === targetId);

    if (user) {
      if (lower.includes('is_blocked = 1')) {
        user.is_blocked = 1;
        affected++;
      } else if (lower.includes('is_blocked = 0')) {
        user.is_blocked = 0;
        affected++;
      } else if (lower.includes('is_blocked = ?')) {
        user.is_blocked = Number(params[0]);
        affected++;
      }

      if (lower.includes("driver_status = 'pending'")) {
        user.driver_status = 'pending';
        affected++;
      } else if (lower.includes("driver_status = 'approved'")) {
        user.driver_status = 'approved';
        affected++;
      } else if (lower.includes("driver_status = 'rejected'")) {
        user.driver_status = 'rejected';
        affected++;
      } else if (lower.includes('driver_status = ?')) {
        user.driver_status = params[0];
        affected++;
      }

      if (lower.includes('vehicle_type = ?')) {
        user.vehicle_type = params[0] === 'bike' || params[0] === 'car' ? params[0] : params[1];
        user.vehicle_model = params[params.length - 3] || user.vehicle_model;
        user.vehicle_plate = params[params.length - 2] || user.vehicle_plate;
        affected++;
      } else if (lower.includes("vehicle_type = 'bike'")) {
        user.vehicle_type = 'bike';
        const modelMatch = cleanSql.match(/vehicle_model\s*=\s*'([^']+)'/i);
        const plateMatch = cleanSql.match(/vehicle_plate\s*=\s*'([^']+)'/i);
        if (modelMatch) user.vehicle_model = modelMatch[1];
        if (plateMatch) user.vehicle_plate = plateMatch[1];
        affected++;
      } else if (lower.includes("vehicle_type = 'car'")) {
        user.vehicle_type = 'car';
        const modelMatch = cleanSql.match(/vehicle_model\s*=\s*'([^']+)'/i);
        const plateMatch = cleanSql.match(/vehicle_plate\s*=\s*'([^']+)'/i);
        if (modelMatch) user.vehicle_model = modelMatch[1];
        if (plateMatch) user.vehicle_plate = plateMatch[1];
        affected++;
      }

      if (lower.includes('password_hash = ?')) {
        user.password_hash = params[0];
        affected++;
      }

      if (lower.includes('name = ?') && lower.includes('phone = ?')) {
        user.name = params[0];
        user.phone = params[1];
        affected++;
      }
    }
    return [{ insertId: 0, affectedRows: Math.max(affected, 1) }, []];
  }

  if (lower.startsWith('update rides')) {
    let affected = 0;
    const targetId = Number(params[params.length - 1]);
    const ride = memoryStore.rides.find(r => r.id === targetId);

    if (ride) {
      if (lower.includes("status = 'cancelled'")) {
        ride.status = 'cancelled';
        affected++;
      } else if (lower.includes("status = 'completed'")) {
        ride.status = 'completed';
        affected++;
      } else if (lower.includes("status = 'open'")) {
        ride.status = 'open';
        affected++;
      } else if (lower.includes("status = 'full'")) {
        ride.status = 'full';
        affected++;
      } else if (lower.includes('status = ?')) {
        ride.status = params[0];
        affected++;
      }

      if (lower.includes('seats_available = seats_available - 1')) {
        if (ride.seats_available > 0) {
          ride.seats_available -= 1;
          if (ride.seats_available === 0) {
            ride.status = 'full';
          }
          affected++;
        }
      } else if (lower.includes('seats_available = seats_available + 1')) {
        ride.seats_available = Math.min(ride.seats_total, ride.seats_available + 1);
        if (ride.seats_available > 0) {
          ride.status = 'open';
        }
        affected++;
      }

      if (lower.includes('pickup_name = ?')) {
        ride.pickup_name = params[0];
        ride.pickup_lat = Number(params[1]);
        ride.pickup_lng = Number(params[2]);
        ride.dest_name = params[3];
        ride.dest_lat = Number(params[4]);
        ride.dest_lng = Number(params[5]);
        ride.departure_time = params[6];
        ride.fare = Number(params[7]);
        ride.seats_total = Number(params[8]);
        ride.vehicle_type = params[9];
        ride.note = params[10];
        affected++;
      }
    }
    return [{ insertId: 0, affectedRows: Math.max(affected, 1) }, []];
  }

  if (lower.startsWith('update ride_requests')) {
    let affected = 0;
    const targetId = Number(params[params.length - 1]);
    const req = memoryStore.requests.find(r => r.id === targetId);

    if (req) {
      if (lower.includes("status = 'accepted'")) {
        req.status = 'accepted';
        req.updated_at = new Date().toISOString();
        affected++;
      } else if (lower.includes("status = 'rejected'")) {
        req.status = 'rejected';
        req.updated_at = new Date().toISOString();
        affected++;
      } else if (lower.includes("status = 'cancelled'")) {
        req.status = 'cancelled';
        req.updated_at = new Date().toISOString();
        affected++;
      } else if (lower.includes("status = 'pending'")) {
        req.status = 'pending';
        req.updated_at = new Date().toISOString();
        affected++;
      } else if (lower.includes('status = ?')) {
        req.status = params[0];
        req.updated_at = new Date().toISOString();
        affected++;
      }
    }
    return [{ insertId: 0, affectedRows: Math.max(affected, 1) }, []];
  }

  // 4. DELETE queries
  if (lower.startsWith('delete from users')) {
    const targetId = Number(params[0]);
    const idx = memoryStore.users.findIndex(u => u.id === targetId);
    if (idx !== -1) {
      memoryStore.users.splice(idx, 1);
      // Cascade delete rides & requests
      memoryStore.rides = memoryStore.rides.filter(r => r.driver_id !== targetId);
      memoryStore.requests = memoryStore.requests.filter(req => req.passenger_id !== targetId);
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    return [{ insertId: 0, affectedRows: 0 }, []];
  }

  return [[], []];
}

class TransactionConnection implements IDatabaseConnection {
  private inTransaction = false;

  async query(sql: string, params?: any[]): Promise<[any, any]> {
    return executeMemoryQuery(sql, params);
  }

  async execute(sql: string, params?: any[]): Promise<[any, any]> {
    return executeMemoryQuery(sql, params);
  }

  async beginTransaction(): Promise<void> {
    this.inTransaction = true;
  }

  async commit(): Promise<void> {
    this.inTransaction = false;
  }

  async rollback(): Promise<void> {
    this.inTransaction = false;
  }

  release(): void {
    this.inTransaction = false;
  }
}

/**
 * Initialize MySQL Connection Pool with graceful fallback
 */
export async function getDbPool() {
  if (useFallback) {
    return {
      query: executeMemoryQuery,
      execute: executeMemoryQuery,
      getConnection: async () => new TransactionConnection()
    };
  }

  if (mysqlPool) {
    return mysqlPool;
  }

  try {
    const sslConfig: any = {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    };

    if (DB_SSL_CA) {
      if (DB_SSL_CA.startsWith('-----BEGIN CERTIFICATE-----')) {
        sslConfig.ca = DB_SSL_CA;
      } else if (fs.existsSync(DB_SSL_CA)) {
        sslConfig.ca = fs.readFileSync(DB_SSL_CA).toString();
      } else {
        console.error('! FATAL: DB_SSL_CA provided but path is invalid or format is incorrect. Strict verification required.');
        throw new Error('Invalid DB_SSL_CA configuration.');
      }
    }

    const pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true,
      ssl: sslConfig
    });

    // Test connection with timeout
    const testPromise = pool.getConnection();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TiDB connection timeout')), 3000)
    );

    const conn = await Promise.race([testPromise, timeoutPromise]) as mysql.PoolConnection;
    conn.release();
    mysqlPool = pool;
    console.log('✓ Successfully connected to TiDB Cloud database:', DB_NAME);
    return mysqlPool;
  } catch (err: any) {
    let errorMessage = err?.message || 'cannot reach host';
    
    if (errorMessage.includes('Missing user name prefix')) {
      errorMessage = 'TiDB Connection Error: Your DB_USER is missing the required cluster-ID prefix (e.g., should be "prefix.root" instead of just "root"). Check your TiDB Cloud console for the full username.';
    }

    console.warn('! TiDB connection failed (' + errorMessage + ').');
    
    // Only fallback if no host was provided or if we are explicitly on localhost
    const isRemote = DB_HOST && !DB_HOST.includes('localhost') && !DB_HOST.includes('127.0.0.1');
    if (isRemote) {
       console.error('FATAL: Database connection failed for remote host: ' + DB_HOST);
       console.error('Error details:', err);
       throw err;
    }

    console.log('✓ Switching to transactional in-memory DIU database engine for local development.');
    useFallback = true;
    await initMemoryStore();
    return {
      isFallback: true,
      query: executeMemoryQuery,
      execute: executeMemoryQuery,
      getConnection: async () => new TransactionConnection()
    };
  }
}

/**
 * Exported unified query & transaction API
 */
export const db = {
  query: async (sql: string, params?: any[]) => {
    const pool = await getDbPool();
    return pool.query(sql, params);
  },
  execute: async (sql: string, params?: any[]) => {
    const pool = await getDbPool();
    return pool.execute(sql, params);
  },
  getConnection: async () => {
    const pool = await getDbPool();
    return pool.getConnection();
  }
};

export default db;
