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

export async function getUserExtendedFields(userId: number): Promise<UserExtendedFields> {
  try {
    const [rows] = await db.query(
      `SELECT email_verified, student_verified, avatar_url, show_phone_to_accepted, bio
       FROM users WHERE id = ?`,
      [userId]
    );
    if (Array.isArray(rows) && rows.length > 0) {
      const row = rows[0] as any;
      return {
        email_verified: Number(row.email_verified || 0),
        student_verified: Number(row.student_verified || 0),
        avatar_url: row.avatar_url || null,
        show_phone_to_accepted: row.show_phone_to_accepted === undefined ? 1 : Number(row.show_phone_to_accepted),
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
  if (userIds.length === 0) return map;

  const uniqueIds = Array.from(new Set(userIds));
  for (const uid of uniqueIds) {
    map.set(uid, { avg_rating: null, review_count: 0 });
  }

  try {
    const [rows] = await db.query(
      `SELECT reviewee_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count
       FROM reviews
       GROUP BY reviewee_id`
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
