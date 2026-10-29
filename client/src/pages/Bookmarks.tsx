import { Bookmark } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Feed } from '../components/Feed';
import type { Post } from '../types';

export function Bookmarks() {
  return (
    <div>
      <PageHeader title="Bookmarks" />
      <Feed
        queryKey={['bookmarks']}
        fetchPage={async (pageParam) => {
          const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>('/posts/bookmarks', {
            params: { cursor: pageParam },
          });
          return { items: data.items, next: data.nextCursor };
        }}
        emptyText="You haven't bookmarked anything yet."
        emptyIcon={Bookmark}
      />
    </div>
  );
}
