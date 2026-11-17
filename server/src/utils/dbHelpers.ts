import { db } from '../config/db.ts';

export interface UserExtendedFields {
  email_verified: number;
  student_verified: number;
  avatar_url: string | null;
  show_phone_to_accepted: number;
  bio: string | null;
}

export interface RatingSummary {
  avg_rating: number | null;
  review_count: number;
}

const DEFAULT_EXTENDED: UserExtendedFields = {
  email_verified: 0,
  student_verified: 0,
  avatar_url: null,
  show_phone_to_accepted: 1,
  bio: null
};

export async function getUserExtendedFields(
  userId: number,
  options?: { includeAvatar?: boolean }
): Promise<UserExtendedFields> {
  const includeAvatar = options?.includeAvatar !== false;
  try {
    const cols = includeAvatar
      ? 'email_verified, student_verified, avatar_url, show_phone_to_accepted, bio'
      : 'email_verified, student_verified, show_phone_to_accepted, bio';
    const [rows] = await db.query(`SELECT ${cols} FROM users WHERE id = ?`, [userId]);
    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0] as any;
      return {
        email_verified: Number(row.email_verified || 0),
        student_verified: Number(row.student_verified || 0),
        avatar_url: includeAvatar ? row.avatar_url || null : null,
        show_phone_to_accepted:
          row.show_phone_to_accepted === undefined ? 1 : Number(row.show_phone_to_accepted),
        bio: row.bio || null
      };
    }
    return { ...DEFAULT_EXTENDED };
  } catch (err: any) {
    if (err?.code === 'ER_BAD_FIELD_ERROR') {
      return { ...DEFAULT_EXTENDED };
    }
    throw err;
  }
}

export async function getUserExtendedFieldsBatch(
  userIds: number[],
  options?: { includeAvatar?: boolean }
): Promise<Map<number, UserExtendedFields>> {
  const map = new Map<number, UserExtendedFields>();
  const uniqueIds = Array.from(
    new Set(userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))
  );
  if (uniqueIds.length === 0) return map;

  for (const uid of uniqueIds) {
    map.set(uid, { ...DEFAULT_EXTENDED });
  }

  const includeAvatar = options?.includeAvatar !== false;
  const cols = includeAvatar
    ? 'id, email_verified, student_verified, avatar_url, show_phone_to_accepted, bio'
    : 'id, email_verified, student_verified, show_phone_to_accepted, bio';
  const placeholders = uniqueIds.map(() => '?').join(', ');

  try {
    const [rows] = await db.query(
      `SELECT ${cols} FROM users WHERE id IN (${placeholders})`,
      uniqueIds
    );
    if (Array.isArray(rows)) {
      for (const row of rows as any[]) {
        const uid = Number(row.id);
        map.set(uid, {
          email_verified: Number(row.email_verified || 0),
          student_verified: Number(row.student_verified || 0),
          avatar_url: includeAvatar ? row.avatar_url || null : null,
          show_phone_to_accepted:
            row.show_phone_to_accepted === undefined ? 1 : Number(row.show_phone_to_accepted),
          bio: row.bio || null
        });
      }
    }
  } catch (err: any) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR') {
      throw err;
    }
  }
  return map;
}

export async function areUsersBlocked(userA: number, userB: number): Promise<boolean> {
  if (userA === userB) return false;
  try {
    const [rows] = await db.query(
      `SELECT id FROM user_blocks
       WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
       LIMIT 1`,
      [userA, userB, userB, userA]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (err: any) {
    if (err?.code === 'ER_NO_SUCH_TABLE') return false;
    throw err;
  }
}

export async function getBlockedUserIds(userId: number): Promise<Set<number>> {
  const blocked = new Set<number>();
  try {
    const [rows] = await db.query(
      `SELECT blocker_id, blocked_id FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?`,
      [userId, userId]
    );
    if (Array.isArray(rows)) {
      for (const row of rows as any[]) {
        if (row.blocker_id === userId) blocked.add(Number(row.blocked_id));
        if (row.blocked_id === userId) blocked.add(Number(row.blocker_id));
      }
    }
  } catch (err: any) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') {
      throw err;
    }
  }
  return blocked;
}

export async function getUserRatingSummaries(userIds: number[]): Promise<Map<number, RatingSummary>> {
  const map = new Map<number, RatingSummary>();
  const uniqueIds = Array.from(
    new Set(userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))
  );
  if (uniqueIds.length === 0) return map;

  for (const uid of uniqueIds) {
    map.set(uid, { avg_rating: null, review_count: 0 });
  }

  const placeholders = uniqueIds.map(() => '?').join(', ');
  try {
    const [rows] = await db.query(
      `SELECT reviewee_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
       FROM reviews
       WHERE reviewee_id IN (${placeholders})
       GROUP BY reviewee_id`,
      uniqueIds
    );
    if (Array.isArray(rows)) {
      for (const row of rows as any[]) {
        const uid = Number(row.reviewee_id);
        if (map.has(uid)) {
          const count = Number(row.review_count || 0);
          map.set(uid, {
            avg_rating: count > 0 ? Number(Number(row.avg_rating).toFixed(1)) : null,
            review_count: count
          });
        }
      }
    }
  } catch (err: any) {
    if (err?.code !== 'ER_NO_SUCH_TABLE') {
      throw err;
    }
  }
  return map;
}

export async function getRideRequestCountsBatch(
  rideIds: number[]
): Promise<Map<number, { pending_requests_count: number; accepted_requests_count: number }>> {
  const map = new Map<number, { pending_requests_count: number; accepted_requests_count: number }>();
  const uniqueIds = Array.from(
    new Set(rideIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))
  );
  if (uniqueIds.length === 0) return map;

  for (const rid of uniqueIds) {
    map.set(rid, { pending_requests_count: 0, accepted_requests_count: 0 });
  }

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const [rows] = await db.query(
    `SELECT ride_id,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_requests_count,
            SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted_requests_count
     FROM ride_requests
     WHERE ride_id IN (${placeholders})
     GROUP BY ride_id`,
    uniqueIds
  );

  if (Array.isArray(rows)) {
    for (const row of rows as any[]) {
      map.set(Number(row.ride_id), {
        pending_requests_count: Number(row.pending_requests_count || 0),
        accepted_requests_count: Number(row.accepted_requests_count || 0)
      });
    }
  }
  return map;
}
