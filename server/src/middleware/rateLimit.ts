import rateLimit from 'express-rate-limit';

// Generous global limiter applied to every API route.
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests, please slow down.' } },
});

// Strict limiter for authentication endpoints to throttle brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Try again later.' } },
});

// Limiter for write-heavy actions (creating posts, messages).
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'You are doing that too often.' } },
});

// Tight limiter for anything that sends or checks an emailed code.
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many code attempts. Try again in a few minutes.' } },
});
