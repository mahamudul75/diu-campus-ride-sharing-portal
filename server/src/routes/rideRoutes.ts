import express from 'express';
import {
  getRides,
  getRideById,
  createRide,
  updateRide,
  cancelRide,
  completeRide,
  getMyRides
} from '../controllers/rideController.ts';
import {
  createRideRequest,
  getRideRequests
} from '../controllers/requestController.ts';
import { authenticateToken, requireApprovedDriver, optionalAuthenticateToken } from '../middleware/auth.ts';
import { sensitiveWriteLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

// Publicly browseable or authenticated browse
router.get('/', getRides);
router.get('/mine', authenticateToken, getMyRides);
router.get('/:id', optionalAuthenticateToken, getRideById);

// Driver ride operations
router.post('/', authenticateToken, requireApprovedDriver, sensitiveWriteLimiter, createRide);
router.put('/:id', authenticateToken, updateRide);
router.patch('/:id/cancel', authenticateToken, cancelRide);
router.patch('/:id/complete', authenticateToken, completeRide);

// Ride booking requests
router.post('/:id/requests', authenticateToken, sensitiveWriteLimiter, createRideRequest);
router.get('/:id/requests', authenticateToken, getRideRequests);

export default router;
