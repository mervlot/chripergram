import { Router } from 'express';
import * as notification from '../controllers/notification.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { cursorQuerySchema } from '../validators/schemas';

const router = Router();

router.use(requireAuth);
router.get('/', validate({ query: cursorQuerySchema }), asyncHandler(notification.list));
router.get('/unread-count', asyncHandler(notification.unreadCount));
router.post('/read', asyncHandler(notification.markRead));

export default router;
