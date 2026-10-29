import { db } from '../config/db';
import { ApiError } from '../utils/apiError';
import { hashPassword, verifyPassword } from '../utils/password';
import { env } from '../config/env';
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
} from '../utils/jwt';
import { assertLoginAllowed, recordLoginFailure, recordLoginSuccess } from '../utils/loginGuard';
import {
  sendPasswordChangedNotice,
  sendPasswordResetCode,
  sendVerificationCode,
} from './mail.service';
import { consumeOtp, discardOtp, issueOtp } from './otp.service';
import { LEGAL_VERSION } from '../config/legal';

function refreshExpiry(): Date {
  return new Date(Date.now() + env.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
}

// Real bcrypt hash of a random value, built lazily; only used to equalise login timing.
let dummyHashPromise: Promise<string> | null = null;
function dummyHash() {
  dummyHashPromise ??= hashPassword(`dummy-${Math.random()}-${Date.now()}`);
  return dummyHashPromise;
}
const ROTATION_GRACE_MS = 30_000;
let refreshMutationQueue: Promise<void> = Promise.resolve();

async function withRefreshMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = refreshMutationQueue;
  let release!: () => void;
  refreshMutationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

const meSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  passwordHash: true,
  googleId: true,
  emailVerified: true,
  verified: true,
  bio: true,
  link: true,
  location: true,
  gameStatus: true,
  avatarUrl: true,
  bannerUrl: true,
  createdAt: true,
};

function toAuthUser(user: any) {
  const { passwordHash, googleId, ...safe } = user;
  return {
    ...safe,
    hasPassword: Boolean(passwordHash),
    googleLinked: Boolean(googleId),
  };
}

// Optional device metadata captured for the "active sessions" screen.
export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

// Issues a short-lived access token plus a persisted, hashed refresh token.
// A `sessionId` ties together every token rotated from the same login (the
// "family"); on a fresh login one is generated, on rotation the parent's is
// reused so the whole chain can be tracked and burned together.
export async function issueTokens(userId: string, meta: SessionMeta = {}, sessionId?: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw ApiError.unauthorized('Session user no longer exists');
  const accessToken = signAccessToken(userId, user.email);
  const refreshToken = generateRefreshToken();
  await db.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId,
      expiresAt: refreshExpiry(),
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ip: meta.ip ?? null,
      ...(sessionId ? { sessionId } : {}),
    },
  });
  return { accessToken, refreshToken };
}

interface RegisterArgs {
  email: string;
  username: string;
  displayName: string;
  password: string;
  acceptTerms: boolean;
  marketingOptIn?: boolean;
}

// Sends a verification code. Failures are surfaced so the person can retry
// instead of being left with an account they cannot activate.
async function sendVerification(userId: string, email: string) {
  const code = await issueOtp(userId, 'verify_email');
  try {
    await sendVerificationCode(email, code);
  } catch (error) {
    await discardOtp(userId, 'verify_email');
    throw error;
  }
}

