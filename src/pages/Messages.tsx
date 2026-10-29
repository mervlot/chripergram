import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { usePresence } from '../store/presence';
import { relativeTime } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/Spinner';
import { ChatPanel } from './ChatPanel';
import { UserName } from '../components/UserName';
import type { Conversation } from '../types';
import { messagePreview } from '../lib/gameInvite';
import { useT } from '../lib/i18n';

export function Messages() {
  const t = useT();
  const { id } = useParams();
  const me = useAuth((s) => s.user);
  const navigate = useNavigate();
  const online = usePresence((s) => s.online);
  // Who is typing to us right now (userId → true), cleared after a pause.
  const [typingFrom, setTypingFrom] = useState<Record<string, boolean>>({});
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await api.get<{ conversations: Conversation[] }>('/conversations')).data.conversations,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const fromList = conversations?.find((c) => c.id === id);
  const { data: single } = useQuery({
    queryKey: ['conversation', id],
    queryFn: async () => (await api.get<{ conversation: Conversation }>(`/conversations/${id}`)).data.conversation,
    enabled: !!id && !fromList,
  });

  const active = fromList ?? single;

  useEffect(() => {
    if (conversations?.length) {
      usePresence.getState().request(conversations.map((c) => c.other.id));
    }
  }, [conversations]);

  // Live "typing..." previews in the conversation list.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onTyping = (p: { fromUserId: string }) => {
      setTypingFrom((cur) => ({ ...cur, [p.fromUserId]: true }));
      clearTimeout(typingTimers.current[p.fromUserId]);
      typingTimers.current[p.fromUserId] = setTimeout(() => {
        setTypingFrom((cur) => {
          const { [p.fromUserId]: _gone, ...rest } = cur;
          return rest;
        });
      }, 2500);
    };
    socket.on('dm:typing', onTyping);
    return () => {
      socket.off('dm:typing', onTyping);
      Object.values(typingTimers.current).forEach(clearTimeout);
    };
  }, []);

  const onlineFriends = (conversations ?? []).filter((c) => online[c.other.id]);

  return (
    <div className="grid h-[100dvh] min-h-0 min-w-0 grid-cols-1 overflow-hidden md:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.4fr)]">
      <div
        className={`min-h-0 min-w-0 overflow-y-auto border-r border-slate-200/80 mobile-content-pad dark:border-white/10 md:pb-0 ${
          id ? 'hidden md:block' : ''
        }`}
      >
        <PageHeader title={t('navMessages')} />

        {/* Online now: quick access to friends who are currently active. */}
        {onlineFriends.length > 0 && (
          <div className="scrollbar-none flex gap-3 overflow-x-auto border-b border-slate-200/60 px-4 py-3 dark:border-white/[0.06]">
            {onlineFriends.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/messages/${c.id}`)}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                className="flex w-14 shrink-0 animate-feed-enter flex-col items-center gap-1 transition active:scale-95"
              >
                <Avatar user={c.other} showPresence linkable={false} />
                <span className="w-full truncate text-center text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                  {c.other.displayName}
                </span>
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <Spinner />
        ) : !conversations?.length ? (
          <p className="p-8 text-center text-slate-500 dark:text-slate-400">
            {t('noConversations')}
          </p>
        ) : (
          conversations.map((c) => (
            <Link
              key={c.id}
              to={`/messages/${c.id}`}
              className={`flex gap-3 px-4 py-3 transition duration-200 hover:bg-violet-50 dark:hover:bg-white/[0.04] ${
                c.id === id ? 'bg-violet-50 dark:bg-white/[0.07]' : ''
              }`}
            >
              <Avatar user={c.other} linkable={false} showPresence />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <UserName user={c.other} className="max-w-full" compact />
                  {c.lastMessage && (
                    <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {relativeTime(c.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  {typingFrom[c.other.id] ? (
                    <p className="truncate text-sm font-semibold italic text-brand dark:text-violet-300">{t('typing')}</p>
                  ) : (
                    <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                      {c.lastMessage
                        ? `${c.lastMessage.senderId === me?.id ? t('youPrefix') : ''}${
                            messagePreview(c.lastMessage.content) || (c.lastMessage.imageUrl ? t('photo') : '')
                          }`
                        : 'No messages yet'}
                    </p>
                  )}
                  {c.unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-2 ring-white dark:ring-[#0a0a0c]" />}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      <div className={`min-h-0 min-w-0 overflow-hidden ${id ? '' : 'hidden md:block'}`}>
        {active ? (
          <ChatPanel conversation={active} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-slate-500 dark:text-slate-400">
            {id ? <Spinner /> : t('selectConversation')}
          </div>
        )}
      </div>
    </div>
  );
}
