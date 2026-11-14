import express from 'express';
import {
  getProfile,
  updateProfile,
  updatePassword,
  uploadAvatar,
  removeAvatar,
  getPublicStudentProfile
} from '../controllers/userController.ts';
import { authenticateToken } from '../middleware/auth.ts';
import { sensitiveWriteLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, updatePassword);
router.post('/avatar', authenticateToken, sensitiveWriteLimiter, uploadAvatar);
router.delete('/avatar', authenticateToken, removeAvatar);
router.get('/:id/public', authenticateToken, getPublicStudentProfile);

export default router;