// Registration no longer signs anyone in. The account stays unverified and no
// session is issued until the emailed code is confirmed, which proves the
// person controls the address (and stops throw-away/typo/impersonation signups).
export async function register({ email, username, displayName, password, marketingOptIn }: RegisterArgs) {
  const normalisedEmail = email.toLowerCase();
  const existing = await db.user.findFirst({
    where: { OR: [{ email: normalisedEmail }, { username }] },
    select: { id: true, email: true, username: true, emailVerified: true, passwordHash: true },
  });

  if (existing) {
    // An abandoned, never-verified signup may be retried with the same email:
    // refresh the details and re-send the code instead of locking the address.
    if (existing.email === normalisedEmail && !existing.emailVerified && existing.passwordHash) {
      const taken = await db.user.findFirst({
        where: { username, NOT: { id: existing.id } },
        select: { id: true },
      });
      if (taken) throw ApiError.conflict('Username already taken');
      await db.user.update({
        where: { id: existing.id },
        data: {
          username,
          displayName,
          passwordHash: await hashPassword(password),
          termsAcceptedAt: new Date(),
          termsVersion: LEGAL_VERSION,
          privacyVersion: LEGAL_VERSION,
          marketingOptIn: Boolean(marketingOptIn),
        },
      });
      await sendVerification(existing.id, normalisedEmail);
      return { email: normalisedEmail, needsVerification: true as const };
    }
    if (existing.email === normalisedEmail) throw ApiError.conflict('Email already in use');
    throw ApiError.conflict('Username already taken');
  }

  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: {
      email: normalisedEmail,
      username,
      displayName,
      passwordHash,
      emailVerified: false,
      termsAcceptedAt: new Date(),
      termsVersion: LEGAL_VERSION,
      privacyVersion: LEGAL_VERSION,
      marketingOptIn: Boolean(marketingOptIn),
    },
    select: { id: true },
  });
  try {
    await sendVerification(user.id, normalisedEmail);
  } catch (error) {
    // Do not leave an orphaned unverified account if the email never left.
    await db.user.delete({ where: { id: user.id } });
    throw error;
  }
  return { email: normalisedEmail, needsVerification: true as const };
}

export async function verifyEmail(email: string, code: string, meta?: SessionMeta) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: meSelect });
  // Same message for unknown address / wrong code / expired code.
  const fail = () => ApiError.badRequest('Invalid or expired verification code');
  if (!user) throw fail();
  if (!user.emailVerified) {
    const ok = await consumeOtp(user.id, 'verify_email', code);
    if (!ok) throw fail();
    await db.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  } else {
    // Already verified: a code can never be used to sign in (that would turn
    // verification into a passwordless login path).
    throw fail();
  }
  const fresh = await db.user.findUnique({ where: { id: user.id }, select: meSelect });
  const tokens = await issueTokens(user.id, meta);
  return { user: toAuthUser(fresh), ...tokens };
}

export async function resendVerification(email: string) {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, emailVerified: true },
  });
  // Always behave the same so this cannot be used to enumerate accounts.
  if (!user || user.emailVerified) return;
  await sendVerification(user.id, user.email);
}

export async function login(identifier: string, password: string, meta?: SessionMeta) {
  const value = identifier.trim();
  const ip = meta?.ip ?? null;
  // Brute-force guard (per identifier + IP) on top of the IP rate limiter.
  assertLoginAllowed(value, ip);

  const user = await db.user.findFirst({
    where: { OR: [{ email: value.toLowerCase() }, { username: value }] },
  });
  if (!user || !user.passwordHash) {
    // Burn the same bcrypt time as a real check so response time does not
    // reveal whether the account exists.
    await verifyPassword(password, await dummyHash());
    recordLoginFailure(value, ip);
    // Identical message whether the account exists or uses Google, to avoid
    // leaking which usernames/emails are registered.
    throw ApiError.unauthorized('Invalid credentials');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    recordLoginFailure(value, ip);
    throw ApiError.unauthorized('Invalid credentials');
  }

  recordLoginSuccess(value, ip);

  // Password is correct but the address was never confirmed: no session. Send
  // a fresh code (cooldown-protected) and tell the client to show the code
  // screen. Only reachable with the right password, so it leaks nothing.
  if (!user.emailVerified) {
    try {
      await sendVerification(user.id, user.email);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 429)) throw error;
    }
    throw new ApiError(403, 'Please verify your email address to continue.', {
      code: 'EMAIL_NOT_VERIFIED',
      email: user.email,
    });
  }

  const tokens = await issueTokens(user.id, meta);
  return { user: toAuthUser(user), ...tokens };
}

function assertGoogleConfigured() {
  if (!env.google.clientId || !env.google.clientSecret) {
    throw ApiError.badRequest('Google sign-in is not configured');
  }
}

