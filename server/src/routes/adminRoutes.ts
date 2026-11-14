import express from 'express';
import {
  getAdminStats,
  getUsers,
  verifyStudent,
  toggleBlockUser,
  deleteUser,
  getPendingDrivers,
  approveDriver,
  rejectDriver,
  getAllRidesAdmin,
  moderateRideAdmin,
  getAllBookingsAdmin,
  getReportsAdmin,
  updateReportAdmin
} from '../controllers/adminController.ts';
import { authenticateToken, requireAdmin } from '../middleware/auth.ts';

const router = express.Router();

// Protect all admin routes with authentication and requireAdmin
router.use(authenticateToken, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/users', getUsers);
router.patch('/users/:id/verify', verifyStudent);
router.patch('/users/:id/block', toggleBlockUser);
router.delete('/users/:id', deleteUser);
router.get('/drivers/pending', getPendingDrivers);
router.patch('/drivers/:id/approve', approveDriver);
router.patch('/drivers/:id/reject', rejectDriver);
router.get('/rides', getAllRidesAdmin);
router.patch('/rides/:id/moderate', moderateRideAdmin);
router.get('/bookings', getAllBookingsAdmin);
router.get('/reports', getReportsAdmin);
router.patch('/reports/:id', updateReportAdmin);

export default router;
