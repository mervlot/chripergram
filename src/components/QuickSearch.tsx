import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, Compass, Home, Mail, Search } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { Spinner } from './Spinner';
import { UserName } from './UserName';
import type { UserSummary } from '../types';
import { buttonClass, cn } from '../lib/ui';

const destinations = [
  { label: 'Home', to: '/home', icon: Home },
  { label: 'Explore', to: '/explore', icon: Compass },
  { label: 'Messages', to: '/messages', icon: Mail },
  { label: 'Bookmarks', to: '/bookmarks', icon: Bookmark },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function QuickSearch({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
    }
  }, [open]);

  const people = useQuery({
    queryKey: ['quick-search', debounced],
    queryFn: async () =>
      (await api.get<{ users: UserSummary[] }>('/search', {
        params: { q: debounced, type: 'users', limit: 5 },
      })).data.users,
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  function go(to: string) {
    onClose();
    navigate(to);
  }

  function searchAll() {
    if (!query.trim()) return;
    go(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Quick search">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          searchAll();
        }}
        className="pt-3"
      >
        <div className="search-field">
          <Search size={19} className="shrink-0 text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people, posts and hashtags"
            aria-label="Search Chirpergram"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
        </div>
      </form>

      {debounced.length < 2 ? (
        <div className="grid grid-cols-2 gap-2 py-4">
          {destinations.map((item) => (
            <button
              key={item.to}
              onClick={() => go(item.to)}
              className="flex min-h-14 items-center gap-3 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 text-left font-semibold transition duration-200 hover:border-brand/25 hover:bg-violet-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
            >
              <item.icon size={19} className="text-brand" />
              {item.label}
            </button>
          ))}
        </div>
      ) : people.isLoading ? (
        <Spinner className="my-8" />
      ) : (
        <div className="py-2">
          {people.data?.map((user) => (
            <button
              key={user.id}
              onClick={() => go(`/${user.username}`)}
              className="flex min-h-16 w-full items-center gap-3 rounded-lg px-2 text-left transition duration-200 hover:bg-violet-50 active:scale-[0.99] dark:hover:bg-white/[0.06]"
            >
              <Avatar user={user} linkable={false} />
              <span className="min-w-0 flex-1">
                <UserName user={user} className="max-w-full" />
                <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                  @{user.username}
                </span>
              </span>
            </button>
          ))}
          {!people.data?.length && (
            <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No people found.
            </p>
          )}
          <button onClick={searchAll} className={cn(buttonClass({ variant: 'secondary', fullWidth: true }), 'mt-2')}>
            <Search size={18} />
            Search all for “{query.trim()}”
          </button>
        </div>
      )}
    </Modal>
  );
}
