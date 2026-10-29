import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Share,
  MoreHorizontal,
  Trash2,
  Pin,
  Quote as QuoteIcon,
  BarChart2,
  Pencil,
  Share2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { toast } from '../store/toast';
import { t, useLocale } from '../lib/i18n';
import { relativeTime, compactNumber } from '../lib/format';
import { encodePostShare } from '../lib/messageCards';
import { Avatar } from './Avatar';
import { RichText } from './RichText';
import { MediaGrid } from './MediaGrid';
import { Modal } from './Modal';
import { FloatingMenu } from './FloatingMenu';
import { IconButton } from './ui';
import { ICON_SIZE, MENU_ITEM, MENU_ITEM_DANGER, buttonClass } from '../lib/ui';
import { PostComposer } from './PostComposer';
import { UserName } from './UserName';
import { GameStatus } from './GameStatus';
import { PollView } from './PollView';
import { postPath } from '../lib/postNav';
import { onViewCounts } from '../lib/views';
import type { Conversation, Post, PostCounts, ViewerState, PostAnalytics } from '../types';

interface Props {
  post: Post;
  onDeleted?: (id: string) => void;
  subscribeRealtime?: boolean;
  showThreadLine?: boolean;
  /** Username of the post this one replies to (shows "Replying to @user", X-style). */
  replyingTo?: string;
  /** 'flat' = borderless X-style row (replies, ancestors) instead of a floating card. */
  variant?: 'card' | 'flat';
  index?: number;
}

