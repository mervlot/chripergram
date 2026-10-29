import { Request, Response } from 'express';
import crypto from 'crypto';
import * as authService from '../services/auth.service';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

const REFRESH_COOKIE = 'refreshToken';
const GOOGLE_STATE_COOKIE = 'googleOAuthState';

// On the web the frontend and API live on different sites, so credentialed
// cross-site requests need SameSite=None + Secure. The desktop app serves both
// from the same http://localhost origin, where a Secure cookie would be dropped
// — there we fall back to the plain Lax/insecure cookie used in development.
const crossSiteCookies = env.isProd && !env.isDesktop;

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: crossSiteCookies,
    sameSite: crossSiteCookies ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: env.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: crossSiteCookies,
    sameSite: crossSiteCookies ? 'none' : 'lax',
    path: '/api/auth',
  });
}

function clientRedirect(path: string) {
  return new URL(path, env.google.clientRedirectBase).toString();
}

function setGoogleStateCookie(res: Response, state: string) {
  res.cookie(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: crossSiteCookies,
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: 10 * 60 * 1000,
  });
}

function clearGoogleStateCookie(res: Response) {
  res.clearCookie(GOOGLE_STATE_COOKIE, { path: '/api/auth/google' });
}

// Captures the requesting device's user-agent and IP for session tracking.
function sessionMeta(req: Request) {
  const ua = req.headers['user-agent'];
  return { userAgent: typeof ua === 'string' ? ua : null, ip: req.ip ?? null };
}

export async function register(req: Request, res: Response) {
  // No session yet: the email address must be verified first.
  const result = await authService.register(req.body);
  res.status(201).json({
    needsVerification: result.needsVerification,
    email: result.email,
    message: 'We sent a 6-digit code to your email. Enter it to finish creating your account.',
  });
}

export async function verifyEmail(req: Request, res: Response) {
  const { user, accessToken, refreshToken } = await authService.verifyEmail(
    req.body.email,
    req.body.code,
    sessionMeta(req),
  );
  setRefreshCookie(res, refreshToken);
  res.json({ user, accessToken });
}

export async function resendVerification(req: Request, res: Response) {
  await authService.resendVerification(req.body.email);
  res.json({ message: 'If that account is awaiting verification, a new code has been sent.' });
}

export async function login(req: Request, res: Response) {
  const { identifier, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login(identifier, password, sessionMeta(req));
  setRefreshCookie(res, refreshToken);
  res.json({ user, accessToken });
}

export async function googleStart(_req: Request, res: Response) {
  try {
    const state = crypto.randomBytes(24).toString('hex');
    setGoogleStateCookie(res, state);
    res.redirect(authService.getGoogleAuthUrl(state));
  } catch {
    res.redirect(clientRedirect('/login?google=not-configured'));
  }
}

export async function googleCallback(req: Request, res: Response) {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const savedState = req.cookies?.[GOOGLE_STATE_COOKIE];
  clearGoogleStateCookie(res);

  if (!state || !code || !savedState || state !== savedState) {
    res.redirect(clientRedirect('/login?google=failed'));
    return;
  }

  try {
    const { refreshToken, isNew } = await authService.loginWithGoogle(code, sessionMeta(req));
    setRefreshCookie(res, refreshToken);
    res.redirect(clientRedirect(isNew ? '/settings?welcome=google' : '/home?google=success'));
  } catch {
    res.redirect(clientRedirect('/login?google=failed'));
  }
}

export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE];
  try {
    const { accessToken, refreshToken } = await authService.rotateRefresh(token, sessionMeta(req));
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) clearRefreshCookie(res);
    throw error;
  }
}

export async function listSessions(req: Request, res: Response) {
  const sessions = await authService.listSessions(req.userId!, req.cookies?.[REFRESH_COOKIE]);
  res.json({ sessions });
}

export async function revokeSession(req: Request, res: Response) {
  await authService.revokeSession(req.userId!, req.params.id);
  res.status(204).end();
}

export async function revokeOtherSessions(req: Request, res: Response) {
  await authService.revokeOtherSessions(req.userId!, req.cookies?.[REFRESH_COOKIE]);
  res.status(204).end();
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await authService.getMe(req.userId!);
  res.json({ user });
}

export async function forgotPassword(req: Request, res: Response) {
  await authService.requestPasswordReset(req.body.identifier);
  // Identical response for known and unknown accounts. The code is only ever
  // delivered by email, never in this response.
  res.json({ message: 'If that account exists, a code has been sent to its email.' });
}

export async function resetPassword(req: Request, res: Response) {
  await authService.resetPassword(req.body.identifier, req.body.code, req.body.password);
  res.json({ message: 'Password updated. Please sign in again.' });
}

export async function changePassword(req: Request, res: Response) {
  await authService.changePassword(
    req.userId!,
    req.body.currentPassword,
    req.body.newPassword,
    req.cookies?.[REFRESH_COOKIE],
  );
  res.json({ message: 'Password changed.' });
}
