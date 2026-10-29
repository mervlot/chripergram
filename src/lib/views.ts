import { api } from './api';
import { useAuth } from '../store/auth';

// Reports posts the viewer actually saw (>=60% visible for a moment) so the server can
// (a) count a public view once per viewer and (b) rank unseen posts above seen ones.
// Batched: at most one request every couple of seconds, flushed when the tab is hidden.

const VIEW_EVENT = 'chirpergram:views';
const queue = new Set<string>();
const sent = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function trackView(postId: string) {
  if (!useAuth.getState().user) return;
  if (sent.has(postId) || queue.has(postId)) return;
  queue.add(postId);
  if (queue.size >= 20) void flush();
  else if (!timer) timer = setTimeout(() => void flush(), 2000);
}

async function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (queue.size === 0) return;
  const ids = [...queue].slice(0, 50);
  ids.forEach((id) => {
    queue.delete(id);
    sent.add(id);
  });
  if (sent.size > 5000) sent.clear();
  try {
    const { data } = await api.post<{ counts: Record<string, number> }>('/posts/views', { ids });
    window.dispatchEvent(new CustomEvent(VIEW_EVENT, { detail: data.counts }));
  } catch {
    ids.forEach((id) => sent.delete(id)); // retry on a later sighting
  }
  if (queue.size > 0 && !timer) timer = setTimeout(() => void flush(), 2000);
}

/** Subscribe to fresh public view counts coming back from the server. */
export function onViewCounts(handler: (counts: Record<string, number>) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<Record<string, number>>).detail);
  window.addEventListener(VIEW_EVENT, listener);
  return () => window.removeEventListener(VIEW_EVENT, listener);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}
