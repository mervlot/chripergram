import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Mail } from 'lucide-react';
import { useAuth } from '../store/auth';
import { useRealtime } from '../store/realtime';
import { Avatar } from '../components/Avatar';
import { StoriesBar } from '../components/StoriesBar';
import { useT } from '../lib/i18n';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { PostComposer } from '../components/PostComposer';
import { Feed } from '../components/Feed';
import type { Post } from '../types';
import { iconButtonClass, cn } from '../lib/ui';

type Tab = 'foryou' | 'following';

export function Home() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('foryou');
  const me = useAuth((s) => s.user);
  const { notifUnread, dmUnread } = useRealtime();
  // Pins one ranked "For you" session so paging stays stable while posts get marked seen.
  const feedToken = useRef<string | undefined>(undefined);

  return (
    <div>
      <PageHeader
        title={t('navHome')}
        right={
          <div className="flex items-center gap-1">
            <HeaderIcon to="/messages" label="Messages" badge={dmUnread}>
              <Mail size={20} />
            </HeaderIcon>
            <HeaderIcon to="/notifications" label="Notifications" badge={notifUnread}>
              <Bell size={20} />
            </HeaderIcon>
          </div>
        }
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
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`relative py-3 text-sm font-semibold tracking-wide transition-colors ${
        active
          ? 'text-stone-950 dark:text-stone-50'
          : 'text-stone-500 hover:text-stone-900 dark:text-stone-500 dark:hover:text-stone-200'
      }`}
    >
      {label}
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
    </button>
  );
}

function HeaderIcon({
  to,
  label,
  badge,
  children,
}: {
  to: string;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} aria-label={label} className={cn(iconButtonClass('ghost', 'md'), 'relative')}>
      {children}
      {!!badge && badge > 0 && (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-black" />
      )}
    </Link>
  );
}
