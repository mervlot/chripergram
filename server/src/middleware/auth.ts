import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/apiError';

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return null;
}

// Rejects the request with 401 if no valid access token is present.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (!token) return next(ApiError.unauthorized('Authentication required'));
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}

// Populates req.userId if a valid token is present, but never rejects.
// Used on public endpoints that personalise the response when logged in.
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (token) {
    try {
      req.userId = verifyAccessToken(token).sub;
    } catch {
      // ignore — treat as anonymous
    }
  }
  next();
}
