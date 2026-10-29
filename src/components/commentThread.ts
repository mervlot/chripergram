import type { Post } from '../types';

export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/**
 * Rows shown under a top-level comment. `fresh` = replies the viewer just posted (newest
 * first); they stay on top for the lifetime of the open sheet, and the same ids are dropped
 * from the server pages, so an optimistic row and a later refetch can never both render.
 */
export function mergeThreadRows(fresh: Post[], fetched: Post[]): Post[] {
  const freshIds = new Set(fresh.map((p) => p.id));
  return uniqueById([...fresh, ...fetched.filter((p) => !freshIds.has(p.id))]);
}

/**
 * "Replying to @x" is only worth showing when the reply answers someone other than the thread
 * owner's own comment. It comes from the real parent relationship (`parentId` + `replyTo`),
 * never from where the row happens to sit in the list. Unknown / deleted parent -> no label.
 */
export function replyAttribution(item: Pick<Post, 'parentId' | 'replyTo'>, rootCommentId: string): string | null {
  if (!item.parentId || item.parentId === rootCommentId) return null;
  return item.replyTo?.username ?? null;
}
