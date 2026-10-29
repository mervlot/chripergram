import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

// Lightweight global toast store — callable from components and plain modules
// via `useToast.getState().show(...)`.
export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, type = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().dismiss(id), 3200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Convenience helper for non-React code.
export const toast = (message: string, type: ToastType = 'info') =>
  useToast.getState().show(message, type);
