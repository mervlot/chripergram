// Augments Express' Request with the authenticated user id, populated by the
// `requireAuth` / `optionalAuth` middleware.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
