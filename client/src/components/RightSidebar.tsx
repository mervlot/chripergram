import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { compactNumber } from '../lib/format';
import { Avatar } from './Avatar';
import { FollowButton } from './FollowButton';
import { UserName } from './UserName';
import type { Trend, UserSummary } from '../types';
import { useT } from '../lib/i18n';

export function RightSidebar() {
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const { data: trends } = useQuery({
    queryKey: ['trends'],
    queryFn: async () => (await api.get<{ trends: Trend[] }>('/trends')).data.trends,
    staleTime: 60_000,
  });

  const { data: suggestions } = useQuery({
    queryKey: ['suggestions'],
    queryFn: async () => (await api.get<{ users: UserSummary[] }>('/users/suggestions')).data.users,
    staleTime: 60_000,
  });

  return (
    <aside className="sticky top-0 hidden h-dvh w-[300px] shrink-0 overflow-y-auto px-4 py-3 lg:block xl:w-[340px] xl:px-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
        className="sticky top-0 z-10 bg-[#07090b] pb-3"
      >
        <div className="search-field">
          <Search size={17} className="text-stone-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('navSearch')}
            className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-stone-500"
          />
        </div>
      </form>

      {!!suggestions?.length && (
        <section className="mb-3 rounded-2xl bg-white/[0.04] px-4 py-3">
          <h2 className="mb-2 text-lg font-bold text-white">
            {t('whoToFollow')}
          </h2>
          <div>
            {suggestions.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 py-2.5"
              >
                <Avatar user={user} size="sm" />
                <Link to={`/${user.username}`} className="min-w-0 flex-1">
                  <UserName user={user} className="max-w-full leading-tight" compact />
                  <p className="truncate text-xs font-semibold text-stone-500">@{user.username}</p>
                </Link>
                <FollowButton username={user.username} initialFollowing={!!user.isFollowing} small />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-3 rounded-2xl bg-white/[0.04] px-4 py-3">
        <h2 className="mb-2 text-lg font-bold text-white">
          {t('trendsForYou')}
        </h2>

        {!trends?.length && (
          <p className="text-sm leading-5 text-stone-500">
            No trends yet. Posts with hashtags will appear here.
          </p>
        )}

        {trends?.map((trend, index) => (
          <Link
            key={trend.tag}
            to={`/hashtag/${trend.tag}`}
            className="grid grid-cols-[2rem_1fr_auto] items-start gap-2 py-2.5 transition-colors hover:text-brand"
          >
            <span className="pt-0.5 text-xs font-semibold tabular-nums text-stone-400">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">#{trend.tag}</span>
              <span className="block text-xs font-semibold text-stone-500">Trending</span>
            </span>
            <span className="pt-0.5 text-xs font-semibold tabular-nums text-stone-500">
              {compactNumber(trend.count)}
            </span>
          </Link>
        ))}
      </section>

      <p className="px-1 pt-2 text-xs text-stone-600">
        Chirpergram · thoughts in public
      </p>
    </aside>
  );
}