export function PostCard({ post, onDeleted, subscribeRealtime, showThreadLine, replyingTo, variant = 'card', index = 0 }: Props) {
  useLocale((s) => s.locale); // re-render on language change
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const menuBtn = useRef<HTMLButtonElement>(null);
  const repostBtn = useRef<HTMLButtonElement>(null);
  const shareBtn = useRef<HTMLButtonElement>(null);

  const isRepost = !!post.repostOf && !post.content && post.media.length === 0;
  const display = isRepost ? (post.repostOf as Post) : post;

  const [counts, setCounts] = useState<PostCounts>(display.counts);
  const [viewer, setViewer] = useState<ViewerState>(display.viewer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [repostMenu, setRepostMenu] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);
  const [content, setContent] = useState<string | null>(display.content);
  const [editedAt, setEditedAt] = useState<string | null>(display.editedAt);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analytics, setAnalytics] = useState<PostAnalytics | null>(null);
  const [shareMenu, setShareMenu] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  // Public view count updates as the server confirms this viewer's impressions.
  useEffect(
    () =>
      onViewCounts((map) => {
        const views = map[display.id];
        if (typeof views === 'number') setCounts((c) => (c.views === views ? c : { ...c, views }));
      }),
    [display.id],
  );

  // Keep local state in sync when fresh data arrives (refetch after a reply, repost, etc).
  useEffect(() => {
    setCounts(display.counts);
    setViewer(display.viewer);
    setContent(display.content);
    setEditedAt(display.editedAt);
  }, [display.counts, display.viewer, display.content, display.editedAt]);

  const isOwner = me?.id === display.author.id;

  function refreshLists() {
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    queryClient.invalidateQueries({ queryKey: ['profile-feed'] });
  }

  async function openAnalytics() {
    setMenuOpen(false);
    setAnalytics(null);
    setAnalyticsOpen(true);
    try {
      const { data } = await api.get<{ analytics: PostAnalytics }>(`/posts/${display.id}/analytics`);
      setAnalytics(data.analytics);
    } catch {
      toast('Could not load analytics', 'error');
      setAnalyticsOpen(false);
    }
  }

  async function saveEdit() {
    setEditBusy(true);
    try {
      const { data } = await api.patch<{ post: Post }>(`/posts/${display.id}`, { content: editText });
      setContent(data.post.content);
      setEditedAt(data.post.editedAt);
      setEditOpen(false);
      toast('Post updated', 'success');
    } catch {
      toast('Could not update post', 'error');
    } finally {
      setEditBusy(false);
    }
  }

  useEffect(() => {
    if (!subscribeRealtime) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('post:subscribe', { postId: display.id });
    const handler = (payload: { postId: string; counts: PostCounts }) => {
      if (payload.postId === display.id) setCounts(payload.counts);
    };
    socket.on('post:counts', handler);
    return () => {
      socket.emit('post:unsubscribe', { postId: display.id });
      socket.off('post:counts', handler);
    };
  }, [display.id, subscribeRealtime]);

  async function toggleLike() {
    const next = !viewer.liked;
    if (next) {
      setLikeBurst(true);
      setTimeout(() => setLikeBurst(false), 500);
    }
    setViewer((v) => ({ ...v, liked: next }));
    setCounts((c) => ({ ...c, likes: c.likes + (next ? 1 : -1) }));
    try {
      const { data } = next
        ? await api.post(`/posts/${display.id}/like`)
        : await api.delete(`/posts/${display.id}/like`);
      setCounts(data.counts);
    } catch {
      setViewer((v) => ({ ...v, liked: !next }));
      setCounts((c) => ({ ...c, likes: c.likes + (next ? -1 : 1) }));
    }
  }

  async function toggleRepost() {
    setRepostMenu(false);
    const next = !viewer.reposted;
    setViewer((v) => ({ ...v, reposted: next }));
    setCounts((c) => ({ ...c, reposts: c.reposts + (next ? 1 : -1) }));
    try {
      const { data } = next
        ? await api.post(`/posts/${display.id}/repost`)
        : await api.delete(`/posts/${display.id}/repost`);
      setCounts(data.counts);
      refreshLists();
      toast(next ? t('reposted') : t('removedRepost'), 'success');
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
      toast(next ? t('bookmarkAdded') : t('bookmarkRemoved'), 'success');
    } catch {
      setViewer((v) => ({ ...v, bookmarked: !next }));
      toast('Could not update bookmark', 'error');
    }
  }

  async function remove() {
    setMenuOpen(false);
    if (!confirm(t('deletePostConfirm'))) return;
    await api.delete(`/posts/${display.id}`);
    setDeleted(true);
    toast(t('postDeleted'), 'success');
    onDeleted?.(display.id);
  }

  async function pin() {
    setMenuOpen(false);
    await api.post(`/posts/${display.id}/pin`);
    toast(t('pinnedToast'), 'success');
  }

  if (deleted) return null;

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className={`post-card animate-feed-enter ${
        variant === 'flat'
          ? showThreadLine
            ? 'px-4 pb-1 pt-3'
            : 'border-b border-white/10 px-4 py-3'
          : 'card px-4 py-4'
      }`}
    >
      {/* The whole card opens the post through this one real link (see .post-card in
          index.css). Interactive children stay clickable on their own, so nothing
          depends on click bubbling or stopPropagation. */}
      <Link to={postPath(display.id)} className="post-card-link" aria-label={`Open post by @${display.author.username}`} />

      {isRepost && (
        <div className="mb-2 flex items-center gap-2 pl-6 text-sm font-medium text-slate-500 dark:text-slate-400">
          <Repeat2 size={15} />
          <Link to={`/${post.author.username}`} className="hover:underline">
            {post.author.displayName} reposted
          </Link>
        </div>
      )}
      {post.pinned && (
        <div className="mb-2 flex items-center gap-2 pl-6 text-sm font-medium text-slate-500 dark:text-slate-400">
          <Pin size={14} /> {t('pinned')}
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Avatar user={display.author} />
          {showThreadLine && <div className="mt-2 w-0.5 flex-1 rounded-full bg-slate-200 dark:bg-white/10" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1 text-sm">
            <Link
              to={`/${display.author.username}`}
              className="min-w-0 hover:underline"
            >
              <UserName user={display.author} className="max-w-full" compact />
            </Link>
            <span className="truncate text-slate-500 dark:text-slate-400">@{display.author.username}</span>
            <span className="text-slate-400">-</span>
            <span className="shrink-0 text-slate-500 hover:underline dark:text-slate-400">
              {relativeTime(display.createdAt)}
            </span>
            <GameStatus userId={display.author.id} status={display.author.gameStatus} className="hidden shrink-0 sm:inline-flex" />
            {editedAt && (
              <span className="shrink-0 text-slate-500 dark:text-slate-400" title="Edited">
                - edited
              </span>
            )}

            <div className={`relative ml-auto ${isOwner ? '' : 'hidden'}`}>
              <IconButton
                ref={menuBtn}
                label="Post options"
                size="sm"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <MoreHorizontal size={ICON_SIZE.md} />
              </IconButton>
              {menuOpen && isOwner && (
                <FloatingMenu anchor={menuBtn.current} onClose={() => setMenuOpen(false)} width={192} align="right">
                  {!isRepost && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setEditText(content ?? '');
                        setEditOpen(true);
                      }}
                      className={MENU_ITEM}
                    >
                      <Pencil size={16} /> {t('edit')}
                    </button>
                  )}
                  <button
                    onClick={remove}
                    className={MENU_ITEM_DANGER}
                  >
                    <Trash2 size={16} /> {t('delete')}
                  </button>
                  <button
                    onClick={pin}
                    className={MENU_ITEM}
                  >
                    <Pin size={16} /> {t('pinToProfile')}
                  </button>
                  {!isRepost && (
                    <button
                      onClick={openAnalytics}
                      className={MENU_ITEM}
                    >
                      <BarChart2 size={16} /> {t('viewAnalytics')}
                    </button>
                  )}
                </FloatingMenu>
              )}
            </div>
          </div>

          {(replyingTo ?? post.replyTo?.username) && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Replying to{' '}
              <Link
                to={`/${replyingTo ?? post.replyTo?.username}`}
                className="text-brand hover:underline"
              >
                @{replyingTo ?? post.replyTo?.username}
              </Link>
            </p>
          )}

          {content && (
            <div className="mt-1 text-[15.5px] leading-6 text-slate-900 dark:text-slate-100">
              <RichText text={content} />
            </div>
          )}

          <MediaGrid media={display.media} />

          {display.poll && <PollView postId={display.id} poll={display.poll} />}

          {display.quotedPost && <QuoteEmbed post={display.quotedPost} />}

          <div className="mt-3 flex max-w-md items-center justify-between text-brand/70">
            {/* Opens the dedicated post page (/post/:id): a real navigation, not a modal or an in-feed expansion. */}
            <Link
              to={postPath(display.id)}
              className="group flex min-h-11 items-center gap-1.5 rounded-full transition hover:text-brand"
              aria-label="Reply"
            >
              <span className="rounded-full p-1.5 group-hover:bg-brand/10">
                <MessageCircle size={18} />
              </span>
              {counts.replies > 0 && (
                <span key={counts.replies} className="inline-block animate-scale-in text-sm tabular-nums text-slate-400">
                  {compactNumber(counts.replies)}
                </span>
              )}
            </Link>

            <div className="relative">
              <button
                onClick={() => setRepostMenu((o) => !o)}
                className={`group flex min-h-11 items-center gap-1.5 rounded-full transition hover:text-brand ${
                  viewer.reposted ? 'text-brand' : ''
                }`}
                ref={repostBtn}
                aria-label="Repost"
              >
                <span className="rounded-full p-1.5 group-hover:bg-brand/10">
                  <Repeat2 size={18} className={viewer.reposted ? 'animate-nav-pop' : ''} />
                </span>
                {counts.reposts > 0 && (
                  <span key={counts.reposts} className="inline-block animate-scale-in text-sm tabular-nums text-slate-400">
                    {compactNumber(counts.reposts)}
                  </span>
                )}
              </button>
              {repostMenu && (
                <FloatingMenu anchor={repostBtn.current} onClose={() => setRepostMenu(false)} width={176}>
                  <button
                    onClick={toggleRepost}
                    className={MENU_ITEM}
                  >
                    <Repeat2 size={16} /> {viewer.reposted ? t('undoRepost') : t('repost')}
                  </button>
                  <button
                    onClick={() => {
                      setRepostMenu(false);
                      setQuoteOpen(true);
                    }}
                    className={MENU_ITEM}
                  >
                    <QuoteIcon size={16} /> Quote
                  </button>
                </FloatingMenu>
              )}
            </div>

            <button
              onClick={toggleLike}
              className={`group flex min-h-11 items-center gap-1.5 rounded-full transition hover:text-brand ${
                viewer.liked ? 'text-brand' : ''
              }`}
              aria-label="Like"
            >
              <span className="relative rounded-full p-1.5 group-hover:bg-brand/10">
                <Heart size={18} fill={viewer.liked ? 'currentColor' : 'none'} className={likeBurst ? 'animate-pop' : ''} />
                {likeBurst && (
                  <>
                    <span className="pointer-events-none absolute inset-0 m-auto h-5 w-5 animate-heart-burst rounded-full border-2 border-brand" />
                    {/* Radial confetti dots flying out of the heart */}
                    {Array.from({ length: 6 }, (_, i) => (
                      <span
                        key={i}
                        style={{ '--angle': `${i * 60 + 15}deg` } as React.CSSProperties}
                        className={`pointer-events-none absolute inset-0 m-auto h-1.5 w-1.5 animate-like-particle rounded-full ${
                          i % 2 ? 'bg-accent' : 'bg-brand'
                        }`}
                      />
                    ))}
                  </>
                )}
              </span>
              {counts.likes > 0 && (
                <span key={counts.likes} className="inline-block animate-scale-in text-sm tabular-nums text-slate-400">
                  {compactNumber(counts.likes)}
                </span>
              )}
            </button>

            {counts.views > 0 && (
              <span className="flex min-h-11 items-center gap-1 text-sm text-slate-500 dark:text-slate-400" title="Views">
                <BarChart2 size={17} />
                {compactNumber(counts.views)}
              </span>
            )}

            <button
              onClick={toggleBookmark}
              className={`group flex min-h-11 items-center rounded-full transition hover:text-brand ${
                viewer.bookmarked ? 'text-brand' : ''
              }`}
              aria-label="Bookmark"
            >
              <span className="rounded-full p-1.5 group-hover:bg-brand/10">
                <Bookmark
                  size={18}
                  fill={viewer.bookmarked ? 'currentColor' : 'none'}
                  className={viewer.bookmarked ? 'animate-nav-pop' : ''}
                />
              </span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShareMenu((o) => !o)}
                className="group flex min-h-11 items-center rounded-full transition hover:text-accent"
                title="Share"
                ref={shareBtn}
                aria-label="Share post"
              >
                <span className="rounded-full p-1.5 group-hover:bg-accent/10">
                  <Share size={18} />
                </span>
              </button>
              {shareMenu && (
                <FloatingMenu anchor={shareBtn.current} onClose={() => setShareMenu(false)} width={208} align="right">
                  <button
                    onClick={() => {
                      setShareMenu(false);
                      navigator.clipboard?.writeText(`${window.location.origin}/post/${display.id}`);
                      toast(t('linkCopied'), 'success');
                    }}
                    className={MENU_ITEM}
                  >
                    <Share size={16} /> {t('copyLink')}
                  </button>
                  {typeof navigator !== 'undefined' && !!navigator.share && (
                    <button
                      onClick={async () => {
                        setShareMenu(false);
                        try {
                          await navigator.share({
                            title: `${display.author.displayName} on Chirpergram`,
                            text: content ?? 'Check out this post on Chirpergram',
                            url: `${window.location.origin}/post/${display.id}`,
                          });
                        } catch {
                          /* user dismissed the native sheet */
                        }
                      }}
                      className={MENU_ITEM}
                    >
                      <Share2 size={16} /> {t('shareTo')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShareMenu(false);
                      setSendOpen(true);
                    }}
                    className={MENU_ITEM}
                  >
                    <MessageCircle size={16} /> {t('sendViaMessage')}
                  </button>
                </FloatingMenu>
              )}
            </div>
          </div>
        </div>
      </div>

      {sendOpen && <SendPostModal post={display} content={content} onClose={() => setSendOpen(false)} />}

      <Modal open={quoteOpen} onClose={() => setQuoteOpen(false)} title={t('quotePost')}>
        <PostComposer quotedPostId={display.id} autoFocus placeholder={t('addComment')} onPosted={() => {
          setQuoteOpen(false);
          refreshLists();
        }} />
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
          <UserName user={display.author} compact />{' '}
          <span className="text-slate-500 dark:text-slate-400">@{display.author.username}</span>
          <p className="mt-1 line-clamp-3">{content}</p>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t('editPost')}>
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          maxLength={280}
          rows={4}
          autoFocus
          className="input min-h-32 resize-none rounded-2xl"
        />
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className={`text-sm ${editText.length > 280 ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
            {280 - editText.length}
          </span>
          <button
            onClick={saveEdit}
            disabled={editBusy || editText.trim().length === 0 || editText.length > 280}
            className={buttonClass({ variant: 'primary' })}
          >
            {editBusy ? t('saving') : t('save')}
          </button>
        </div>
      </Modal>

      <Modal open={analyticsOpen} onClose={() => setAnalyticsOpen(false)} title={t('postAnalytics')}>
        {!analytics ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : (
          <div>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{compactNumber(analytics.views)}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">impressions</span>
              <span className="ml-auto rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                {analytics.engagementRate}% engagement
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Likes', analytics.likes],
                ['Reposts', analytics.reposts],
                ['Replies', analytics.replies],
                ['Quotes', analytics.quotes],
                ['Bookmarks', analytics.bookmarks],
                ['Interactions', analytics.interactions],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-slate-200/80 p-3 text-center dark:border-white/10"
                >
                  <p className="text-xl font-semibold tabular-nums">{compactNumber(value as number)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
              Posted {relativeTime(analytics.createdAt)}
            </p>
          </div>
        )}
      </Modal>
    </article>
  );
}

// Picker for sharing a post into one of your existing conversations.
function SendPostModal({ post, content, onClose }: { post: Post; content: string | null; onClose: () => void }) {
  useLocale((s) => s.locale);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () =>
      (await api.get<{ conversations: Conversation[] }>('/conversations')).data.conversations,
  });

  async function send(conversation: Conversation) {
    if (sendingTo) return;
    setSendingTo(conversation.id);
    try {
      await api.post(`/conversations/${conversation.id}/messages`, {
        content: encodePostShare({
          postId: post.id,
          authorUsername: post.author.username,
          authorName: post.author.displayName,
          excerpt: content ?? '',
        }),
      });
      toast(`${t('sentTo')} ${conversation.other.displayName}`, 'success');
      onClose();
    } catch {
      toast('Could not send the post', 'error');
      setSendingTo(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('sendPost')}>
      <div>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : !conversations?.length ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            No conversations yet. Visit a profile to start one.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={!!sendingTo}
                onClick={() => send(c)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-violet-50 disabled:opacity-60 dark:hover:bg-white/[0.06]"
              >
                <Avatar user={c.other} linkable={false} />
                <div className="min-w-0 flex-1">
                  <UserName user={c.other} className="max-w-full" compact />
                  <p className="truncate text-sm text-slate-500 dark:text-slate-400">@{c.other.username}</p>
                </div>
                <span className="text-sm font-semibold text-brand">{sendingTo === c.id ? t('sending') : t('send')}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function QuoteEmbed({ post }: { post: Post }) {
  const navigate = useNavigate();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button')) return; // inner links handle themselves
        navigate(postPath(post.id));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) navigate(postPath(post.id));
      }}
      className="mt-3 cursor-pointer rounded-2xl border border-slate-200 bg-white/70 p-3 transition duration-200 hover:border-brand/30 hover:bg-violet-50/70 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Avatar user={post.author} size="sm" />
        <UserName user={post.author} className="max-w-[45%]" compact />
        <span className="truncate text-slate-500 dark:text-slate-400">@{post.author.username}</span>
      </div>
      {post.content && (
        <div className="mt-2 text-sm leading-5 text-slate-800 dark:text-slate-200">
          <RichText text={post.content} />
        </div>
      )}
      {post.media.length > 0 && <MediaGrid media={post.media.slice(0, 1)} />}
    </div>
  );
}
