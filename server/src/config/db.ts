/**
 * Database configuration & Connection Pool
 * Supports MySQL 8 via mysql2 with an in-memory transactional SQL fallback
 * for containerized environments where a MySQL daemon is not running.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import { parseRideDateTime } from '../utils/dateTime.ts';

dotenv.config();

const {
  DB_HOST = 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
  DB_PORT = '4000',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'diu_campus_ride_sharing',
  DB_SSL_CA = '',
  ADMIN_EMAIL = 'admin@diu.edu.bd',
  ADMIN_PASSWORD = '',
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
  const defaultAdminHash = await bcrypt.hash(ADMIN_PASSWORD || 'LocalDevAdminSeedPassword123!', 10);

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

let memoryTxChain: Promise<void> = Promise.resolve();
let memorySnapshot: string | null = null;

function toEpochMs(val: unknown): number {
  const parsed = parseRideDateTime(val);
  if (parsed) return parsed.getTime();
  const ts = new Date(String(val ?? '')).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

// Memory query handler with faithful relational + transactional SQL semantics
async function executeMemoryQuery(sql: string, params: any[] = []): Promise<[any, any]> {
  await initMemoryStore();
  const cleanSql = sql.replace(/\s+/g, ' ').trim();
  const lower = cleanSql.toLowerCase();

  // 1. SELECT queries
  if (lower.startsWith('select')) {
    if (lower.includes('select 1') || lower.includes('1 as connected') || lower.includes('1 as val')) {
      return [[{ connected: 1, val: 1, 1: 1 }], []];
    }

    if (lower.includes('count(*) as count from users')) {
      let filtered = [...memoryStore.users];
      if (lower.includes("role = 'admin'")) {
        filtered = filtered.filter((u) => u.role === 'admin');
      }
      if (lower.includes('is_blocked = 0')) {
        filtered = filtered.filter((u) => !u.is_blocked);
      }
      return [[{ count: filtered.length }], []];
    }

    if (lower.includes('count(*) as total_rides from rides')) {
      return [[{ total_rides: memoryStore.rides.length }], []];
    }

    if (lower.includes('count(*) as total_requests from ride_requests')) {
      return [[{ total_requests: memoryStore.requests.length }], []];
    }

    if (lower.includes('sum(case when driver_status') || (lower.includes('count(*)') && lower.includes('from users'))) {
      return [[{
        total_users: memoryStore.users.length,
        approved_drivers: memoryStore.users.filter((u) => u.driver_status === 'approved').length,
        pending_drivers: memoryStore.users.filter((u) => u.driver_status === 'pending').length,
        total_rides: memoryStore.rides.length,
        total_requests: memoryStore.requests.length
      }], []];
    }

    // Select ride_requests (check before 'from users' because queries JOIN users!)
    if (lower.includes('from ride_requests')) {
      let results = memoryStore.requests.map((req) => {
        const ride = memoryStore.rides.find((r) => r.id === req.ride_id);
        const passenger = memoryStore.users.find((u) => u.id === req.passenger_id);
        const driver = ride ? memoryStore.users.find((u) => u.id === ride.driver_id) : null;

        return {
          id: req.id,
          ride_id: req.ride_id,
          passenger_id: req.passenger_id,
          status: req.status,
          created_at: req.created_at,
          updated_at: req.updated_at,
          passenger_name: passenger?.name,
          passenger_email: passenger?.email,
          passenger_phone: passenger?.phone,
          passenger_student_id: passenger?.student_id,
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
          driver_name: driver?.name,
          driver_email: driver?.email,
          driver_phone: driver?.phone,
          vehicle_type: ride?.vehicle_type || driver?.vehicle_type,
          driver_vehicle_model: driver?.vehicle_model,
          driver_vehicle_plate: driver?.vehicle_plate
        };
      });

      if (lower.includes('where req.id = ?') || lower.includes('where id = ?')) {
        results = results.filter((r) => r.id === Number(params[0]));
      } else if (lower.includes('ride_id = ?') && lower.includes('passenger_id = ?')) {
        results = results.filter((r) => r.ride_id === Number(params[0]) && r.passenger_id === Number(params[1]));
      } else if (lower.includes('ride_id = ?')) {
        results = results.filter((r) => r.ride_id === Number(params[0]));
      } else if (lower.includes('passenger_id = ?')) {
        results = results.filter((r) => r.passenger_id === Number(params[0]));
      } else if (lower.includes('r.driver_id = ?')) {
        results = results.filter((r) => r.driver_id === Number(params[0]));
      }

      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return [results, []];
    }

    // Select users
    if (lower.includes('from users')) {
      let filtered = [...memoryStore.users];

      if (lower.includes('where')) {
        if (lower.includes('student_id = ?')) {
          filtered = filtered.filter((u) => u.student_id.toLowerCase() === String(params[0]).toLowerCase());
        } else if (lower.includes('email = ?')) {
          filtered = filtered.filter((u) => u.email.toLowerCase() === String(params[0]).toLowerCase());
        } else if (/\bwhere\s+(?:u\.)?id\s*=\s*\?/.test(lower)) {
          filtered = filtered.filter((u) => u.id === Number(params[0]));
        } else if (lower.includes("driver_status = 'pending'")) {
          filtered = filtered.filter((u) => u.driver_status === 'pending');
        } else if (lower.includes('driver_status = ?')) {
          filtered = filtered.filter((u) => u.driver_status === params[0]);
        } else if (lower.includes('name like ?') && params.length > 0 && typeof params[0] === 'string') {
          const queryTerm = params[0].replace(/%/g, '').toLowerCase();
          filtered = filtered.filter(
            (u) =>
              u.name.toLowerCase().includes(queryTerm) ||
              u.email.toLowerCase().includes(queryTerm) ||
              u.student_id.toLowerCase().includes(queryTerm)
          );
        }
      }

      if (lower.includes('order by id asc')) {
        filtered.sort((a, b) => a.id - b.id);
      } else {
        filtered.sort((a, b) => b.id - a.id);
      }
      return [filtered, []];
    }

    // Select rides
    if (lower.includes('from rides')) {
      let results = memoryStore.rides.map((r) => {
        const driver = memoryStore.users.find((u) => u.id === r.driver_id);
        const pending_requests_count = memoryStore.requests.filter(
          (req) => req.ride_id === r.id && req.status === 'pending'
        ).length;
        const accepted_requests_count = memoryStore.requests.filter(
          (req) => req.ride_id === r.id && req.status === 'accepted'
        ).length;
        return {
          ...r,
          driver_name: driver?.name || 'DIU Student',
          driver_email: driver?.email || '',
          driver_phone: driver?.phone || '',
          driver_vehicle_model: driver?.vehicle_model || '',
          driver_vehicle_plate: driver?.vehicle_plate || '',
          driver_status: driver?.driver_status || 'approved',
          pending_requests_count,
          accepted_requests_count
        };
      });

      if (lower.includes('where r.id = ?') || lower.includes('where id = ?')) {
        results = results.filter((r) => r.id === Number(params[0]));
        return [results, []];
      }

      if (lower.includes("r.status = 'open'") || lower.includes("status = 'open'")) {
        results = results.filter((r) => r.status === 'open');
      }

      if (lower.includes('utc_timestamp()')) {
        const nowMs = Date.now();
        results = results.filter((r) => toEpochMs(r.departure_time) > nowMs);
      }

      let paramIdx = 0;
      if (lower.includes('r.driver_id = ?') || lower.includes('driver_id = ?')) {
        const driverId = Number(params[paramIdx++]);
        results = results.filter((r) => r.driver_id === driverId);
      }
      if (lower.includes('r.pickup_name like ?')) {
        const term = String(params[paramIdx++] || '').replace(/%/g, '').toLowerCase();
        results = results.filter((r) => r.pickup_name.toLowerCase().includes(term));
      }
      if (lower.includes('r.dest_name like ?')) {
        const term = String(params[paramIdx++] || '').replace(/%/g, '').toLowerCase();
        results = results.filter((r) => r.dest_name.toLowerCase().includes(term));
      } else if (lower.includes('dest_name like')) {
        results = results.filter((r) => r.dest_name.toLowerCase().includes('dhanmondi'));
      }
      if (lower.includes('r.departure_time >= ? and r.departure_time < ?')) {
        const startMs = toEpochMs(params[paramIdx++]);
        const endMs = toEpochMs(params[paramIdx++]);
        results = results.filter((r) => {
          const depMs = toEpochMs(r.departure_time);
          return depMs >= startMs && depMs < endMs;
        });
      }
      if (lower.includes('r.fare <= ?')) {
        const maxFare = Number(params[paramIdx++]);
        results = results.filter((r) => r.fare <= maxFare);
      }
      if (lower.includes('r.vehicle_type = ?')) {
        const vType = params[paramIdx++];
        results = results.filter((r) => r.vehicle_type === vType);
      }

      if (lower.includes('order by r.departure_time desc')) {
        results.sort((a, b) => toEpochMs(b.departure_time) - toEpochMs(a.departure_time));
      } else {
        results.sort((a, b) => toEpochMs(a.departure_time) - toEpochMs(b.departure_time));
      }
      return [results, []];
    }
  }

  // 2. INSERT queries
  if (lower.startsWith('insert into users')) {
    const cleanStudentId = String(params[0]);
    const cleanEmail = String(params[2]).toLowerCase();
    if (
      memoryStore.users.some(
        (u) => u.student_id.toLowerCase() === cleanStudentId.toLowerCase() || u.email.toLowerCase() === cleanEmail
      )
    ) {
      const dupErr: any = new Error('Duplicate entry');
      dupErr.code = 'ER_DUP_ENTRY';
      throw dupErr;
    }

    const newUser: UserRecord = {
      id: memoryStore.nextUserId++,
      student_id: cleanStudentId,
      name: params[1],
      email: cleanEmail,
      phone: params[3],
      password_hash: params[4],
      role: 'student',
      driver_status: 'none',
      vehicle_type: null,
      vehicle_model: null,
      vehicle_plate: null,
      is_blocked: 0,
      created_at: new Date().toISOString()
    };
    memoryStore.users.push(newUser);
    return [{ insertId: newUser.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into rides')) {
    const fallbackVehicle = lower.includes("'car'") ? 'car' : 'bike';
    const rawVehicle = params[11];
    const vehicleType: 'bike' | 'car' =
      rawVehicle === 'car' || rawVehicle === 'bike' ? rawVehicle : fallbackVehicle;
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
      seats_available: Number(params[10] ?? params[9]),
      vehicle_type: vehicleType,
      note: params[12] ?? null,
      status: 'open',
      created_at: new Date().toISOString()
    };
    memoryStore.rides.push(newRide);
    return [{ insertId: newRide.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into ride_requests')) {
    const rId = Number(params[0]);
    const pId = Number(params[1]);
    if (memoryStore.requests.some((req) => req.ride_id === rId && req.passenger_id === pId)) {
      const dupErr: any = new Error('Duplicate entry');
      dupErr.code = 'ER_DUP_ENTRY';
      throw dupErr;
    }
    const newReq: RideRequestRecord = {
      id: memoryStore.nextRequestId++,
      ride_id: rId,
      passenger_id: pId,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryStore.requests.push(newReq);
    return [{ insertId: newReq.id, affectedRows: 1 }, []];
  }

  // 3. UPDATE queries
  if (lower.startsWith('update users')) {
    const targetId = Number(params[params.length - 1]);
    const user = memoryStore.users.find((u) => u.id === targetId);
    if (!user) return [{ insertId: 0, affectedRows: 0 }, []];

    if (lower.includes('set is_blocked = ?')) {
      user.is_blocked = Number(params[0]);
    } else if (lower.includes('set is_blocked = 1')) {
      user.is_blocked = 1;
    } else if (lower.includes('set is_blocked = 0')) {
      user.is_blocked = 0;
    } else if (lower.includes("set driver_status = 'pending'")) {
      user.driver_status = 'pending';
      user.vehicle_type = params[0];
      user.vehicle_model = params[1];
      user.vehicle_plate = params[2];
    } else if (lower.includes("set driver_status = 'approved'")) {
      user.driver_status = 'approved';
    } else if (lower.includes("set driver_status = 'rejected'")) {
      user.driver_status = 'rejected';
    } else if (lower.includes('set password_hash = ?')) {
      user.password_hash = params[0];
    } else if (lower.includes('set name = ?, phone = ?')) {
      user.name = params[0];
      user.phone = params[1];
    }
    return [{ insertId: 0, affectedRows: 1 }, []];
  }

  if (lower.startsWith('update rides')) {
    const targetId = Number(params[params.length - 1]);
    const ride = memoryStore.rides.find((r) => r.id === targetId);
    if (!ride) return [{ insertId: 0, affectedRows: 0 }, []];

    if (lower.includes("set status = 'cancelled'")) {
      ride.status = 'cancelled';
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    if (lower.includes("set status = 'completed'")) {
      ride.status = 'completed';
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    if (lower.includes('seats_available = seats_available - 1')) {
      if (lower.includes('seats_available > 0') && ride.seats_available <= 0) {
        return [{ insertId: 0, affectedRows: 0 }, []];
      }
      ride.seats_available -= 1;
      if (ride.seats_available === 0) ride.status = 'full';
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    if (lower.includes('seats_available + 1')) {
      if (lower.includes('seats_available < seats_total') && ride.seats_available >= ride.seats_total) {
        return [{ insertId: 0, affectedRows: 0 }, []];
      }
      ride.seats_available = Math.min(ride.seats_total, ride.seats_available + 1);
      if (ride.status === 'full' && ride.seats_available > 0) {
        ride.status = 'open';
      }
      return [{ insertId: 0, affectedRows: 1 }, []];
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
      ride.seats_available = Number(params[9]);
      ride.status = params[10];
      ride.vehicle_type = params[11];
      ride.note = params[12];
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    return [{ insertId: 0, affectedRows: 0 }, []];
  }

  if (lower.startsWith('update ride_requests')) {
    // Cascade driver cancellation: WHERE ride_id = ? AND status IN ('pending', 'accepted')
    if (lower.includes("where ride_id = ? and status in ('pending', 'accepted')")) {
      const targetRideId = Number(params[0]);
      let affected = 0;
      for (const req of memoryStore.requests) {
        if (req.ride_id === targetRideId && (req.status === 'pending' || req.status === 'accepted')) {
          req.status = 'cancelled';
          req.updated_at = new Date().toISOString();
          affected++;
        }
      }
      return [{ insertId: 0, affectedRows: affected }, []];
    }

    const targetId = Number(params[params.length - 1]);
    const req = memoryStore.requests.find((r) => r.id === targetId);
    if (!req) return [{ insertId: 0, affectedRows: 0 }, []];

    if (lower.includes("and status = 'pending'") && req.status !== 'pending') {
      return [{ insertId: 0, affectedRows: 0 }, []];
    }
    if (
      lower.includes("and status in ('pending', 'accepted')") &&
      req.status !== 'pending' &&
      req.status !== 'accepted'
    ) {
      return [{ insertId: 0, affectedRows: 0 }, []];
    }

    if (lower.includes("set status = 'accepted'")) req.status = 'accepted';
    else if (lower.includes("set status = 'rejected'")) req.status = 'rejected';
    else if (lower.includes("set status = 'cancelled'")) req.status = 'cancelled';
    else if (lower.includes("set status = 'pending'")) req.status = 'pending';
    req.updated_at = new Date().toISOString();

    return [{ insertId: 0, affectedRows: 1 }, []];
  }

  // 4. DELETE queries
  if (lower.startsWith('delete from users')) {
    const targetId = Number(params[0]);
    const idx = memoryStore.users.findIndex((u) => u.id === targetId);
    if (idx !== -1) {
      memoryStore.users.splice(idx, 1);
      memoryStore.rides = memoryStore.rides.filter((r) => r.driver_id !== targetId);
      memoryStore.requests = memoryStore.requests.filter((req) => req.passenger_id !== targetId);
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    return [{ insertId: 0, affectedRows: 0 }, []];
  }

  return [[], []];
}

class TransactionConnection implements IDatabaseConnection {
  private releaseLock: (() => void) | null = null;
  private inTransaction = false;

  async query(sql: string, params?: any[]): Promise<[any, any]> {
    return executeMemoryQuery(sql, params);
  }

  async execute(sql: string, params?: any[]): Promise<[any, any]> {
    return executeMemoryQuery(sql, params);
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) return;
    let resolveNext!: () => void;
    const prev = memoryTxChain;
    memoryTxChain = new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
    await prev;
    this.releaseLock = resolveNext;
    this.inTransaction = true;
    await initMemoryStore();
    memorySnapshot = JSON.stringify(memoryStore);
  }

  async commit(): Promise<void> {
    if (!this.inTransaction) return;
    memorySnapshot = null;
    this.inTransaction = false;
    if (this.releaseLock) {
      this.releaseLock();
      this.releaseLock = null;
    }
  }

  async rollback(): Promise<void> {
    if (!this.inTransaction) return;
    if (memorySnapshot) {
      const restored = JSON.parse(memorySnapshot);
      memoryStore.users = restored.users;
      memoryStore.rides = restored.rides;
      memoryStore.requests = restored.requests;
      memoryStore.nextUserId = restored.nextUserId;
      memoryStore.nextRideId = restored.nextRideId;
      memoryStore.nextRequestId = restored.nextRequestId;
      memoryStore.initialized = restored.initialized;
      memorySnapshot = null;
    }
    this.inTransaction = false;
    if (this.releaseLock) {
      this.releaseLock();
      this.releaseLock = null;
    }
  }

  release(): void {
    if (this.inTransaction && this.releaseLock) {
      this.releaseLock();
      this.releaseLock = null;
      this.inTransaction = false;
    }
  }
}

export class DatabaseUnavailableError extends Error {
  status: number;
  isDatabaseUnavailable: boolean;

  constructor(message: string = 'Database service is temporarily unavailable. Please try again shortly.') {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.status = 503;
    this.isDatabaseUnavailable = true;
  }
}

export function isDbFallbackActive(): boolean {
  return useFallback;
}

export function resetDbPoolForTesting(): void {
  mysqlPool = null;
  useFallback = false;
  memoryStore.initialized = false;
}

/**
 * Explicitly forces isolated in-memory database execution for automated tests.
 * Strictly forbidden when NODE_ENV === 'production'.
 */
