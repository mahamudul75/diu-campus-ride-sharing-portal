import express from 'express';
import {
  getEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
  submitUserReport,
  getMyReports,
  getBlockedUsers,
  blockUser,
  unblockUser
} from '../controllers/safetyController.ts';
import { authenticateToken } from '../middleware/auth.ts';
import { sensitiveWriteLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

router.use(authenticateToken);

router.get('/emergency-contacts', getEmergencyContacts);
router.post('/emergency-contacts', sensitiveWriteLimiter, addEmergencyContact);
router.delete('/emergency-contacts/:id', deleteEmergencyContact);

router.post('/reports', sensitiveWriteLimiter, submitUserReport);
router.get('/reports/mine', getMyReports);

router.get('/blocks', getBlockedUsers);
router.post('/blocks', sensitiveWriteLimiter, blockUser);
router.delete('/blocks/:blockedId', unblockUser);

export default router;
