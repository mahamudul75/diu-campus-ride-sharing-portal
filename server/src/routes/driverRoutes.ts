import { Router } from 'express';
import { applyForDriver } from '../controllers/driverController.ts';
import { authenticateToken } from '../middleware/auth.ts';

const router = Router();

router.post('/apply', authenticateToken, applyForDriver);

export default router;
