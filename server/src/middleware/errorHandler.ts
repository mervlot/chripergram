import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';

// Central error translator. Anything thrown in the request lifecycle ends up
// here and is mapped to a clean JSON shape: { error: { message, details? } }.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { message: err.message, details: err.details } });
  }

  // Upload limits raised by multer itself. Without this they fell through to
  // the generic 500 and users saw "Internal server error" for an oversize video.
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round(env.upload.maxBytes / (1024 * 1024));
      return res.status(413).json({ error: { message: `File is too large. The limit is ${mb} MB.` } });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: { message: 'Unexpected file field in upload.' } });
    }
    return res.status(400).json({ error: { message: 'The upload could not be processed.' } });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof Error) {
    const databaseError = err as Error & { code?: string; meta?: { target?: string[] } };
    if (databaseError.code === 'P2002') {
      const target = databaseError.meta?.target?.join(', ');
      return res
        .status(409)
        .json({ error: { message: `Already exists${target ? `: ${target}` : ''}` } });
    }
    if (databaseError.code === 'P2025') {
      return res.status(404).json({ error: { message: 'Resource not found' } });
    }
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: { message: 'Internal server error' } });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Route not found' } });
}
