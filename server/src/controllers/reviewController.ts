import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import { db } from '../config/db.ts';
import { isPositiveIntId } from '../utils/validators.ts';
import { createNotification } from '../services/notificationService.ts';

export async function createReview(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const rideId = isPositiveIntId(req.body?.ride_id);
    const revieweeId = isPositiveIntId(req.body?.reviewee_id);
    const ratingNum = Number(req.body?.rating);
    const rawComment = req.body?.comment;

    if (!rideId || !revieweeId) {
      res.status(400).json({ success: false, message: 'Valid ride_id and reviewee_id are required.' });
      return;
    }

    if (revieweeId === req.user.id) {
      res.status(400).json({ success: false, message: 'You cannot rate or review yourself.' });
      return;
    }

    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      res.status(400).json({ success: false, message: 'Rating must be a whole number from 1 to 5.' });
      return;
    }

    if (rawComment !== undefined && rawComment !== null && (typeof rawComment !== 'string' || rawComment.trim().length > 500)) {
      res.status(400).json({ success: false, message: 'Review comment must be at most 500 characters.' });
      return;
    }

    const [rideRows] = await db.query('SELECT id, driver_id, pickup_name, dest_name, status FROM rides WHERE id = ?', [rideId]);
    const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;

    if (!ride) {
      res.status(404).json({ success: false, message: 'Ride not found.' });
      return;
    }

    if (ride.status !== 'completed') {
      res.status(409).json({
        success: false,
        message: 'Ratings can only be submitted after the ride is marked completed.'
      });
      return;
    }

    // Eligibility: either accepted passenger rating the driver, OR driver rating an accepted passenger
    const isReviewerDriver = Number(ride.driver_id) === req.user.id;
    let eligible = false;

    if (isReviewerDriver) {
      const [reqRows] = await db.query(
        "SELECT id FROM ride_requests WHERE ride_id = ? AND passenger_id = ? AND status = 'accepted'",
        [rideId, revieweeId]
      );
      eligible = Array.isArray(reqRows) && reqRows.length > 0;
    } else if (Number(ride.driver_id) === revieweeId) {
      const [reqRows] = await db.query(
        "SELECT id FROM ride_requests WHERE ride_id = ? AND passenger_id = ? AND status = 'accepted'",
        [rideId, req.user.id]
      );
      eligible = Array.isArray(reqRows) && reqRows.length > 0;
    }

    if (!eligible) {
      res.status(403).json({
        success: false,
        message: 'Only confirmed participants of this completed ride can rate each other.'
      });
      return;
    }

    const [dupRows] = await db.query(
      'SELECT id FROM reviews WHERE ride_id = ? AND reviewer_id = ? AND reviewee_id = ?',
      [rideId, req.user.id, revieweeId]
    );
    if (Array.isArray(dupRows) && dupRows.length > 0) {
      res.status(409).json({
        success: false,
        message: 'You have already submitted a review for this user on this ride.'
      });
      return;
    }

    const cleanComment = typeof rawComment === 'string' && rawComment.trim() ? rawComment.trim() : null;
    const [insertRes] = await db.query(
      'INSERT INTO reviews (ride_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [rideId, req.user.id, revieweeId, ratingNum, cleanComment]
    );

    await createNotification({
      userId: revieweeId,
      type: 'new_review',
      title: `New ${ratingNum}-Star Review`,
      message: `${req.user.name} left a ${ratingNum}-star review for your ride (${ride.pickup_name} to ${ride.dest_name}).`,
      link: '/profile'
    });

    res.status(201).json({
      success: true,
      message: 'Thank you for your feedback!',
      reviewId: (insertRes as any).insertId
    });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ success: false, message: 'Duplicate review is not allowed.' });
      return;
    }
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(503).json({ success: false, message: 'Reviews table requires Migration 002.' });
      return;
    }
    console.error('createReview error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit review.' });
  }
}

