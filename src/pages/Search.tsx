import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search as SearchIcon } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Feed } from '../components/Feed';
import { UserListItem } from '../components/UserListItem';
import { Spinner } from '../components/Spinner';
import type { Post, UserSummary } from '../types';

type Tab = 'top' | 'people' | 'posts';

export function Search() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [tab, setTab] = useState<Tab>('top');

  const peopleQuery = useQuery({
    queryKey: ['search-users', q],
    queryFn: async () => (await api.get<{ users: UserSummary[] }>('/search', { params: { q, type: 'users' } })).data.users,
    enabled: !!q && (tab === 'top' || tab === 'people'),
  });

  return (
    <div>
      <PageHeader title="Search" back>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) navigate(`/search?q=${encodeURIComponent(input.trim())}`);
          }}
          className="px-4 pb-2"
        >
          <div className="search-field">
            <SearchIcon size={18} className="text-slate-500" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent outline-none placeholder:text-slate-400"
            />
          </div>
        </form>
        <div className="flex">
          {(['top', 'people', 'posts'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="relative flex-1 py-3 text-center font-semibold capitalize transition duration-200 hover:bg-violet-50 dark:hover:bg-white/[0.05]"
            >
              <span className={tab === t ? 'text-slate-950 dark:text-white' : 'text-slate-500 dark:text-slate-400'}>{t}</span>
              {tab === t && <span className="absolute bottom-0 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      </PageHeader>

      {!q && <p className="p-8 text-center text-slate-500 dark:text-slate-400">Search for people, posts and hashtags.</p>}

      {q && tab === 'people' && (
        peopleQuery.isLoading ? (
          <Spinner />
        ) : peopleQuery.data?.length ? (
          peopleQuery.data.map((u) => <UserListItem key={u.id} user={u} />)
        ) : (
          <p className="p-8 text-center text-slate-500 dark:text-slate-400">No people found.</p>
        )
      )}

      {q && tab === 'top' && (
        <>
          {peopleQuery.data?.slice(0, 3).map((u) => <UserListItem key={u.id} user={u} />)}
          <PostsResults q={q} />
        </>
      )}

      {q && tab === 'posts' && <PostsResults q={q} />}
    </div>
  );
}

function PostsResults({ q }: { q: string }) {
  return (
    <Feed
      key={q}
      queryKey={['search-posts', q]}
      fetchPage={async (pageParam) => {
        const { data } = await api.get<{ posts: { items: Post[]; nextCursor: string | null } }>('/search', {
          params: { q, type: 'posts', cursor: pageParam },
        });
        return { items: data.posts.items, next: data.posts.nextCursor };
      }}
      emptyText="No posts found."
    />
  );
}
