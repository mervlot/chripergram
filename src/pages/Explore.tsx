import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { compactNumber } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { Feed } from '../components/Feed';
import type { Post, Trend } from '../types';

export function Explore() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data: trends } = useQuery({
    queryKey: ['trends'],
    queryFn: async () => (await api.get<{ trends: Trend[] }>('/trends')).data.trends,
  });

  return (
    <div>
      <PageHeader title="Explore">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
          className="px-4 pb-3"
        >
          <div className="search-field">
            <Search size={17} className="text-stone-500" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search Chirpergram"
              className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-stone-500"
            />
          </div>
        </form>
      </PageHeader>

      {!!trends?.length && (
        <section className="border-b border-stone-300 px-4 py-4 dark:border-white/10">
          <div className="mb-2 flex items-end justify-between border-t-2 border-stone-950 pt-3 dark:border-stone-100">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Trending now</h2>
            <span className="text-[11px] font-semibold tracking-wide text-stone-400">Chirpergram</span>
          </div>

          {trends.map((trend, index) => (
            <Link
              key={trend.tag}
              to={`/hashtag/${trend.tag}`}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 border-b border-stone-300 py-3 last:border-b-0 transition-colors hover:text-brand dark:border-white/10"
            >
              <span className="text-xs font-semibold tabular-nums text-stone-400">{String(index + 1).padStart(2, '0')}</span>
              <span className="font-semibold">#{trend.tag}</span>
              <span className="text-xs font-semibold tabular-nums text-stone-500">{compactNumber(trend.count)} posts</span>
            </Link>
          ))}
        </section>
      )}

      <Feed
        queryKey={['feed', 'explore', 'page']}
        initialPageParam={0}
        fetchPage={async (pageParam) => {
          const { data } = await api.get<{ items: Post[]; nextPage: number | null }>('/feed/explore', {
            params: { page: pageParam ?? 0 },
          });
          return { items: data.items, next: data.nextPage };
        }}
      />
    </div>
  );
}
