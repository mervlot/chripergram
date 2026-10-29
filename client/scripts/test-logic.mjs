// Run: node --experimental-strip-types scripts/test-logic.mjs
// Pure-logic tests for post navigation and Black comment threads (no DOM needed).
import assert from 'node:assert/strict';
import { bumpReplyCount, planPostBack, postPath } from '../src/lib/postNav.ts';
import { mergeThreadRows, replyAttribution, uniqueById } from '../src/components/commentThread.ts';

// ---- a tiny browser-history model: push / replace / back, with react-router's `idx` ----
class History {
  constructor(first) { this.entries = [first]; this.idx = 0; }
  get path() { return this.entries[this.idx]; }
  get hasInApp() { return this.idx > 0; }          // == hasInAppHistory()
  push(p) { this.entries = this.entries.slice(0, this.idx + 1); this.entries.push(p); this.idx++; }
  replace(p) { this.entries[this.idx] = p; }
  back() { if (this.idx > 0) this.idx--; }
  // what the top-left arrow does on /post/:id
  arrow(id, rootId) {
    const plan = planPostBack(this.hasInApp, id, rootId);
    if (plan.type === 'history') this.back(); else this.replace(plan.to);
  }
}
const idOf = (path) => path.replace('/post/', '');

// Scenario C: Home -> A -> B -> C -> D, then the arrow walks it back.
{
  const h = new History('/home');
  for (const id of ['A', 'B', 'C', 'D']) h.push(postPath(id));
  const seen = [];
  for (let i = 0; i < 4; i++) { h.arrow(idOf(h.path), 'A'); seen.push(h.path); }
  assert.deepEqual(seen, ['/post/C', '/post/B', '/post/A', '/home']);
}
// Scenario A: root opened from a feed returns to that feed.
{
  const h = new History('/home'); h.push('/post/A'); h.arrow('A', 'A');
  assert.equal(h.path, '/home');
}
// Scenario D: direct link to C. Arrow -> root A (replace, no extra entry), arrow again -> /home. No loop.
{
  const h = new History('/post/C');
  h.arrow('C', 'A');
  assert.equal(h.path, '/post/A'); assert.equal(h.entries.length, 1); assert.equal(h.idx, 0);
  h.arrow('A', 'A');
  assert.equal(h.path, '/home'); assert.equal(h.entries.length, 1);
}
// Direct link to a root post, and to a post whose root is unknown (thread not loaded yet).
assert.deepEqual(planPostBack(false, 'A', 'A'), { type: 'replace', to: '/home' });
assert.deepEqual(planPostBack(false, 'C', undefined), { type: 'replace', to: '/home' });
assert.deepEqual(planPostBack(true, 'C', 'A'), { type: 'history' });

// ---- feed cache patching: counts change in place, order and length never do ----
{
  const mk = (id, replies, repostOf = null) => ({ id, counts: { replies, likes: 0 }, repostOf });
  const A = mk('A', 0), B = mk('B', 3), C = mk('C', 1);
  const R = mk('R', 0, B); // a repost of B
  const store = { feed: { pages: [{ items: [A, B] }, { items: [R, C] }], pageParams: [0, 1] } };
  const qc = {
    setQueriesData({ queryKey }, fn) { const k = queryKey[0]; if (store[k]) store[k] = fn(store[k]); },
  };
  bumpReplyCount(qc, 'B');
  const ids = store.feed.pages.flatMap((p) => p.items.map((i) => i.id));
  assert.deepEqual(ids, ['A', 'B', 'R', 'C'], 'feed order untouched (nothing pinned or moved)');
  assert.equal(store.feed.pages[0].items[1].counts.replies, 4);
  assert.equal(store.feed.pages[1].items[0].repostOf.counts.replies, 4);
  assert.equal(store.feed.pages[0].items[0].counts.replies, 0);
  assert.equal(store.feed.pages[1].items[1], C, 'unrelated posts keep identity (no needless re-render)');
}

// ---- Black flat thread presentation ----
const user = (name) => ({ id: `u-${name}`, username: name, displayName: name });
const reply = (id, parentId, who, parentWho) => ({
  id, parentId, rootCommentId: 'A', author: user(who), replyTo: parentWho ? user(parentWho) : null, content: id,
});
const B = reply('B', 'A', 'bob', 'alice');
const C = reply('C', 'B', 'charlie', 'bob');
const D = reply('D', 'A', 'david', 'alice');
const E = reply('E', 'D', 'eve', 'david');
assert.equal(replyAttribution(B, 'A'), null, 'direct reply to the thread owner: no redundant label');
assert.equal(replyAttribution(C, 'A'), 'bob');
assert.equal(replyAttribution(D, 'A'), null);
assert.equal(replyAttribution(E, 'A'), 'david');
assert.equal(replyAttribution({ parentId: 'X', replyTo: null }, 'A'), null, 'unknown parent: no crash, no label');
assert.equal(replyAttribution({ parentId: null, replyTo: null }, 'A'), null);

// optimistic reply + later server page containing the same reply -> exactly one row, stays on top
{
  const mine = { ...reply('F', 'B', 'me', 'bob') };
  const rows = mergeThreadRows([mine], [B, C, { ...mine }, D, E]);
  assert.deepEqual(rows.map((r) => r.id), ['F', 'B', 'C', 'D', 'E']);
  assert.equal(rows.find((r) => r.id === 'F').parentId, 'B', 'real parent preserved');
}
// pages that overlap (race) never duplicate
assert.deepEqual(uniqueById([B, C, B, D, C]).map((r) => r.id), ['B', 'C', 'D']);

console.log('client logic tests passed');
