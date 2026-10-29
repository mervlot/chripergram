import { db, sqlite } from '../config/db';
import { ApiError } from '../utils/apiError';
import { verifyPassword } from '../utils/password';
import { consumeOtp, discardOtp, issueOtp } from './otp.service';
import { sendAccountDeletedNotice, sendAccountDeletionCode } from './mail.service';

type Row = Record<string, unknown>;
const all = (sql: string, ...params: string[]) => sqlite.prepare(sql).all(...params) as Row[];

/**
 * GDPR Art. 15/20 / CCPA "right to know": everything we hold about the person,
 * as machine-readable JSON. Password hashes, token hashes and other people's
 * private data are never included.
 */
export async function exportMyData(userId: string) {
  const user = all(
    `SELECT id, email, username, display_name, email_verified, verified, bio, link, location,
            game_status, avatar_url, banner_url, created_at, last_seen_at,
            terms_accepted_at, terms_version, privacy_version, marketing_opt_in
       FROM users WHERE id = ?`,
    userId,
  )[0];
  if (!user) throw ApiError.notFound('User not found');

  return {
    exportedAt: new Date().toISOString(),
    note:
      'Direct messages you SENT are included. Messages other people sent you are their content and are not included.',
    profile: user,
    posts: all('SELECT * FROM posts WHERE author_id = ?', userId),
    comments: all('SELECT * FROM comments WHERE author_id = ?', userId),
    likes: all('SELECT * FROM likes WHERE user_id = ?', userId),
    bookmarks: all('SELECT * FROM bookmarks WHERE user_id = ?', userId),
    following: all('SELECT following_id, created_at FROM follows WHERE follower_id = ?', userId),
    followers: all('SELECT follower_id, created_at FROM follows WHERE following_id = ?', userId),
    blocks: all('SELECT blocked_id, created_at FROM blocks WHERE blocker_id = ?', userId),
    mutes: all('SELECT muted_id, created_at FROM mutes WHERE muter_id = ?', userId),
    stories: all('SELECT * FROM stories WHERE author_id = ? OR user_id = ?', userId, userId),
    pollVotes: all('SELECT * FROM poll_votes WHERE user_id = ?', userId),
    communities: all('SELECT community_id, role, joined_at FROM community_members WHERE user_id = ?', userId),
    communityMessagesSent: all('SELECT * FROM community_messages WHERE sender_id = ?', userId),
    directMessagesSent: all('SELECT * FROM messages WHERE sender_id = ?', userId),
    sessions: all(
      'SELECT created_at, last_used_at, user_agent, ip, revoked_at, expires_at FROM refresh_tokens WHERE user_id = ?',
      userId,
    ),
  };
}

// Google-only accounts have no password, so confirm deletion by emailed code.
export async function requestDeletionCode(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw ApiError.notFound('User not found');
  const code = await issueOtp(userId, 'delete_account');
  try {
    await sendAccountDeletionCode(user.email, code);
  } catch (error) {
    await discardOtp(userId, 'delete_account');
    throw error;
  }
}

