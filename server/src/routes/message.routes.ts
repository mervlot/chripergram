import { Router } from 'express';
import * as message from '../controllers/message.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { writeLimiter } from '../middleware/rateLimit';
import {
  startConversationSchema,
  sendMessageSchema,
  cursorQuerySchema,
  reactMessageSchema,
  editMessageSchema,
} from '../validators/schemas';

const router = Router();

router.use(requireAuth);
router.get('/', asyncHandler(message.listConversations));
router.post('/', validate({ body: startConversationSchema }), asyncHandler(message.startConversation));
router.get('/:id', asyncHandler(message.getConversation));
router.get('/:id/messages', validate({ query: cursorQuerySchema }), asyncHandler(message.getMessages));
router.post(
  '/:id/messages',
  writeLimiter,
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
    { name: 'videoNote', maxCount: 1 },
    { name: 'video', maxCount: 1 },
  ]),
  validate({ body: sendMessageSchema }),
  asyncHandler(message.sendMessage),
);
router.post('/:id/read', asyncHandler(message.markRead));
router.post(
  '/:id/messages/:mid/react',
  writeLimiter,
  validate({ body: reactMessageSchema }),
  asyncHandler(message.reactMessage),
);
router.patch(
  '/:id/messages/:mid',
  writeLimiter,
  validate({ body: editMessageSchema }),
  asyncHandler(message.editMessage),
);
router.delete('/:id/messages/:mid', asyncHandler(message.deleteMessage));

export default router;
