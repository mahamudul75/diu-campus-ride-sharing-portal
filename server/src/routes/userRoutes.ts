import { Router } from 'express';
import { getProfile, updateProfile, updatePassword } from '../controllers/userController.ts';
import { authenticateToken } from '../middleware/auth.ts';

const router = Router();

router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, updatePassword);

export default router;
