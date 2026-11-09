import { Router } from 'express';
import { applyForDriver } from '../controllers/driverController.ts';
import { authenticateToken } from '../middleware/auth.ts';
import { sensitiveWriteLimiter } from '../middleware/rateLimiter.ts';

const router = Router();

router.post('/apply', authenticateToken, sensitiveWriteLimiter, applyForDriver);

export default router;
