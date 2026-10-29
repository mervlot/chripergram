import { Request, Response } from 'express';
import * as postService from '../services/post.service';
import { MediaType } from '../types/enums';
import { storeUploadedFile } from '../middleware/upload';
import type { MediaInput } from '../services/post.service';
import { recordViews as saveViews } from '../services/signals.service';

function mediaTypeFromMime(mime: string): MediaType {
  if (mime === 'image/gif') return 'GIF';
  if (mime.startsWith('video/')) return 'VIDEO';
  return 'IMAGE';
}

async function filesToMedia(req: Request): Promise<MediaInput[]> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  return Promise.all(
    files.map(async (file) => ({
      url: await storeUploadedFile(file),
      type: mediaTypeFromMime(file.mimetype),
    })),
  );
}

// Poll data arrives as a JSON string field inside the multipart form.
function parsePollField(raw: unknown): postService.PollInput | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return { options: parsed.options ?? [], durationHours: parsed.durationHours ?? 0 };
  } catch {
    return undefined;
  }
}

export async function create(req: Request, res: Response) {
  const media = await filesToMedia(req);
  const post = await postService.createPost({
    authorId: req.userId!,
    content: req.body.content,
    parentId: req.body.parentId || undefined,
    quotedPostId: req.body.quotedPostId || undefined,
    communityId: req.body.communityId || undefined,
    media,
    poll: parsePollField(req.body.poll),
  });
  res.status(201).json({ post });
}

export async function votePoll(req: Request, res: Response) {
  const poll = await postService.votePoll(req.params.id, req.userId!, req.body.optionId);
  res.json({ poll });
}

export async function getOne(req: Request, res: Response) {
  const post = await postService.getPostById(req.params.id, req.userId);
  res.json({ post });
}

export async function getThread(req: Request, res: Response) {
  const result = await postService.getThread(req.params.id, req.userId);
  res.json(result);
}

export async function analytics(req: Request, res: Response) {
  const result = await postService.getPostAnalytics(req.params.id, req.userId!);
  res.json({ analytics: result });
}

export async function getReplies(req: Request, res: Response) {
  const { cursor, limit, sort } = req.query as { cursor?: string; limit?: number; sort?: 'top' | 'new' };
  const result = await postService.getReplies(req.params.id, req.userId, cursor, limit, sort ?? 'top');
  res.json(result);
}

export async function getQuotes(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  res.json(await postService.getQuotes(req.params.id, req.userId, cursor, limit));
}

export async function getReplyThread(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  res.json(await postService.getReplyThread(req.params.id, req.userId, cursor, limit));
}

export async function remove(req: Request, res: Response) {
  await postService.deletePost(req.params.id, req.userId!);
  res.status(204).end();
}

export async function update(req: Request, res: Response) {
  const post = await postService.updatePost(req.params.id, req.userId!, req.body.content ?? '');
  res.json({ post });
}

export async function like(req: Request, res: Response) {
  const result = await postService.likePost(req.params.id, req.userId!);
  res.json(result);
}

export async function unlike(req: Request, res: Response) {
  const result = await postService.unlikePost(req.params.id, req.userId!);
  res.json(result);
}

export async function repost(req: Request, res: Response) {
  const result = await postService.repost(req.params.id, req.userId!);
  res.json(result);
}

export async function unrepost(req: Request, res: Response) {
  const result = await postService.unrepost(req.params.id, req.userId!);
  res.json(result);
}

export async function bookmark(req: Request, res: Response) {
  await postService.bookmarkPost(req.params.id, req.userId!);
  res.status(204).end();
}

export async function unbookmark(req: Request, res: Response) {
  await postService.unbookmarkPost(req.params.id, req.userId!);
  res.status(204).end();
}

export async function listBookmarks(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  const result = await postService.listBookmarks(req.userId!, cursor, limit);
  res.json(result);
}

export async function pin(req: Request, res: Response) {
  await postService.pinPost(req.params.id, req.userId!);
  res.status(204).end();
}

export async function unpin(req: Request, res: Response) {
  await postService.unpinPost(req.userId!);
  res.status(204).end();
}

// Batch of posts the viewer actually scrolled into view (see client lib/views.ts).
export async function recordViews(req: Request, res: Response) {
  const counts = saveViews(req.userId!, req.body.ids as string[]);
  res.json({ counts });
}
