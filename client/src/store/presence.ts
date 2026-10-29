import { create } from 'zustand';
import { getSocket } from '../lib/socket';

interface PresenceState {
  online: Record<string, boolean>;
  lastSeen: Record<string, string>;
  activities: Record<string, string | null>;
  setOnline: (userId: string, online: boolean, lastSeenAt?: string) => void;
  setActivity: (userId: string, game: string | null) => void;
  setOnlineList: (ids: string[], activities?: Record<string, string>) => void;
  request: (ids: string[]) => void;
}

// Tracks which users are currently online (driven by Socket.io presence events).
export const usePresence = create<PresenceState>((set) => ({
  online: {},
  lastSeen: {},
  activities: {},
  setOnline: (userId, online, lastSeenAt) =>
    set((s) => ({
      online: { ...s.online, [userId]: online },
      lastSeen: lastSeenAt ? { ...s.lastSeen, [userId]: lastSeenAt } : s.lastSeen,
    })),
  setActivity: (userId, game) =>
    set((s) => ({ activities: { ...s.activities, [userId]: game } })),
  setOnlineList: (ids, activities = {}) =>
    set((s) => {
      const next = { ...s.online };
      ids.forEach((id) => (next[id] = true));
      return { online: next, activities: { ...s.activities, ...activities } };
    }),
  // Ask the server for the current online state of specific users.
  request: (ids) => {
    const socket = getSocket();
    if (socket && ids.length) socket.emit('presence:get', { userIds: ids });
  },
}));
