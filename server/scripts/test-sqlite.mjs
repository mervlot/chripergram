import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteModels } from '../src/config/sqlite-model.ts';
import { initializeSchema, modelTables } from '../src/config/sqlite-schema.ts';
import {
  createPostSchema,
  postIdParamSchema,
  sendMessageSchema,
  votePollSchema,
} from '../src/validators/schemas.ts';

const sqlite = new DatabaseSync(':memory:');
initializeSchema(sqlite);
const db = createSqliteModels(sqlite, modelTables);

const generatedId = randomUUID();
assert.equal(createPostSchema.parse({ content: 'reply', parentId: generatedId }).parentId, generatedId);
assert.equal(votePollSchema.parse({ optionId: generatedId }).optionId, generatedId);
assert.equal(postIdParamSchema.parse({ id: generatedId }).id, generatedId);
assert.equal(sendMessageSchema.parse({ content: 'reply', replyToId: generatedId }).replyToId, generatedId);
assert.equal(createPostSchema.safeParse({ parentId: 'not-a-database-id' }).success, false);

const user = await db.user.create({
  data: {
    email: 'sqlite-test@example.invalid',
    username: 'sqlite-test',
    displayName: 'SQLite Test',
    verified: true,
  },
});
assert.equal(user.verified, true);
assert.ok(user.id);
assert.ok(user.createdAt instanceof Date);

await db.follow.upsert({
  where: { followerId_followingId: { followerId: user.id, followingId: 'someone' } },
  create: { followerId: user.id, followingId: 'someone' },
  update: {},
});
assert.equal(await db.follow.count({ where: { followerId: user.id } }), 1);

const post = await db.post.create({
  data: {
    authorId: user.id,
    content: 'Native SQLite adapter smoke test',
    media: { create: [{ url: 'https://example.invalid/image.png', type: 'IMAGE', width: 320 }] },
    poll: {
      create: {
        endsAt: new Date(Date.now() + 60_000),
        options: { create: [{ text: 'Yes', order: 0 }, { text: 'No', order: 1 }] },
      },
    },
  },
  include: {
    author: { select: { id: true, username: true } },
    media: true,
    poll: { include: { options: { orderBy: { order: 'asc' }, include: { _count: { select: { votes: true } } } } } },
    _count: { select: { likes: true } },
  },
});
assert.equal(post.author.id, user.id);
assert.equal(post.media.length, 1);
assert.equal(post.media[0].url, 'https://example.invalid/image.png');
assert.equal(post.poll.options.length, 2);
assert.equal(post._count.likes, 0);

await db.pollVote.upsert({
  where: { pollId_userId: { pollId: post.poll.id, userId: user.id } },
  create: { pollId: post.poll.id, userId: user.id, optionId: post.poll.options[0].id },
  update: { optionId: post.poll.options[0].id },
});
const freshPoll = await db.poll.findUnique({
  where: { postId: post.id },
  include: {
    options: { orderBy: { order: 'asc' }, include: { _count: { select: { votes: true } } } },
    votes: { where: { userId: user.id }, select: { optionId: true } },
  },
});
assert.equal(freshPoll.options[0]._count.votes, 1);
assert.equal(freshPoll.votes[0].optionId, post.poll.options[0].id);

await db.post.update({ where: { id: post.id }, data: { viewCount: { increment: 3 } } });
assert.equal((await db.post.findUnique({ where: { id: post.id }, select: { viewCount: true } })).viewCount, 3);
assert.equal(
  (await db.post.findMany({ where: { content: { contains: 'SQLITE ADAPTER' } } })).length,
  1,
  'contains search is case-insensitive',
);
assert.equal(
  (await db.post.findMany({ where: { media: { some: { type: 'IMAGE' } } } })).length,
  1,
  'JSON media relation filters work',
);

const hashtag = await db.hashtag.upsert({
  where: { tag: 'sqlite' },
  create: { tag: 'sqlite' },
  update: {},
});
await db.postHashtag.upsert({
  where: { postId_hashtagId: { postId: post.id, hashtagId: hashtag.id } },
  create: { postId: post.id, hashtagId: hashtag.id },
  update: {},
});
const tags = await db.post.findMany({
  where: { hashtags: { some: { hashtag: { tag: 'sqlite' } } } },
  include: { hashtags: { include: { hashtag: true } } },
});
assert.equal(tags.length, 1);
assert.equal(tags[0].hashtags[0].hashtag.tag, 'sqlite');

await db.notification.create({ data: { recipientId: user.id, actorId: 'someone', type: 'FOLLOW' } });
assert.equal(await db.notification.count({ where: { recipientId: user.id, read: false } }), 1);
assert.equal(await db.notification.count({ where: { userId: user.id } }), 1);
await db.notification.updateMany({ where: { recipientId: user.id, read: false }, data: { read: true } });
assert.equal(await db.notification.count({ where: { recipientId: user.id, read: false } }), 0);

await assert.rejects(
  db.$transaction(async () => {
    await db.user.create({
      data: { email: 'rollback@example.invalid', username: 'rollback', displayName: 'Rollback' },
    });
    throw new Error('force rollback');
  }),
  /force rollback/,
);
assert.equal(await db.user.count({ where: { email: 'rollback@example.invalid' } }), 0);

await assert.rejects(
  db.user.create({ data: { email: 'bad@example.invalid', username: 'bad', displayName: 'Bad', verified: 'yes' } }),
  /verified must be a boolean/,
);

await db.storedUpload.create({
  data: {
    data: Buffer.from([0, 1, 2, 255]),
    mimeType: 'application/octet-stream',
    originalName: 'test.bin',
    size: 4,
  },
});
const upload = await db.storedUpload.findFirst({ select: { data: true, size: true } });
assert.equal(upload.data.byteLength, 4);
assert.equal(upload.size, 4);

await assert.rejects(Promise.resolve().then(() => db.notARealModel), /Unknown SQLite model/);
assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
sqlite.close();

if (process.env.SQLITE_LEGACY_TEST_PATH) {
  const legacy = new DatabaseSync(process.env.SQLITE_LEGACY_TEST_PATH);
  initializeSchema(legacy);
  const oldUser = legacy.prepare('SELECT id, username, display_name, verified FROM users LIMIT 1').get();
  const oldPost = legacy.prepare('SELECT id, media, media_json, view_count FROM posts LIMIT 1').get();
  assert.ok(oldUser, 'existing user row is preserved');
  assert.ok(oldPost, 'existing post row is preserved');
  assert.equal(legacy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  legacy.close();
}

console.log('SQLite schema, types, relations, transactions, and legacy migration checks passed.');
