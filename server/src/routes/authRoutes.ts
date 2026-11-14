import express from 'express';
import { register, login, logout, getMe } from '../controllers/authController.ts';
import { authenticateToken } from '../middleware/auth.ts';
import { loginAccountLimiter, loginIpLimiter, registerLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginIpLimiter, loginAccountLimiter, login);
router.post('/logout', logout);
router.get('/me', authenticateToken, getMe);

export default router;
