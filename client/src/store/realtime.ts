import { create } from 'zustand';

interface RealtimeState {
  notifUnread: number;
  dmUnread: number;
  setNotifUnread: (n: number) => void;
  setDmUnread: (n: number) => void;
  bumpDmUnread: () => void;
}

// Holds the unread badge counts shown in the navigation, kept in sync with
// the server via Socket.io (see RealtimeBridge).
export const useRealtime = create<RealtimeState>((set) => ({
  notifUnread: 0,
  dmUnread: 0,
  setNotifUnread: (n) => set({ notifUnread: n }),
  setDmUnread: (n) => set({ dmUnread: n }),
  bumpDmUnread: () => set((s) => ({ dmUnread: s.dmUnread + 1 })),
}));
