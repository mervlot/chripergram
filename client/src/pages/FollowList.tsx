import { useParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useIntersection } from '../hooks/useIntersection';
import { PageHeader } from '../components/PageHeader';
import { UserListItem } from '../components/UserListItem';
import { Spinner } from '../components/Spinner';
import type { UserSummary } from '../types';

export function FollowList({ type }: { type: 'followers' | 'following' }) {
  const { username = '' } = useParams();

  const query = useInfiniteQuery({
    queryKey: ['follow-list', username, type],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ items: UserSummary[]; nextCursor: string | null }>(
        `/users/${username}/${type}`,
        { params: { cursor: pageParam } },
      );
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const sentinel = useIntersection(
    () => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage(),
    query.hasNextPage,
  );

  const users = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <PageHeader title={`@${username}`} subtitle={type === 'followers' ? 'Followers' : 'Following'} back />
      {query.isLoading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <p className="p-8 text-center text-gray-500">
          {type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
        </p>
      ) : (
        <>
          {users.map((u) => (
            <UserListItem key={u.id} user={u} />
          ))}
          <div ref={sentinel} />
          {query.isFetchingNextPage && <Spinner />}
        </>
      )}
    </div>
  );
}