export async function getUserReviews(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = isPositiveIntId(req.params.userId);
    if (!userId) {
      res.status(400).json({ success: false, message: 'Invalid user ID.' });
      return;
    }

    try {
      const [rows] = await db.query(
        `SELECT rv.id, rv.ride_id, rv.reviewer_id, rv.reviewee_id, rv.rating, rv.comment, rv.created_at,
                u.name AS reviewer_name, r.pickup_name, r.dest_name
         FROM reviews rv
         JOIN users u ON rv.reviewer_id = u.id
         JOIN rides r ON rv.ride_id = r.id
         WHERE rv.reviewee_id = ?
         ORDER BY rv.created_at DESC`,
        [userId]
      );

      const list = rows as any[];
      const count = list.length;
      const avgRating =
        count > 0
          ? Number((list.reduce((sum, item) => sum + Number(item.rating || 0), 0) / count).toFixed(1))
          : null;

      res.status(200).json({
        success: true,
        avg_rating: avgRating,
        review_count: count,
        reviews: list
      });
    } catch (err: any) {
      if (err?.code === 'ER_NO_SUCH_TABLE') {
        res.status(200).json({ success: true, avg_rating: null, review_count: 0, reviews: [] });
        return;
      }
      throw err;
    }
  } catch (error: any) {
    console.error('getUserReviews error:', error);
    res.status(500).json({ success: false, message: 'Failed to load reviews.' });
  }
}

export async function getRideReviewsAndEligibility(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rideId = isPositiveIntId(req.params.rideId);
    if (!rideId) {
      res.status(400).json({ success: false, message: 'Invalid ride ID.' });
      return;
    }

    let reviews: any[] = [];
    try {
      const [rows] = await db.query(
        `SELECT rv.id, rv.ride_id, rv.reviewer_id, rv.reviewee_id, rv.rating, rv.comment, rv.created_at,
                u.name AS reviewer_name, u2.name AS reviewee_name
         FROM reviews rv
         JOIN users u ON rv.reviewer_id = u.id
         JOIN users u2 ON rv.reviewee_id = u2.id
         WHERE rv.ride_id = ?
         ORDER BY rv.created_at DESC`,
        [rideId]
      );
      reviews = rows as any[];
    } catch (err: any) {
      if (err?.code !== 'ER_NO_SUCH_TABLE') throw err;
    }

    const eligibleTargets: Array<{ user_id: number; name: string; role: 'driver' | 'passenger'; already_reviewed: boolean }> = [];

    if (req.user) {
      const [rideRows] = await db.query(
        `SELECT r.id, r.driver_id, r.status, u.name AS driver_name
         FROM rides r
         JOIN users u ON r.driver_id = u.id
         WHERE r.id = ?`,
        [rideId]
      );
      const ride = Array.isArray(rideRows) && rideRows.length > 0 ? (rideRows[0] as any) : null;

      if (ride && ride.status === 'completed') {
        const myReviewedIds = new Set(
          reviews.filter((rv) => Number(rv.reviewer_id) === req.user!.id).map((rv) => Number(rv.reviewee_id))
        );

        if (Number(ride.driver_id) === req.user.id) {
          const [acceptedPassengers] = await db.query(
            `SELECT req.passenger_id, u.name
             FROM ride_requests req
             JOIN users u ON req.passenger_id = u.id
             WHERE req.ride_id = ? AND req.status = 'accepted'`,
            [rideId]
          );
          if (Array.isArray(acceptedPassengers)) {
            for (const p of acceptedPassengers as any[]) {
              eligibleTargets.push({
                user_id: Number(p.passenger_id),
                name: p.name,
                role: 'passenger',
                already_reviewed: myReviewedIds.has(Number(p.passenger_id))
              });
            }
          }
        } else {
          const [myReq] = await db.query(
            "SELECT id FROM ride_requests WHERE ride_id = ? AND passenger_id = ? AND status = 'accepted'",
            [rideId, req.user.id]
          );
          if (Array.isArray(myReq) && myReq.length > 0) {
            eligibleTargets.push({
              user_id: Number(ride.driver_id),
              name: ride.driver_name,
              role: 'driver',
              already_reviewed: myReviewedIds.has(Number(ride.driver_id))
            });
          }
        }
      }
    }

    res.status(200).json({
      success: true,
      reviews,
      eligible_targets: eligibleTargets
    });
  } catch (error: any) {
    console.error('getRideReviewsAndEligibility error:', error);
    res.status(500).json({ success: false, message: 'Failed to load ride reviews.' });
  }
}
