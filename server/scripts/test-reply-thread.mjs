// Run: node --experimental-strip-types scripts/test-reply-thread.mjs
// Exercises the flat reply-thread queries against a real in-memory SQLite DB.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteModels } from '../src/config/sqlite-model.ts';
import { initializeSchema, modelTables } from '../src/config/sqlite-schema.ts';
import { postInclude, serializePost } from '../src/services/serializers.ts';
import {
  getAncestorIds,
  getFlatReplyThread,
  getThreadCounts,
  parseThreadCursor,
} from '../src/services/replyThread.ts';

const sqlite = new DatabaseSync(':memory:');
initializeSchema(sqlite);
const db = createSqliteModels(sqlite, modelTables);
const deps = { sqlite, db, postInclude, serializePost };

const users = {};
for (const name of ['owner', 'alice', 'bob', 'charlie', 'david', 'eve', 'frank']) {
  users[name] = await db.user.create({
    data: { email: `${name}@example.invalid`, username: name, displayName: name.toUpperCase() },
  });
}
let clock = Date.parse('2026-01-01T00:00:00.000Z');
async function post(author, content, parentId) {
  clock += 1000; // strictly increasing timestamps
  return db.post.create({
    data: { authorId: users[author].id, content, parentId, createdAt: new Date(clock) },
  });
}

// P (media post) <- A(alice) <- B(bob) <- C(charlie);  A <- D(david) <- E(eve);  P <- F(frank)
const P = await post('owner', 'media post');
const A = await post('alice', 'Sup guys', P.id);
const B = await post('bob', 'Hhhh', A.id);
const C = await post('charlie', 'Hi', B.id);
const D = await post('david', 'gggg', A.id);
const E = await post('eve', 'Hello', D.id);
const F = await post('frank', 'other thread', P.id);
const F1 = await post('bob', 'reply in F', F.id);

const all = async (rootId, limit = 50) => (await getFlatReplyThread(deps, rootId, undefined, null, limit));

// Test E: B, C, D, E all in one flat list under A; real parents preserved.
{
  const t = await all(A.id);
  assert.deepEqual(t.items.map((i) => i.content), ['Hhhh', 'Hi', 'gggg', 'Hello']);
  assert.equal(t.total, 4);
  assert.equal(t.nextCursor, null);
  const byContent = Object.fromEntries(t.items.map((i) => [i.content, i]));
  assert.equal(byContent['Hhhh'].parentId, A.id);
  assert.equal(byContent['Hi'].parentId, B.id);
  assert.equal(byContent['gggg'].parentId, A.id);
  assert.equal(byContent['Hello'].parentId, D.id);
  for (const i of t.items) assert.equal(i.rootCommentId, A.id);
  assert.equal(byContent['Hhhh'].replyTo.username, 'alice');
  assert.equal(byContent['Hi'].replyTo.username, 'bob');
  assert.equal(byContent['gggg'].replyTo.username, 'alice');
  assert.equal(byContent['Hello'].replyTo.username, 'david');
  assert.deepEqual(t.items.map((i) => i.depth), [1, 2, 1, 2]);
  // The database itself must be untouched.
  const rows = Object.fromEntries(sqlite.prepare('SELECT id, parent_id FROM posts').all().map((r) => [r.id, r.parent_id]));
  assert.deepEqual([rows[A.id], rows[B.id], rows[C.id], rows[D.id], rows[E.id]], [P.id, A.id, B.id, A.id, D.id]);
}

// Test G: threads are independent.
{
  const t = await all(F.id);
  assert.deepEqual(t.items.map((i) => i.content), ['reply in F']);
  assert.equal(t.total, 1);
  assert.equal(t.items[0].rootCommentId, F.id);
}

// Top-level thread counts include all depths (A has 2 direct replies but 4 descendants).
{
  const c = getThreadCounts(sqlite, [A.id, F.id, E.id]);
  assert.equal(c.get(A.id), 4);
  assert.equal(c.get(F.id), 1);
  assert.equal(c.get(E.id), 0);
}

// Test H: pagination - no duplicates, no skips, stable across inserts between pages.
{
  const big = await post('owner', 'big root', P.id);
  const expected = [];
  let prev = big.id;
  for (let i = 0; i < 23; i++) {
    // alternate: chain deeper, or reply to the root, so depths vary
    const parent = i % 3 === 0 ? big.id : prev;
    const r = await post(['alice', 'bob', 'charlie'][i % 3], `r${i}`, parent);
    expected.push(r.id);
    prev = r.id;
  }
  const seen = [];
  let cursor = null;
  let pages = 0;
  while (true) {
    const page = await getFlatReplyThread(deps, big.id, undefined, cursor, 5);
    assert.equal(page.total, pages < 2 ? 23 : 24, 'total counts all current descendants');
    seen.push(...page.items.map((i) => i.id));
    pages++;
    if (pages === 2) await post('eve', 'late arrival', big.id); // arrives mid-pagination
    if (!page.nextCursor) break;
    cursor = parseThreadCursor(page.nextCursor);
    assert.ok(cursor);
  }
  assert.equal(new Set(seen).size, seen.length, 'no duplicates');
  assert.deepEqual(seen.slice(0, 23), expected, 'no skips, chronological order');
  assert.equal(seen.length, 24, 'late arrival appended, nothing lost');
  assert.ok(pages >= 5);
}

// Deleted comment: its subtree goes with it, the rest of the thread still loads.
{
  sqlite.prepare('DELETE FROM posts WHERE id = ?').run(B.id); // simulate removal of B only
  const t = await all(A.id);
  const contents = t.items.map((i) => i.content);
  assert.ok(!contents.includes('Hhhh'));
  // C is orphaned (its parent is gone): it is no longer reachable from A, nothing crashes.
  assert.deepEqual(contents, ['gggg', 'Hello']);
  assert.equal(t.total, 2);
  const orphan = await getFlatReplyThread(deps, B.id, undefined, null, 10);
  assert.equal(orphan, null, 'missing root -> null (service maps to 404)');
  // attribution when the parent row is missing but the child is queried via an ancestor root
  const viaP = await getFlatReplyThread(deps, P.id, undefined, null, 50);
  for (const i of viaP.items) assert.ok(i.replyTo === null || typeof i.replyTo.username === 'string');
}

// Cursor parsing.
assert.equal(parseThreadCursor(undefined), null);
assert.equal(parseThreadCursor('garbage'), null);
assert.equal(parseThreadCursor('|x'), null);
assert.deepEqual(parseThreadCursor('2026-01-01T00:00:00.000Z|abc'), { createdAt: '2026-01-01T00:00:00.000Z', id: 'abc' });

// Ancestors: root first, one query.
{
  const chain = getAncestorIds(sqlite, E.id);
  assert.deepEqual(chain, [P.id, A.id, D.id]);
  assert.deepEqual(getAncestorIds(sqlite, P.id), []);
}

console.log('reply thread tests passed');
