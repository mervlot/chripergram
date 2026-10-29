import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // user id
  email?: string;
}

export function signAccessToken(userId: string, email: string): string {
  // JWT payloads are signed, not encrypted; keep claims to the identity needed
  // by the client and never put credentials or password material here.
  return jwt.sign({ sub: userId, email }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.jwt.accessSecret, { algorithms: ['HS256'] });
  if (
    typeof payload === 'string' ||
    typeof payload.sub !== 'string' ||
    (payload.email !== undefined && typeof payload.email !== 'string')
  ) {
    throw new Error('Invalid access token payload');
  }
  return { sub: payload.sub, ...(typeof payload.email === 'string' ? { email: payload.email } : {}) };
}

// Refresh tokens are opaque random strings. We store only their SHA-256 hash
// in the database, so a DB leak does not expose usable tokens.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
