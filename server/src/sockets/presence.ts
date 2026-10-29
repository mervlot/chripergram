// In-memory presence tracking. Each user may have multiple open tabs/sockets,
// so we ref-count connections and only flip online/offline on the edges.
const counts = new Map<string, number>();
const activities = new Map<string, { game: string; socketId: string }>();

export function isOnline(userId: string): boolean {
  return (counts.get(userId) ?? 0) > 0;
}

export function onlineUserIds(): string[] {
  return [...counts.entries()].filter(([, n]) => n > 0).map(([id]) => id);
}

export function activityForUsers(userIds: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  userIds.forEach((userId) => {
    const activity = activities.get(userId);
    if (activity) result[userId] = activity.game;
  });
  return result;
}

export function setActivity(userId: string, game: string, socketId: string) {
  activities.set(userId, { game, socketId });
}

export function clearActivity(userId: string, socketId: string): boolean {
  const activity = activities.get(userId);
  if (!activity || activity.socketId !== socketId) return false;
  activities.delete(userId);
  return true;
}

// Returns true if the user just transitioned offline → online.
export function addConnection(userId: string): boolean {
  const n = (counts.get(userId) ?? 0) + 1;
  counts.set(userId, n);
  return n === 1;
}

// Returns true if the user just transitioned online → offline.
export function removeConnection(userId: string): boolean {
  const n = (counts.get(userId) ?? 1) - 1;
  if (n <= 0) {
    counts.delete(userId);
    return true;
  }
  counts.set(userId, n);
  return false;
}