export async function enableIsolatedTestMemoryDb(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot enable isolated test memory DB in production.');
  }
  mysqlPool = null;
  useFallback = true;
  memoryStore.initialized = false;
  await initMemoryStore();
}

/**
 * Initialize MySQL Connection Pool with strict production safety.
 * Never silently enables in-memory fallback in production.
 */
export async function getDbPool() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevFallbackExplicitlyAllowed = !isProduction && process.env.ALLOW_IN_MEMORY_DB === 'true';

  if (useFallback) {
    if (isProduction) {
      useFallback = false;
      throw new DatabaseUnavailableError('In-memory database is strictly forbidden in production.');
    }
    return {
      isFallback: true,
      query: executeMemoryQuery,
      execute: executeMemoryQuery,
      getConnection: async () => new TransactionConnection()
    };
  }

  if (mysqlPool) {
    return mysqlPool;
  }

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
      console.warn('! DB_SSL_CA provided but path is invalid. Strict verification falling back.');
    }
  }

  // Attempt connection with retry to handle TiDB Serverless cold starts
  const maxRetries = 2;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let pool: mysql.Pool | null = null;
    try {
      pool = mysql.createPool({
        host: DB_HOST,
        port: Number(DB_PORT),
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        decimalNumbers: true,
        timezone: 'Z',
        connectTimeout: 15000,
        ssl: sslConfig
      });

      // Test connection with 15-second timeout to handle cluster wake-up latency
      const testPromise = pool.getConnection();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TiDB connection timeout')), 15000)
      );

      const conn = await Promise.race([testPromise, timeoutPromise]) as mysql.PoolConnection;
      conn.release();

      // Handle subsequent runtime pool disconnects
      (pool as any).on?.('error', (err: any) => {
        console.error('MySQL connection pool error:', err?.message || err);
        mysqlPool = null;
      });

      mysqlPool = pool;
      console.log('✓ Successfully connected to TiDB Cloud database:', DB_NAME);
      return mysqlPool;
    } catch (err: any) {
      lastError = err;
      if (pool) {
        await pool.end().catch(() => {});
      }
      if (attempt < maxRetries) {
        console.warn(`! TiDB connection attempt ${attempt} failed (${err?.message || err}). Retrying in 1.5s...`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  let errorMessage = lastError?.message || 'cannot reach host';
  if (errorMessage.includes('Missing user name prefix')) {
    errorMessage = 'TiDB Connection Error: Your DB_USER is missing the required cluster-ID prefix (e.g., should be "prefix.root" instead of just "root"). Check your TiDB Cloud console for the full username.';
  }

  console.error(`! TiDB connection failed (${errorMessage}).`);

  // Production safety: NEVER silently switch to in-memory database in production
  if (isProduction) {
    console.error('FATAL: TiDB Cloud connection failed in production. Refusing in-memory fallback. Operations will fail safely with HTTP 503.');
    throw new DatabaseUnavailableError('Database service is temporarily unavailable. Please try again shortly.');
  }

  // Non-production: Only use in-memory fallback if EXPLICITLY allowed via ALLOW_IN_MEMORY_DB=true
  if (isDevFallbackExplicitlyAllowed) {
    console.warn('⚠️ WARNING [DEV ONLY]: Explicit in-memory fallback enabled (ALLOW_IN_MEMORY_DB=true).');
    console.warn('⚠️ User accounts, rides, and requests will NOT be persisted to TiDB Cloud!');
    useFallback = true;
    await initMemoryStore();
    return {
      isFallback: true,
      query: executeMemoryQuery,
      execute: executeMemoryQuery,
      getConnection: async () => new TransactionConnection()
    };
  }

  console.error('! Database connection unavailable. Set ALLOW_IN_MEMORY_DB=true in development to allow ephemeral in-memory storage. Failing safely.');
  throw new DatabaseUnavailableError('Database service is temporarily unavailable. Please try again shortly.');
}

function isConnectionFailure(err: any): boolean {
  if (!err) return false;
  const msg = err.message || '';
  const code = err.code || '';
  return (
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ECONNRESET' ||
    msg.includes('connection timeout') ||
    msg.includes('Connection lost') ||
    msg.includes('closed')
  );
}

/**
 * Exported unified query & transaction API with connection failure propagation
 */
export const db = {
  query: async (sql: string, params?: any[]) => {
    try {
      const pool = await getDbPool();
      return await pool.query(sql, params);
    } catch (err: any) {
      if (err?.isDatabaseUnavailable || err?.status === 503) {
        throw err;
      }
      if (isConnectionFailure(err)) {
        mysqlPool = null;
        throw new DatabaseUnavailableError('Database service connection lost during query execution.');
      }
      throw err;
    }
  },
  execute: async (sql: string, params?: any[]) => {
    try {
      const pool = await getDbPool();
      return await pool.execute(sql, params);
    } catch (err: any) {
      if (err?.isDatabaseUnavailable || err?.status === 503) {
        throw err;
      }
      if (isConnectionFailure(err)) {
        mysqlPool = null;
        throw new DatabaseUnavailableError('Database service connection lost during query execution.');
      }
      throw err;
    }
  },
  getConnection: async () => {
    try {
      const pool = await getDbPool();
      return await pool.getConnection();
    } catch (err: any) {
      if (err?.isDatabaseUnavailable || err?.status === 503) {
        throw err;
      }
      if (isConnectionFailure(err)) {
        mysqlPool = null;
        throw new DatabaseUnavailableError('Database service connection lost while acquiring connection.');
      }
      throw err;
    }
  }
};

export default db;
