// Single source of truth for the identity shown in the legal pages.
// Set these in client/.env (see client/.env.example) before you launch.
// Anything still in [square brackets] is a placeholder you MUST replace.
export const LEGAL = {
  appName: (import.meta.env.VITE_APP_NAME as string | undefined) ?? 'Chirpergram',
  entity: (import.meta.env.VITE_LEGAL_ENTITY as string | undefined) ?? '[Your legal name or company]',
  address: (import.meta.env.VITE_LEGAL_ADDRESS as string | undefined) ?? '[Your postal address]',
  supportEmail: (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ?? '[support@your-domain.com]',
  privacyEmail: (import.meta.env.VITE_PRIVACY_EMAIL as string | undefined) ?? '[privacy@your-domain.com]',
  dmcaEmail: (import.meta.env.VITE_DMCA_EMAIL as string | undefined) ?? '[copyright@your-domain.com]',
  governingLaw: (import.meta.env.VITE_GOVERNING_LAW as string | undefined) ?? '[your country / state]',
  // Keep in sync with LEGAL_VERSION in server/src/config/legal.ts
  version: '2026-10-29',
  effective: 'October 29, 2026',
  minAge: 13,
} as const;
