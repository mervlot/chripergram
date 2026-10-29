import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Feed } from '../components/Feed';
import type { Post } from '../types';

export function Hashtag() {
  const { tag = '' } = useParams();
  return (
    <div>
      <PageHeader title={`#${tag}`} subtitle="Hashtag" back />
      <Feed
        key={tag}
        queryKey={['hashtag', tag]}
        fetchPage={async (pageParam) => {
          const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>(`/hashtags/${tag}`, {
            params: { cursor: pageParam },
          });
          return { items: data.items, next: data.nextCursor };
        }}
        emptyText={`No posts with #${tag} yet.`}
      />
    </div>
  );
}
