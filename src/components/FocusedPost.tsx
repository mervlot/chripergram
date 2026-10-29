import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, Heart, MessageCircle, MoreHorizontal, Quote as QuoteIcon, Repeat2, Share2, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { compactNumber } from '../lib/format';
import { Avatar } from './Avatar';
import { UserName } from './UserName';
import { RichText } from './RichText';
import { MediaGrid } from './MediaGrid';
import { PollView } from './PollView';
import { FollowButton } from './FollowButton';
import { Modal } from './Modal';
import { GlassPopover, IconButton, MenuItem } from './ui';
import { ICON_SIZE } from '../lib/ui';
import { PostComposer } from './PostComposer';
import { QuoteEmbed } from './PostCard';
import type { Post, PostCounts, ViewerState } from '../types';

function stamp(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  return `${time} · ${date}`;
}

// The post you're "on", X-style: big, borderless, full-width text and media, an
// exact timestamp with views, and a label-less action row. Replies open their own page.
export function FocusedPost({
  post,
  hasAncestor,
  onReply,
}: {
  post: Post;
  hasAncestor?: boolean;
  onReply: () => void;
}) {
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();

  const isRepost = !!post.repostOf && !post.content && post.media.length === 0;
  const display = isRepost ? (post.repostOf as Post) : post;

  const [counts, setCounts] = useState<PostCounts>(display.counts);
  const [viewer, setViewer] = useState<ViewerState>(display.viewer);
  const [menu, setMenu] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);

  useEffect(() => {
    setCounts(display.counts);
    setViewer(display.viewer);
  }, [display.counts, display.viewer]);

  // Live counts.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('post:subscribe', { postId: display.id });
    const handler = (p: { postId: string; counts: PostCounts }) => {
      if (p.postId === display.id) setCounts(p.counts);
    };
    socket.on('post:counts', handler);
    return () => {
      socket.emit('post:unsubscribe', { postId: display.id });
      socket.off('post:counts', handler);
    };
  }, [display.id]);

  const isOwner = me?.id === display.author.id;
  const { data: profile } = useQuery({
    queryKey: ['profile', display.author.username],
    queryFn: async () =>
      (await api.get<{ profile: { relationship: { isFollowing: boolean } } }>(`/users/${display.author.username}`)).data
        .profile,
    enabled: !isOwner,
  });

  async function toggleLike() {
    const next = !viewer.liked;
    setViewer((v) => ({ ...v, liked: next }));
    setCounts((c) => ({ ...c, likes: c.likes + (next ? 1 : -1) }));
    try {
      const { data } = next ? await api.post(`/posts/${display.id}/like`) : await api.delete(`/posts/${display.id}/like`);
      setCounts(data.counts);
    } catch {
      setViewer((v) => ({ ...v, liked: !next }));
      setCounts((c) => ({ ...c, likes: c.likes + (next ? -1 : 1) }));
    }
  }

  async function toggleRepost() {
    setRepostOpen(false);
    const next = !viewer.reposted;
    setViewer((v) => ({ ...v, reposted: next }));
    setCounts((c) => ({ ...c, reposts: c.reposts + (next ? 1 : -1) }));
    try {
      const { data } = next ? await api.post(`/posts/${display.id}/repost`) : await api.delete(`/posts/${display.id}/repost`);
      setCounts(data.counts);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast(next ? 'Reposted' : 'Repost removed', 'success');
    } catch {
      setViewer((v) => ({ ...v, reposted: !next }));
      toast('Could not repost', 'error');
    }
  }

  async function toggleBookmark() {
    const next = !viewer.bookmarked;
    setViewer((v) => ({ ...v, bookmarked: next }));
    try {
      if (next) await api.post(`/posts/${display.id}/bookmark`);
      else await api.delete(`/posts/${display.id}/bookmark`);
      toast(next ? 'Added to bookmarks' : 'Removed from bookmarks', 'success');
    } catch {
      setViewer((v) => ({ ...v, bookmarked: !next }));
    }
  }

  async function share() {
    const url = `${window.location.origin}/post/${display.id}`;
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied', 'success');
      }
    } catch {
      /* cancelled */
    }
  }

  async function remove() {
    setMenu(false);
    if (!confirm('Delete this post?')) return;
    await api.delete(`/posts/${display.id}`);
    queryClient.invalidateQueries();
    toast('Post deleted', 'success');
    navigate(-1);
  }

  const action = 'flex min-h-11 items-center gap-2 rounded-full text-slate-400 transition';

  return (
    <article className="px-4 pb-1 pt-3">
      {hasAncestor && <div className="-mt-3 mb-1 ml-5 h-3 w-0.5 rounded-full bg-white/10" />}

      <div className="flex items-center gap-3">
        <Avatar user={display.author} size="md" />
        <Link to={`/${display.author.username}`} className="min-w-0 flex-1 leading-tight">
          <UserName user={display.author} className="max-w-full" compact />
          <p className="truncate text-sm text-slate-500">@{display.author.username}</p>
        </Link>
        {!isOwner && profile && (
          <FollowButton username={display.author.username} initialFollowing={profile.relationship.isFollowing} small />
        )}
        {isOwner && (
          <div className="relative">
            <IconButton
              label="Post options"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((o) => !o)}
            >
              <MoreHorizontal size={ICON_SIZE.md} />
            </IconButton>
            {menu && (
              <GlassPopover className="absolute right-0 top-12 z-10 w-48">
                <MenuItem danger icon={<Trash2 size={ICON_SIZE.sm} />} onClick={remove}>
                  Delete post
                </MenuItem>
              </GlassPopover>
            )}
          </div>
        )}
      </div>

      {display.content && (
        <div className="mt-3 text-[17px] leading-6 text-slate-100">
          <RichText text={display.content} />
        </div>
      )}
      <MediaGrid media={display.media} />
      {display.poll && <PollView postId={display.id} poll={display.poll} />}
      {display.quotedPost && <QuoteEmbed post={display.quotedPost} />}

      <p className="mt-3 text-[15px] text-slate-500">
        {stamp(display.createdAt)} · <span className="font-semibold text-slate-200">{compactNumber(counts.views)}</span> Views
      </p>

      <div className="mt-2 flex items-center justify-between border-t border-white/[0.07] pr-1 pt-1">
        <button onClick={onReply} className={`${action} hover:text-brand`} aria-label="Reply">
          <MessageCircle size={20} />
          <span className="text-sm tabular-nums">{compactNumber(counts.replies)}</span>
        </button>
        <button
          onClick={() => setRepostOpen(true)}
          className={`${action} hover:text-brand ${viewer.reposted ? 'text-brand' : ''}`}
          aria-label="Repost"
        >
          <Repeat2 size={20} />
          <span className="text-sm tabular-nums">{compactNumber(counts.reposts)}</span>
        </button>
        <button onClick={toggleLike} className={`${action} hover:text-brand ${viewer.liked ? 'text-brand' : ''}`} aria-label="Like">
          <Heart size={20} fill={viewer.liked ? 'currentColor' : 'none'} />
          <span className="text-sm tabular-nums">{compactNumber(counts.likes)}</span>
        </button>
        <button
          onClick={toggleBookmark}
          className={`${action} hover:text-brand ${viewer.bookmarked ? 'text-brand' : ''}`}
          aria-label="Bookmark"
        >
          <Bookmark size={20} fill={viewer.bookmarked ? 'currentColor' : 'none'} />
        </button>
        <button onClick={share} className={`${action} hover:text-brand`} aria-label="Share">
          <Share2 size={20} />
        </button>
      </div>

      <Modal open={repostOpen} onClose={() => setRepostOpen(false)} title="">
        <div className="-mx-4 -mb-4">
          <button onClick={toggleRepost} className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-semibold hover:bg-white/[0.04]">
            <Repeat2 size={20} /> {viewer.reposted ? 'Undo repost' : 'Repost'}
          </button>
          <button
            onClick={() => {
              setRepostOpen(false);
              setQuoteOpen(true);
            }}
            className="flex min-h-14 w-full items-center gap-3 border-t border-white/10 px-4 text-left font-semibold hover:bg-white/[0.04]"
          >
            <QuoteIcon size={20} /> Quote
          </button>
        </div>
      </Modal>

      <Modal open={quoteOpen} onClose={() => setQuoteOpen(false)} title="Quote post">
        <PostComposer
          quotedPostId={display.id}
          autoFocus
          placeholder="Add a comment"
          onPosted={() => {
            setQuoteOpen(false);
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            queryClient.invalidateQueries({ queryKey: ['quotes', display.id] });
          }}
        />
      </Modal>
    </article>
  );
}