export function getGoogleAuthUrl(state: string) {
  assertGoogleConfigured();
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: env.google.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

async function fetchGoogleProfile(code: string): Promise<GoogleProfile> {
  assertGoogleConfigured();
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: env.google.callbackUrl,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw ApiError.unauthorized('Google sign-in failed');
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) throw ApiError.unauthorized('Google sign-in failed');

  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileRes.ok) throw ApiError.unauthorized('Could not read Google profile');
  const profile = (await profileRes.json()) as GoogleProfile;
  if (!profile.sub || !profile.email || profile.email_verified === false) {
    throw ApiError.unauthorized('Google account email must be verified');
  }
  return profile;
}

function cleanUsername(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  return cleaned.length >= 3 ? cleaned : `user${cleaned}`.slice(0, 16);
}

async function uniqueUsername(email: string) {
  const localPart = email.split('@')[0] || 'user';
  const base = cleanUsername(localPart);
  for (let i = 0; i < 50; i += 1) {
    const suffix = i === 0 ? '' : String(i + 1);
    const candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
    const exists = await db.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `user_${generateRefreshToken().slice(0, 8)}`;
}

export async function loginWithGoogle(code: string, meta?: SessionMeta) {
  const profile = await fetchGoogleProfile(code);
  const email = profile.email.toLowerCase();
  const displayName = (profile.name || email.split('@')[0] || 'Google user').slice(0, 50);
  const existing = await db.user.findFirst({
    where: { OR: [{ googleId: profile.sub }, { email }] },
    select: meSelect,
  });

  if (existing) {
    // Pre-hijack defence: if the local account was never email-verified, whoever
    // created it never proved they own this address. Google has proven it, so
    // the real owner takes over: drop any password set by the unverified
    // signup and end its sessions.
    if (!existing.emailVerified && existing.passwordHash) {
      await db.user.update({ where: { id: existing.id }, data: { passwordHash: null } });
      await db.refreshToken.deleteMany({ where: { userId: existing.id } });
    }
    const user = await db.user.update({
      where: { id: existing.id },
      data: {
        googleId: existing.googleId ?? profile.sub,
        emailVerified: true,
        avatarUrl: existing.avatarUrl ?? profile.picture ?? null,
      },
      select: meSelect,
    });
    const tokens = await issueTokens(user.id, meta);
    return { user: toAuthUser(user), isNew: false, ...tokens };
  }

  const username = await uniqueUsername(email);
  const user = await db.user.create({
    data: {
      email,
      username,
      displayName,
      googleId: profile.sub,
      emailVerified: true,
      avatarUrl: profile.picture ?? null,
    },
    select: meSelect,
  });
  const tokens = await issueTokens(user.id, meta);
  return { user: toAuthUser(user), isNew: true, ...tokens };
}

// Revokes every still-live token in a session family. Used both for explicit
// "log out this device" and automatically when token reuse is detected.
async function revokeFamily(sessionId: string) {
  await db.refreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: new Date(), rotationGraceUntil: null },
  });
}

// Validates a refresh token and rotates it: the presented token is marked
// revoked and a fresh token is issued within the same session family.
//
// A very short grace window handles simultaneous refreshes from multiple tabs.
// Outside that window, reuse still revokes the entire session family.
async function issueAfterConcurrentRotation(
  stored: any,
  meta: SessionMeta | undefined,
  now: Date,
) {
  if (
    !stored?.sessionId ||
    !stored.revokedAt ||
    !stored.rotationGraceUntil ||
    stored.rotationGraceUntil <= now ||
    stored.expiresAt <= now
  ) {
    return null;
  }

  // A family explicitly logged out or revoked elsewhere must never be revived
  // by a duplicate request that arrives during the grace period.
  const activeTokens = await db.refreshToken.count({
    where: { sessionId: stored.sessionId, revokedAt: null, expiresAt: { gt: now } },
  });
  if (activeTokens === 0) return null;

  return issueTokens(
    stored.userId,
    { userAgent: meta?.userAgent ?? stored.userAgent, ip: meta?.ip ?? stored.ip },
    stored.sessionId,
  );
}

