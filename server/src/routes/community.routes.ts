import { Router } from 'express';
import * as community from '../controllers/community.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { writeLimiter } from '../middleware/rateLimit';
import {
  createCommunitySchema,
  communityMessageSchema,
  cursorQuerySchema,
} from '../validators/schemas';

const router = Router();

router.get('/', optionalAuth, validate({ query: cursorQuerySchema }), asyncHandler(community.list));
router.post('/', requireAuth, writeLimiter, validate({ body: createCommunitySchema }), asyncHandler(community.create));
router.get('/mine', requireAuth, asyncHandler(community.mine));

router.get('/:slug', optionalAuth, asyncHandler(community.getOne));
router.get('/:slug/feed', optionalAuth, validate({ query: cursorQuerySchema }), asyncHandler(community.feed));
router.get('/:slug/members', optionalAuth, validate({ query: cursorQuerySchema }), asyncHandler(community.members));

router.post('/:slug/join', requireAuth, asyncHandler(community.join));
router.delete('/:slug/join', requireAuth, asyncHandler(community.leave));

router.get('/:slug/messages', requireAuth, validate({ query: cursorQuerySchema }), asyncHandler(community.messages));
router.post(
  '/:slug/messages',
  requireAuth,
  writeLimiter,
  validate({ body: communityMessageSchema }),
  asyncHandler(community.sendMessage),
);

export default router;
