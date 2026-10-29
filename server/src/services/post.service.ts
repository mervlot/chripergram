import { db, sqlite } from '../config/db';
import { recordViews } from './signals.service';
import { MediaType } from '../types/enums';
import { ApiError } from '../utils/apiError';
import { extractHashtags, extractMentions } from '../utils/textParser';
import { postInclude, serializePoll, serializePost } from './serializers';
import { createNotification, removeNotification } from './notification.service';
import { assertCanPostTo } from './community.service';
import { emitToPost } from '../sockets/io';
import { commentScore } from './ranking.service';
import {
  getAncestorIds,
  getFlatReplyThread,
  getThreadCounts,
  parseThreadCursor,
} from './replyThread';

export interface MediaInput {
  url: string;
  type: MediaType;
  width?: number;
  height?: number;
}

export interface PollInput {
  options: string[];
  durationHours: number;
}

interface CreatePostArgs {
  authorId: string;
  content?: string;
  media?: MediaInput[];
  parentId?: string;
  quotedPostId?: string;
  communityId?: string;
  poll?: PollInput;
}

// Validates poll input from the client (2-4 non-empty options, 1h-7d).
function validatePoll(poll: PollInput): { options: string[]; durationHours: number } {
  const options = (poll.options ?? []).map((o) => String(o).trim()).filter(Boolean);
  if (options.length < 2 || options.length > 4) {
    throw ApiError.badRequest('A poll needs between 2 and 4 options');
  }
  if (options.some((o) => o.length > 50)) {
    throw ApiError.badRequest('Poll options are limited to 50 characters');
  }
  const durationHours = Number(poll.durationHours);
  if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 168) {
    throw ApiError.badRequest('Poll duration must be between 1 hour and 7 days');
  }
  return { options, durationHours };
}

// Links hashtags and mentions found in `content` to the post, and notifies
// mentioned users. Runs after the post row exists.
async function syncHashtagsAndMentions(
  postId: string,
  content: string,
  authorId: string,
  notifyMentions = true,
) {
  const tags = extractHashtags(content);
  const mentions = extractMentions(content);

  for (const tag of tags) {
    const hashtag = await db.hashtag.upsert({
      where: { tag },
      create: { tag },
      update: {},
    });
    await db.postHashtag.upsert({
      where: { postId_hashtagId: { postId, hashtagId: hashtag.id } },
      create: { postId, hashtagId: hashtag.id },
      update: {},
    });
  }

  if (mentions.length) {
    const users = await db.user.findMany({
      where: { username: { in: mentions } },
      select: { id: true },
    });
    for (const u of users) {
      if (u.id === authorId) continue;
      await db.mention.upsert({
        where: { postId_userId: { postId, userId: u.id } },
        create: { postId, userId: u.id },
        update: {},
      });
      if (notifyMentions) {
        await createNotification({ type: 'MENTION', recipientId: u.id, actorId: authorId, postId });
      }
    }
  }
}

