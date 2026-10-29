import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodEffects } from 'zod';

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

// Validates and *replaces* req.body / req.query / req.params with the parsed,
// type-coerced result. Throws ZodError on failure (handled by errorHandler).
export const validate =
  (schema: { body?: Schema; query?: Schema; params?: Schema }) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body);
      if (schema.query) {
        const parsed = schema.query.parse(req.query);
        // req.query is a read-only getter on newer Express; assign per-key.
        Object.assign(req.query, parsed);
      }
      if (schema.params) req.params = schema.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