export function rotateRefresh(refreshToken: string, meta?: SessionMeta) {
  return withRefreshMutation(() => rotateRefreshLocked(refreshToken, meta));
}

async function rotateRefreshLocked(refreshToken: string, meta?: SessionMeta) {
  if (!refreshToken) throw ApiError.unauthorized('Missing refresh token');
  const tokenHash = hashToken(refreshToken);
  const stored = await db.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) throw ApiError.unauthorized('Invalid or expired session');

  const now = new Date();

  // Concurrent refresh requests can carry the same cookie. Allow a duplicate
  // only when the row was explicitly rotated moments ago and its family still
  // has a live token; an old replay still burns the family.
  if (stored.revokedAt) {
    const concurrentResult = await issueAfterConcurrentRotation(stored, meta, now);
    if (concurrentResult) return concurrentResult;
    if (stored.sessionId) await revokeFamily(stored.sessionId);
    throw ApiError.unauthorized('Session reuse detected — please sign in again');
  }

  const sessionId = stored.sessionId ?? stored.id;

  if (stored.expiresAt <= now) {
    await db.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { sessionId, revokedAt: now, rotationGraceUntil: null },
    });
    throw ApiError.unauthorized('Invalid or expired session');
  }

  // Compare-and-set prevents two requests that read the same active row from
  // both rotating it as if they were the first request.
  const rotation = await db.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null, expiresAt: { gt: now } },
    data: {
      sessionId,
      revokedAt: now,
      lastUsedAt: now,
      rotationGraceUntil: new Date(now.getTime() + ROTATION_GRACE_MS),
    },
  });
  if (rotation.count === 0) {
    const latest = await db.refreshToken.findUnique({ where: { id: stored.id } });
    const concurrentResult = await issueAfterConcurrentRotation(latest, meta, new Date());
    if (concurrentResult) return concurrentResult;
    if (latest?.sessionId) await revokeFamily(latest.sessionId);
    throw ApiError.unauthorized('Invalid or expired session');
  }

  return issueTokens(
    stored.userId,
    { userAgent: meta?.userAgent ?? stored.userAgent, ip: meta?.ip ?? stored.ip },
    sessionId,
  );
}

// ─────────────────────── Active sessions ───────────────────────

// Resolves the session family id for the refresh token currently in use.
async function currentSessionId(currentRefreshToken?: string): Promise<string | null> {
  if (!currentRefreshToken) return null;
  const row = await db.refreshToken.findUnique({
    where: { tokenHash: hashToken(currentRefreshToken) },
    select: { id: true, sessionId: true },
  });
  return row ? row.sessionId ?? row.id : null;
}

// Lists the user's active session families (one entry per login), flagging the
// current device. Revoked/expired tokens are excluded.
export async function listSessions(userId: string, currentRefreshToken?: string) {
  const currentSid = await currentSessionId(currentRefreshToken);
  const rows = await db.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: 'desc' },
    select: { id: true, sessionId: true, userAgent: true, ip: true, createdAt: true, lastUsedAt: true },
  });

  // Collapse a family's rotated tokens into a single session entry.
  const seen = new Set<string>();
  const sessions: Array<{
    id: string;
    userAgent: string | null;
    ip: string | null;
    createdAt: Date;
    lastUsedAt: Date;
    current: boolean;
  }> = [];
  for (const r of rows) {
    const sessionId = r.sessionId ?? r.id;
    if (seen.has(sessionId)) continue;
    seen.add(sessionId);
    sessions.push({
      id: sessionId,
      userAgent: r.userAgent,
      ip: r.ip,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      current: currentSid !== null && sessionId === currentSid,
    });
  }
  return sessions;
}