export async function createPost({
  authorId,
  content,
  media,
  parentId,
  quotedPostId,
  communityId,
  poll,
}: CreatePostArgs) {
  const trimmed = content?.trim() || undefined;
  if (!trimmed && (!media || media.length === 0)) {
    throw ApiError.badRequest('A post must contain text or media');
  }
  // Polls need a question and can't be combined with media attachments.
  const validPoll = poll ? validatePoll(poll) : undefined;
  if (validPoll && !trimmed) throw ApiError.badRequest('A poll needs a question in the post text');
  if (validPoll && media && media.length > 0) {
    throw ApiError.badRequest('A post cannot have both a poll and media');
  }

  // Validate referenced posts exist.
  if (parentId) {
    const parent = await db.post.findUnique({ where: { id: parentId } });
    if (!parent) throw ApiError.notFound('Parent post not found');
  }
  if (quotedPostId) {
    const quoted = await db.post.findUnique({ where: { id: quotedPostId } });
    if (!quoted) throw ApiError.notFound('Quoted post not found');
  }
  // Posting into a community requires membership (top-level posts only).
  if (communityId) {
    if (parentId) throw ApiError.badRequest('Replies cannot target a community');
    await assertCanPostTo(communityId, authorId);
  }

  const post = await db.post.create({
    data: {
      authorId,
      content: trimmed,
      parentId,
      quotedPostId,
      communityId,
      media: media?.length
        ? { create: media.map((m) => ({ url: m.url, type: m.type, width: m.width, height: m.height })) }
        : undefined,
      poll: validPoll
        ? {
            create: {
              endsAt: new Date(Date.now() + validPoll.durationHours * 60 * 60 * 1000),
              options: { create: validPoll.options.map((text, order) => ({ text, order })) },
            },
          }
        : undefined,
    },
    include: postInclude(authorId),
  });

  if (trimmed) await syncHashtagsAndMentions(post.id, trimmed, authorId);

  // Notify on reply / quote.
  if (parentId) {
    const parent = await db.post.findUnique({ where: { id: parentId }, select: { authorId: true } });
    if (parent) {
      await createNotification({ type: 'REPLY', recipientId: parent.authorId, actorId: authorId, postId: post.id });
    }
  }
  if (quotedPostId) {
    const quoted = await db.post.findUnique({ where: { id: quotedPostId }, select: { authorId: true } });
    if (quoted) {
      await createNotification({ type: 'QUOTE', recipientId: quoted.authorId, actorId: authorId, postId: post.id });
    }
  }

  // Re-fetch with viewer flags now that links exist.
  const full = await db.post.findUnique({ where: { id: post.id }, include: postInclude(authorId) });
  return serializePost(full!);
}

const pollWithCounts = (viewerId?: string) => ({
  options: {
    orderBy: { order: 'asc' as const },
    include: { _count: { select: { votes: true } } },
  },
  ...(viewerId ? { votes: { where: { userId: viewerId }, select: { optionId: true } } } : {}),
});

// Cast (or change) a vote in a post's poll. Votes can be switched until the
// poll closes. Everyone watching the post gets a live 'poll:update'.
export async function votePoll(postId: string, userId: string, optionId: string) {
  const poll = await db.poll.findUnique({
    where: { postId },
    include: { options: { select: { id: true } } },
  });
  if (!poll) throw ApiError.notFound('This post has no poll');
  if (poll.endsAt <= new Date()) throw ApiError.badRequest('This poll has ended');
  if (!poll.options.some((o) => o.id === optionId)) throw ApiError.badRequest('Unknown poll option');

  await db.pollVote.upsert({
    where: { pollId_userId: { pollId: poll.id, userId } },
    create: { pollId: poll.id, optionId, userId },
    update: { optionId },
  });

  const fresh = await db.poll.findUnique({
    where: { id: poll.id },
    include: pollWithCounts(userId),
  });
  const serialized = serializePoll(fresh);
  // Broadcast without the voter's personal choice; clients keep their own.
  emitToPost(postId, 'poll:update', { postId, poll: { ...serialized, viewerVote: null } });
  return serialized;
}

export async function getPostById(id: string, viewerId?: string) {
  const post = await db.post.findUnique({ where: { id }, include: postInclude(viewerId) });
  if (!post) throw ApiError.notFound('Post not found');
  return serializePost(post);
}

export async function getThread(id: string, viewerId?: string) {
  // Count a view (best-effort; ignored for the post's own author).
  if (viewerId) {
    try {
      recordViews(viewerId, [id]);
    } catch {
      /* best-effort */
    }
  }

  const post = await db.post.findUnique({ where: { id }, include: postInclude(viewerId) });
  if (!post) throw ApiError.notFound('Post not found');

  // Ancestor chain (the parents above this post), oldest first. One recursive
  // query for the ids and one batched fetch, instead of a query per level.
  const ancestorIds = getAncestorIds(sqlite, id);
  const found: any[] = ancestorIds.length
    ? await db.post.findMany({ where: { id: { in: ancestorIds } }, include: postInclude(viewerId) })
    : [];
  const foundById = new Map<string, any>(found.map((a) => [a.id, a]));
  const ancestors = ancestorIds.map((aid) => foundById.get(aid)).filter(Boolean).map(serializePost);

  // `rootId` is the top of the conversation: where "back" falls back to when the
  // page was opened directly (shared link, refresh, notification).
  return { post: serializePost(post), ancestors, rootId: ancestors[0]?.id ?? post.id };
}

