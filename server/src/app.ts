import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import routes from './routes';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import {
  serveStoredUpload,
  uploadPublicPath,
  uploadRoot,
} from './middleware/upload';
import { asyncHandler } from './utils/asyncHandler';

export function createApp() {
  const app = express();

  // Behind a hosting proxy (e.g. Render) so secure cookies and protocol
  // detection work correctly.
  if (env.isProd) app.set('trust proxy', 1);

  // Security headers. A strict Content-Security-Policy limits where scripts,
  // styles and connections may come from (defence-in-depth against XSS and
  // clickjacking); HSTS forces HTTPS in production. In development the HTML
  // document is served by Vite (not Express), so this CSP only governs the
  // API + the production build and won't interfere with HMR.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          // React/Tailwind and inline style attributes need 'unsafe-inline'.
          'style-src': ["'self'", "'unsafe-inline'"],
          // Avatars/media: same-origin uploads, Cloudinary/Google (https),
          // generated data URIs and local blob previews.
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'font-src': ["'self'", 'data:'],
          // XHR + Socket.io (which may upgrade to wss / fall back to polling).
          'connect-src': ["'self'", 'https:', 'wss:', 'ws:'],
          'media-src': ["'self'", 'blob:', 'https:'],
          'frame-ancestors': ["'none'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          // Only force HTTPS upgrades in production over real HTTPS. Dev and
          // the desktop app both run over plain http://localhost, where
          // upgrade-insecure-requests would break every API/socket request.
          ...(env.isProd && !env.isDesktop ? {} : { 'upgrade-insecure-requests': null }),
        },
      },
      hsts:
        env.isProd && !env.isDesktop
          ? { maxAge: 15552000, includeSubDomains: true }
          : false,
    }),
  );

  app.use(
    cors({
      origin: env.clientUrls,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Production uploads are read from PostgreSQL when Cloudinary is absent.
  // Local development continues to serve files from the uploads directory.
  app.get(`${uploadPublicPath}/:id`, asyncHandler(serveStoredUpload));
  app.use(
    uploadPublicPath,
    express.static(uploadRoot, {
      // Uploads are opaque media, never documents: forbid MIME sniffing and
      // neutralise anything that would execute if opened directly.
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      },
    }),
  );
  app.use(uploadPublicPath, notFoundHandler);

  // Apply the global rate limiter to the API surface.
  app.use('/api', globalLimiter, routes);
  app.use('/api', notFoundHandler);

  // In production the React build is served from the same origin as the API.
  // This keeps auth cookies, OAuth callbacks, and Socket.io straightforward.
  if (env.isProd) {
    const clientDist = path.resolve(process.cwd(), '../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
