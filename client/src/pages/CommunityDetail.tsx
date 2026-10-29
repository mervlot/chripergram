import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gamepad2, Lock, MessageCircle, Send, Users } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { PageHeader } from '../components/PageHeader';
import { PostComposer } from '../components/PostComposer';
import { Feed } from '../components/Feed';
import { Avatar } from '../components/Avatar';
import { Spinner } from '../components/Spinner';
import { relativeTime } from '../lib/format';
import type { Community, CommunityMember, CommunityMessage, Post } from '../types';
import { buttonClass, cn, glass } from '../lib/ui';

type Tab = 'chat' | 'feed' | 'members';

export function CommunityDetail() {
  const { slug = '' } = useParams();
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [typers, setTypers] = useState<Record<string, string>>({});
  const typerTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const communityQuery = useQuery({
    queryKey: ['community', slug],
    queryFn: async () => (await api.get<{ community: Community }>(`/communities/${slug}`)).data.community,
    enabled: Boolean(slug),
  });
  const community = communityQuery.data;

  const members = useQuery({
    queryKey: ['community-members', slug],
    queryFn: async () =>
      (await api.get<{ items: CommunityMember[]; nextCursor: string | null }>(`/communities/${slug}/members`)).data.items,
    enabled: Boolean(slug) && tab === 'members',
  });

  useEffect(() => {
    if (!community?.isMember) {
      setMessages([]);
      return;
    }
    let active = true;
    api
      .get<{ items: CommunityMessage[]; nextCursor: string | null }>(`/communities/${slug}/messages`)
      .then(({ data }) => {
        if (!active) return;
        setMessages([...data.items].reverse());
        setNextCursor(data.nextCursor);
        setTimeout(() => bottomRef.current?.scrollIntoView(), 40);
      })
      .catch(() => {});

    const socket = getSocket();
    socket?.emit('community:join', { communityId: community.id });
    const onMessage = (payload: { communityId: string; message: CommunityMessage }) => {
      if (payload.communityId !== community.id) return;
      setMessages((current) =>
        current.some((message) => message.id === payload.message.id)
          ? current
          : [...current, payload.message],
      );
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
    };
    const onTyping = (payload: { communityId: string; userId: string; displayName?: string; username?: string }) => {
      if (payload.communityId !== community.id || payload.userId === me?.id) return;
      const name = payload.displayName || payload.username || 'Someone';
      setTypers((cur) => ({ ...cur, [payload.userId]: name }));
      clearTimeout(typerTimers.current[payload.userId]);
      typerTimers.current[payload.userId] = setTimeout(() => {
        setTypers((cur) => {
          const { [payload.userId]: _gone, ...rest } = cur;
          return rest;
        });
      }, 1800);
    };
    socket?.on('community:message', onMessage);
    socket?.on('community:typing', onTyping);

    return () => {
      active = false;
      socket?.emit('community:leave', { communityId: community.id });
      socket?.off('community:message', onMessage);
      socket?.off('community:typing', onTyping);
      Object.values(typerTimers.current).forEach(clearTimeout);
      setTypers({});
    };
  }, [community?.id, community?.isMember, slug, me?.id]);

  async function joinOrLeave() {
    if (!community) return;
    setError('');
    try {
      if (community.isMember) await api.delete(`/communities/${slug}/join`);
      else await api.post(`/communities/${slug}/join`);
      await queryClient.invalidateQueries({ queryKey: ['community', slug] });
      await queryClient.invalidateQueries({ queryKey: ['communities'] });
    } catch (err) {
      setError(errorMessage(err, 'Could not update membership'));
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setText('');
    setSending(true);
    setError('');
    try {
      const { data } = await api.post<{ message: CommunityMessage }>(
        `/communities/${slug}/messages`,
        { content },
      );
      setMessages((current) =>
        current.some((message) => message.id === data.message.id) ? current : [...current, data.message],
      );
    } catch (err) {
      setText(content);
      setError(errorMessage(err, 'Could not send message'));
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!nextCursor) return;
    const { data } = await api.get<{ items: CommunityMessage[]; nextCursor: string | null }>(
      `/communities/${slug}/messages`,
      { params: { cursor: nextCursor } },
    );
    setMessages((current) => [...[...data.items].reverse(), ...current]);
    setNextCursor(data.nextCursor);
  }

  if (communityQuery.isLoading || !community) return <Spinner />;

  return (
    <div className="min-w-0">
      <PageHeader
        title={community.name}
        subtitle={`${community.memberCount} members${community.isPrivate ? ' - private' : ''}`}
        back
        right={
          community.role !== 'OWNER' ? (
            <button type="button" onClick={joinOrLeave} className={buttonClass({ variant: community.isMember ? 'secondary' : 'primary', size: 'sm' })}>
              {community.isMember ? 'Leave' : 'Join'}
            </button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-3 border-t border-slate-200/60 dark:border-white/[0.06]">
          {([
            ['chat', MessageCircle, 'Chat'],
            ['feed', Gamepad2, 'Feed'],
            ['members', Users, 'Members'],
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`flex min-h-12 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold transition ${
                tab === value ? 'border-brand text-brand' : 'border-transparent text-slate-500'
              }`}
            >
              <Icon size={17} /> {label}
            </button>
          ))}
        </div>
      </PageHeader>

      {community.bannerUrl && (
        <img src={community.bannerUrl} alt="" className="h-32 w-full object-cover sm:h-40" />
      )}
      {!community.bannerUrl && (
        <div className="flex min-h-24 items-center gap-3 border-b border-white/[0.08] bg-[#101419] px-4 py-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-brand/20 bg-brand/10 text-xl font-semibold text-brand">
            {community.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{community.name}</p>
            <p className="line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
              {community.description || 'A place for the squad to talk, post and play.'}
            </p>
          </div>
        </div>
      )}

      {error && <p className="m-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      {tab === 'chat' && (
        community.isMember ? (
          <div className="flex min-h-[calc(100dvh-17rem)] flex-col">
            <div className="min-h-0 flex-1 px-3 py-3">
              {nextCursor && (
                <button type="button" onClick={loadOlder} className="mx-auto mb-3 block min-h-11 px-4 text-sm font-semibold text-brand">
                  Load older messages
                </button>
              )}
              {messages.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-500">Start the squad conversation.</p>
              )}
              {messages.map((message) => (
                <div key={message.id} className="group flex gap-2.5 py-2">
                  <Avatar user={message.sender} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <p className="truncate text-sm font-semibold">{message.sender.displayName}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">{relativeTime(message.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-6">{message.content}</p>
                  </div>
                </div>
              ))}
              {Object.keys(typers).length > 0 && (
                <p className="py-1 text-sm text-slate-500">
                  {(() => {
                    const names = Object.values(typers);
                    return names.length === 1
                      ? `${names[0]} is typing...`
                      : names.length === 2
                        ? `${names[0]} and ${names[1]} are typing...`
                        : 'Several people are typing...';
                  })()}
                </p>
              )}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={sendMessage} className={glass('bottom', 'sticky bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] flex min-w-0 items-end gap-2 px-2 pb-2 pt-2 sm:px-3 sm:pb-3 lg:bottom-0')}>
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  getSocket()?.emit('community:typing', { communityId: community.id });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder={`Message #${community.slug}`}
                className="input max-h-32 min-w-0 flex-1 resize-none rounded-2xl px-3"
              />
              <button type="submit" disabled={!text.trim() || sending} className={cn(buttonClass({ variant: 'primary', iconOnly: true }), 'shrink-0')} aria-label="Send message">
                <Send size={18} />
              </button>
            </form>
          </div>
        ) : (
          <div className="flex min-h-[45dvh] flex-col items-center justify-center px-6 text-center">
            <Lock size={30} className="mb-3 text-brand" />
            <h2 className="text-xl font-semibold">Join to open squad chat</h2>
            <p className="mt-2 text-sm text-slate-500">Members can chat in realtime and coordinate game sessions.</p>
            <button type="button" onClick={joinOrLeave} className={cn(buttonClass({ variant: 'primary' }), 'mt-5')}>Join server</button>
          </div>
        )
      )}

      {tab === 'feed' && (
        <div>
          {community.isMember && (
            <div className="card px-4 py-4">
              <PostComposer communityId={community.id} placeholder={`Share with ${community.name}`} compact />
            </div>
          )}
          <Feed
            queryKey={['community-feed', slug]}
            fetchPage={async (pageParam) => {
              const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>(
                `/communities/${slug}/feed`,
                { params: { cursor: pageParam } },
              );
              return { items: data.items, next: data.nextCursor };
            }}
            emptyText="No squad posts yet."
          />
        </div>
      )}

      {tab === 'members' && (
        members.isLoading ? <Spinner /> : (
          <div className="divide-y divide-slate-200/70 dark:divide-white/[0.07]">
            {(members.data ?? []).map((member) => (
              <div key={member.id} className="flex min-w-0 items-center gap-3 px-4 py-3">
                <Avatar user={member} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.displayName}</p>
                  <p className="truncate text-sm text-slate-500">@{member.username}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">
                  {member.role.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
