import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Post } from '../types';

export const postPath = (id: string) => `/post/${id}`;

/**
 * True when this browser tab has an earlier in-app history entry to go back to.
 * React Router stamps every entry it creates with `idx` (0 for the first entry of
 * the tab), and `replace` keeps the idx. A page opened from a shared link, a
 * refresh of a first entry, or an external site therefore reports false.
 */
export function hasInAppHistory(): boolean {
  if (typeof window === 'undefined') return false;
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

export type BackPlan = { type: 'history' } | { type: 'replace'; to: string };

/**
 * What the top-left arrow on a post page does.
 *  - There is in-app history: step back through it (A -> B -> C -> D walks D, C, B, A, feed).
 *  - Opened directly: open the conversation root; if we are the root (or it is unknown),
 *    go Home. It replaces the entry, so the direct-link entry never becomes a back-loop.
 */
export function planPostBack(hasHistory: boolean, currentId: string, rootId?: string | null): BackPlan {
  if (hasHistory) return { type: 'history' };
  if (rootId && rootId !== currentId) return { type: 'replace', to: postPath(rootId) };
  return { type: 'replace', to: '/home' };
}

/**
 * A reply was posted: bump the reply counter of that post inside the cached feeds,
 * in place. Re-fetching the ranked feed instead would reorder it under the user.
 */
export function bumpReplyCount(queryClient: QueryClient, postId: string, delta = 1) {
  const patch = (p: Post): Post => {
    if (p.id === postId) return { ...p, counts: { ...p.counts, replies: Math.max(0, p.counts.replies + delta) } };
    if (p.repostOf && p.repostOf.id === postId) return { ...p, repostOf: patch(p.repostOf) };
    return p;
  };
  for (const key of [['feed'], ['profile-feed']]) {
    queryClient.setQueriesData<InfiniteData<{ items: Post[] }>>({ queryKey: key }, (old) =>
      old
        ? { ...old, pages: old.pages.map((pg) => (Array.isArray(pg?.items) ? { ...pg, items: pg.items.map(patch) } : pg)) }
        : old,
    );
  }
}
