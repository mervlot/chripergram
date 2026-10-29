import type { MessageReaction } from '../types';

/** Does `userId` currently have `emoji` on this message? */
export function hasReacted(reactions: MessageReaction[] | undefined, emoji: string, userId: string): boolean {
  return !!reactions?.some((r) => r.emoji === emoji && r.userIds.includes(userId));
}

/**
 * Force `userId`'s reaction to `emoji` to be present/absent. Idempotent, so it
 * can be used both for optimistic updates and for re-applying a still-pending
 * action on top of a server snapshot.
 */
export function setReaction(
  reactions: MessageReaction[] | undefined,
  emoji: string,
  userId: string,
  present: boolean,
): MessageReaction[] {
  const list = reactions ?? [];
  const existing = list.find((r) => r.emoji === emoji);
  if (present) {
    if (!existing) return [...list, { emoji, userIds: [userId] }];
    if (existing.userIds.includes(userId)) return list;
    return list.map((r) => (r === existing ? { ...r, userIds: [...r.userIds, userId] } : r));
  }
  if (!existing || !existing.userIds.includes(userId)) return list;
  const userIds = existing.userIds.filter((id) => id !== userId);
  return userIds.length
    ? list.map((r) => (r === existing ? { ...r, userIds } : r))
    : list.filter((r) => r !== existing);
}

/**
 * Server snapshot + our not-yet-acknowledged toggles. A realtime `dm:update`
 * that was produced before the server processed our request must not make the
 * UI flicker back, so pending intents are re-applied over it.
 * `pending` maps emoji -> desired presence for this user on this message.
 */
export function reconcileReactions(
  server: MessageReaction[] | undefined,
  pending: ReadonlyMap<string, boolean>,
  userId: string,
): MessageReaction[] {
  let next = server ?? [];
  for (const [emoji, present] of pending) next = setReaction(next, emoji, userId, present);
  return next;
}