// Direct replies to a post. `sort=top` (default) ranks by engagement (likes,
// replies) instead of upload time; the cursor is then an offset. `sort=new`
// lists newest first with an id cursor.
export async function getReplies(
  postId: string,
  viewerId?: string,
  cursor?: string,
  limit = 20,
  sort: 'top' | 'new' = 'top',
) {
  if (sort === 'new') {
    const items = await db.post.findMany({
      where: { parentId: postId },
      include: postInclude(viewerId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const threads = getThreadCounts(sqlite, page.map((c: any) => c.id));
    return {
      items: page.map((c: any) => ({ ...serializePost(c), threadCount: threads.get(c.id) ?? 0 })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  const all = await db.post.findMany({
    where: { parentId: postId },
    include: postInclude(viewerId),
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  const ranked = all
    .map((c: any) => ({ c, s: commentScore(c, viewerId) }))
    .sort((a: any, b: any) => b.s - a.s || new Date(a.c.createdAt).getTime() - new Date(b.c.createdAt).getTime())
    .map((x: any) => x.c);

  const offset = Math.max(0, Number.parseInt(cursor ?? '0', 10) || 0);
  const slice = ranked.slice(offset, offset + limit);
  const nextCursor = offset + limit < ranked.length ? String(offset + limit) : null;
  const threads = getThreadCounts(sqlite, slice.map((c: any) => c.id));
  return {
    items: slice.map((c: any) => ({ ...serializePost(c), threadCount: threads.get(c.id) ?? 0 })),
    nextCursor,
    total: ranked.length,
  };
}

// Quote-posts of a post, newest first.
export async function getQuotes(postId: string, viewerId?: string, cursor?: string, limit = 20) {
  const items = await db.post.findMany({
    where: { quotedPostId: postId },
    include: postInclude(viewerId),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page.map(serializePost), nextCursor: hasMore ? page[page.length - 1].id : null };
}

// Flat reply list for one top-level comment (Black's comment sheet): every
// descendant, oldest first, keyset-paginated. Real parent links are untouched;
// each item reports `parentId`, `rootCommentId` and `replyTo` so the client can
// label "Replying to @x" without guessing from position. See replyThread.ts.
export async function getReplyThread(rootId: string, viewerId?: string, cursor?: string, limit = 10) {
  const parsed = parseThreadCursor(cursor);
  if (cursor && !parsed) throw ApiError.badRequest('Invalid cursor');
  const page = await getFlatReplyThread({ sqlite, db, postInclude, serializePost }, rootId, viewerId, parsed, limit);
  if (!page) throw ApiError.notFound('Comment not found');
  return page;
}

export async function deletePost(id: string, userId: string) {
  const post = await db.post.findUnique({ where: { id }, select: { authorId: true } });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.authorId !== userId) throw ApiError.forbidden('You can only delete your own posts');
  await db.post.delete({ where: { id } });
}

// Edits the text of an existing post (text only; media stays unchanged).
export async function updatePost(id: string, userId: string, content: string) {
  const post = await db.post.findUnique({
    where: { id },
    select: { authorId: true, repostOfId: true, media: { select: { id: true } } },
  });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.authorId !== userId) throw ApiError.forbidden('You can only edit your own posts');
  if (post.repostOfId) throw ApiError.badRequest('Reposts cannot be edited');

  const trimmed = content?.trim();
  if (!trimmed && post.media.length === 0) throw ApiError.badRequest('Post cannot be empty');

  // Rebuild hashtag / mention links from the new text (without re-notifying).
  await db.postHashtag.deleteMany({ where: { postId: id } });
  await db.mention.deleteMany({ where: { postId: id } });
  await db.post.update({
    where: { id },
    data: { content: trimmed || null, editedAt: new Date() },
  });
  if (trimmed) await syncHashtagsAndMentions(id, trimmed, userId, false);

  const full = await db.post.findUnique({ where: { id }, include: postInclude(userId) });
  return serializePost(full!);
}

// ───────────────────────── Likes ─────────────────────────

export async function likePost(postId: string, userId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (!post) throw ApiError.notFound('Post not found');

  await db.like.upsert({
    where: { userId_postId: { userId, postId } },
    create: { userId, postId },
    update: {},
  });
  await createNotification({ type: 'LIKE', recipientId: post.authorId, actorId: userId, postId });
  return getCounts(postId);
}

export async function unlikePost(postId: string, userId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (!post) throw ApiError.notFound('Post not found');
  await db.like.deleteMany({ where: { userId, postId } });
  await removeNotification({ type: 'LIKE', recipientId: post.authorId, actorId: userId, postId });
  return getCounts(postId);
}

// ──────────────────────── Reposts ────────────────────────

export async function repost(postId: string, userId: string) {
  const original = await db.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (!original) throw ApiError.notFound('Post not found');

  const existing = await db.post.findFirst({ where: { repostOfId: postId, authorId: userId } });
  if (!existing) {
    await db.post.create({ data: { authorId: userId, repostOfId: postId } });
    await createNotification({ type: 'REPOST', recipientId: original.authorId, actorId: userId, postId });
  }
  return getCounts(postId);
}

export async function unrepost(postId: string, userId: string) {
  const original = await db.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (!original) throw ApiError.notFound('Post not found');
  await db.post.deleteMany({ where: { repostOfId: postId, authorId: userId } });
  await removeNotification({ type: 'REPOST', recipientId: original.authorId, actorId: userId, postId });
  return getCounts(postId);
}

// ─────────────────────── Bookmarks ───────────────────────

export async function bookmarkPost(postId: string, userId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) throw ApiError.notFound('Post not found');
  await db.bookmark.upsert({
    where: { userId_postId: { userId, postId } },
    create: { userId, postId },
    update: {},
  });
}

export async function unbookmarkPost(postId: string, userId: string) {
  await db.bookmark.deleteMany({ where: { userId, postId } });
}

export async function listBookmarks(userId: string, cursor?: string, limit = 20) {
  const items = await db.bookmark.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { userId_postId: { userId, postId: cursor } }, skip: 1 } : {}),
    include: { post: { include: postInclude(userId) } },
  });
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return {
    items: page.map((b) => serializePost(b.post)),
    nextCursor: hasMore ? page[page.length - 1].postId : null,
  };
}

// Returns the up-to-date engagement counts for a post (used by toggle endpoints).
export async function getCounts(postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { viewCount: true, _count: { select: { likes: true, reposts: true, replies: true, quotes: true } } },
  });
  const result = {
    postId,
    counts: {
      likes: post?._count.likes ?? 0,
      reposts: post?._count.reposts ?? 0,
      replies: post?._count.replies ?? 0,
      quotes: post?._count.quotes ?? 0,
      views: post?.viewCount ?? 0,
    },
  };
  // Broadcast to everyone currently viewing this post.
  emitToPost(postId, 'post:counts', result);
  return result;
}

