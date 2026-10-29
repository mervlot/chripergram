import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-auth-refresh-'));
process.env.SQLITE_PATH = path.join(tempDir, 'auth-test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-not-for-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-not-for-production';
process.env.ACCESS_TOKEN_TTL = '15m';
// Verify configured values cannot silently extend the requested one-day limit.
process.env.REFRESH_TOKEN_TTL_DAYS = '30';

const require = createRequire(import.meta.url);
let sqlite;

try {
  const auth = require('../dist/services/auth.service.js');
  const dbModule = require('../dist/config/db.js');
  const { verifyAccessToken, hashToken } = require('../dist/utils/jwt.js');
  sqlite = dbModule.sqlite;

  const initial = await auth.register({
    email: 'refresh-test@example.invalid',
    username: 'refresh_test',
    displayName: 'Refresh Test',
    password: 'Test-Only-Password-123!',
  });

  const claims = verifyAccessToken(initial.accessToken);
  assert.equal(claims.email, 'refresh-test@example.invalid');
  assert.equal(typeof claims.sub, 'string');
  assert.equal(initial.refreshToken.includes(claims.email), false);

  const initialRow = await dbModule.db.refreshToken.findUnique({
    where: { tokenHash: hashToken(initial.refreshToken) },
  });
  const remainingMs = initialRow.expiresAt.getTime() - Date.now();
  assert.ok(remainingMs > 23 * 60 * 60 * 1000, 'new refresh tokens should live close to one day');
  assert.ok(remainingMs <= 24 * 60 * 60 * 1000, 'refresh tokens must not exceed one day');

  const [first, second] = await Promise.all([
    auth.rotateRefresh(initial.refreshToken, { userAgent: 'auth-test' }),
    auth.rotateRefresh(initial.refreshToken, { userAgent: 'auth-test' }),
  ]);
  assert.notEqual(first.refreshToken, second.refreshToken);
  assert.equal(verifyAccessToken(first.accessToken).email, 'refresh-test@example.invalid');
  assert.equal(verifyAccessToken(second.accessToken).email, 'refresh-test@example.invalid');

  await auth.logout(first.refreshToken);
  await assert.rejects(() => auth.rotateRefresh(second.refreshToken), /reuse|expired|Invalid/i);
  assert.equal(
    await dbModule.db.refreshToken.count({
      where: { sessionId: initialRow.id, revokedAt: null },
    }),
    0,
    'logging out one device must revoke every token in its family',
  );

  console.log('Refresh-token lifetime, email claims, concurrent rotation, and family logout checks passed.');
} finally {
  sqlite?.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
