import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { storeUploadedFile } from '../middleware/upload';

export async function getProfile(req: Request, res: Response) {
  const profile = await userService.getProfile(req.params.username, req.userId);
  res.json({ profile });
}

export async function suggestions(req: Request, res: Response) {
  const users = await userService.getSuggestions(req.userId!, 5);
  res.json({ users });
}

export async function updateProfile(req: Request, res: Response) {
  // Avatar / banner may arrive as uploaded files alongside text fields.
  const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
  const data: Record<string, unknown> = { ...req.body };
  const [avatarUrl, bannerUrl] = await Promise.all([
    files?.avatar?.[0] ? storeUploadedFile(files.avatar[0]) : undefined,
    files?.banner?.[0] ? storeUploadedFile(files.banner[0]) : undefined,
  ]);
  if (avatarUrl) data.avatarUrl = avatarUrl;
  if (bannerUrl) data.bannerUrl = bannerUrl;

  const user = await userService.updateProfile(req.userId!, data);
  res.json({ user });
}

export async function follow(req: Request, res: Response) {
  const counts = await userService.followUser(req.userId!, req.params.username);
  res.json({ counts });
}

export async function unfollow(req: Request, res: Response) {
  const counts = await userService.unfollowUser(req.userId!, req.params.username);
  res.json({ counts });
}

export async function followers(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  const result = await userService.listFollowers(req.params.username, req.userId, cursor, limit);
  res.json(result);
}

export async function following(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  const result = await userService.listFollowing(req.params.username, req.userId, cursor, limit);
  res.json(result);
}

export async function block(req: Request, res: Response) {
  await userService.blockUser(req.userId!, req.params.username);
  res.status(204).end();
}

export async function unblock(req: Request, res: Response) {
  await userService.unblockUser(req.userId!, req.params.username);
  res.status(204).end();
}

export async function mute(req: Request, res: Response) {
  await userService.muteUser(req.userId!, req.params.username);
  res.status(204).end();
}

export async function unmute(req: Request, res: Response) {
  await userService.unmuteUser(req.userId!, req.params.username);
  res.status(204).end();
}
