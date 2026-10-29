import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, LinkIcon, MoreHorizontal, Share2 } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../store/toast';
import { usePresence } from '../store/presence';
import { compactNumber } from '../lib/format';
import { Avatar } from '../components/Avatar';
import { FloatingMenu } from '../components/FloatingMenu';
import { BackButton, IconButton, MenuItem } from '../components/ui';
import { ICON_SIZE, buttonClass, cn } from '../lib/ui';
import { ProfileBlackGrid } from '../components/ProfileBlackGrid';
import { FollowButton } from '../components/FollowButton';
import { Feed } from '../components/Feed';
import { Spinner } from '../components/Spinner';
import { UserName } from '../components/UserName';
import type { Conversation, Post, Profile as ProfileType } from '../types';

type Tab = 'posts' | 'replies' | 'media' | 'likes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'media', label: 'Black' },
  { id: 'replies', label: 'Replies' },
  { id: 'likes', label: 'Likes' },
];

export function Profile() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('posts');
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);

  const { data: profile, isLoading, isError, refetch } = useQuery({
    queryKey: ['profile', username],
    queryFn: async () => (await api.get<{ profile: ProfileType }>(`/users/${username}`)).data.profile,
  });

  useEffect(() => {
    if (profile?.id) usePresence.getState().request([profile.id]);
  }, [profile?.id]);

  async function blockToggle() {
    if (!profile) return;
    setMenu(false);
    const wasBlocked = profile.relationship.isBlocked;
    if (wasBlocked) await api.delete(`/users/${username}/block`);
    else await api.post(`/users/${username}/block`);
    toast(wasBlocked ? `Unblocked @${username}` : `Blocked @${username}`, 'success');
    refetch();
  }

  async function muteToggle() {
    if (!profile) return;
    setMenu(false);
    const wasMuted = profile.relationship.isMuted;
    if (wasMuted) await api.delete(`/users/${username}/mute`);
    else await api.post(`/users/${username}/mute`);
    toast(wasMuted ? `Unmuted @${username}` : `Muted @${username}`, 'success');
    refetch();
  }

  async function message() {
    const { data } = await api.post<{ conversation: Conversation }>('/conversations', { username });
    queryClient.setQueryData<Conversation[]>(['conversations'], (current) => [
      data.conversation,
      ...(current ?? []).filter((c) => c.id !== data.conversation.id),
    ]);
    navigate(`/messages/${data.conversation.id}`);
  }

  if (isLoading) return <Spinner className="mt-10" />;
  if (isError || !profile) return <p className="p-6 text-center text-red-500">User not found.</p>;

  const rel = profile.relationship;

  async function copyProfile() {
    await navigator.clipboard?.writeText(`${window.location.origin}/${username}`);
    toast('Profile link copied', 'success');
  }

  return (
    <div>
      {/* Cover */}
      <div className="relative h-44 w-full overflow-hidden bg-[#0d0e11] sm:h-56">
        {profile.bannerUrl ? (
          <img src={profile.bannerUrl} alt="" className="h-full w-full animate-avatar-reveal object-cover" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(120%_90%_at_50%_0%,rgba(30,127,240,0.28),transparent_60%),linear-gradient(180deg,#16181d,#0a0a0c)]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#141519] to-transparent" />

        <div className="safe-top absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <BackButton variant="glass" onClick={() => navigate(-1)} />
          <div className="flex gap-2">
            <IconButton label="Copy profile link" variant="glass" onClick={copyProfile}>
              <Share2 size={ICON_SIZE.md} />
            </IconButton>
            {!rel.isSelf && (
              <IconButton
                ref={menuBtn}
                label="Profile actions"
                variant="glass"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu((open) => !open)}
              >
                <MoreHorizontal size={ICON_SIZE.md} />
              </IconButton>
            )}
          </div>
        </div>
      </div>

      {menu && (
        <FloatingMenu anchor={menuBtn.current} onClose={() => setMenu(false)} width={208} align="right">
          <MenuItem onClick={muteToggle}>
            {rel.isMuted ? 'Unmute' : 'Mute'} @{username}
          </MenuItem>
          <MenuItem danger onClick={blockToggle}>
            {rel.isBlocked ? 'Unblock' : 'Block'} @{username}
          </MenuItem>
        </FloatingMenu>
      )}

      {/* Identity */}
      <div className="-mt-14 flex flex-col items-center px-4 text-center">
        <Avatar user={profile} size="xl" linkable={false} showPresence />

        <UserName user={profile} className="mt-3 max-w-full justify-center text-2xl" />
        <p className="text-sm text-stone-500">@{profile.username}</p>
        {rel.isFollowedBy && !rel.isSelf && (
          <span className="mt-2 rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-stone-400">
            Follows you
          </span>
        )}

        {profile.bio && (
          <p className="mt-3 max-w-[46ch] whitespace-pre-wrap text-[15px] leading-6 text-stone-300">{profile.bio}</p>
        )}

        {(profile.location || profile.link) && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-stone-500">
            {profile.location && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} className="text-brand" /> {profile.location}
              </span>
            )}
            {profile.link && (
              <a
                href={profile.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-1.5 text-stone-300 hover:underline"
              >
                <LinkIcon size={14} className="text-brand" /> {profile.link.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="card mx-0 mt-5 grid w-full max-w-sm grid-cols-3 divide-x divide-white/[0.07] py-3 text-center">
          <div>
            <p className="text-lg font-semibold tabular-nums text-stone-100">{compactNumber(profile.counts.posts)}</p>
            <p className="text-xs text-stone-500">Posts</p>
          </div>
          <Link to={`/${username}/followers`} className="transition-colors hover:text-white">
            <p className="text-lg font-semibold tabular-nums text-stone-100">{compactNumber(profile.counts.followers)}</p>
            <p className="text-xs text-stone-500">Followers</p>
          </Link>
          <Link to={`/${username}/following`} className="transition-colors hover:text-white">
            <p className="text-lg font-semibold tabular-nums text-stone-100">{compactNumber(profile.counts.following)}</p>
            <p className="text-xs text-stone-500">Following</p>
          </Link>
        </div>

        {/* Actions */}
        <div className="mt-4 flex w-full max-w-sm items-center justify-center gap-3">
          {rel.isSelf ? (
            <Link to="/settings" className={cn(buttonClass({ variant: 'secondary', pill: true }), 'flex-1')}>
              Edit profile
            </Link>
          ) : (
            <>
              <div className="flex-1 [&>button]:w-full">
                <FollowButton username={username} initialFollowing={rel.isFollowing} onChange={() => refetch()} />
              </div>
              <button onClick={message} className={cn(buttonClass({ variant: 'secondary', pill: true }), 'flex-1')}>
                Message
              </button>
            </>
          )}
        </div>
      </div>

      {rel.isBlocked ? (
        <p className="mt-6 border-t border-white/[0.07] p-10 text-center text-stone-500">
          You have blocked @{username}.
        </p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-4 border-y border-white/[0.07]">
            {TABS.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`relative py-3 text-sm transition-colors ${
                  tab === item.id ? 'text-stone-100' : 'text-stone-500 hover:text-stone-300'
                }`}
              >
                {item.label}
                {tab === item.id && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-brand" />}
              </button>
            ))}
          </div>

          {tab === 'media' ? (
            <ProfileBlackGrid username={username} />
          ) : (
            <Feed
              key={tab}
              queryKey={['profile-feed', username, tab]}
              fetchPage={async (pageParam) => {
                const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>(
                  `/users/${username}/posts`,
                  { params: { tab, cursor: pageParam } },
                );
                return { items: data.items, next: data.nextCursor };
              }}
              emptyText={`No ${tab} yet.`}
            />
          )}
        </>
      )}
    </div>
  );
}
