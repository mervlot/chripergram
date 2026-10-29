import { useParams } from 'react-router-dom';
import { Quote } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Feed } from '../components/Feed';
import type { Post } from '../types';

export function PostQuotes() {
  const { id = '' } = useParams();
  return (
    <div>
      <PageHeader title="Quotes" back />
      <Feed
        queryKey={['quotes', id]}
        emptyIcon={Quote}
        emptyText="No quotes yet."
        fetchPage={async (pageParam) => {
          const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>(`/posts/${id}/quotes`, {
            params: { cursor: pageParam },
          });
          return { items: data.items, next: data.nextCursor };
        }}
      />
    </div>
  );
}
