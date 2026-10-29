import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Heart, Repeat2, UserPlus, AtSign, MessageCircle, Quote, Bell } from 'lucide-react';
import { api } from '../lib/api';
import { useRealtime } from '../store/realtime';
import { useT, type TranslationKey } from '../lib/i18n';
import { useIntersection } from '../hooks/useIntersection';
import { relativeTime } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { UserName } from '../components/UserName';
import type { Notification, NotificationType } from '../types';

const ICONS: Record<NotificationType, { icon: typeof Heart; color: string }> = {
  LIKE: { icon: Heart, color: 'text-pink-600' },
  REPOST: { icon: Repeat2, color: 'text-green-500' },
  QUOTE: { icon: Quote, color: 'text-green-500' },
  FOLLOW: { icon: UserPlus, color: 'text-brand' },
  MENTION: { icon: AtSign, color: 'text-brand' },
  REPLY: { icon: MessageCircle, color: 'text-brand' },
};

const VERB: Record<NotificationType, TranslationKey> = {
  LIKE: 'likedYourPost',
  REPOST: 'repostedYourPost',
  QUOTE: 'quotedYourPost',
  FOLLOW: 'followedYou',
  MENTION: 'mentionedYou',
  REPLY: 'repliedToYourPost',
};

type Filter = 'all' | 'mentions' | 'likes' | 'follows';

const FILTERS: Array<{ key: Filter; label: TranslationKey; types: NotificationType[] | null }> = [
  { key: 'all', label: 'filterAll', types: null },
  { key: 'mentions', label: 'filterMentions', types: ['MENTION', 'REPLY', 'QUOTE'] },
  { key: 'likes', label: 'filterLikes', types: ['LIKE', 'REPOST'] },
  { key: 'follows', label: 'filterFollows', types: ['FOLLOW'] },
];

export function Notifications() {
  const t = useT();
  const setNotifUnread = useRealtime((s) => s.setNotifUnread);
  const [filter, setFilter] = useState<Filter>('all');

  const query = useInfiniteQuery({
    queryKey: ['notifications'],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ items: Notification[]; nextCursor: string | null }>('/notifications', {
        params: { cursor: pageParam },
      });
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Mark everything read when the page is opened.
  useEffect(() => {
    api.post('/notifications/read').then(() => setNotifUnread(0)).catch(() => {});
  }, [setNotifUnread]);

  const sentinel = useIntersection(
    () => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage(),
    query.hasNextPage,
  );

  const allItems = query.data?.pages.flatMap((p) => p.items) ?? [];
  const activeTypes = FILTERS.find((f) => f.key === filter)!.types;
  const items = activeTypes ? allItems.filter((n) => activeTypes.includes(n.type)) : allItems;

  return (
    <div>
      <PageHeader title={t('navNotifications')}>
        <div className="scrollbar-none flex gap-2 overflow-x-auto px-3 pb-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition duration-200 ${
                filter === f.key
                  ? 'border border-brand/60 bg-stone-900 text-brand'
                  : 'bg-black/[0.04] text-slate-600 hover:bg-black/[0.07] dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.1]'
              }`}
            >
              {t(f.label)}
            </button>
          ))}
        </div>
      </PageHeader>
      {query.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === 'all' ? t('noNotifications') : t('nothingHere')}
          subtitle={
            filter === 'all'
              ? t('noNotificationsSub')
              : t('noFilterMatches')
          }
        />
      ) : (
        <>
          {items.map((n) => {
            const { icon: Icon, color } = ICONS[n.type];
            const href = n.type === 'FOLLOW' ? `/${n.actor.username}` : n.post ? `/post/${n.post.id}` : '#';
            return (
              <Link
                key={n.id}
                to={href}
                className={`post-card flex gap-3 px-4 py-4 ${
                  n.read ? '' : 'border-l-2 border-l-brand bg-brand/5'
                } card`}
              >
                <Icon className={`mt-1 shrink-0 ${color}`} size={22} />
                <div className="min-w-0">
                  <Avatar user={n.actor} size="sm" />
                  <p className="mt-1">
                    <UserName user={n.actor} compact />{' '}
                    <span className="text-gray-500">@{n.actor.username}</span> {t(VERB[n.type])}
                    <span className="ml-1 text-sm text-gray-500">· {relativeTime(n.createdAt)}</span>
                  </p>
                  {n.post?.content && <p className="mt-1 line-clamp-2 text-gray-500">{n.post.content}</p>}
                </div>
              </Link>
            );
          })}
          <div ref={sentinel} />
          {query.isFetchingNextPage && <Spinner />}
        </>
      )}
    </div>
  );
}
