import { Router } from 'express';
import * as feed from '../controllers/feed.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { cursorQuerySchema, pageQuerySchema } from '../validators/schemas';

const router = Router();

router.get('/home', requireAuth, validate({ query: cursorQuerySchema }), asyncHandler(feed.home));
router.get('/explore', optionalAuth, validate({ query: pageQuerySchema }), asyncHandler(feed.explore));
router.get('/foryou', requireAuth, validate({ query: pageQuerySchema }), asyncHandler(feed.forYou));
router.get('/black', optionalAuth, validate({ query: pageQuerySchema }), asyncHandler(feed.black));

export default router;
