import { Request, Response } from 'express';
import * as community from '../services/community.service';

export async function create(req: Request, res: Response) {
  const result = await community.createCommunity(req.userId!, req.body);
  res.status(201).json({ community: result });
}

export async function list(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  const result = await community.listCommunities(req.userId, cursor, limit);
  res.json(result);
}

export async function mine(req: Request, res: Response) {
  const items = await community.listMyCommunities(req.userId!);
  res.json({ items });
}

export async function getOne(req: Request, res: Response) {
  const result = await community.getCommunity(req.params.slug, req.userId);
  res.json({ community: result });
}

export async function join(req: Request, res: Response) {
  const result = await community.joinCommunity(req.userId!, req.params.slug);
  res.json({ community: result });
}

export async function leave(req: Request, res: Response) {
  const result = await community.leaveCommunity(req.userId!, req.params.slug);
  res.json({ community: result });
}

export async function feed(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  const result = await community.getCommunityFeed(req.params.slug, req.userId, cursor, limit);
  res.json(result);
}

export async function members(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  const result = await community.listMembers(req.params.slug, cursor, limit);
  res.json(result);
}

export async function messages(req: Request, res: Response) {
  const { cursor, limit } = req.query as { cursor?: string; limit?: number };
  const result = await community.getCommunityMessages(req.params.slug, req.userId!, cursor, limit);
  res.json(result);
}

export async function sendMessage(req: Request, res: Response) {
  const message = await community.sendCommunityMessage(req.params.slug, req.userId!, req.body.content ?? '');
  res.status(201).json({ message });
}
