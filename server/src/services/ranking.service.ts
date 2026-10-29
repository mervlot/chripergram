import { db } from '../config/db';
import { getSearchTerms } from './signals.service';
import { getTrends } from './search.service';

// Shared feed-ranking helpers used by Home ("For you"), Black and comment sorting.
//
// score = (weighted engagement) * (time decay) * (affinity boost)
//   - engagement : likes, reposts, replies, quotes (+ a small signal from views)
//   - decay      : Hacker-News-style gravity so fresh posts surface, old ones fade
//   - affinity   : people you follow / have liked / reposted / replied to, and
//                  hashtags you tend to like, get boosted
// A final diversity pass stops one author from filling the whole feed.

export interface Affinity {
  following: Set<string>;
  authorWeight: Map<string, number>; // authors the viewer interacts with
  tagWeight: Map<string, number>; // hashtags in posts the viewer liked / bookmarked
  terms: Map<string, number>; // words from the viewer's recent searches (0..1)
}

const EMPTY: Affinity = { following: new Set(), authorWeight: new Map(), tagWeight: new Map(), terms: new Map() };

// Trending hashtags change slowly; cache them so ranking never waits on them.
let trendCache: { at: number; tags: Set<string> } | null = null;
export async function getTrendingTags(): Promise<Set<string>> {
  if (trendCache && Date.now() - trendCache.at < 60_000) return trendCache.tags;
  try {
    const trends = await getTrends(15);
    trendCache = { at: Date.now(), tags: new Set(trends.map((t) => t.tag.toLowerCase())) };
  } catch {
    trendCache = { at: Date.now(), tags: new Set() };
  }
  return trendCache.tags;
}

export async function loadAffinity(viewerId?: string): Promise<Affinity> {
  if (!viewerId) return EMPTY;
  const [follows, likes, reposts, replies, bookmarks] = await Promise.all([
    db.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
    db.like.findMany({
      where: { userId: viewerId },
      orderBy: { createdAt: 'desc' },
      take: 150,
      include: { post: { include: { hashtags: { include: { hashtag: true } } } } },
    }),
    db.post.findMany({
      where: { authorId: viewerId, repostOfId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { repostOf: true },
    }),
    db.post.findMany({
      where: { authorId: viewerId, parentId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { parentId: true },
    }),
    db.bookmark.findMany({
      where: { userId: viewerId },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { post: { include: { hashtags: { include: { hashtag: true } } } } },
    }),
  ]);
  const parentIds = (replies as any[]).map((r) => r.parentId).filter(Boolean);
  const parents: any[] = parentIds.length
    ? await db.post.findMany({ where: { id: { in: parentIds } }, select: { authorId: true } })
    : [];

  const authorWeight = new Map<string, number>();
  const tagWeight = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string | undefined, by: number) => {
    if (k) m.set(k, (m.get(k) ?? 0) + by);
  };

  for (const l of likes as any[]) {
    bump(authorWeight, l.post?.authorId, 1);
    for (const h of l.post?.hashtags ?? []) bump(tagWeight, h.hashtag?.tag, 1);
  }
  // Bookmarks are a strong "I want more of this" signal.
  for (const b of bookmarks as any[]) {
    bump(authorWeight, b.post?.authorId, 2);
    for (const h of b.post?.hashtags ?? []) bump(tagWeight, h.hashtag?.tag, 2);
  }
  for (const r of reposts as any[]) bump(authorWeight, r.repostOf?.authorId, 2);
  for (const r of parents) bump(authorWeight, r.authorId, 2);

  let terms = new Map<string, number>();
  try {
    terms = getSearchTerms(viewerId);
  } catch {
    /* signals are optional */
  }
  return { following: new Set(follows.map((f: any) => f.followingId)), authorWeight, tagWeight, terms };
}

export function engagementOf(p: any): number {
  const src = p.repostOf ?? p;
  const c = src._count ?? {};
  const views = src.viewCount ?? 0;
  return (
    (c.likes ?? 0) * 1 +
    (c.reposts ?? 0) * 2 +
    (c.replies ?? 0) * 1.5 +
    (c.quotes ?? 0) * 1.5 +
    Math.log10(views + 1) * 0.5
  );
}

interface ScoreOpts {
  gravity?: number; // higher = faster decay
  followBoost?: number;
  freshBoost?: number; // exploration bonus for brand-new posts with no data yet
}

export function scorePost(p: any, aff: Affinity, viewerId: string | undefined, opts: ScoreOpts = {}): number {
  const { gravity = 1.5, followBoost = 1.6, freshBoost = 2 } = opts;
  const ageHours = Math.max(0, (Date.now() - new Date(p.createdAt).getTime()) / 3_600_000);
  const src = p.repostOf ?? p;

  let engagement = engagementOf(p);
  // New posts get a small head-start so they can collect signals.
  if (ageHours < 3) engagement += freshBoost * (1 - ageHours / 3);

  let affinity = 1;
  if (aff.following.has(p.authorId) || aff.following.has(src.authorId)) affinity *= followBoost;
  const w = aff.authorWeight.get(src.authorId) ?? 0;
  if (w > 0) affinity *= 1 + Math.min(0.8, Math.log2(1 + w) * 0.25);
  let tagHit = 0;
  for (const h of src.hashtags ?? []) tagHit += aff.tagWeight.get(h.hashtag?.tag) ?? 0;
  if (tagHit > 0) affinity *= 1 + Math.min(0.5, Math.log2(1 + tagHit) * 0.15);
  if (viewerId && p.authorId === viewerId) affinity *= 0.7; // don't flood with your own posts

  return ((engagement + 1) / Math.pow(ageHours + 2, gravity)) * affinity;
}

// Greedy re-rank: each time an author was already picked recently, damp their next post.
export function diversify<T extends { post: any; score: number }>(scored: T[], window = 4, damp = 0.55): T[] {
  const pool = [...scored].sort((a, b) => b.score - a.score);
  const out: T[] = [];
  while (pool.length) {
    const recent = out.slice(-window).map((x) => x.post.authorId);
    let bestIdx = 0;
    let best = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 40); i++) {
      const repeats = recent.filter((a) => a === pool[i].post.authorId).length;
      const s = pool[i].score * Math.pow(damp, repeats);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    }
    out.push(pool.splice(bestIdx, 1)[0]);
  }
  return out;
}

