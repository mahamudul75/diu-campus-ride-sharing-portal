import express from 'express';
import {
  getAdminStats,
  getUsers,
  toggleBlockUser,
  deleteUser,
  getPendingDrivers,
  approveDriver,
  rejectDriver
} from '../controllers/adminController.ts';
import { authenticateToken, requireAdmin } from '../middleware/auth.ts';

const router = express.Router();

// Protect all admin routes with authentication and requireAdmin
router.use(authenticateToken, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/users', getUsers);
router.patch('/users/:id/block', toggleBlockUser);
router.delete('/users/:id', deleteUser);
router.get('/drivers/pending', getPendingDrivers);
router.patch('/drivers/:id/approve', approveDriver);
router.patch('/drivers/:id/reject', rejectDriver);

export default router;