export async function deleteAccount(userId: string, opts: { password?: string; code?: string }) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) throw ApiError.notFound('User not found');

  if (user.passwordHash) {
    if (!opts.password || !(await verifyPassword(opts.password, user.passwordHash))) {
      throw ApiError.badRequest('Password is incorrect');
    }
  } else if (!opts.code || !(await consumeOtp(userId, 'delete_account', opts.code))) {
    throw ApiError.badRequest('Invalid or expired confirmation code');
  }

  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const run = (sql: string, ...p: string[]) => sqlite.prepare(sql).run(...p);

    // Hand owned communities to the longest-standing other member; delete the
    // ones nobody else belongs to.
    const owned = all('SELECT id FROM communities WHERE owner_id = ?', userId);
    for (const { id } of owned) {
      const next = all(
        'SELECT user_id FROM community_members WHERE community_id = ? AND user_id <> ? ORDER BY joined_at ASC LIMIT 1',
        String(id),
        userId,
      )[0];
      if (next) {
        run('UPDATE communities SET owner_id = ? WHERE id = ?', String(next.user_id), String(id));
        run("UPDATE community_members SET role = 'OWNER' WHERE community_id = ? AND user_id = ?", String(id), String(next.user_id));
      } else {
        run('DELETE FROM community_message_reactions WHERE message_id IN (SELECT id FROM community_messages WHERE community_id = ?)', String(id));
        run('DELETE FROM community_messages WHERE community_id = ?', String(id));
        run('DELETE FROM community_members WHERE community_id = ?', String(id));
        run('DELETE FROM communities WHERE id = ?', String(id));
      }
    }

    // Direct messages: remove whole conversations the user took part in.
    const convs = 'SELECT id FROM conversations WHERE user_a_id = ? OR user_b_id = ?';
    run(`DELETE FROM message_reactions WHERE user_id = ? OR message_id IN (SELECT id FROM messages WHERE sender_id = ? OR conversation_id IN (${convs}))`, userId, userId, userId, userId);
    run(`DELETE FROM messages WHERE sender_id = ? OR conversation_id IN (${convs})`, userId, userId, userId);
    run('DELETE FROM conversations WHERE user_a_id = ? OR user_b_id = ?', userId, userId);

    run('DELETE FROM community_message_reactions WHERE user_id = ? OR message_id IN (SELECT id FROM community_messages WHERE sender_id = ?)', userId, userId);
    run('DELETE FROM community_messages WHERE sender_id = ?', userId);
    run('DELETE FROM community_members WHERE user_id = ?', userId);

    // Posts and everything hanging off them.
    const mine = 'SELECT id FROM posts WHERE author_id = ?';
    run(`DELETE FROM likes WHERE post_id IN (${mine}) OR user_id = ?`, userId, userId);
    run(`DELETE FROM bookmarks WHERE post_id IN (${mine}) OR user_id = ?`, userId, userId);
    run(`DELETE FROM post_hashtags WHERE post_id IN (${mine})`, userId);
    run(`DELETE FROM mentions WHERE post_id IN (${mine}) OR user_id = ?`, userId, userId);
    run(`DELETE FROM poll_votes WHERE user_id = ? OR poll_id IN (SELECT id FROM polls WHERE post_id IN (${mine}))`, userId, userId);
    run(`DELETE FROM poll_options WHERE poll_id IN (SELECT id FROM polls WHERE post_id IN (${mine}))`, userId);
    run(`DELETE FROM polls WHERE post_id IN (${mine})`, userId);
    run(`DELETE FROM comments WHERE author_id = ? OR post_id IN (${mine})`, userId, userId);
    run(`DELETE FROM notifications WHERE user_id = ? OR recipient_id = ? OR actor_id = ? OR post_id IN (${mine})`, userId, userId, userId, userId);
    run(`UPDATE posts SET quoted_post_id = NULL WHERE quoted_post_id IN (${mine})`, userId);
    run(`DELETE FROM posts WHERE repost_of_id IN (${mine})`, userId);
    run('DELETE FROM posts WHERE author_id = ?', userId);

    run('DELETE FROM story_views WHERE user_id = ? OR story_id IN (SELECT id FROM stories WHERE author_id = ? OR user_id = ?)', userId, userId, userId);
    run('DELETE FROM stories WHERE author_id = ? OR user_id = ?', userId, userId);
    run('DELETE FROM follows WHERE follower_id = ? OR following_id = ?', userId, userId);
    run('DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?', userId, userId);
    run('DELETE FROM mutes WHERE muter_id = ? OR muted_id = ?', userId, userId);
    run('DELETE FROM refresh_tokens WHERE user_id = ?', userId);
    run('DELETE FROM password_reset_tokens WHERE user_id = ?', userId);
    run('DELETE FROM otp_codes WHERE user_id = ?', userId);
    run('DELETE FROM users WHERE id = ?', userId);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }

  sendAccountDeletedNotice(user.email).catch(() => undefined);
}
