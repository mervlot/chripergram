// Run: node --experimental-strip-types scripts/test-reactions.mjs
import assert from 'node:assert/strict';
import { hasReacted, setReaction, reconcileReactions } from '../src/lib/reactions.ts';

let r = setReaction(undefined, '👍', 'me', true);
assert.deepEqual(r, [{ emoji: '👍', userIds: ['me'] }]);
assert.equal(setReaction(r, '👍', 'me', true), r);                       // idempotent add
r = setReaction(r, '👍', 'you', true);
assert.deepEqual(r[0].userIds, ['me', 'you']);
r = setReaction(r, '👍', 'me', false);                                    // remove mine, keep theirs
assert.deepEqual(r, [{ emoji: '👍', userIds: ['you'] }]);
r = setReaction(r, '👍', 'you', false);                                   // last user removes chip
assert.deepEqual(r, []);
assert.deepEqual(setReaction([], '❤️', 'me', false), []);                 // removing absent is a no-op

// failure recovery: optimistic add then rollback restores the original
const before = [{ emoji: '🔥', userIds: ['you'] }];
const optimistic = setReaction(before, '🔥', 'me', true);
assert.ok(hasReacted(optimistic, '🔥', 'me'));
assert.deepEqual(setReaction(optimistic, '🔥', 'me', false), before);

// a stale realtime update must not undo a pending optimistic add...
const stale = [{ emoji: '🔥', userIds: ['you'] }];
const pending = new Map([['🔥', true]]);
assert.ok(hasReacted(reconcileReactions(stale, pending, 'me'), '🔥', 'me'));
// ...but once the server confirms (pending cleared) the server snapshot wins
const confirmed = [{ emoji: '🔥', userIds: ['you', 'me'] }];
assert.deepEqual(reconcileReactions(confirmed, new Map(), 'me'), confirmed);
// pending removal hides my reaction in a stale snapshot
assert.ok(!hasReacted(reconcileReactions(confirmed, new Map([['🔥', false]]), 'me'), '🔥', 'me'));
console.log('reaction tests passed');
