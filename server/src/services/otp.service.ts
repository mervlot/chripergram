import crypto from 'crypto';
import { db } from '../config/db';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

export type OtpPurpose = 'verify_email' | 'reset_password' | 'delete_account';

// Keyed hash (HMAC) rather than a bare SHA-256: a 6-digit code has only a
// million possibilities, so an unkeyed hash would be reversible in
// milliseconds if the database ever leaked.
function hashCode(userId: string, purpose: OtpPurpose, code: string) {
  return crypto
    .createHmac('sha256', env.jwt.refreshSecret)
    .update(`${purpose}:${userId}:${code}`)
    .digest('hex');
}

/** Creates a fresh code (invalidating older ones). Enforces a resend cooldown. */
export async function issueOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const latest = await db.otpCode.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: 'desc' },
  });
  if (latest) {
    const waitMs = env.otp.resendCooldownSeconds * 1000 - (Date.now() - new Date(latest.createdAt).getTime());
    if (waitMs > 0) {
      throw ApiError.tooManyRequests(`Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`);
    }
  }
  const code = String(crypto.randomInt(100000, 1000000));
  await db.otpCode.deleteMany({ where: { userId, purpose } });
  await db.otpCode.create({
    data: {
      userId,
      purpose,
      codeHash: hashCode(userId, purpose, code),
      attempts: 0,
      expiresAt: new Date(Date.now() + env.otp.ttlMinutes * 60_000),
    },
  });
  return code;
}

export async function discardOtp(userId: string, purpose: OtpPurpose) {
  await db.otpCode.deleteMany({ where: { userId, purpose } });
}

/**
 * Checks a code. The attempt counter is incremented BEFORE the comparison and
 * the code is burned after `maxAttempts` wrong guesses, so a 6-digit code
 * cannot be brute-forced (previously unlimited guesses were possible).
 */
export async function consumeOtp(userId: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const record = await db.otpCode.findFirst({
    where: { userId, purpose, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return false;

  if (new Date(record.expiresAt).getTime() < Date.now() || record.attempts >= env.otp.maxAttempts) {
    await db.otpCode.deleteMany({ where: { userId, purpose } });
    return false;
  }

  await db.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });

  const expected = Buffer.from(record.codeHash);
  const given = Buffer.from(hashCode(userId, purpose, code));
  const ok = expected.length === given.length && crypto.timingSafeEqual(expected, given);
  if (!ok) return false;

  await db.otpCode.deleteMany({ where: { userId, purpose } });
  return true;
}
