import express from 'express';
import {
  createReview,
  getUserReviews,
  getRideReviewsAndEligibility
} from '../controllers/reviewController.ts';
import { authenticateToken, optionalAuthenticateToken } from '../middleware/auth.ts';
import { sensitiveWriteLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

router.post('/', authenticateToken, sensitiveWriteLimiter, createReview);
router.get('/user/:userId', getUserReviews);
router.get('/ride/:rideId', optionalAuthenticateToken, getRideReviewsAndEligibility);

export default router;
