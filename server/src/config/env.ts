import dotenv from 'dotenv';

dotenv.config();

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const clientUrls = (
  process.env.CLIENT_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  'http://localhost:5173'
)
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);
const apiUrl = normalizeOrigin(
  process.env.API_URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:4000',
);
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY ?? '';
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET ?? '';
const cloudinaryValues = [cloudinaryCloudName, cloudinaryApiKey, cloudinaryApiSecret];
const configuredRefreshTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 1);

if (!Number.isFinite(configuredRefreshTtlDays) || configuredRefreshTtlDays <= 0) {
  throw new Error('REFRESH_TOKEN_TTL_DAYS must be a positive number');
}

if (cloudinaryValues.some(Boolean) && !cloudinaryValues.every(Boolean)) {
  throw new Error(
    'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set together',
  );
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  const weak = ['dev-access-secret', 'dev-refresh-secret', 'changeme', 'secret'];
  const access = process.env.JWT_ACCESS_SECRET ?? '';
  const refresh = process.env.JWT_REFRESH_SECRET ?? '';
  if (
    access.length < 32 || refresh.length < 32 ||
    weak.includes(access) || weak.includes(refresh) || access === refresh
  ) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set to two different random strings of at least 32 characters in production.',
    );
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  // Desktop (Electron) mode: the API and the renderer share the same
  // http://localhost origin, so cookies must stay non-secure/Lax and the
  // CSP must not upgrade requests to https. Set DESKTOP=1 when launched by
  // the Electron shell (which still runs the server with NODE_ENV=production
  // so the built client is served and uploads are persisted in the database).
  isDesktop: process.env.DESKTOP === '1',
  // 0.0.0.0 is required when the app is opened from another device on the
  // same network, which is common when running the stack in Termux.
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 4000),
  apiUrl,
  clientUrls,

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    // A refresh token may live for less than a day when explicitly configured,
    // but never longer than the one-day session limit.
    refreshTtlDays: Math.min(configuredRefreshTtlDays, 1),
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? `${apiUrl}/api/auth/google/callback`,
    clientRedirectBase: clientUrls[0] ?? 'http://localhost:5173',
  },

  // Legal / compliance identity shown in email footers and policy pages.
  legal: {
    appName: process.env.APP_NAME ?? 'Chirpergram',
    entityName: process.env.LEGAL_ENTITY_NAME ?? '',
    // CAN-SPAM requires a valid physical postal address in commercial email
    // and it is best practice to include it in every message.
    postalAddress: process.env.LEGAL_POSTAL_ADDRESS ?? '',
    supportEmail: process.env.SUPPORT_EMAIL ?? process.env.SMTP_USER ?? '',
    privacyEmail: process.env.PRIVACY_EMAIL ?? process.env.SUPPORT_EMAIL ?? process.env.SMTP_USER ?? '',
  },

  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 10),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60),
  },

  // Secret used to sign one-click unsubscribe links. Falls back to the refresh
  // secret so nothing extra is required, but set it explicitly in production.
  unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET ?? '',

  // Never exposes codes over HTTP. Only controls whether codes are printed to
  // the server console when no mail provider is configured (development).
  logOtpToConsole: process.env.LOG_OTP_TO_CONSOLE === '1',

  mail: {
    webhookUrl: process.env.MAIL_WEBHOOK_URL ?? '',
    webhookToken: process.env.MAIL_WEBHOOK_TOKEN ?? '',
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''),
    from: process.env.MAIL_FROM ?? process.env.SMTP_USER ?? '',
  },

  upload: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxBytes: Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024,
  },

  cloudinary: {
    enabled: cloudinaryValues.every(Boolean),
    cloudName: cloudinaryCloudName,
    apiKey: cloudinaryApiKey,
    apiSecret: cloudinaryApiSecret,
    folder: process.env.CLOUDINARY_FOLDER ?? 'murmur',
  },
} as const;