// Detailed engagement analytics for a post. Author-only: surfaces reach and
// interaction breakdowns plus a simple engagement rate.
export async function getPostAnalytics(postId: string, userId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      authorId: true,
      viewCount: true,
      createdAt: true,
      _count: {
        select: { likes: true, reposts: true, replies: true, quotes: true, bookmarks: true },
      },
    },
  });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.authorId !== userId) throw ApiError.forbidden('You can only view analytics for your own posts');

  const c = post._count;
  const interactions = c.likes + c.reposts + c.replies + c.quotes + c.bookmarks;
  const views = post.viewCount || 0;
  // Engagement rate = interactions per view (capped, expressed as a percentage).
  const engagementRate = views > 0 ? Math.min(100, (interactions / views) * 100) : 0;

  return {
    postId,
    createdAt: post.createdAt,
    views,
    likes: c.likes,
    reposts: c.reposts,
    replies: c.replies,
    quotes: c.quotes,
    bookmarks: c.bookmarks,
    interactions,
    engagementRate: Math.round(engagementRate * 10) / 10,
  };
}

export async function pinPost(postId: string, userId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { authorId: true } });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.authorId !== userId) throw ApiError.forbidden('You can only pin your own posts');
  await db.user.update({ where: { id: userId }, data: { pinnedPostId: postId } });
}

export async function unpinPost(userId: string) {
  await db.user.update({ where: { id: userId }, data: { pinnedPostId: null } });
}
