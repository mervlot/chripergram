import { useInfiniteQuery } from '@tanstack/react-query';
import { MessageSquareDashed } from 'lucide-react';
import { api } from '../lib/api';
import { useIntersection } from '../hooks/useIntersection';
import { PostCard } from './PostCard';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';
import { PostSkeletonList } from './PostSkeleton';
import type { Post } from '../types';

export type ReplySort = 'top' | 'new';

// Flat, X-style reply list: every reply is its own row and tapping it opens it as
// its own post page (with the conversation above it), so threads go as deep as you like.
export function ReplyThread({ postId, sort }: { postId: string; sort: ReplySort }) {
  const query = useInfiniteQuery({
    queryKey: ['replies', postId, sort],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>(`/posts/${postId}/replies`, {
        params: { cursor: pageParam, sort },
      });
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const sentinel = useIntersection(
    () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
    !!query.hasNextPage && !query.isFetchingNextPage,
  );

  if (query.isLoading) return <PostSkeletonList />;
  const replies = query.data?.pages.flatMap((p) => p.items) ?? [];
  if (replies.length === 0) return <EmptyState icon={MessageSquareDashed} title="No replies yet. Be the first to reply!" />;

  return (
    <div>
      {replies.map((r) => (
        <PostCard key={r.id} post={r} variant="flat" />
      ))}
      <div ref={sentinel} />
      {query.isFetchingNextPage && <Spinner />}
    </div>
  );
}
