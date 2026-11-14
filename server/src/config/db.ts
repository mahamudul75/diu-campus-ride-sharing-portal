/**
 * Database configuration & Connection Pool
 * Supports MySQL 8 / TiDB Cloud via mysql2 with an isolated in-memory relational SQL engine
 * for automated tests (ALLOW_IN_MEMORY_DB=true / enableIsolatedTestMemoryDb).
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
  email_verified: number;
  student_verified: number;
  avatar_url: string | null;
  show_phone_to_accepted: number;
  bio: string | null;
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
  status: 'scheduled' | 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
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

interface AuthTokenRecord {
  id: number;
  user_id: number;
  purpose: 'email_verify' | 'password_reset';
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface DriverApplicationRecord {
  id: number;
  user_id: number;
  vehicle_type: 'bike' | 'car';
  vehicle_model: string;
  vehicle_plate: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  reviewed_by: number | null;
  created_at: string;
  reviewed_at: string | null;
}

interface ReviewRecord {
  id: number;
  ride_id: number;
  reviewer_id: number;
  reviewee_id: number;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface NotificationRecord {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: number;
  created_at: string;
}

interface ConversationRecord {
  id: number;
  ride_id: number;
  driver_id: number;
  passenger_id: number;
  created_at: string;
  updated_at: string;
}

interface MessageRecord {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  is_read: number;
  created_at: string;
}

interface EmergencyContactRecord {
  id: number;
  user_id: number;
  name: string;
  relationship: string;
  phone: string;
  created_at: string;
}

interface UserReportRecord {
  id: number;
  reporter_id: number;
  reported_user_id: number;
  ride_id: number | null;
  reason: string;
  description: string;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  admin_note: string | null;
  reviewed_by: number | null;
  created_at: string;
  updated_at: string;
}

interface UserBlockRecord {
  id: number;
  blocker_id: number;
  blocked_id: number;
  created_at: string;
}

const memoryStore = {
  users: [] as UserRecord[],
  rides: [] as RideRecord[],
  requests: [] as RideRequestRecord[],
  authTokens: [] as AuthTokenRecord[],
  driverApplications: [] as DriverApplicationRecord[],
  reviews: [] as ReviewRecord[],
  notifications: [] as NotificationRecord[],
  conversations: [] as ConversationRecord[],
  messages: [] as MessageRecord[],
  emergencyContacts: [] as EmergencyContactRecord[],
  userReports: [] as UserReportRecord[],
  userBlocks: [] as UserBlockRecord[],
  nextUserId: 6,
  nextRideId: 7,
  nextRequestId: 6,
  nextAuthTokenId: 1,
  nextDriverAppId: 4,
  nextReviewId: 2,
  nextNotificationId: 1,
  nextConversationId: 1,
  nextMessageId: 1,
  nextEmergencyContactId: 1,
  nextReportId: 1,
  nextBlockId: 1,
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
      email_verified: 1,
      student_verified: 1,
      avatar_url: null,
      show_phone_to_accepted: 1,
      bio: 'DIU Campus Transport Administrator',
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
      email_verified: 1,
      student_verified: 1,
      avatar_url: null,
      show_phone_to_accepted: 1,
      bio: 'CSE Senior commuting daily between Ashulia & Dhanmondi.',
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
      email_verified: 1,
      student_verified: 1,
      avatar_url: null,
      show_phone_to_accepted: 1,
      bio: 'SWE student driving from Uttara to DIU Smart City.',
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
      email_verified: 0,
      student_verified: 0,
      avatar_url: null,
      show_phone_to_accepted: 1,
      bio: null,
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
      email_verified: 1,
      student_verified: 0,
      avatar_url: null,
      show_phone_to_accepted: 1,
      bio: null,
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

  memoryStore.driverApplications = [
    {
      id: 1,
      user_id: 2,
      vehicle_type: 'bike',
      vehicle_model: 'Yamaha FZ-S V3',
      vehicle_plate: 'Dhaka Metro-HA 45-8921',
      status: 'approved',
      admin_note: 'Verified registration and DIU student ID.',
      reviewed_by: 1,
      created_at: new Date(now - 86400000 * 14).toISOString(),
      reviewed_at: new Date(now - 86400000 * 13).toISOString()
    },
    {
      id: 2,
      user_id: 3,
      vehicle_type: 'car',
      vehicle_model: 'Toyota Aqua 2018',
      vehicle_plate: 'Dhaka Metro-GA 19-3342',
      status: 'approved',
      admin_note: 'Vehicle verified.',
      reviewed_by: 1,
      created_at: new Date(now - 86400000 * 9).toISOString(),
      reviewed_at: new Date(now - 86400000 * 8).toISOString()
    },
    {
      id: 3,
      user_id: 4,
      vehicle_type: 'bike',
      vehicle_model: 'Honda CB Trigger',
      vehicle_plate: 'Dhaka Metro-LA 12-4099',
      status: 'pending',
      admin_note: null,
      reviewed_by: null,
      created_at: new Date(now - 86400000 * 5).toISOString(),
      reviewed_at: null
    }
  ];

  memoryStore.reviews = [
    {
      id: 1,
      ride_id: 6,
      reviewer_id: 5,
      reviewee_id: 3,
      rating: 5,
      comment: 'Very punctual and smooth ride to Ashulia campus.',
      created_at: new Date(now - 43200000).toISOString()
    }
  ];

  memoryStore.authTokens = [];
  memoryStore.notifications = [];
  memoryStore.conversations = [];
  memoryStore.messages = [];
  memoryStore.emergencyContacts = [];
  memoryStore.userReports = [];
  memoryStore.userBlocks = [];

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

async function executeMemoryQuery(sql: string, params: any[] = []): Promise<[any, any]> {
  await initMemoryStore();
  const cleanSql = sql.replace(/\s+/g, ' ').trim();
  const lower = cleanSql.toLowerCase();

  // =========================================================================
  // 1. SELECT QUERIES
  // =========================================================================
  if (lower.startsWith('select')) {
    if (lower.includes('select 1') || lower.includes('1 as connected') || lower.includes('1 as val')) {
      return [[{ connected: 1, val: 1, 1: 1 }], []];
    }

    // auth_tokens
    if (lower.includes('from auth_tokens')) {
      let rows = [...memoryStore.authTokens];
      if (lower.includes('token_hash = ?')) {
        rows = rows.filter((t) => t.token_hash === params[0]);
      }
      if (lower.includes("purpose = 'password_reset'")) {
        rows = rows.filter((t) => t.purpose === 'password_reset');
      } else if (lower.includes("purpose = 'email_verify'")) {
        rows = rows.filter((t) => t.purpose === 'email_verify');
      }
      if (lower.includes('used_at is null')) {
        rows = rows.filter((t) => t.used_at === null);
      }
      return [rows, []];
    }

    // driver_applications
    if (lower.includes('from driver_applications')) {
      let rows = memoryStore.driverApplications.map((da) => {
        const rev = da.reviewed_by ? memoryStore.users.find((u) => u.id === da.reviewed_by) : null;
        return { ...da, reviewer_name: rev?.name || null };
      });
      if (lower.includes('da.user_id = ?') || lower.includes('user_id = ?')) {
        rows = rows.filter((r) => r.user_id === Number(params[0]));
      }
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return [rows, []];
    }

    // reviews
    if (lower.includes('from reviews')) {
      if (lower.includes('group by reviewee_id')) {
        const grouped = new Map<number, number[]>();
        for (const rv of memoryStore.reviews) {
          if (!grouped.has(rv.reviewee_id)) grouped.set(rv.reviewee_id, []);
          grouped.get(rv.reviewee_id)!.push(rv.rating);
        }
        const summary = Array.from(grouped.entries()).map(([reviewee_id, ratings]) => ({
          reviewee_id,
          avg_rating: ratings.reduce((a, b) => a + b, 0) / ratings.length,
          review_count: ratings.length
        }));
        return [summary, []];
      }

      let rows = memoryStore.reviews.map((rv) => {
        const reviewer = memoryStore.users.find((u) => u.id === rv.reviewer_id);
        const reviewee = memoryStore.users.find((u) => u.id === rv.reviewee_id);
        const ride = memoryStore.rides.find((r) => r.id === rv.ride_id);
        return {
          ...rv,
          reviewer_name: reviewer?.name || 'DIU Student',
          reviewee_name: reviewee?.name || 'DIU Student',
          pickup_name: ride?.pickup_name || '',
          dest_name: ride?.dest_name || ''
        };
      });

      if (lower.includes('ride_id = ? and reviewer_id = ? and reviewee_id = ?')) {
        rows = rows.filter(
          (rv) =>
            rv.ride_id === Number(params[0]) &&
            rv.reviewer_id === Number(params[1]) &&
            rv.reviewee_id === Number(params[2])
        );
      } else if (lower.includes('rv.reviewee_id = ?')) {
        rows = rows.filter((rv) => rv.reviewee_id === Number(params[0]));
      } else if (lower.includes('rv.ride_id = ?')) {
        rows = rows.filter((rv) => rv.ride_id === Number(params[0]));
      } else if (lower.includes('reviewer_id = ?')) {
        rows = rows.filter((rv) => rv.reviewer_id === Number(params[0]));
      }

      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return [rows, []];
    }

    // notifications
    if (lower.includes('from notifications')) {
      let rows = [...memoryStore.notifications];
      if (lower.includes('where id = ?')) {
        rows = rows.filter((n) => n.id === Number(params[0]));
      } else if (lower.includes('user_id = ?')) {
        rows = rows.filter((n) => n.user_id === Number(params[0]));
        if (lower.includes("type = 'ride_reminder'")) {
          rows = rows.filter((n) => n.type === 'ride_reminder');
        }
      }
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return [rows, []];
    }

    // conversations
    if (lower.includes('from conversations')) {
      let rows = memoryStore.conversations.map((c) => {
        const ride = memoryStore.rides.find((r) => r.id === c.ride_id);
        const driver = memoryStore.users.find((u) => u.id === c.driver_id);
        const passenger = memoryStore.users.find((u) => u.id === c.passenger_id);
        return {
          ...c,
          pickup_name: ride?.pickup_name || '',
          dest_name: ride?.dest_name || '',
          departure_time: ride?.departure_time || '',
          ride_status: ride?.status || 'open',
          driver_name: driver?.name || 'Driver',
          passenger_name: passenger?.name || 'Passenger'
        };
      });

      if (lower.includes('where id = ?')) {
        rows = rows.filter((c) => c.id === Number(params[0]));
      } else if (lower.includes('ride_id = ? and passenger_id = ?')) {
        rows = rows.filter((c) => c.ride_id === Number(params[0]) && c.passenger_id === Number(params[1]));
      } else if (lower.includes('c.driver_id = ? or c.passenger_id = ?')) {
        const uid = Number(params[0]);
        rows = rows.filter((c) => c.driver_id === uid || c.passenger_id === uid);
      }

      rows.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      return [rows, []];
    }

    // messages
    if (lower.includes('from messages')) {
      let rows = memoryStore.messages.map((m) => {
        const sender = memoryStore.users.find((u) => u.id === m.sender_id);
        return { ...m, sender_name: sender?.name || 'DIU Student' };
      });
      if (lower.includes('conversation_id = ?')) {
        rows = rows.filter((m) => m.conversation_id === Number(params[0]));
      }
      if (lower.includes('order by created_at desc') || lower.includes('order by m.created_at desc')) {
        rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
        rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      return [rows, []];
    }

    // emergency_contacts
    if (lower.includes('from emergency_contacts')) {
      let rows = [...memoryStore.emergencyContacts];
      if (lower.includes('where id = ?')) {
        rows = rows.filter((c) => c.id === Number(params[0]));
      } else if (lower.includes('user_id = ?')) {
        rows = rows.filter((c) => c.user_id === Number(params[0]));
      }
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return [rows, []];
    }

    // user_reports
    if (lower.includes('from user_reports')) {
      let rows = memoryStore.userReports.map((rp) => {
        const reporter = memoryStore.users.find((u) => u.id === rp.reporter_id);
        const reported = memoryStore.users.find((u) => u.id === rp.reported_user_id);
        return {
          ...rp,
          reporter_name: reporter?.name || 'Reporter',
          reporter_student_id: reporter?.student_id || '',
          reported_user_name: reported?.name || 'Student',
          reported_student_id: reported?.student_id || '',
          reported_is_blocked: reported?.is_blocked || 0
        };
      });

      if (lower.includes('where id = ?')) {
        rows = rows.filter((r) => r.id === Number(params[0]));
      } else if (lower.includes('rp.reporter_id = ?')) {
        rows = rows.filter((r) => r.reporter_id === Number(params[0]));
      }
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return [rows, []];
    }

    // user_blocks
    if (lower.includes('from user_blocks')) {
      let rows = memoryStore.userBlocks.map((ub) => {
        const blocked = memoryStore.users.find((u) => u.id === ub.blocked_id);
        return {
          ...ub,
          blocked_name: blocked?.name || 'Student',
          blocked_student_id: blocked?.student_id || ''
        };
      });

      if (lower.includes('(blocker_id = ? and blocked_id = ?) or (blocker_id = ? and blocked_id = ?)')) {
        const a = Number(params[0]);
        const b = Number(params[1]);
        rows = rows.filter((r) => (r.blocker_id === a && r.blocked_id === b) || (r.blocker_id === b && r.blocked_id === a));
      } else if (lower.includes('blocker_id = ? and blocked_id = ?')) {
        rows = rows.filter((r) => r.blocker_id === Number(params[0]) && r.blocked_id === Number(params[1]));
      } else if (lower.includes('blocker_id = ? or blocked_id = ?')) {
        const uid = Number(params[0]);
        rows = rows.filter((r) => r.blocker_id === uid || r.blocked_id === uid);
      } else if (lower.includes('ub.blocker_id = ?')) {
        rows = rows.filter((r) => r.blocker_id === Number(params[0]));
      }
      return [rows, []];
    }

    // Aggregates on users / rides / ride_requests
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
      return [
        [
          {
            total_users: memoryStore.users.length,
            approved_drivers: memoryStore.users.filter((u) => u.driver_status === 'approved').length,
            pending_drivers: memoryStore.users.filter((u) => u.driver_status === 'pending').length,
            total_rides: memoryStore.rides.length,
            total_requests: memoryStore.requests.length
          }
        ],
        []
      ];
    }

    // Select ride_requests (BEFORE users because queries JOIN users!)
    if (lower.includes('from ride_requests')) {
      let results = memoryStore.requests.map((req) => {
        const ride = memoryStore.rides.find((r) => r.id === req.ride_id);
        const passenger = memoryStore.users.find((u) => u.id === req.passenger_id);
        const driver = ride ? memoryStore.users.find((u) => u.id === ride.driver_id) : null;

        return {
          id: req.id,
          ride_id: req.ride_id,
          passenger_id: req.passenger_id,
          name: passenger?.name,
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
      } else if (lower.includes('ride_id = ?') && lower.includes("status = 'accepted'")) {
        results = results.filter((r) => r.ride_id === Number(params[0]) && r.status === 'accepted');
      } else if (lower.includes('ride_id = ?') && lower.includes('status in (')) {
        const statuses = params.slice(1);
        results = results.filter((r) => r.ride_id === Number(params[0]) && statuses.includes(r.status));
      } else if (lower.includes('ride_id = ?')) {
        results = results.filter((r) => r.ride_id === Number(params[0]));
      } else if (lower.includes('passenger_id = ?') && lower.includes("status = 'accepted'")) {
        results = results.filter((r) => r.passenger_id === Number(params[0]) && r.status === 'accepted');
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
        } else if (lower.includes("role = 'admin' and is_blocked = 0")) {
          filtered = filtered.filter((u) => u.role === 'admin' && !u.is_blocked);
        } else if (lower.includes('student_verified = 1')) {
          filtered = filtered.filter((u) => u.student_verified === 1);
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
          ride_id: r.id,
          driver_name: driver?.name || 'DIU Student',
          driver_email: driver?.email || '',
          driver_phone: driver?.phone || '',
          driver_student_id: driver?.student_id || '',
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

      if (lower.includes("r.status in ('open', 'scheduled')")) {
        results = results.filter((r) => r.status === 'open' || r.status === 'scheduled');
      } else if (lower.includes("r.status = 'open'") || lower.includes("status = 'open'")) {
        results = results.filter((r) => r.status === 'open');
      }

      if (lower.includes('r.seats_available > 0')) {
        results = results.filter((r) => r.seats_available > 0);
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
      if (lower.includes('r.seats_available >= ?')) {
        const minSeats = Number(params[paramIdx++]);
        results = results.filter((r) => r.seats_available >= minSeats);
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

  // =========================================================================
  // 2. INSERT QUERIES
  // =========================================================================
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
      email_verified: 0,
      student_verified: 0,
      avatar_url: null,
      show_phone_to_accepted: 1,
      bio: null,
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
    const rawStatus = params[13];
    const rideStatus: RideRecord['status'] = rawStatus === 'scheduled' ? 'scheduled' : 'open';
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
      status: rideStatus,
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

  if (lower.startsWith('insert into auth_tokens')) {
    const newToken: AuthTokenRecord = {
      id: memoryStore.nextAuthTokenId++,
      user_id: Number(params[0]),
      purpose: params[1],
      token_hash: params[2],
      expires_at: params[3],
      used_at: null,
      created_at: new Date().toISOString()
    };
    memoryStore.authTokens.push(newToken);
    return [{ insertId: newToken.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into driver_applications')) {
    const appRec: DriverApplicationRecord = {
      id: memoryStore.nextDriverAppId++,
      user_id: Number(params[0]),
      vehicle_type: params[1],
      vehicle_model: params[2],
      vehicle_plate: params[3],
      status: 'pending',
      admin_note: null,
      reviewed_by: null,
      created_at: new Date().toISOString(),
      reviewed_at: null
    };
    memoryStore.driverApplications.push(appRec);
    return [{ insertId: appRec.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into reviews')) {
    const rideId = Number(params[0]);
    const reviewerId = Number(params[1]);
    const revieweeId = Number(params[2]);
    if (
      memoryStore.reviews.some(
        (rv) => rv.ride_id === rideId && rv.reviewer_id === reviewerId && rv.reviewee_id === revieweeId
      )
    ) {
      const dupErr: any = new Error('Duplicate entry');
      dupErr.code = 'ER_DUP_ENTRY';
      throw dupErr;
    }
    const rev: ReviewRecord = {
      id: memoryStore.nextReviewId++,
      ride_id: rideId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      rating: Number(params[3]),
      comment: params[4] ?? null,
      created_at: new Date().toISOString()
    };
    memoryStore.reviews.push(rev);
    return [{ insertId: rev.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into notifications')) {
    const notif: NotificationRecord = {
      id: memoryStore.nextNotificationId++,
      user_id: Number(params[0]),
      type: params[1],
      title: params[2],
      message: params[3],
      link: params[4] ?? null,
      is_read: 0,
      created_at: new Date().toISOString()
    };
    memoryStore.notifications.push(notif);
    return [{ insertId: notif.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into conversations')) {
    const rideId = Number(params[0]);
    const driverId = Number(params[1]);
    const passengerId = Number(params[2]);
    if (memoryStore.conversations.some((c) => c.ride_id === rideId && c.passenger_id === passengerId)) {
      const dupErr: any = new Error('Duplicate entry');
      dupErr.code = 'ER_DUP_ENTRY';
      throw dupErr;
    }
    const conv: ConversationRecord = {
      id: memoryStore.nextConversationId++,
      ride_id: rideId,
      driver_id: driverId,
      passenger_id: passengerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryStore.conversations.push(conv);
    return [{ insertId: conv.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into messages')) {
    const msg: MessageRecord = {
      id: memoryStore.nextMessageId++,
      conversation_id: Number(params[0]),
      sender_id: Number(params[1]),
      content: params[2],
      is_read: 0,
      created_at: new Date().toISOString()
    };
    memoryStore.messages.push(msg);
    return [{ insertId: msg.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into emergency_contacts')) {
    const ec: EmergencyContactRecord = {
      id: memoryStore.nextEmergencyContactId++,
      user_id: Number(params[0]),
      name: params[1],
      relationship: params[2],
      phone: params[3],
      created_at: new Date().toISOString()
    };
    memoryStore.emergencyContacts.push(ec);
    return [{ insertId: ec.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into user_reports')) {
    const rep: UserReportRecord = {
      id: memoryStore.nextReportId++,
      reporter_id: Number(params[0]),
      reported_user_id: Number(params[1]),
      ride_id: params[2] ? Number(params[2]) : null,
      reason: params[3],
      description: params[4],
      status: 'pending',
      admin_note: null,
      reviewed_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    memoryStore.userReports.push(rep);
    return [{ insertId: rep.id, affectedRows: 1 }, []];
  }

  if (lower.startsWith('insert into user_blocks')) {
    const blockerId = Number(params[0]);
    const blockedId = Number(params[1]);
    if (memoryStore.userBlocks.some((b) => b.blocker_id === blockerId && b.blocked_id === blockedId)) {
      const dupErr: any = new Error('Duplicate entry');
      dupErr.code = 'ER_DUP_ENTRY';
      throw dupErr;
    }
    const blk: UserBlockRecord = {
      id: memoryStore.nextBlockId++,
      blocker_id: blockerId,
      blocked_id: blockedId,
      created_at: new Date().toISOString()
    };
    memoryStore.userBlocks.push(blk);
    return [{ insertId: blk.id, affectedRows: 1 }, []];
  }

  // =========================================================================
  // 3. UPDATE QUERIES
  // =========================================================================
  if (lower.startsWith('update auth_tokens')) {
    if (lower.includes('where user_id = ? and purpose = ? and used_at is null')) {
      let affected = 0;
      for (const tok of memoryStore.authTokens) {
        if (tok.user_id === Number(params[0]) && tok.purpose === params[1] && tok.used_at === null) {
          tok.used_at = new Date().toISOString();
          affected++;
        }
      }
      return [{ insertId: 0, affectedRows: affected }, []];
    }
    if (lower.includes('where id = ?')) {
      const tok = memoryStore.authTokens.find((t) => t.id === Number(params[0]));
      if (tok) {
        tok.used_at = new Date().toISOString();
        return [{ insertId: 0, affectedRows: 1 }, []];
      }
    }
    return [{ insertId: 0, affectedRows: 0 }, []];
  }

  if (lower.startsWith('update driver_applications')) {
    const targetUserId = Number(params[params.length - 1]);
    let affected = 0;
    for (const da of memoryStore.driverApplications) {
      if (da.user_id === targetUserId && da.status === 'pending') {
        da.status = lower.includes("'approved'") ? 'approved' : 'rejected';
        da.admin_note = params[0] ?? null;
        da.reviewed_by = params[1] ? Number(params[1]) : null;
        da.reviewed_at = new Date().toISOString();
        affected++;
      }
    }
    return [{ insertId: 0, affectedRows: affected }, []];
  }

  if (lower.startsWith('update notifications')) {
    if (lower.includes('where id = ? and user_id = ?')) {
      const n = memoryStore.notifications.find((x) => x.id === Number(params[0]) && x.user_id === Number(params[1]));
      if (!n) return [{ insertId: 0, affectedRows: 0 }, []];
      n.is_read = 1;
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    if (lower.includes('where user_id = ?')) {
      let affected = 0;
      for (const n of memoryStore.notifications) {
        if (n.user_id === Number(params[0])) {
          n.is_read = 1;
          affected++;
        }
      }
      return [{ insertId: 0, affectedRows: affected }, []];
    }
  }

  if (lower.startsWith('update conversations')) {
    const conv = memoryStore.conversations.find((c) => c.id === Number(params[0]));
    if (conv) {
      conv.updated_at = new Date().toISOString();
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    return [{ insertId: 0, affectedRows: 0 }, []];
  }

  if (lower.startsWith('update messages')) {
    const convId = Number(params[0]);
    const myId = Number(params[1]);
    let affected = 0;
    for (const m of memoryStore.messages) {
      if (m.conversation_id === convId && m.sender_id !== myId && m.is_read === 0) {
        m.is_read = 1;
        affected++;
      }
    }
    return [{ insertId: 0, affectedRows: affected }, []];
  }

  if (lower.startsWith('update user_reports')) {
    const reportId = Number(params[params.length - 1]);
    const rep = memoryStore.userReports.find((r) => r.id === reportId);
    if (!rep) return [{ insertId: 0, affectedRows: 0 }, []];
    rep.status = params[0];
    rep.admin_note = params[1] ?? null;
    rep.reviewed_by = params[2] ? Number(params[2]) : null;
    rep.updated_at = new Date().toISOString();
    return [{ insertId: 0, affectedRows: 1 }, []];
  }

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
    } else if (lower.includes('set email_verified = 1')) {
      user.email_verified = 1;
    } else if (lower.includes('set student_verified = ?')) {
      user.student_verified = Number(params[0]);
    } else if (lower.includes('set avatar_url = null')) {
      user.avatar_url = null;
    } else if (lower.includes('set avatar_url = ?')) {
      user.avatar_url = params[0];
    } else if (lower.includes('set bio = ?, show_phone_to_accepted = ?')) {
      user.bio = params[0];
      user.show_phone_to_accepted = Number(params[1]);
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

    if (lower.includes('set status = ? where id = ?')) {
      ride.status = params[0];
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
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

  // =========================================================================
  // 4. DELETE QUERIES
  // =========================================================================
  if (lower.startsWith('delete from notifications')) {
    const idx = memoryStore.notifications.findIndex(
      (n) => n.id === Number(params[0]) && n.user_id === Number(params[1])
    );
    if (idx !== -1) {
      memoryStore.notifications.splice(idx, 1);
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    return [{ insertId: 0, affectedRows: 0 }, []];
  }

  if (lower.startsWith('delete from emergency_contacts')) {
    const idx = memoryStore.emergencyContacts.findIndex(
      (c) => c.id === Number(params[0]) && c.user_id === Number(params[1])
    );
    if (idx !== -1) {
      memoryStore.emergencyContacts.splice(idx, 1);
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    return [{ insertId: 0, affectedRows: 0 }, []];
  }

  if (lower.startsWith('delete from user_blocks')) {
    const idx = memoryStore.userBlocks.findIndex(
      (b) => b.blocker_id === Number(params[0]) && b.blocked_id === Number(params[1])
    );
    if (idx !== -1) {
      memoryStore.userBlocks.splice(idx, 1);
      return [{ insertId: 0, affectedRows: 1 }, []];
    }
    return [{ insertId: 0, affectedRows: 0 }, []];
  }

  if (lower.startsWith('delete from users')) {
    const targetId = Number(params[0]);
    const idx = memoryStore.users.findIndex((u) => u.id === targetId);
    if (idx !== -1) {
      memoryStore.users.splice(idx, 1);
      memoryStore.rides = memoryStore.rides.filter((r) => r.driver_id !== targetId);
      memoryStore.requests = memoryStore.requests.filter((req) => req.passenger_id !== targetId);
      memoryStore.notifications = memoryStore.notifications.filter((n) => n.user_id !== targetId);
      memoryStore.emergencyContacts = memoryStore.emergencyContacts.filter((c) => c.user_id !== targetId);
      memoryStore.userBlocks = memoryStore.userBlocks.filter(
        (b) => b.blocker_id !== targetId && b.blocked_id !== targetId
      );
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
      Object.assign(memoryStore, restored);
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

export async function enableIsolatedTestMemoryDb(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot enable isolated test memory DB in production.');
  }
  mysqlPool = null;
  useFallback = true;
  memoryStore.initialized = false;
  await initMemoryStore();
}

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

      const testPromise = pool.getConnection();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TiDB connection timeout')), 15000)
      );

      const conn = (await Promise.race([testPromise, timeoutPromise])) as mysql.PoolConnection;
      conn.release();

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
    errorMessage =
      'TiDB Connection Error: Your DB_USER is missing the required cluster-ID prefix (e.g., should be "prefix.root" instead of just "root"). Check your TiDB Cloud console for the full username.';
  }

  console.error(`! TiDB connection failed (${errorMessage}).`);

  if (isProduction) {
    console.error('FATAL: TiDB Cloud connection failed in production. Refusing in-memory fallback. Operations will fail safely with HTTP 503.');
    throw new DatabaseUnavailableError('Database service is temporarily unavailable. Please try again shortly.');
  }

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
