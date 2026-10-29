import { create } from 'zustand';
import { api, setAccessToken, registerAuthHandlers, isTransientAuthError } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { AuthUser } from '../types';

type Status = 'loading' | 'authenticated' | 'unauthenticated';
let bootstrapRetries = 0;

interface AuthState {
  user: AuthUser | null;
  status: Status;
  bootstrap: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    username: string;
    displayName: string;
    password: string;
    acceptTerms: boolean;
    marketingOptIn?: boolean;
  }) => Promise<{ email: string }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',

  // On app load, try to silently restore the session via the refresh cookie.
  bootstrap: async () => {
    try {
      const { data } = await api.post<{ accessToken: string }>('/auth/refresh');
      setAccessToken(data.accessToken);
      const me = await api.get<{ user: AuthUser }>('/auth/me');
      bootstrapRetries = 0;
      set({ user: me.data.user, status: 'authenticated' });
      connectSocket();
    } catch (error) {
      setAccessToken(null);
      disconnectSocket();
      if (isTransientAuthError(error) && bootstrapRetries < 3 && typeof window !== 'undefined') {
        bootstrapRetries += 1;
        const delay = bootstrapRetries * 1_000;
        set({ user: null, status: 'loading' });
        window.setTimeout(() => {
          if (useAuth.getState().status === 'loading') {
            void useAuth.getState().bootstrap();
          }
        }, delay);
        return;
      }
      bootstrapRetries = 0;
      set({ user: null, status: 'unauthenticated' });
    }
  },

  login: async (identifier, password) => {
    const { data } = await api.post<{ user: AuthUser; accessToken: string }>('/auth/login', {
      identifier,
      password,
    });
    bootstrapRetries = 0;
    setAccessToken(data.accessToken);
    set({ user: data.user, status: 'authenticated' });
    connectSocket();
  },

  // Registration does not sign you in: the emailed code must be confirmed first.
  register: async (payload) => {
    const { data } = await api.post<{ needsVerification: boolean; email: string }>('/auth/register', payload);
    return { email: data.email };
  },

  verifyEmail: async (email, code) => {
    const { data } = await api.post<{ user: AuthUser; accessToken: string }>('/auth/verify-email', { email, code });
    bootstrapRetries = 0;
    setAccessToken(data.accessToken);
    set({ user: data.user, status: 'authenticated' });
    connectSocket();
  },

  logout: async () => {
    bootstrapRetries = 0;
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore network errors on logout
    }
    setAccessToken(null);
    disconnectSocket();
    set({ user: null, status: 'unauthenticated' });
  },

  setUser: (user) => set({ user }),
}));

// Keep the socket token fresh after a silent refresh, and force-logout on
// an unrecoverable auth failure.
registerAuthHandlers({
  onTokenRefreshed: () => {
    connectSocket();
  },
  onAuthFailure: () => {
    setAccessToken(null);
    disconnectSocket();
    useAuth.setState({ user: null, status: 'unauthenticated' });
  },
});
