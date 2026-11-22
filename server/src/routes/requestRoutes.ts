import express from 'express';
import {
  acceptRequest,
  rejectRequest,
  cancelRequest,
  getMyRequests,
  getIncomingRequests
} from '../controllers/requestController.ts';
import { authenticateToken, requireApprovedDriver } from '../middleware/auth.ts';

const router = express.Router();

router.get('/mine', authenticateToken, getMyRequests);
router.get('/incoming', authenticateToken, requireApprovedDriver, getIncomingRequests);
router.patch('/:id/accept', authenticateToken, acceptRequest);
router.patch('/:id/reject', authenticateToken, rejectRequest);
router.patch('/:id/cancel', authenticateToken, cancelRequest);

export default router;
