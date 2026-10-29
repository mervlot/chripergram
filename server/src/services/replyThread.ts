// Reply-thread queries for the Black comment sheet and the post page.
//
// This module deliberately has no relative imports: the database handles and
// serializers are injected, so the logic can be exercised against a real
// in-memory SQLite database in scripts/test-reply-thread.mjs.
//
// Data model reminder: every comment is a row in `posts`, linked to its real
// parent through `parent_id`. Nothing here rewrites those links. The "flat"
// presentation is produced at read time by collecting every descendant of a
// top-level comment with a recursive CTE.

export interface ThreadDeps {
  sqlite: { prepare(sql: string): { all(...params: any[]): any[] } };
  db: any;
  postInclude: (viewerId?: string) => Record<string, unknown>;
  serializePost: (post: any) => any;
}

/** Safety valve against pathological chains; real threads are far shallower. */
export const MAX_THREAD_DEPTH = 100;
export const DEFAULT_THREAD_LIMIT = 10;

// Cursor = position of the last row returned, in (created_at, id) order. A
// keyset cursor never skips or repeats rows when replies are added or removed
// between pages, unlike an offset into a list that is re-ranked on every call.
export function encodeThreadCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function parseThreadCursor(cursor?: string): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const cut = cursor.lastIndexOf('|');
  if (cut <= 0 || cut === cursor.length - 1) return null;
  return { createdAt: cursor.slice(0, cut), id: cursor.slice(cut + 1) };
}

const TREE_CTE = `
  WITH RECURSIVE tree(id, parent_id, depth) AS (
    SELECT id, parent_id, 1 FROM posts WHERE parent_id = ?
    UNION ALL
    SELECT p.id, p.parent_id, t.depth + 1 FROM posts p JOIN tree t ON p.parent_id = t.id WHERE t.depth < ${MAX_THREAD_DEPTH}
  )`;

export interface FlatThreadPage {
  items: any[];
  nextCursor: string | null;
  /** Every descendant of the root comment (not just this page / not "remaining"). */
  total: number;
}

/**
 * One page of the flattened thread under `rootId`: all descendants (replies,
 * replies to replies, ...) oldest first. Each item keeps its real `parentId`,
 * names the thread owner in `rootCommentId`, and carries `replyTo` (author of
 * the comment it answers, or null when that comment is unavailable).
 * Returns null when the root does not exist.
 */
export async function getFlatReplyThread(
  deps: ThreadDeps,
  rootId: string,
  viewerId: string | undefined,
  cursor: { createdAt: string; id: string } | null,
  limit = DEFAULT_THREAD_LIMIT,
): Promise<FlatThreadPage | null> {
  const { sqlite, db, postInclude, serializePost } = deps;

  const root = await db.post.findUnique({
    where: { id: rootId },
    include: { author: { select: { id: true, username: true, displayName: true } } },
  });
  if (!root) return null;

  const total = Number(
    (sqlite.prepare(`${TREE_CTE} SELECT COUNT(*) AS n FROM tree`).all(rootId)[0] as any)?.n ?? 0,
  );

  const rows = cursor
    ? sqlite
        .prepare(
          `${TREE_CTE}
           SELECT t.id AS id, t.depth AS depth, p.created_at AS createdAt
           FROM tree t JOIN posts p ON p.id = t.id
           WHERE (p.created_at, p.id) > (?, ?)
           ORDER BY p.created_at ASC, p.id ASC LIMIT ?`,
        )
        .all(rootId, cursor.createdAt, cursor.id, limit + 1)
    : sqlite
        .prepare(
          `${TREE_CTE}
           SELECT t.id AS id, t.depth AS depth, p.created_at AS createdAt
           FROM tree t JOIN posts p ON p.id = t.id
           ORDER BY p.created_at ASC, p.id ASC LIMIT ?`,
        )
        .all(rootId, limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  if (pageRows.length === 0) return { items: [], nextCursor: null, total };

  // One batched fetch for the whole page.
  const ids = pageRows.map((r: any) => r.id as string);
  const nodes: any[] = await db.post.findMany({ where: { id: { in: ids } }, include: postInclude(viewerId) });
  const byId = new Map<string, any>(nodes.map((n) => [n.id, n]));

  // Who each reply answers: the parent's author. Parents are usually on this
  // page, the root, or an earlier page; fetch only the ones we have not seen.
  const authors = new Map<string, { id: string; username: string; displayName: string }>();
  const remember = (post: any) => {
    if (post?.author) {
      authors.set(post.id, { id: post.author.id, username: post.author.username, displayName: post.author.displayName });
    }
  };
  remember(root);
  nodes.forEach(remember);
  const missing = [
    ...new Set(nodes.map((n) => n.parentId).filter((pid: string | null) => pid && !authors.has(pid))),
  ] as string[];
  if (missing.length) {
    const parents: any[] = await db.post.findMany({
      where: { id: { in: missing } },
      include: { author: { select: { id: true, username: true, displayName: true } } },
    });
    parents.forEach(remember);
  }

  const items = pageRows
    .map((r: any) => {
      const node = byId.get(r.id);
      if (!node) return null; // deleted between the two queries
      return {
        ...serializePost(node),
        depth: Number(r.depth),
        rootCommentId: rootId,
        replyTo: (node.parentId && authors.get(node.parentId)) || null,
      };
    })
    .filter(Boolean);

  const last = pageRows[pageRows.length - 1];
  return {
    items,
    nextCursor: hasMore ? encodeThreadCursor(last.createdAt, last.id) : null,
    total,
  };
}

/** Descendant count per comment (all depths) in a single query. */
export function getThreadCounts(sqlite: ThreadDeps['sqlite'], ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const marks = ids.map(() => '?').join(',');
  const rows = sqlite
    .prepare(
      `WITH RECURSIVE t(root, id, depth) AS (
         SELECT id, id, 0 FROM posts WHERE id IN (${marks})
         UNION ALL
         SELECT t.root, p.id, t.depth + 1 FROM posts p JOIN t ON p.parent_id = t.id WHERE t.depth < ${MAX_THREAD_DEPTH}
       )
       SELECT root, COUNT(*) - 1 AS n FROM t GROUP BY root`,
    )
    .all(...ids);
  for (const r of rows as any[]) out.set(r.root, Number(r.n));
  return out;
}

/** Ids of the posts above `postId`, oldest (conversation root) first. One query, no per-level round trips. */
export function getAncestorIds(sqlite: ThreadDeps['sqlite'], postId: string): string[] {
  const rows = sqlite
    .prepare(
      `WITH RECURSIVE up(id, parent_id, depth) AS (
         SELECT id, parent_id, 0 FROM posts WHERE id = ?
         UNION ALL
         SELECT p.id, p.parent_id, u.depth + 1 FROM posts p JOIN up u ON p.id = u.parent_id WHERE u.depth < ${MAX_THREAD_DEPTH}
       )
       SELECT id FROM up WHERE depth > 0 ORDER BY depth DESC`,
    )
    .all(postId);
  return (rows as any[]).map((r) => r.id as string);
}
