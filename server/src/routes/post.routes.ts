import { Router } from 'express';
import * as post from '../controllers/post.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { writeLimiter } from '../middleware/rateLimit';
import {
  createPostSchema,
  cursorQuerySchema,
  postIdParamSchema,
  recordViewsSchema,
  repliesQuerySchema,
  updatePostSchema,
  votePollSchema,
} from '../validators/schemas';

const router = Router();

// Create a post (optionally with up to 4 media attachments).
router.post(
  '/',
  requireAuth,
  writeLimiter,
  upload.array('media', 4),
  validate({ body: createPostSchema }),
  asyncHandler(post.create),
);

// Impressions: the client reports posts that were really on screen.
router.post('/views', requireAuth, validate({ body: recordViewsSchema }), asyncHandler(post.recordViews));

// Static paths must precede the `/:id` matcher.
router.get('/bookmarks', requireAuth, validate({ query: cursorQuerySchema }), asyncHandler(post.listBookmarks));

router.get('/:id', validate({ params: postIdParamSchema }), optionalAuth, asyncHandler(post.getOne));
router.get('/:id/thread', validate({ params: postIdParamSchema }), optionalAuth, asyncHandler(post.getThread));
router.get('/:id/analytics', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.analytics));
router.get(
  '/:id/replies',
  validate({ params: postIdParamSchema, query: repliesQuerySchema }),
  optionalAuth,
  asyncHandler(post.getReplies),
);
router.get(
  '/:id/quotes',
  validate({ params: postIdParamSchema, query: cursorQuerySchema }),
  optionalAuth,
  asyncHandler(post.getQuotes),
);
router.get(
  '/:id/replies/flat',
  validate({ params: postIdParamSchema, query: cursorQuerySchema }),
  optionalAuth,
  asyncHandler(post.getReplyThread),
);
router.delete('/:id', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.remove));
router.patch(
  '/:id',
  validate({ params: postIdParamSchema, body: updatePostSchema }),
  requireAuth,
  asyncHandler(post.update),
);

router.post(
  '/:id/poll/vote',
  validate({ params: postIdParamSchema, body: votePollSchema }),
  requireAuth,
  writeLimiter,
  asyncHandler(post.votePoll),
);

router.post('/:id/like', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.like));
router.delete('/:id/like', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.unlike));

router.post(
  '/:id/repost',
  validate({ params: postIdParamSchema }),
  requireAuth,
  writeLimiter,
  asyncHandler(post.repost),
);
router.delete('/:id/repost', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.unrepost));

router.post('/:id/bookmark', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.bookmark));
router.delete('/:id/bookmark', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.unbookmark));

router.post('/:id/pin', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.pin));
router.delete('/:id/pin', validate({ params: postIdParamSchema }), requireAuth, asyncHandler(post.unpin));

export default router;
