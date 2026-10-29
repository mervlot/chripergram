import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export const modelTables: Record<string, string> = {
  user: 'users',
  post: 'posts',
  follow: 'follows',
  like: 'likes',
  comment: 'comments',
  bookmark: 'bookmarks',
  refreshToken: 'refresh_tokens',
  passwordResetToken: 'password_reset_tokens',
  otpCode: 'otp_codes',
  emailSuppression: 'email_suppressions',
  block: 'blocks',
  mute: 'mutes',
  story: 'stories',
  storyView: 'story_views',
  hashtag: 'hashtags',
  postHashtag: 'post_hashtags',
  mention: 'mentions',
  poll: 'polls',
  pollOption: 'poll_options',
  pollVote: 'poll_votes',
  notification: 'notifications',
  community: 'communities',
  communityMember: 'community_members',
  communityMessage: 'community_messages',
  conversation: 'conversations',
  message: 'messages',
  messageReaction: 'message_reactions',
  communityMessageReaction: 'community_message_reactions',
  storedUpload: 'stored_uploads',
};

const createSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '', password_hash TEXT, google_id TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0,
    bio TEXT NOT NULL DEFAULT '', link TEXT, location TEXT, game_status TEXT,
    avatar_url TEXT, banner_url TEXT, cover_url TEXT, pinned_post_id TEXT,
    last_seen_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
    media TEXT NOT NULL DEFAULT '[]', media_json TEXT NOT NULL DEFAULT '[]', poll TEXT,
    parent_id TEXT, reply_to_id TEXT, repost_of_id TEXT, quoted_post_id TEXT,
    community_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, edited_at TEXT,
    view_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL, following_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
  );
  CREATE TABLE IF NOT EXISTS likes (
    user_id TEXT NOT NULL, post_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, post_id)
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL, author_id TEXT NOT NULL,
    content TEXT NOT NULL, parent_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    session_id TEXT, expires_at TEXT NOT NULL, revoked_at TEXT, user_agent TEXT, ip TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rotation_grace_until TEXT
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS otp_codes (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL, used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS email_suppressions (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, reason TEXT NOT NULL DEFAULT 'unsubscribe',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (blocker_id, blocked_id)
  );
  CREATE TABLE IF NOT EXISTS mutes (
    muter_id TEXT NOT NULL, muted_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (muter_id, muted_id)
  );
  CREATE TABLE IF NOT EXISTS bookmarks (
    user_id TEXT NOT NULL, post_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, post_id)
  );
  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL, user_id TEXT, content TEXT NOT NULL DEFAULT '',
    media_url TEXT, media_type TEXT NOT NULL DEFAULT 'IMAGE', caption TEXT,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS story_views (
    story_id TEXT NOT NULL, user_id TEXT NOT NULL,
    viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (story_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS hashtags (
    id TEXT PRIMARY KEY, tag TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS post_hashtags (
    post_id TEXT NOT NULL, hashtag_id TEXT NOT NULL, PRIMARY KEY (post_id, hashtag_id)
  );
  CREATE TABLE IF NOT EXISTS mentions (
    post_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL UNIQUE, question TEXT NOT NULL DEFAULT '',
    options TEXT NOT NULL DEFAULT '[]', ends_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS poll_options (
    id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, text TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL, user_id TEXT NOT NULL, option_id TEXT,
    option_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (poll_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT, recipient_id TEXT, actor_id TEXT,
    type TEXT NOT NULL DEFAULT '', post_id TEXT, read INTEGER NOT NULL DEFAULT 0,
    read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS communities (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    description TEXT, avatar_url TEXT, banner_url TEXT,
    is_private INTEGER NOT NULL DEFAULT 0, owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS community_members (
    community_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'MEMBER',
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (community_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS community_messages (
    id TEXT PRIMARY KEY, community_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, user_a_id TEXT NOT NULL, user_b_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (user_a_id, user_b_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    content TEXT, image_url TEXT, audio_url TEXT, video_note_url TEXT, video_url TEXT,
    media_duration_ms INTEGER, reply_to_id TEXT, edited_at TEXT, deleted_at TEXT,
    read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS message_reactions (
    id TEXT PRIMARY KEY, message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (message_id, user_id, emoji)
  );
  CREATE TABLE IF NOT EXISTS community_message_reactions (
    id TEXT PRIMARY KEY, message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS stored_uploads (
    id TEXT PRIMARY KEY, data BLOB NOT NULL, mime_type TEXT NOT NULL,
    original_name TEXT NOT NULL, size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

// Defaults on additive columns must be SQLite-safe for ALTER TABLE; timestamps
// are backfilled in a separate statement below.
export const requiredColumns: Record<string, Record<string, string>> = {
  users: {
    id: 'TEXT',
    email: "TEXT NOT NULL DEFAULT ''", username: "TEXT NOT NULL DEFAULT ''",
    display_name: "TEXT NOT NULL DEFAULT ''", password_hash: 'TEXT', google_id: 'TEXT',
    email_verified: 'INTEGER NOT NULL DEFAULT 0', verified: 'INTEGER NOT NULL DEFAULT 0',
    bio: "TEXT NOT NULL DEFAULT ''", link: 'TEXT', location: 'TEXT', game_status: 'TEXT',
    avatar_url: 'TEXT', banner_url: 'TEXT', cover_url: 'TEXT', pinned_post_id: 'TEXT',
    last_seen_at: 'TEXT', created_at: 'TEXT', updated_at: 'TEXT',
    terms_accepted_at: 'TEXT', terms_version: 'TEXT', privacy_version: 'TEXT',
    marketing_opt_in: 'INTEGER NOT NULL DEFAULT 0',
  },
  posts: {
    id: 'TEXT',
    author_id: "TEXT NOT NULL DEFAULT ''", content: "TEXT NOT NULL DEFAULT ''",
    media: "TEXT NOT NULL DEFAULT '[]'", media_json: "TEXT NOT NULL DEFAULT '[]'", poll: 'TEXT',
    parent_id: 'TEXT', reply_to_id: 'TEXT', repost_of_id: 'TEXT', quoted_post_id: 'TEXT',
    community_id: 'TEXT', created_at: 'TEXT', updated_at: 'TEXT', edited_at: 'TEXT',
    view_count: 'INTEGER NOT NULL DEFAULT 0',
  },
  follows: { follower_id: "TEXT NOT NULL DEFAULT ''", following_id: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT' },
  likes: { user_id: "TEXT NOT NULL DEFAULT ''", post_id: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT' },
  comments: {
    id: 'TEXT',
    post_id: "TEXT NOT NULL DEFAULT ''", author_id: "TEXT NOT NULL DEFAULT ''",
    content: "TEXT NOT NULL DEFAULT ''", parent_id: 'TEXT', created_at: 'TEXT', updated_at: 'TEXT',
  },
  refresh_tokens: {
    id: 'TEXT',
    user_id: "TEXT NOT NULL DEFAULT ''", token_hash: "TEXT NOT NULL DEFAULT ''", session_id: 'TEXT',
    expires_at: "TEXT NOT NULL DEFAULT ''", revoked_at: 'TEXT', user_agent: 'TEXT', ip: 'TEXT',
    created_at: 'TEXT', last_used_at: 'TEXT', rotation_grace_until: 'TEXT',
  },
  password_reset_tokens: {
    id: 'TEXT',
    user_id: "TEXT NOT NULL DEFAULT ''", token_hash: "TEXT NOT NULL DEFAULT ''",
    expires_at: "TEXT NOT NULL DEFAULT ''", used_at: 'TEXT',
  },
  otp_codes: {
    id: 'TEXT',
    user_id: "TEXT NOT NULL DEFAULT ''", purpose: "TEXT NOT NULL DEFAULT ''",
    code_hash: "TEXT NOT NULL DEFAULT ''", attempts: 'INTEGER NOT NULL DEFAULT 0',
    expires_at: "TEXT NOT NULL DEFAULT ''", used_at: 'TEXT', created_at: 'TEXT',
  },
  email_suppressions: {
    id: 'TEXT',
    email: "TEXT NOT NULL DEFAULT ''", reason: "TEXT NOT NULL DEFAULT 'unsubscribe'", created_at: 'TEXT',
  },
  blocks: { blocker_id: "TEXT NOT NULL DEFAULT ''", blocked_id: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT' },
  mutes: { muter_id: "TEXT NOT NULL DEFAULT ''", muted_id: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT' },
  bookmarks: { user_id: "TEXT NOT NULL DEFAULT ''", post_id: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT' },
  stories: {
    id: 'TEXT',
    author_id: 'TEXT', user_id: 'TEXT', content: "TEXT NOT NULL DEFAULT ''",
    media_url: 'TEXT', media_type: "TEXT NOT NULL DEFAULT 'IMAGE'", caption: 'TEXT',
    expires_at: 'TEXT', created_at: 'TEXT',
  },
  story_views: { story_id: "TEXT NOT NULL DEFAULT ''", user_id: "TEXT NOT NULL DEFAULT ''", viewed_at: 'TEXT' },
  hashtags: { id: 'TEXT', tag: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT' },
  post_hashtags: { post_id: "TEXT NOT NULL DEFAULT ''", hashtag_id: "TEXT NOT NULL DEFAULT ''" },
  mentions: { post_id: "TEXT NOT NULL DEFAULT ''", user_id: "TEXT NOT NULL DEFAULT ''" },
  polls: {
    id: 'TEXT',
    post_id: "TEXT NOT NULL DEFAULT ''", question: "TEXT NOT NULL DEFAULT ''",
    options: "TEXT NOT NULL DEFAULT '[]'", ends_at: 'TEXT', created_at: 'TEXT',
  },
  poll_options: { id: 'TEXT', poll_id: "TEXT NOT NULL DEFAULT ''", text: "TEXT NOT NULL DEFAULT ''", order: 'INTEGER NOT NULL DEFAULT 0' },
  poll_votes: {
    poll_id: "TEXT NOT NULL DEFAULT ''", user_id: "TEXT NOT NULL DEFAULT ''",
    option_id: 'TEXT', option_index: 'INTEGER NOT NULL DEFAULT 0', created_at: 'TEXT',
  },
  notifications: {
    id: 'TEXT',
    user_id: 'TEXT', recipient_id: 'TEXT', actor_id: 'TEXT',
    type: "TEXT NOT NULL DEFAULT ''", post_id: 'TEXT', read: 'INTEGER NOT NULL DEFAULT 0',
    read_at: 'TEXT', created_at: 'TEXT',
  },
  communities: {
    id: 'TEXT',
    slug: "TEXT NOT NULL DEFAULT ''", name: "TEXT NOT NULL DEFAULT ''", description: 'TEXT',
    avatar_url: 'TEXT', banner_url: 'TEXT', is_private: 'INTEGER NOT NULL DEFAULT 0',
    owner_id: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT', updated_at: 'TEXT',
  },
  community_members: {
    community_id: "TEXT NOT NULL DEFAULT ''", user_id: "TEXT NOT NULL DEFAULT ''",
    role: "TEXT NOT NULL DEFAULT 'MEMBER'", joined_at: 'TEXT',
  },
  community_messages: {
    id: 'TEXT',
    community_id: "TEXT NOT NULL DEFAULT ''", sender_id: "TEXT NOT NULL DEFAULT ''",
    content: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT',
  },
  conversations: {
    id: 'TEXT',
    user_a_id: "TEXT NOT NULL DEFAULT ''", user_b_id: "TEXT NOT NULL DEFAULT ''",
    created_at: 'TEXT', updated_at: 'TEXT',
  },
  messages: {
    id: 'TEXT',
    conversation_id: "TEXT NOT NULL DEFAULT ''", sender_id: "TEXT NOT NULL DEFAULT ''",
    content: 'TEXT', image_url: 'TEXT', audio_url: 'TEXT', video_note_url: 'TEXT', video_url: 'TEXT',
    media_duration_ms: 'INTEGER', reply_to_id: 'TEXT', edited_at: 'TEXT', deleted_at: 'TEXT',
    read_at: 'TEXT', created_at: 'TEXT',
  },
  message_reactions: {
    id: 'TEXT',
    message_id: "TEXT NOT NULL DEFAULT ''", user_id: "TEXT NOT NULL DEFAULT ''",
    emoji: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT',
  },
  community_message_reactions: {
    id: 'TEXT',
    message_id: "TEXT NOT NULL DEFAULT ''", user_id: "TEXT NOT NULL DEFAULT ''",
    emoji: "TEXT NOT NULL DEFAULT ''", created_at: 'TEXT',
  },
  stored_uploads: {
    id: 'TEXT',
    data: 'BLOB', mime_type: "TEXT NOT NULL DEFAULT 'application/octet-stream'",
    original_name: "TEXT NOT NULL DEFAULT ''", size: 'INTEGER NOT NULL DEFAULT 0', created_at: 'TEXT',
  },
};

export const expectedPrimaryKeys: Record<string, string[]> = {
  users: ['id'],
  posts: ['id'],
  follows: ['follower_id', 'following_id'],
  likes: ['user_id', 'post_id'],
  comments: ['id'],
  refresh_tokens: ['id'],
  password_reset_tokens: ['id'],
  otp_codes: ['id'],
  email_suppressions: ['id'],
  blocks: ['blocker_id', 'blocked_id'],
  mutes: ['muter_id', 'muted_id'],
  bookmarks: ['user_id', 'post_id'],
  stories: ['id'],
  story_views: ['story_id', 'user_id'],
  hashtags: ['id'],
  post_hashtags: ['post_id', 'hashtag_id'],
  mentions: ['post_id', 'user_id'],
  polls: ['id'],
  poll_options: ['id'],
  poll_votes: ['poll_id', 'user_id'],
  notifications: ['id'],
  communities: ['id'],
  community_members: ['community_id', 'user_id'],
  community_messages: ['id'],
  conversations: ['id'],
  messages: ['id'],
  message_reactions: ['id'],
  community_message_reactions: ['id'],
  stored_uploads: ['id'],
};

const expectedTypes: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(requiredColumns).map(([table, columns]) => [
    table,
    Object.fromEntries(Object.entries(columns).map(([name, definition]) => [name, definition.split(/\s+/)[0].toUpperCase()])),
  ]),
);

const tableColumns = (db: DatabaseSync, table: string) =>
  db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string; type: string; pk: number }>;

function hasColumn(db: DatabaseSync, table: string, name: string) {
  return tableColumns(db, table).some((column) => column.name === name);
}

function addMissingColumns(db: DatabaseSync) {
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const present = new Set(tableColumns(db, table).map((column) => column.name));
    for (const [name, definition] of Object.entries(columns)) {
      if (!present.has(name)) {
        db.exec(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`);
      }
    }
  }
}

function backfillLegacyColumns(db: DatabaseSync) {
  const columns = (table: string) => new Set(tableColumns(db, table).map((column) => column.name));
  const userColumns = columns('users');
  if (userColumns.has('is_verified')) {
    db.exec('UPDATE users SET verified = CASE WHEN verified = 0 AND is_verified <> 0 THEN 1 ELSE verified END');
  }
  if (userColumns.has('cover_url')) {
    db.exec('UPDATE users SET banner_url = COALESCE(NULLIF(banner_url, \'\'), cover_url)');
  }
  db.exec("UPDATE users SET display_name = username WHERE display_name IS NULL OR display_name = ''");
  db.exec("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''");
  db.exec("UPDATE users SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL OR updated_at = ''");

  db.exec(`
    UPDATE posts
    SET media = CASE
      WHEN media IS NULL OR media = '' OR media = '[]' THEN COALESCE(NULLIF(media_json, ''), '[]')
      ELSE media
    END
  `);
  db.exec('UPDATE posts SET media_json = media WHERE media_json IS NULL OR media_json = \'\' OR media_json = \'[]\'');
  db.exec("UPDATE posts SET content = '' WHERE content IS NULL");
  db.exec('UPDATE posts SET view_count = 0 WHERE view_count IS NULL');
  db.exec("UPDATE posts SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL OR created_at = ''");
  db.exec("UPDATE posts SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL OR updated_at = ''");

  const storyColumns = columns('stories');
  if (storyColumns.has('user_id')) {
    db.exec("UPDATE stories SET author_id = COALESCE(NULLIF(author_id, ''), user_id)");
  }
  if (storyColumns.has('content')) {
    db.exec("UPDATE stories SET caption = COALESCE(caption, NULLIF(content, ''))");
  }
  db.exec("UPDATE stories SET media_type = 'IMAGE' WHERE media_type IS NULL OR media_type = ''");
  db.exec("UPDATE stories SET expires_at = datetime(COALESCE(created_at, CURRENT_TIMESTAMP), '+24 hours') WHERE expires_at IS NULL OR expires_at = ''");

  const notificationColumns = columns('notifications');
  if (notificationColumns.has('user_id')) {
    db.exec('UPDATE notifications SET recipient_id = COALESCE(recipient_id, user_id)');
  }
  if (notificationColumns.has('recipient_id') && notificationColumns.has('user_id')) {
    db.exec('UPDATE notifications SET user_id = COALESCE(user_id, recipient_id)');
  }
  db.exec('UPDATE notifications SET read = 0 WHERE read IS NULL');

  for (const table of Object.keys(requiredColumns)) {
    const names = new Set(tableColumns(db, table).map((column) => column.name));
    for (const column of ['created_at', 'updated_at', 'last_used_at', 'joined_at', 'viewed_at']) {
      if (names.has(column)) {
        db.exec(`UPDATE "${table}" SET "${column}" = CURRENT_TIMESTAMP WHERE "${column}" IS NULL OR "${column}" = ''`);
      }
    }
  }

  // Convert legacy JSON-backed post polls into normalized rows while keeping
  // the original JSON column intact for rollback safety.
  const oldPostPolls = db.prepare(
    "SELECT id, content, poll, created_at FROM posts WHERE poll IS NOT NULL AND poll <> ''",
  ).all() as Array<Record<string, unknown>>;
  const pollForPost = db.prepare('SELECT id FROM polls WHERE post_id = ?');
  const insertPoll = db.prepare(
    'INSERT INTO polls (id, post_id, question, options, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insertOption = db.prepare('INSERT INTO poll_options (id, poll_id, text, "order") VALUES (?, ?, ?, ?)');
  for (const post of oldPostPolls) {
    if (pollForPost.get(String(post.id))) continue;
    let decoded: any;
    try { decoded = JSON.parse(String(post.poll)); } catch { continue; }
    const poll = decoded?.create ?? decoded;
    const options = poll?.options?.create ?? poll?.options ?? [];
    const pollId = randomUUID();
    const optionTexts = Array.isArray(options)
      ? options.map((option: any) => typeof option === 'string' ? option : String(option?.text ?? ''))
      : [];
    const end = poll?.endsAt instanceof Date
      ? poll.endsAt.toISOString()
      : typeof poll?.endsAt === 'string' ? poll.endsAt : null;
    insertPoll.run(
      pollId,
      String(post.id),
      String(poll?.question ?? post.content ?? ''),
      JSON.stringify(optionTexts),
      end,
      post.created_at == null ? new Date().toISOString() : String(post.created_at),
    );
    if (Array.isArray(options)) {
      options.forEach((option: any, index: number) => insertOption.run(
        randomUUID(),
        pollId,
        typeof option === 'string' ? option : String(option?.text ?? ''),
        Number(typeof option === 'object' ? option.order ?? index : index),
      ));
    }
  }

  // Convert older poll option arrays and vote indexes without deleting the
  // source representation.
  const oldPolls = db.prepare('SELECT id, post_id, options, ends_at, created_at FROM polls').all() as Array<Record<string, unknown>>;
  const selectOptions = db.prepare('SELECT id FROM poll_options WHERE poll_id = ? ORDER BY "order"');
  const optionIdByPollAndIndex = new Map<string, string[]>();
  for (const poll of oldPolls) {
    if (!poll.ends_at && poll.created_at) {
      const created = Date.parse(String(poll.created_at).replace(' ', 'T') + (String(poll.created_at).includes('Z') ? '' : 'Z'));
      if (Number.isFinite(created)) {
        db.prepare('UPDATE polls SET ends_at = ? WHERE id = ?').run(new Date(created + 24 * 60 * 60 * 1000).toISOString(), String(poll.id));
      }
    }
    let optionIds = (selectOptions.all(String(poll.id)) as Array<{ id: string }>).map((item) => item.id);
    if (!optionIds.length) {
      let options: unknown;
      try { options = JSON.parse(String(poll.options ?? '[]')); } catch { options = []; }
      if (Array.isArray(options)) {
        optionIds = options.map((item, index) => {
          const option = typeof item === 'string' ? { text: item, order: index } : item as Record<string, unknown>;
          const id = randomUUID();
          insertOption.run(id, String(poll.id), String(option.text ?? ''), Number(option.order ?? index));
          return id;
        });
      }
    }
    optionIdByPollAndIndex.set(String(poll.id), optionIds);
  }

  const oldVotes = db.prepare('SELECT poll_id, user_id, option_index, option_id FROM poll_votes').all() as Array<Record<string, unknown>>;
  const updateVoteOption = db.prepare('UPDATE poll_votes SET option_id = ? WHERE poll_id = ? AND user_id = ?');
  for (const vote of oldVotes) {
    if (vote.option_id) continue;
    const options = optionIdByPollAndIndex.get(String(vote.poll_id)) ?? [];
    const optionId = options[Number(vote.option_index ?? 0)];
    if (optionId) updateVoteOption.run(optionId, String(vote.poll_id), String(vote.user_id));
  }
}

// Interest signals used by the ranking algorithm. Kept outside `modelTables` (they are
// accessed with raw SQL from signals.service.ts, not through the model adapter).
function createSignalTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_views (
      user_id TEXT NOT NULL, post_id TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
      PRIMARY KEY (user_id, post_id)
    );
    CREATE INDEX IF NOT EXISTS post_views_user_idx ON post_views(user_id, last_seen_at DESC);
    CREATE TABLE IF NOT EXISTS search_history (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, query TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS search_history_user_idx ON search_history(user_id, created_at DESC);
  `);
}

function createIndexes(db: DatabaseSync) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS posts_author_idx ON posts(author_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS posts_parent_idx ON posts(parent_id, created_at);
    CREATE INDEX IF NOT EXISTS posts_repost_idx ON posts(repost_of_id, author_id);
    CREATE INDEX IF NOT EXISTS posts_quote_idx ON posts(quoted_post_id);
    CREATE INDEX IF NOT EXISTS likes_post_idx ON likes(post_id);
    CREATE INDEX IF NOT EXISTS otp_codes_user_idx ON otp_codes(user_id, purpose, created_at DESC);
    CREATE INDEX IF NOT EXISTS follows_following_idx ON follows(following_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows(follower_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS bookmarks_user_idx ON bookmarks(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS stories_author_expiry_idx ON stories(author_id, expires_at);
    CREATE INDEX IF NOT EXISTS poll_options_poll_idx ON poll_options(poll_id, "order");
    CREATE INDEX IF NOT EXISTS poll_votes_option_idx ON poll_votes(option_id);
    CREATE INDEX IF NOT EXISTS community_posts_idx ON posts(community_id, created_at DESC);
  `);
}

function validateSchema(db: DatabaseSync) {
  const tables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name),
  );
  for (const table of Object.values(modelTables)) {
    if (!tables.has(table)) throw new Error(`SQLite schema is missing required table "${table}"`);
  }

  for (const [table, columns] of Object.entries(expectedTypes)) {
    const info = tableColumns(db, table);
    const actual = new Map(info.map((column) => [column.name, column.type.toUpperCase()]));
    for (const [name, expected] of Object.entries(columns)) {
      const found = actual.get(name);
      if (!found) throw new Error(`SQLite schema is missing required column "${table}.${name}"`);
      if (found !== expected) {
        throw new Error(`SQLite type mismatch for "${table}.${name}": expected ${expected}, found ${found}`);
      }
      const storageTypes = expected === 'TEXT' ? "'text'"
        : expected === 'INTEGER' ? "'integer'"
          : expected === 'REAL' ? "'integer', 'real'"
            : expected === 'BLOB' ? "'blob'"
              : "'integer', 'real', 'text'";
      const invalid = db.prepare(
        `SELECT COUNT(*) AS count FROM "${table}" WHERE "${name}" IS NOT NULL AND typeof("${name}") NOT IN (${storageTypes})`,
      ).get() as { count: number };
      if (Number(invalid.count) > 0) {
        throw new Error(`SQLite data type mismatch: ${invalid.count} row(s) in "${table}.${name}" have invalid storage types`);
      }
    }
    const primary = info.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => column.name);
    const expectedPrimary = expectedPrimaryKeys[table] ?? [];
    if (primary.join(',') !== expectedPrimary.join(',')) {
      throw new Error(`SQLite primary key mismatch for "${table}": expected (${expectedPrimary.join(', ')}), found (${primary.join(', ')})`);
    }
  }
}

export function initializeSchema(db: DatabaseSync) {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(createSchema);
    addMissingColumns(db);
    backfillLegacyColumns(db);
    createIndexes(db);
    createSignalTables(db);
    validateSchema(db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
