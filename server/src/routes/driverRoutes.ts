import express from 'express';
import { applyForDriver, getDriverApplicationHistory } from '../controllers/driverController.ts';
import { authenticateToken } from '../middleware/auth.ts';
import { sensitiveWriteLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

router.post('/apply', authenticateToken, sensitiveWriteLimiter, applyForDriver);
router.get('/history', authenticateToken, getDriverApplicationHistory);

export default router;
