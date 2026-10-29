// Run: node --experimental-strip-types scripts/test-message-video.mjs
// Verifies the additive video_url migration on an existing DB and persistence of videoUrl.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteModels } from '../src/config/sqlite-model.ts';
import { initializeSchema, modelTables } from '../src/config/sqlite-schema.ts';

// Fresh DB has the column.
const fresh = new DatabaseSync(':memory:');
initializeSchema(fresh);
const cols = (d) => d.prepare('PRAGMA table_info("messages")').all().map((c) => c.name);
assert.ok(cols(fresh).includes('video_url'));

// Legacy DB (pre-change messages table, with data) is migrated in place, data kept.
const legacy = new DatabaseSync(':memory:');
legacy.exec(`CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
  content TEXT, image_url TEXT, audio_url TEXT, video_note_url TEXT,
  media_duration_ms INTEGER, reply_to_id TEXT, edited_at TEXT, deleted_at TEXT,
  read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
legacy.exec(`INSERT INTO messages (id, conversation_id, sender_id, content) VALUES ('m1','c','u','old message')`);
initializeSchema(legacy);
assert.ok(cols(legacy).includes('video_url'));
assert.equal(legacy.prepare('SELECT content FROM messages WHERE id=?').get('m1').content, 'old message');

// videoUrl round-trips and is distinct from videoNoteUrl.
const db = createSqliteModels(legacy, modelTables);
const m = await db.message.create({
  data: { conversationId: 'c', senderId: 'u', videoUrl: '/uploads/a.mp4', mediaDurationMs: null },
});
const got = await db.message.findUnique({ where: { id: m.id } });
assert.equal(got.videoUrl, '/uploads/a.mp4');
assert.ok(!got.videoNoteUrl);

// Reaction uniqueness constraint: same user/emoji twice is rejected by the DB.
await db.messageReaction.create({ data: { messageId: m.id, userId: 'u', emoji: '👍' } });
await assert.rejects(() => db.messageReaction.create({ data: { messageId: m.id, userId: 'u', emoji: '👍' } }));
await db.messageReaction.create({ data: { messageId: m.id, userId: 'u2', emoji: '👍' } });

console.log('message video / migration tests passed');
