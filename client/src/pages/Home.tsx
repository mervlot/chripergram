import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../store/auth';
import { Avatar } from '../components/Avatar';
import { StoriesBar } from '../components/StoriesBar';
import { useT } from '../lib/i18n';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { PostComposer } from '../components/PostComposer';
import { Feed } from '../components/Feed';
import type { Post } from '../types';

type Tab = 'foryou' | 'following';

export function Home() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('foryou');
  const me = useAuth((s) => s.user);
  // Pins one ranked "For you" session so paging stays stable while posts get marked seen.
  const feedToken = useRef<string | undefined>(undefined);

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+8.5rem)] md:pb-0">
      <PageHeader
        title={t('navHome')}
        left={
          me && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('murmur:menu'))}
              aria-label="Open menu"
              className="rounded-full md:hidden"
            >
              <Avatar user={me} size="sm" linkable={false} />
            </button>
          )
        }
      >
        <div className="flex gap-6 px-4">
          <TabButton active={tab === 'foryou'} onClick={() => setTab('foryou')} label={t('forYou')} />
          <TabButton active={tab === 'following'} onClick={() => setTab('following')} label={t('followingTab')} />
        </div>
      </PageHeader>

      <section className="hidden border-b border-white/[0.07] px-4 py-3 md:block">
        <PostComposer />
      </section>

      {tab === 'foryou' ? (
        <Feed
          key="foryou"
          queryKey={['feed', 'foryou']}
          initialPageParam={0}
          subscribeRealtime
          fetchPage={async (pageParam) => {
            type Page = { items: Post[]; nextPage: number | null; feedToken?: string };
            const page = Number(pageParam ?? 0);
            const params = { page, ...(page > 0 && feedToken.current ? { token: feedToken.current } : {}) };
            let data: Page;
            try {
              data = (await api.get<Page>('/feed/foryou', { params })).data;
              if (data.feedToken) feedToken.current = data.feedToken;
            } catch {
              // older server without the personalised feed
              data = (await api.get<Page>('/feed/explore', { params })).data;
            }
            return { items: data.items, next: data.nextPage };
          }}
          emptyText={t('emptyExplore')}
        />
      ) : (
        <Feed
          key="following"
          queryKey={['feed', 'home']}
          subscribeRealtime
          fetchPage={async (pageParam) => {
            const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>('/feed/home', {
              params: { cursor: pageParam },
            });
            return { items: data.items, next: data.nextCursor };
          }}
          emptyText={t('emptyHome')}
        />
      )}

      <button
        type="button"
        aria-label="Create post"
        title="Create post"
        onClick={() => window.dispatchEvent(new Event('murmur:compose'))}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_5px_16px_rgba(0,0,0,0.36)] transition-transform duration-150 hover:bg-brand-hover active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page)] md:hidden"
      >
        <Plus size={31} strokeWidth={2} />
      </button>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
        className={`relative min-h-12 py-3 text-sm font-semibold tracking-normal transition-colors ${
        active
          ? 'text-white'
          : 'text-stone-500 hover:text-stone-900 dark:text-stone-500 dark:hover:text-stone-200'
      }`}
    >
      {label}
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
    </button>
  );
}
