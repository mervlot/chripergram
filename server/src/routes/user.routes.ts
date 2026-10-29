import { Router } from 'express';
import * as user from '../controllers/user.controller';
import * as feed from '../controllers/feed.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { updateProfileSchema, profileTabQuerySchema, cursorQuerySchema } from '../validators/schemas';

const router = Router();

// Update the authenticated user's profile (text fields + optional images).
router.patch(
  '/profile',
  requireAuth,
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ]),
  validate({ body: updateProfileSchema }),
  asyncHandler(user.updateProfile),
);

// "Who to follow" suggestions (static path before the `/:username` matcher).
router.get('/suggestions', requireAuth, asyncHandler(user.suggestions));

router.get('/:username', optionalAuth, asyncHandler(user.getProfile));
router.get('/:username/posts', optionalAuth, validate({ query: profileTabQuerySchema }), asyncHandler(feed.userPosts));
router.get('/:username/followers', optionalAuth, validate({ query: cursorQuerySchema }), asyncHandler(user.followers));
router.get('/:username/following', optionalAuth, validate({ query: cursorQuerySchema }), asyncHandler(user.following));

router.post('/:username/follow', requireAuth, asyncHandler(user.follow));
router.delete('/:username/follow', requireAuth, asyncHandler(user.unfollow));

router.post('/:username/block', requireAuth, asyncHandler(user.block));
router.delete('/:username/block', requireAuth, asyncHandler(user.unblock));

router.post('/:username/mute', requireAuth, asyncHandler(user.mute));
router.delete('/:username/mute', requireAuth, asyncHandler(user.unmute));

export default router;
