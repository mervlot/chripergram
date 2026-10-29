import { Router } from 'express';
import * as search from '../controllers/search.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { searchQuerySchema, cursorQuerySchema } from '../validators/schemas';

// Search, hashtags and trends. Mounted at the API root so paths are
// /api/search, /api/hashtags/:tag and /api/trends.
const router = Router();

router.get('/search', optionalAuth, validate({ query: searchQuerySchema }), asyncHandler(search.search));
router.get('/hashtags/:tag', optionalAuth, validate({ query: cursorQuerySchema }), asyncHandler(search.hashtag));
router.get('/trends', asyncHandler(search.trends));

export default router;
