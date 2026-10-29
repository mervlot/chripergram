import { Request, Response } from 'express';
import * as storyService from '../services/story.service';
import { storeUploadedFile } from '../middleware/upload';
import { ApiError } from '../utils/apiError';

export async function create(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw ApiError.badRequest('A photo or video is required');
  const mediaUrl = await storeUploadedFile(file);
  const mediaType = file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE';
  const story = await storyService.createStory(req.userId!, mediaUrl, mediaType, req.body.caption);
  res.status(201).json({ story });
}

export async function feed(req: Request, res: Response) {
  const groups = await storyService.getStoriesFeed(req.userId!);
  res.json({ groups });
}

export async function view(req: Request, res: Response) {
  await storyService.markStoryViewed(req.params.id, req.userId!);
  res.status(204).end();
}

export async function viewers(req: Request, res: Response) {
  const viewersList = await storyService.getStoryViewers(req.params.id, req.userId!);
  res.json({ viewers: viewersList });
}

export async function remove(req: Request, res: Response) {
  await storyService.deleteStory(req.params.id, req.userId!);
  res.status(204).end();
}
