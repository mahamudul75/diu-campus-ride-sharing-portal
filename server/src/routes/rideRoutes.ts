import { Router } from 'express';
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
import { authenticateToken, requireApprovedDriver } from '../middleware/auth.ts';

const router = Router();

// Publicly browseable or authenticated browse
router.get('/', getRides);
router.get('/mine', authenticateToken, getMyRides);
router.get('/:id', getRideById);

// Driver ride operations
router.post('/', authenticateToken, requireApprovedDriver, createRide);
router.put('/:id', authenticateToken, updateRide);
router.patch('/:id/cancel', authenticateToken, cancelRide);
router.patch('/:id/complete', authenticateToken, completeRide);

// Ride booking requests
router.post('/:id/requests', authenticateToken, createRideRequest);
router.get('/:id/requests', authenticateToken, getRideRequests);

export default router;
