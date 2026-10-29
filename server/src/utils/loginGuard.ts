import { ApiError } from './apiError';

/**
 * In-memory brute-force guard for password login, layered on top of the
 * IP-based express rate limiter. It tracks failures per (identifier + IP) so a
 * single attacker IP gets locked out on a given account without letting an
 * attacker lock a victim out from elsewhere.
 *
 * Stateless across restarts (acceptable — a restart only resets counters) and
 * single-process; for a multi-instance deployment back this with Redis.
 */
const MAX_FAILURES = 8; // attempts allowed within the window before lockout
const WINDOW_MS = 15 * 60 * 1000; // rolling window for counting failures
const LOCK_MS = 15 * 60 * 1000; // how long a lockout lasts

interface Entry {
  failures: number;
  firstFailureAt: number;
  lockedUntil?: number;
}

const attempts = new Map<string, Entry>();

// Opportunistic cleanup so the map can't grow unbounded.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, e] of attempts) {
    const stale = now - e.firstFailureAt > WINDOW_MS;
    const unlocked = !e.lockedUntil || e.lockedUntil < now;
    if (stale && unlocked) attempts.delete(key);
  }
}

function keyFor(identifier: string, ip?: string | null) {
  return `${identifier.trim().toLowerCase()}|${ip ?? 'unknown'}`;
}

// Throws 429 if the (identifier, ip) pair is currently locked out.
export function assertLoginAllowed(identifier: string, ip?: string | null) {
  const now = Date.now();
  sweep(now);
  const entry = attempts.get(keyFor(identifier, ip));
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    const mins = Math.ceil((entry.lockedUntil - now) / 60000);
    throw ApiError.tooManyRequests(
      `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
    );
  }
}

// Records a failed attempt; locks the pair once the threshold is exceeded.
export function recordLoginFailure(identifier: string, ip?: string | null) {
  const now = Date.now();
  const key = keyFor(identifier, ip);
  const entry = attempts.get(key);

  if (!entry || now - entry.firstFailureAt > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstFailureAt: now });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
  }
}

// Clears the counter after a successful login.
export function recordLoginSuccess(identifier: string, ip?: string | null) {
  attempts.delete(keyFor(identifier, ip));
}
