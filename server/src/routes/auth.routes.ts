import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter, otpLimiter } from '../middleware/rateLimit';
import {
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../validators/schemas';

const router = Router();

router.get('/google', asyncHandler(auth.googleStart));
router.get('/google/callback', asyncHandler(auth.googleCallback));
router.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(auth.register));
router.post(
  '/verify-email',
  otpLimiter,
  validate({ body: verifyEmailSchema }),
  asyncHandler(auth.verifyEmail),
);
router.post(
  '/resend-verification',
  otpLimiter,
  validate({ body: resendVerificationSchema }),
  asyncHandler(auth.resendVerification),
);
router.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(auth.login));
router.post('/refresh', asyncHandler(auth.refresh));
router.post('/logout', asyncHandler(auth.logout));
router.get('/me', requireAuth, asyncHandler(auth.me));
router.get('/sessions', requireAuth, asyncHandler(auth.listSessions));
router.delete('/sessions/others', requireAuth, asyncHandler(auth.revokeOtherSessions));
router.delete('/sessions/:id', requireAuth, asyncHandler(auth.revokeSession));
router.post(
  '/forgot-password',
  otpLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(auth.forgotPassword),
);
router.post(
  '/reset-password',
  otpLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(auth.resetPassword),
);
router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  asyncHandler(auth.changePassword),
);

export default router;
