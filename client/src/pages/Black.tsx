import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { AlertTriangle, Aperture } from 'lucide-react';
import { api } from '../lib/api';
import { useIntersection } from '../hooks/useIntersection';
import { BlackCard } from '../components/BlackCard';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import type { Post } from '../types';
import { buttonClass } from '../lib/ui';

type Filter = 'all' | 'photos' | 'videos';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
];

// TikTok-style: one post per screen, vertical snap scrolling.
export function Black() {
  const [filter, setFilter] = useState<Filter>('all');

  const query = useInfiniteQuery({
    queryKey: ['black'],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ items: Post[]; nextPage: number | null }>('/feed/black', {
        params: { page: pageParam },
      });
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    staleTime: 30_000,
  });

  const sentinel = useIntersection(
    () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
    !!query.hasNextPage && !query.isFetchingNextPage,
  );

  const seen = new Set<string>();
  const posts = (query.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    if (filter === 'videos') return p.media.some((m) => m.type === 'VIDEO');
    if (filter === 'photos') return p.media.some((m) => m.type !== 'VIDEO');
    return true;
  });

  return (
    // Fixed full-height stage, centred on desktop, edge-to-edge on phones.
    <div className="fixed inset-0 z-30 mx-auto w-full max-w-[520px] bg-[#07090b] md:border-x md:border-white/[0.07]">
      <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-3">
        <div className="pointer-events-auto flex items-center justify-center gap-5 text-[15px]">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`relative pb-1 transition-colors ${filter === f.id ? 'text-white' : 'text-white/55'}`}
            >
              {f.label}
              {filter === f.id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <Spinner className="pt-40" />
      ) : query.isError ? (
        <div className="pt-32">
          <EmptyState icon={AlertTriangle} title="Couldn't load Black" subtitle="Check your connection and try again.">
            <button onClick={() => query.refetch()} className={buttonClass({ variant: 'secondary' })}>
              Retry
            </button>
          </EmptyState>
        </div>
      ) : posts.length === 0 ? (
        <div className="pt-32">
          <EmptyState icon={Aperture} title="Nothing here yet" subtitle="Photos and videos people post will show up here." />
        </div>
      ) : (
        <div className="scrollbar-none h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain">
          {posts.map((post) => (
            <div key={post.id} className="h-full w-full snap-start snap-always">
              <BlackCard post={post} />
            </div>
          ))}
          <div ref={sentinel} className="h-px" />
          {query.isFetchingNextPage && <Spinner />}
        </div>
      )}
    </div>
  );
}
