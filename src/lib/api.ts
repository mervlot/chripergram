import axios, { AxiosError, AxiosRequestConfig } from 'axios';

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// An explicit VITE_API_URL wins. Otherwise use this page's origin: Vite proxies
// /api and /socket.io to the local API in development, while production and the
// Electron shell serve the API from the same origin.
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const API_ORIGIN = normalizeOrigin(
  configuredApiUrl
    ? configuredApiUrl
    : window.location.origin,
);

export const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true, // send the refresh-token cookie
});

// Access token is kept in memory only (never localStorage) to reduce XSS risk.
let accessToken: string | null = null;
let refreshTimer: number | null = null;
let authVersion = 0;

function tokenExpiryMs(token: string): number | null {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return null;
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTerminalAuthError(error: unknown): boolean {
  return axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);
}

export function isTransientAuthError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

function scheduleRefresh(token: string, delayMs: number) {
  if (typeof window === 'undefined') return;
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void refreshAccessToken().catch((error: unknown) => {
      if (isTerminalAuthError(error)) {
        onAuthFailure();
      } else if (accessToken === token) {
        // A temporary API/network failure should not sign the user out.
        scheduleRefresh(token, 30_000);
      }
    });
  }, Math.max(0, delayMs));
}

export const setAccessToken = (token: string | null) => {
  authVersion += 1;
  if (refreshTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  accessToken = token;
  if (token) {
    const expiry = tokenExpiryMs(token);
    if (expiry !== null) scheduleRefresh(token, expiry - Date.now() - 60_000);
  }
};
export const getAccessToken = () => accessToken;

// Callbacks wired up by the auth store so api.ts stays decoupled from it.
let onTokenRefreshed: (token: string) => void = () => {};
let onAuthFailure: () => void = () => {};
export function registerAuthHandlers(handlers: {
  onTokenRefreshed: (token: string) => void;
  onAuthFailure: () => void;
}) {
  onTokenRefreshed = handlers.onTokenRefreshed;
  onAuthFailure = handlers.onAuthFailure;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// --- Single-flight refresh: queue requests while a refresh is in progress ---
let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshing) {
    const requestVersion = authVersion;
    const sendRefreshRequest = () =>
      axios.post<{ accessToken: string }>(`${API_ORIGIN}/api/auth/refresh`, null, { withCredentials: true });
    const request = Promise.resolve(
      typeof navigator !== 'undefined' && navigator.locks?.request
        ? navigator.locks.request('social-network-auth-refresh', sendRefreshRequest)
        : sendRefreshRequest(),
    );

    refreshing = request
      .then((res) => {
        if (requestVersion !== authVersion) {
          throw new Error('Authentication state changed while refreshing');
        }
        const token = res.data.accessToken;
        setAccessToken(token);
        onTokenRefreshed(token);
        return token;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url ?? '';

    const isAuthRoute =
      url.includes('/auth/login') ||
      url.includes('/auth/refresh') ||
      url.includes('/auth/register') ||
      url.includes('/auth/logout');

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch (refreshError) {
        if (isTerminalAuthError(refreshError)) onAuthFailure();
      }
    }
    return Promise.reject(error);
  },
);

// Normalises an API error into a human-readable message. When the backend
// returns field-level validation details, surface the first specific message
// (e.g. "Password must be at least 8 characters") instead of the generic one.
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: { message?: string; details?: Array<{ path?: string; message?: string }> } }
      | undefined;
    const detail = data?.error?.details?.[0]?.message;
    if (detail) return detail;
    return data?.error?.message ?? err.message ?? fallback;
  }
  return fallback;
}

export { API_ORIGIN };
