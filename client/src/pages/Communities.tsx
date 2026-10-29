import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Compass, Gamepad2, Lock, Plus, Users } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import type { Community } from '../types';
import { buttonClass, cn, iconButtonClass } from '../lib/ui';

type View = 'mine' | 'discover';

function CommunityAvatar({ community }: { community: Community }) {
  if (community.avatarUrl) {
    return <img src={community.avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />;
  }
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand/10 text-xl font-semibold text-brand">
      {community.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function Communities() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('mine');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', isPrivate: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mine = useQuery({
    queryKey: ['communities', 'mine'],
    queryFn: async () => (await api.get<{ items: Community[] }>('/communities/mine')).data.items,
  });
  const discover = useQuery({
    queryKey: ['communities', 'discover'],
    queryFn: async () =>
      (await api.get<{ items: Community[]; nextCursor: string | null }>('/communities')).data.items,
  });

  const items = view === 'mine' ? mine.data : discover.data;
  const loading = view === 'mine' ? mine.isLoading : discover.isLoading;

  async function createCommunity(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<{ community: Community }>('/communities', form);
      await queryClient.invalidateQueries({ queryKey: ['communities'] });
      setCreateOpen(false);
      setForm({ name: '', description: '', isPrivate: false });
      navigate(`/communities/${data.community.slug}`);
    } catch (err) {
      setError(errorMessage(err, 'Could not create server'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Gaming servers"
        subtitle="Squads, communities and live chat"
        right={
          <button type="button" onClick={() => setCreateOpen(true)} className={iconButtonClass('ghost', 'md', 'brand')} aria-label="Create server">
            <Plus size={22} />
          </button>
        }
      >
        <div className="grid grid-cols-2 border-t border-slate-200/60 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => setView('mine')}
            className={`min-h-12 border-b-2 px-3 font-semibold transition ${
              view === 'mine' ? 'border-brand text-brand' : 'border-transparent text-slate-500'
            }`}
          >
            My servers
          </button>
          <button
            type="button"
            onClick={() => setView('discover')}
            className={`min-h-12 border-b-2 px-3 font-semibold transition ${
              view === 'discover' ? 'border-brand text-brand' : 'border-transparent text-slate-500'
            }`}
          >
            Discover
          </button>
        </div>
      </PageHeader>

      {loading ? (
        <Spinner />
      ) : !items?.length ? (
        <div className="flex min-h-[55dvh] flex-col items-center justify-center px-6 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand/10 text-brand">
            {view === 'mine' ? <Gamepad2 size={30} /> : <Compass size={30} />}
          </span>
          <h2 className="text-xl font-semibold">
            {view === 'mine' ? 'Find your squad' : 'No servers yet'}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            {view === 'mine'
              ? 'Join a gaming server or create one for your friends, clan or favourite game.'
              : 'Create the first gaming server and invite your friends.'}
          </p>
          <button type="button" onClick={() => setCreateOpen(true)} className={cn(buttonClass({ variant: 'primary' }), 'mt-5')}>
            <Plus size={18} /> Create server
          </button>
        </div>
      ) : (
        <div className="grid gap-2 p-3 sm:p-4">
          {items.map((community) => (
            <button
              key={community.id}
              type="button"
              onClick={() => navigate(`/communities/${community.slug}`)}
              className="panel flex min-w-0 items-center gap-3 p-3 text-left transition hover:border-brand/25 active:scale-[0.99]"
            >
              <CommunityAvatar community={community} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-semibold">{community.name}</h2>
                  {community.isPrivate && <Lock size={14} className="shrink-0 text-slate-400" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                  {community.description || 'A place for the squad to talk, post and play.'}
                </p>
                <p className="mt-2 flex items-center gap-3 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1"><Users size={13} /> {community.memberCount}</span>
                  <span>{community.postCount} posts</span>
                  {community.isMember && <span className="text-green-600 dark:text-green-400">Joined</span>}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create gaming server">
        <form onSubmit={createCommunity} className="space-y-4 pt-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Server name</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              maxLength={50}
              placeholder="Night Raid Squad"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">What do you play?</span>
            <textarea
              className="input min-h-24 resize-none"
              value={form.description}
              onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
              maxLength={280}
              placeholder="Games, region, play style and when your squad is online."
            />
          </label>
          <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200/70 px-3 dark:border-white/10">
            <span>
              <span className="block font-semibold">Private server</span>
              <span className="text-sm text-slate-500">Only members can see its feed and chat.</span>
            </span>
            <input
              type="checkbox"
              checked={form.isPrivate}
              onChange={(e) => setForm((current) => ({ ...current, isPrivate: e.target.checked }))}
              className="h-5 w-5 accent-brand"
            />
          </label>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <button
            type="submit"
            className={buttonClass({ variant: 'primary', fullWidth: true })}
            disabled={busy || form.name.trim().length < 3}
          >
            {busy ? 'Creating...' : 'Create server'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
