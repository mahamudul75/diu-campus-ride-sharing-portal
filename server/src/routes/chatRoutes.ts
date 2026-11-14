import express from 'express';
import {
  getConversations,
  getOrCreateConversation,
  getConversationMessages,
  sendMessage
} from '../controllers/chatController.ts';
import { authenticateToken } from '../middleware/auth.ts';
import { sensitiveWriteLimiter } from '../middleware/rateLimiter.ts';

const router = express.Router();

router.use(authenticateToken);

router.get('/conversations', getConversations);
router.post('/conversations', sensitiveWriteLimiter, getOrCreateConversation);
router.get('/conversations/:id/messages', getConversationMessages);
router.post('/conversations/:id/messages', sensitiveWriteLimiter, sendMessage);

export default router;
