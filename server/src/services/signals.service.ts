import { randomUUID } from 'node:crypto';
import { sqlite } from '../config/db';

// Per-user interest signals: which posts were actually seen, and what was searched.
// Raw SQL on purpose: these tables are write-heavy and don't need the model adapter.

const nowIso = () => new Date().toISOString();

/** Record posts the viewer saw. A post's public view count goes up once per viewer. */
export function recordViews(viewerId: string, ids: string[]): Record<string, number> {
  const unique = [...new Set(ids)].slice(0, 50);
  const counts: Record<string, number> = {};
  const exists = sqlite.prepare('SELECT 1 FROM post_views WHERE user_id = ? AND post_id = ?');
  const insert = sqlite.prepare(
    'INSERT INTO post_views (user_id, post_id, views, first_seen_at, last_seen_at) VALUES (?, ?, 1, ?, ?)',
  );
  const touch = sqlite.prepare('UPDATE post_views SET views = views + 1, last_seen_at = ? WHERE user_id = ? AND post_id = ?');
  const author = sqlite.prepare('SELECT author_id FROM posts WHERE id = ?');
  const bump = sqlite.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?');
  const read = sqlite.prepare('SELECT view_count FROM posts WHERE id = ?');

  sqlite.exec('BEGIN');
  try {
    for (const id of unique) {
      const post = author.get(id) as { author_id: string } | undefined;
      if (!post) continue;
      const t = nowIso();
      if (exists.get(viewerId, id)) {
        touch.run(t, viewerId, id);
      } else {
        insert.run(viewerId, id, t, t);
        if (post.author_id !== viewerId) bump.run(id);
      }
      counts[id] = (read.get(id) as { view_count: number } | undefined)?.view_count ?? 0;
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
  return counts;
}

/** Map of postId -> times seen, for the given posts. */
export function getSeenMap(viewerId: string, ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = sqlite
      .prepare(`SELECT post_id, views FROM post_views WHERE user_id = ? AND post_id IN (${chunk.map(() => '?').join(',')})`)
      .all(viewerId, ...chunk) as Array<{ post_id: string; views: number }>;
    for (const r of rows) out.set(r.post_id, r.views);
  }
  return out;
}

/** Log a search / hashtag visit. Typing "ab" -> "abc" within seconds updates one row. */
export function recordSearch(userId: string, raw: string) {
  const query = raw.trim().toLowerCase().slice(0, 80);
  if (query.length < 2) return;
  const last = sqlite
    .prepare('SELECT id, query, created_at FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(userId) as { id: string; query: string; created_at: string } | undefined;
  const recent = last && Date.now() - new Date(last.created_at).getTime() < 30_000;
  if (last && recent && (query.startsWith(last.query) || last.query.startsWith(query))) {
    sqlite.prepare('UPDATE search_history SET query = ?, created_at = ? WHERE id = ?').run(query, nowIso(), last.id);
    return;
  }
  sqlite.prepare('INSERT INTO search_history (id, user_id, query, created_at) VALUES (?, ?, ?, ?)').run(randomUUID(), userId, query, nowIso());
  sqlite
    .prepare(
      'DELETE FROM search_history WHERE user_id = ? AND id NOT IN (SELECT id FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 100)',
    )
    .run(userId, userId);
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'you', 'not', 'but']);

/** Interest terms from recent searches (newest weigh most). */
export function getSearchTerms(viewerId: string): Map<string, number> {
  const since = new Date(Date.now() - 45 * 24 * 3_600_000).toISOString();
  const rows = sqlite
    .prepare('SELECT query FROM search_history WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 40')
    .all(viewerId, since) as Array<{ query: string }>;
  const terms = new Map<string, number>();
  rows.forEach((row, i) => {
    const weight = 1 - i / (rows.length + 5); // 1.0 .. ~0.1
    for (const word of row.query.replace(/#/g, ' ').split(/[^\p{L}\p{N}_]+/u)) {
      if (word.length < 3 || STOP.has(word)) continue;
      terms.set(word, Math.max(terms.get(word) ?? 0, weight));
    }
  });
  return terms;
}