// Revokes an entire session family by its id ("log out this device").
export async function revokeSession(userId: string, sessionId: string) {
  return withRefreshMutation(async () => {
    const result = await db.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ sessionId }, { id: sessionId, sessionId: null }],
      },
      data: { revokedAt: new Date(), rotationGraceUntil: null },
    });
    return result.count > 0;
  });
}

// Revokes every session except the current family ("log out everywhere else").
export async function revokeOtherSessions(userId: string, currentRefreshToken?: string) {
  return withRefreshMutation(async () => {
    const currentSid = await currentSessionId(currentRefreshToken);
    await db.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSid
          ? {
              OR: [
                { sessionId: { not: null }, NOT: { sessionId: currentSid } },
                { sessionId: null, NOT: { id: currentSid } },
              ],
            }
          : {}),
      },
      data: { revokedAt: new Date(), rotationGraceUntil: null },
    });
  });
}

export async function logout(refreshToken?: string) {
  if (!refreshToken) return;
  return withRefreshMutation(async () => {
    const stored = await db.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      select: { id: true, sessionId: true },
    });
    if (!stored) return;
    const sessionId = stored.sessionId ?? stored.id;

    // Revoke the whole login family so a parallel refresh cannot leave a
    // sibling token active after the user explicitly logs out.
    await db.refreshToken.updateMany({
      where: {
        revokedAt: null,
        OR: [{ sessionId }, { id: stored.id, sessionId: null }],
      },
      data: { revokedAt: new Date(), rotationGraceUntil: null },
    });
  });
}

export async function getMe(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: meSelect });
  if (!user) throw ApiError.notFound('User not found');
  return toAuthUser(user);
}

// Sends a short-lived code. The response is identical whether or not the
// account exists, and the code is NEVER returned over HTTP (the old dev mode
// leaked it in the JSON body, which made reset-by-anyone possible whenever
// NODE_ENV was not "production").
export async function requestPasswordReset(identifier: string) {
  const value = identifier.trim();
  const user = await db.user.findFirst({
    where: { OR: [{ email: value.toLowerCase() }, { username: value }] },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user?.passwordHash) return;

  let code: string;
  try {
    code = await issueOtp(user.id, 'reset_password');
  } catch (error) {
    // Cooldown hit: stay silent so timing/response cannot reveal the account.
    if (error instanceof ApiError && error.status === 429) return;
    throw error;
  }
  try {
    await sendPasswordResetCode(user.email, code);
  } catch (error) {
    await discardOtp(user.id, 'reset_password');
    throw error;
  }
}

export async function resetPassword(identifier: string, code: string, newPassword: string) {
  const value = identifier.trim();
  const fail = () => ApiError.badRequest('Invalid or expired reset code');
  const user = await db.user.findFirst({
    where: { OR: [{ email: value.toLowerCase() }, { username: value }] },
    select: { id: true, email: true },
  });
  if (!user) throw fail();
  if (!(await consumeOtp(user.id, 'reset_password', code))) throw fail();

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async () => {
    // Receiving the emailed code proves control of the inbox.
    await db.user.update({ where: { id: user.id }, data: { passwordHash, emailVerified: true } });
    await db.refreshToken.deleteMany({ where: { userId: user.id } });
  });
  sendPasswordChangedNotice(user.email).catch(() => undefined);
}

export async function changePassword(
  userId: string,
  currentPassword: string | undefined,
  newPassword: string,
  currentRefreshToken?: string,
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');
  if (user.passwordHash) {
    if (!currentPassword) throw ApiError.badRequest('Current password is required');
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw ApiError.badRequest('Current password is incorrect');
  }
  const passwordHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });
  // A changed password ends every OTHER session; this device stays signed in.
  await revokeOtherSessions(userId, currentRefreshToken);
  sendPasswordChangedNotice(user.email).catch(() => undefined);
}
