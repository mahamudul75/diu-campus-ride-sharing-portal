import express from 'express';
import {
  register,
  login,
  logout,
  getMe,
  requestPasswordReset,
  resetPassword,
  resendVerificationEmail,
  verifyEmail
} from '../controllers/authController.ts';
import { authenticateToken } from '../middleware/auth.ts';
import { loginAccountLimiter, loginIpLimiter, registerLimiter, authTokenLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginIpLimiter, loginAccountLimiter, login);
router.post('/logout', logout);
router.get('/me', authenticateToken, getMe);
router.post('/forgot-password', authTokenLimiter, requestPasswordReset);
router.post('/reset-password', authTokenLimiter, resetPassword);
router.post('/verify-email', authTokenLimiter, verifyEmail);
router.post('/resend-verification', authenticateToken, authTokenLimiter, resendVerificationEmail);

export default router;
