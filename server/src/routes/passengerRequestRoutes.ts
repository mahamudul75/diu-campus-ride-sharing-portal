import express from 'express';
import {
  acceptDriverOffer,
  cancelPassengerRequest,
  createDriverOffer,
  createPassengerRequest,
  getMyDriverOffers,
  getMyPassengerRequests,
  getPassengerRequestById,
  getPassengerRequests,
  rejectDriverOffer,
  updateDriverOffer,
  withdrawDriverOffer
} from '../controllers/passengerRequestController.ts';
import { authenticateToken, requireApprovedDriver } from '../middleware/auth.ts';
import { sensitiveWriteLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

// Browse open passenger ride requests (approved drivers) & view own requests/offers
router.get('/', authenticateToken, requireApprovedDriver, getPassengerRequests);
router.get('/mine', authenticateToken, getMyPassengerRequests);
router.get('/offers/mine', authenticateToken, requireApprovedDriver, getMyDriverOffers);
router.get('/:id', authenticateToken, getPassengerRequestById);

// Passenger creates or cancels a ride request
router.post('/', authenticateToken, sensitiveWriteLimiter, createPassengerRequest);
router.patch('/:id/cancel', authenticateToken, cancelPassengerRequest);

// Approved driver submits, edits, or withdraws an offer
router.post('/:id/offers', authenticateToken, requireApprovedDriver, sensitiveWriteLimiter, createDriverOffer);
router.patch('/offers/:offerId', authenticateToken, requireApprovedDriver, updateDriverOffer);
router.patch('/offers/:offerId/withdraw', authenticateToken, requireApprovedDriver, withdrawDriverOffer);

// Passenger accepts or rejects a specific driver offer
router.patch('/:id/offers/:offerId/accept', authenticateToken, acceptDriverOffer);
router.patch('/:id/offers/:offerId/reject', authenticateToken, rejectDriverOffer);

export default router;
