import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Aperture, Eye, Images, Play } from 'lucide-react';
import { api } from '../lib/api';
import { compactNumber } from '../lib/format';
import { useIntersection } from '../hooks/useIntersection';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';
import type { Post } from '../types';

// Two-column grid of a user's photo/video posts (the "Black" tab on profiles).
export function ProfileBlackGrid({ username }: { username: string }) {
  const navigate = useNavigate();
  const query = useInfiniteQuery({
    queryKey: ['profile-feed', username, 'media'],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>(`/users/${username}/posts`, {
        params: { tab: 'media', cursor: pageParam },
      });
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const sentinel = useIntersection(
    () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
    !!query.hasNextPage && !query.isFetchingNextPage,
  );

  if (query.isLoading) return <Spinner className="mt-6" />;
  const posts = query.data?.pages.flatMap((p) => p.items) ?? [];
  if (!posts.length) return <EmptyState icon={Aperture} title="No photos or videos yet" />;

  return (
    <div className="pb-4 pt-0.5">
      <div className="grid grid-cols-3 gap-0.5">
        {posts.map((post) => {
          const first = post.media[0];
          const isVideo = first?.type === 'VIDEO';
          return (
            <button
              key={post.id}
              onClick={() => navigate(`/post/${post.id}`)}
              className="group relative aspect-[3/4] overflow-hidden bg-[#101317]"
            >
              {isVideo ? (
                <video src={first.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                <img
                  src={first?.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                />
              )}
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 to-transparent" />
              <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-xs text-white">
                <Eye size={13} className="text-brand" /> {compactNumber(post.counts.views)}
              </span>
              {post.media.length > 1 && (
                <span className="absolute right-1.5 top-1.5 text-white/90">
                  <Images size={15} />
                </span>
              )}
              {isVideo && post.media.length === 1 && (
                <span className="absolute right-1.5 top-1.5 text-brand">
                  <Play size={14} fill="currentColor" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div ref={sentinel} />
      {query.isFetchingNextPage && <Spinner />}
    </div>
  );
}
