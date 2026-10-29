import { Request, Response } from 'express';
import * as notificationService from '../services/notification.service';

export async function list(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  const result = await notificationService.listNotifications(req.userId!, cursor, limit);
  res.json(result);
}

export async function unreadCount(req: Request, res: Response) {
  const unread = await notificationService.unreadCount(req.userId!);
  res.json({ unread });
}

export async function markRead(req: Request, res: Response) {
  await notificationService.markAllRead(req.userId!);
  res.status(204).end();
}
