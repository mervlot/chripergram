import { Router } from 'express';
import * as story from '../controllers/story.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { upload } from '../middleware/upload';
import { writeLimiter } from '../middleware/rateLimit';
import { createStorySchema } from '../validators/schemas';

const router = Router();

router.use(requireAuth);
router.get('/feed', asyncHandler(story.feed));
router.post(
  '/',
  writeLimiter,
  upload.single('media'),
  validate({ body: createStorySchema }),
  asyncHandler(story.create),
);
router.post('/:id/view', asyncHandler(story.view));
router.get('/:id/viewers', asyncHandler(story.viewers));
router.delete('/:id', asyncHandler(story.remove));

export default router;