// Comment score: likes and replies matter, not upload time. Comments the viewer
// wrote in the last couple of minutes are pinned first (like TikTok).
export function commentScore(c: any, viewerId?: string): number {
  const counts = c._count ?? {};
  let s = (counts.likes ?? 0) * 1 + (counts.replies ?? 0) * 2 + (counts.reposts ?? 0) * 1 + (counts.quotes ?? 0) * 1;
  if (viewerId && c.authorId === viewerId && Date.now() - new Date(c.createdAt).getTime() < 2 * 60_000) s += 1e6;
  return s;
}

// ─────────────────────────── "For you" ranking ───────────────────────────
//
// Posts are placed in tiers first, then ordered by score inside a tier:
//   tier 3  unseen AND in your interests (people you follow, tags/authors you engage with,
//           words you searched) or a trending topic that matches your interests
//   tier 2  unseen, a trending topic (not personal)
//   tier 1  unseen, everything else (pushed down)
//   tier 0  already seen (always last; seen more often = lower)
// Score inside a tier = engagement (likes, reposts, replies, quotes, views) x gentle time
// decay x affinity. Recency alone never wins: a fresh post you have no interest in sits
// below an older one you are interested in.

export interface RankedEntry {
  post: any;
  score: number;
  tier: number;
}

const TIER_WEIGHT = [1, 1e3, 1e6, 1e9];

export function rankForYou(
  candidates: any[],
  aff: Affinity,
  seen: Map<string, number>,
  trending: Set<string>,
  viewerId: string,
): RankedEntry[] {
  const out: RankedEntry[] = [];
  for (const p of candidates) {
    const src = p.repostOf ?? p;
    const tags: string[] = (src.hashtags ?? []).map((h: any) => String(h.hashtag?.tag ?? '').toLowerCase()).filter(Boolean);
    const text = String(src.content ?? '').toLowerCase();

    // --- interest ---
    const isFollowed = aff.following.has(p.authorId) || aff.following.has(src.authorId);
    let termHit = 0;
    for (const [term, weight] of aff.terms) {
      if (text.includes(term) || tags.includes(term)) termHit += weight;
    }
    let tagHit = 0;
    for (const tag of tags) tagHit += aff.tagWeight.get(tag) ?? 0;
    const authorHit = aff.authorWeight.get(src.authorId) ?? 0;
    const interested = isFollowed || termHit > 0 || tagHit > 0 || authorHit > 0;
    const isTrending = tags.some((t) => trending.has(t));

    // --- score ---
    let score = scorePost(p, aff, viewerId, { gravity: 1.15, followBoost: 1.5 });
    if (termHit > 0) score *= 1 + Math.min(0.9, termHit * 0.35);
    if (isTrending) score *= interested ? 1.5 : 1.25;

    // --- tier ---
    const seenCount = seen.get(src.id) ?? seen.get(p.id) ?? 0;
    let tier: number;
    if (seenCount > 0 || p.authorId === viewerId) {
      // Already seen, or your own post (you know about it): bottom tier.
      tier = 0;
      score /= 1 + seenCount; // seen repeatedly sinks further
    } else if (interested) {
      tier = 3;
    } else if (isTrending) {
      tier = 2;
    } else {
      tier = 1;
    }
    out.push({ post: p, score: score * TIER_WEIGHT[tier], tier });
  }
  return out;
}
