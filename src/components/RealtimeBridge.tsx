import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import { playMessageSound } from '../lib/sound';
import { useAuth } from '../store/auth';
import { useRealtime } from '../store/realtime';
import { usePresence } from '../store/presence';
import { showNativeNotification } from '../lib/notify';
import { messagePreview } from '../lib/gameInvite';
import type { Conversation, Message, Notification as Notif } from '../types';

// Human-readable text + deep link for a realtime notification.
function describeNotification(n: Notif): { body: string; navigateTo: string } {
  const action: Record<Notif['type'], string> = {
    LIKE: 'liked your post',
    REPOST: 'reposted your post',
    QUOTE: 'quoted your post',
    REPLY: 'replied to your post',
    MENTION: 'mentioned you',
    FOLLOW: 'started following you',
  };
  const navigateTo =
    n.type === 'FOLLOW'
      ? `/${n.actor.username}`
      : n.post
        ? `/post/${n.post.id}`
        : '/notifications';
  return { body: action[n.type] ?? 'interacted with you', navigateTo };
}

// Mounted once for authenticated users. Wires Socket.io events to the global
// unread badges and the React Query cache, and seeds the initial counts.
export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const { setNotifUnread, setDmUnread } = useRealtime();

  useEffect(() => {
    let cancelled = false;

    // Seed initial unread counts from the API.
    (async () => {
      try {
        const [{ data: n }, { data: c }] = await Promise.all([
          api.get<{ unread: number }>('/notifications/unread-count'),
          api.get<{ conversations: Conversation[] }>('/conversations'),
        ]);
        if (cancelled) return;
        setNotifUnread(n.unread);
        setDmUnread(c.conversations.reduce((sum, conv) => sum + conv.unread, 0));
      } catch {
        // ignore — counts default to 0
      }
    })();

    const socket = connectSocket();

    const onNotifCount = (p: { unread: number }) => setNotifUnread(p.unread);
    const onNotifNew = (n: Notif) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (n?.actor && n.actor.id !== me?.id) {
        const { body, navigateTo } = describeNotification(n);
        showNativeNotification({
          title: n.actor.displayName || `@${n.actor.username}`,
          body,
          icon: n.actor.avatarUrl,
          navigateTo,
          tag: `notif-${n.id}`,
        });
      }
    };
    const onDmNew = (p: { conversationId: string; message: Message }) => {
      const fromOther = p.message.senderId !== me?.id;
      if (fromOther) {
        playMessageSound();
      }

      // Refresh conversation list, update visible chats immediately, and recompute the badge.
      api
        .get<{ conversations: Conversation[] }>('/conversations')
        .then(({ data }) => {
          queryClient.setQueryData(['conversations'], data.conversations);
          setDmUnread(data.conversations.reduce((s, c) => s + c.unread, 0));

          // Telegram-style toast for messages that arrive while we're away.
          if (fromOther) {
            const conv = data.conversations.find((c) => c.id === p.conversationId);
            const sender = conv?.other;
            showNativeNotification({
              title: sender?.displayName || sender?.username || 'New message',
              body:
                messagePreview(p.message.content) ||
                (p.message.audioUrl
                  ? 'Voice message'
                  : p.message.videoNoteUrl
                    ? 'Video message'
                    : p.message.imageUrl
                      ? 'Photo'
                      : 'Sent you a message'),
              icon: sender?.avatarUrl ?? null,
              navigateTo: `/messages/${p.conversationId}`,
              tag: `dm-${p.conversationId}`,
            });
          }
        })
        .catch(() => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        });
    };
    const onDmRead = (p: { conversationId: string; readerId: string }) => {
      queryClient.setQueryData<Conversation[]>(['conversations'], (current) =>
        current?.map((c) => {
          if (c.id !== p.conversationId || !c.lastMessage || c.lastMessage.senderId !== me?.id) {
            return c;
          }
          return { ...c, lastMessage: { ...c.lastMessage, readAt: new Date().toISOString() } };
        }),
      );
      api
        .get<{ conversations: Conversation[] }>('/conversations')
        .then(({ data }) => setDmUnread(data.conversations.reduce((s, c) => s + c.unread, 0)))
        .catch(() => {});
    };

    const onPresenceUpdate = (p: { userId: string; online: boolean; lastSeenAt?: string }) =>
      usePresence.getState().setOnline(p.userId, p.online, p.lastSeenAt);
    const onPresenceState = (p: { online: string[]; activities?: Record<string, string> }) =>
      usePresence.getState().setOnlineList(p.online, p.activities);
    const onActivityUpdate = (p: { userId: string; game: string | null }) =>
      usePresence.getState().setActivity(p.userId, p.game);

    socket.on('notification:count', onNotifCount);
    socket.on('notification:new', onNotifNew);
    socket.on('dm:new', onDmNew);
    socket.on('dm:read', onDmRead);
    socket.on('presence:update', onPresenceUpdate);
    socket.on('presence:state', onPresenceState);
    socket.on('activity:update', onActivityUpdate);

    return () => {
      cancelled = true;
      const s = getSocket();
      s?.off('notification:count', onNotifCount);
      s?.off('notification:new', onNotifNew);
      s?.off('dm:new', onDmNew);
      s?.off('dm:read', onDmRead);
      s?.off('presence:update', onPresenceUpdate);
      s?.off('presence:state', onPresenceState);
      s?.off('activity:update', onActivityUpdate);
    };
  }, [me?.id, queryClient, setNotifUnread, setDmUnread]);

  return null;
}
