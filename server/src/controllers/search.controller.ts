import { Request, Response } from 'express';
import * as searchService from '../services/search.service';
import { recordSearch } from '../services/signals.service';

export async function search(req: Request, res: Response) {
  const { q, type, cursor, limit } = req.query as unknown as {
    q: string;
    type?: 'top' | 'users' | 'posts';
    cursor?: string;
    limit?: number;
  };

  if (req.userId && !cursor) {
    try {
      recordSearch(req.userId, q);
    } catch {
      /* best-effort */
    }
  }

  if (type === 'users') {
    const users = await searchService.searchUsers(q, req.userId, limit);
    return res.json({ users });
  }
  if (type === 'posts') {
    const posts = await searchService.searchPosts(q, req.userId, cursor, limit);
    return res.json({ posts });
  }
  // "top": a mix of users and posts.
  const [users, posts] = await Promise.all([
    searchService.searchUsers(q, req.userId, 5),
    searchService.searchPosts(q, req.userId, cursor, limit),
  ]);
  res.json({ users, posts });
}

export async function hashtag(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  if (req.userId && !cursor) {
    try {
      recordSearch(req.userId, `#${req.params.tag}`);
    } catch {
      /* best-effort */
    }
  }
  const result = await searchService.getHashtagPosts(req.params.tag, req.userId, cursor, limit);
  res.json(result);
}

export async function trends(_req: Request, res: Response) {
  const trends = await searchService.getTrends();
  res.json({ trends });
}
