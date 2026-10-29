import { db } from '../config/db';
import { ApiError } from '../utils/apiError';
import { postInclude, serializePost } from './serializers';
import { getHiddenUserIds } from './user.service';
import { diversify, getTrendingTags, loadAffinity, rankForYou, scorePost } from './ranking.service';
import { getSeenMap } from './signals.service';
import { randomUUID } from 'node:crypto';

const PAGE = 20;

function paginate<T extends { id: string }>(items: T[], limit: number) {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { page, nextCursor: hasMore ? page[page.length - 1].id : null };
}

// "Following" timeline: top-level posts and reposts from ONLY the people the viewer
// follows, newest first. (Not the viewer's own posts, not suggestions.) Replies are
// excluded (seen in threads). Cursor pagination, so each page is one small query.
export async function getHomeFeed(viewerId: string, cursor?: string, limit = PAGE) {
  const [following, hidden] = await Promise.all([
    db.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
    getHiddenUserIds(viewerId),
  ]);
  const authorIds = following.map((f) => f.followingId).filter((id) => id !== viewerId && !hidden.includes(id));
  if (authorIds.length === 0) return { items: [], nextCursor: null };

  const where: any = {
    authorId: { in: authorIds },
    parentId: null, // exclude replies from the home timeline
    communityId: null, // community posts live in their own feed
  };

  const items = await db.post.findMany({
    where,
    include: postInclude(viewerId),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const { page, nextCursor } = paginate(items, limit);
  return { items: page.map(serializePost), nextCursor };
}

// "For you" / Explore: a lightweight ranking over recent public posts.
// Score blends engagement with recency so fresh, popular posts surface first.
// Uses offset pagination because ordering is computed in memory.
export async function getExploreFeed(viewerId: string | undefined, page = 0, limit = PAGE) {
  const hidden = viewerId ? await getHiddenUserIds(viewerId) : [];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Pull a candidate window of recent original posts, then rank in memory.
  const candidates = await db.post.findMany({
    where: {
      createdAt: { gte: since },
      parentId: null,
      communityId: null,
      ...(hidden.length ? { authorId: { notIn: hidden } } : {}),
    },
    include: postInclude(viewerId),
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const now = Date.now();
  const scored = candidates
    .filter((p: any) => !(p.repostOf && (hidden.includes(p.repostOf.authorId) || p.repostOf.communityId)))
    .map((p: any) => {
      const ageHours = (now - new Date(p.createdAt).getTime()) / 3_600_000;
      // Reposts are ranked on the original post's engagement.
      const source = p.repostOf ?? p;
      // The SQLite compatibility adapter may not materialize Prisma's `_count`
      // include. Treat missing relation counts as zero so Explore still loads.
      const counts = source._count ?? {};
      const engagement =
        (counts.likes ?? 0) * 1 +
        (counts.reposts ?? 0) * 2 +
        (counts.replies ?? 0) * 1.5 +
        (counts.quotes ?? 0) * 1.5;
      // Time decay similar to Hacker News' gravity formula.
      const score = (engagement + 1) / Math.pow(ageHours + 2, 1.5);
      return { post: p, score };
    })
    .sort((a, b) => b.score - a.score)
    // Show each original only once (an original and its reposts collapse into the best-ranked entry).
    .filter((entry, _i, all) => {
      const key = entry.post.repostOfId ?? entry.post.id;
      return all.findIndex((o) => (o.post.repostOfId ?? o.post.id) === key) === all.indexOf(entry);
    });

  const start = page * limit;
  const slice = scored.slice(start, start + limit + 1);
  const hasMore = slice.length > limit;
  const items = (hasMore ? slice.slice(0, limit) : slice).map((s) => serializePost(s.post));
  return { items, nextPage: hasMore ? page + 1 : null };
}

// Ranked "For you" sessions. Page 0 ranks a candidate window once and remembers the ordered
// ids under a token; later pages just slice that list and load ~20 posts. That keeps paging
// cheap and stable (posts marked "seen" while scrolling can't shuffle later pages).
const sessions = new Map<string, { viewerId: string; ids: string[]; exp: number }>();
const SESSION_TTL = 15 * 60_000;

function sweepSessions() {
  const now = Date.now();
  for (const [key, v] of sessions) if (v.exp < now) sessions.delete(key);
  while (sessions.size > 500) sessions.delete(sessions.keys().next().value as string);
}

// Personalised "For you" timeline. Unseen posts that match your interests (follows, likes,
// bookmarks, reposts, replies, searches, trending topics you care about) come first; the
// rest follow; posts you've already seen go last. See rankForYou() in ranking.service.ts.
export async function getForYouFeed(viewerId: string, page = 0, limit = PAGE, token?: string) {
  const cached = token ? sessions.get(token) : undefined;
  let ids: string[];
  let feedToken = token;

  if (cached && cached.viewerId === viewerId && cached.exp > Date.now() && page > 0) {
    ids = cached.ids;
  } else {
    const [hidden, aff, trending] = await Promise.all([getHiddenUserIds(viewerId), loadAffinity(viewerId), getTrendingTags()]);
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const candidates = await db.post.findMany({
      where: {
        createdAt: { gte: since },
        parentId: null,
        communityId: null,
        ...(hidden.length ? { authorId: { notIn: hidden } } : {}),
      },
      include: postInclude(viewerId),
      orderBy: { createdAt: 'desc' },
      take: 400,
    });

    const usable = candidates.filter((p: any) => !(p.repostOf && (hidden.includes(p.repostOf.authorId) || p.repostOf.communityId)));
    const seen = getSeenMap(viewerId, [...new Set(usable.flatMap((p: any) => [p.id, p.repostOfId].filter(Boolean)))] as string[]);
    const scored = rankForYou(usable, aff, seen, trending, viewerId);

    // Collapse an original and its reposts into the best entry.
    const best = new Map<string, (typeof scored)[number]>();
    for (const e of scored) {
      const key = e.post.repostOfId ?? e.post.id;
      const cur = best.get(key);
      if (!cur || e.score > cur.score) best.set(key, e);
    }
    // Spread authors out inside the ranking without breaking the tiers.
    ids = diversify([...best.values()]).map((e) => e.post.id);

    sweepSessions();
    feedToken = randomUUID();
    sessions.set(feedToken, { viewerId, ids, exp: Date.now() + SESSION_TTL });
  }

  const start = page * limit;
  const pageIds = ids.slice(start, start + limit);
  const hasMore = ids.length > start + limit;
  const rows = pageIds.length
    ? await db.post.findMany({ where: { id: { in: pageIds } }, include: postInclude(viewerId) })
    : [];
  const byId = new Map(rows.map((r: any) => [r.id, r]));
  const items = pageIds.map((id) => byId.get(id)).filter(Boolean).map((p: any) => serializePost(p));
  return { items, nextPage: hasMore ? page + 1 : null, feedToken };
}

// "Black": photo and video posts only, ranked like a short-video feed: engagement
// (with a slow decay and a freshness boost for new uploads), affinity for creators
// and tags you engage with, and author diversity. Offset pagination.
export async function getBlackFeed(viewerId: string | undefined, page = 0, limit = PAGE) {
  const [hidden, aff] = await Promise.all([viewerId ? getHiddenUserIds(viewerId) : [], loadAffinity(viewerId)]);
  const candidates = await db.post.findMany({
    where: {
      media: { some: {} },
      repostOfId: null,
      communityId: null,
      ...(hidden.length ? { authorId: { notIn: hidden } } : {}),
    },
    include: postInclude(viewerId),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 400,
  });

  const scored = candidates.map((p: any) => ({
    post: p,
    // Slower gravity than text posts: good videos stay in rotation for days.
    score: scorePost(p, aff, viewerId, { gravity: 1.1, freshBoost: 3 }),
  }));
  const ranked = diversify(scored, 3, 0.5);

  const start = page * limit;
  const slice = ranked.slice(start, start + limit + 1);
  const hasMore = slice.length > limit;
  const items = (hasMore ? slice.slice(0, limit) : slice).map((e) => serializePost(e.post));
  return { items, nextPage: hasMore ? page + 1 : null };
}

export type ProfileTab = 'posts' | 'replies' | 'media' | 'likes';

// Posts shown on a user's profile, depending on the active tab.
export async function getUserPosts(
  username: string,
  tab: ProfileTab,
  viewerId?: string,
  cursor?: string,
  limit = PAGE,
) {
  const user = await db.user.findUnique({
    where: { username },
    select: { id: true, pinnedPostId: true },
  });
  if (!user) throw ApiError.notFound('User not found');

  if (tab === 'likes') {
    const rows = await db.like.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { userId_postId: { userId: user.id, postId: cursor } }, skip: 1 } : {}),
      include: { post: { include: postInclude(viewerId) } },
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: pageRows.map((r) => serializePost(r.post)),
      nextCursor: hasMore ? pageRows[pageRows.length - 1].postId : null,
    };
  }

  let where: any = { authorId: user.id };
  if (tab === 'posts') where = { authorId: user.id, parentId: null };
  if (tab === 'replies') where = { authorId: user.id, parentId: { not: null } };
  if (tab === 'media') where = { authorId: user.id, repostOfId: null, media: { some: {} } };

  const items = await db.post.findMany({
    where,
    include: postInclude(viewerId),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const { page, nextCursor } = paginate(items, limit);
  let result = page.map(serializePost);

  // Surface the pinned post at the top of the first page of the "posts" tab.
  if (tab === 'posts' && !cursor && user.pinnedPostId) {
    const pinned = await db.post.findUnique({
      where: { id: user.pinnedPostId },
      include: postInclude(viewerId),
    });
    if (pinned) {
      result = [{ ...serializePost(pinned), pinned: true }, ...result.filter((p) => p.id !== pinned.id)];
    }
  }

  return { items: result, nextCursor };
}
