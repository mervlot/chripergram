// End-to-end check of: Following-only feed, view counting (unique per viewer), search-driven
// interest, and "unseen + interesting first, seen last" ordering in For You.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feedtest-'));
process.env.SQLITE_DATA_DIR = dir;
process.env.SQLITE_PATH = path.join(dir, 't.db');
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'y'.repeat(32);

const { db, sqlite } = await import('../dist/config/db.js');
const feed = await import('../dist/services/feed.service.js');
const signals = await import('../dist/services/signals.service.js');

const mk = async (username) =>
  db.user.create({ data: { email: `${username}@t.io`, username, displayName: username, passwordHash: 'x' } });
const me = await mk('me'), alice = await mk('alice'), bob = await mk('bob'), cara = await mk('cara');
await db.follow.create({ data: { followerId: me.id, followingId: alice.id } });

const post = (authorId, content, hoursAgo = 1) =>
  db.post.create({ data: { authorId, content, createdAt: new Date(Date.now() - hoursAgo * 3_600_000) } });

const pAlice = await post(alice.id, 'alice news from the followed side', 5);
const pMine = await post(me.id, 'my own post', 1);
const pBobGuitar = await post(bob.id, 'learning guitar chords today', 20);
const pCaraFresh = await post(cara.id, 'random fresh lunch photo', 0.1);
const pCaraOld = await post(cara.id, 'random older thought', 30);

// 1) Following feed: only followed authors (not me, not bob/cara)
const following = await feed.getHomeFeed(me.id);
assert.deepEqual(following.items.map((p) => p.id), [pAlice.id], 'following shows only followed authors');

// 2) For You with no signals: followed author's post is interesting -> first
let fy = await feed.getForYouFeed(me.id, 0, 20);
assert.equal(fy.items[0].id, pAlice.id, 'followed author ranks first');
assert.ok(fy.feedToken, 'feed token issued');

// 3) Search for "guitar" -> bob's guitar post jumps above fresher uninteresting posts
signals.recordSearch(me.id, 'guitar');
fy = await feed.getForYouFeed(me.id, 0, 20);
const order = fy.items.map((p) => p.id);
assert.ok(order.indexOf(pBobGuitar.id) < order.indexOf(pCaraFresh.id), 'searched topic beats a fresher unrelated post');
assert.ok(order.indexOf(pBobGuitar.id) < order.indexOf(pCaraOld.id));

// 4) Views: unique per viewer, not counted for author, seen posts sink to the bottom
const c1 = signals.recordViews(me.id, [pAlice.id, pAlice.id, pCaraFresh.id]);
assert.equal(c1[pAlice.id], 1, 'view counted once per viewer');
signals.recordViews(me.id, [pAlice.id]);
assert.equal(sqlite.prepare('SELECT view_count v FROM posts WHERE id=?').get(pAlice.id).v, 1, 'repeat views do not inflate');
signals.recordViews(alice.id, [pAlice.id]);
assert.equal(sqlite.prepare('SELECT view_count v FROM posts WHERE id=?').get(pAlice.id).v, 1, 'author views ignored');
signals.recordViews(bob.id, [pAlice.id]);
assert.equal(sqlite.prepare('SELECT view_count v FROM posts WHERE id=?').get(pAlice.id).v, 2, 'another viewer counts');

fy = await feed.getForYouFeed(me.id, 0, 20);
const o2 = fy.items.map((p) => p.id);
assert.ok(o2.indexOf(pBobGuitar.id) < o2.indexOf(pAlice.id), 'unseen interesting beats seen');
assert.ok(o2.indexOf(pCaraOld.id) < o2.indexOf(pCaraFresh.id), 'unseen (older) beats seen (fresher)');
assert.equal(o2.at(-1) === pAlice.id || o2.at(-1) === pCaraFresh.id, true, 'seen posts are last');

// 5) Paging with a token is stable and complete
const p0 = await feed.getForYouFeed(me.id, 0, 2);
const p1 = await feed.getForYouFeed(me.id, 1, 2, p0.feedToken);
const p2 = await feed.getForYouFeed(me.id, 2, 2, p0.feedToken);
const all = [...p0.items, ...p1.items, ...p2.items].map((p) => p.id);
assert.equal(new Set(all).size, all.length, 'no duplicates across pages');
assert.equal(p2.nextPage, null);
console.log('feed ranking + views: all checks passed');
console.log('For You order:', o2.map((id) => ({ [pAlice.id]: 'alice(seen)', [pBobGuitar.id]: 'bob-guitar', [pCaraFresh.id]: 'cara-fresh(seen)', [pCaraOld.id]: 'cara-old', [pMine.id]: 'mine' })[id]).join(' > '));
