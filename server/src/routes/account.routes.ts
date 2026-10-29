import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { otpLimiter } from '../middleware/rateLimit';
import * as account from '../services/account.service';

const router = Router();
router.use(requireAuth);

router.get(
  '/export',
  otpLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const data = await account.exportMyData(req.userId!);
    res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  }),
);

router.post(
  '/delete-code',
  otpLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    await account.requestDeletionCode(req.userId!);
    res.json({ message: 'We emailed you a confirmation code.' });
  }),
);

router.delete(
  '/',
  otpLimiter,
  validate({
    body: z.object({
      password: z.string().max(200).optional(),
      code: z.string().regex(/^\d{6}$/).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    await account.deleteAccount(req.userId!, req.body);
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.status(204).end();
  }),
);

export default router;
