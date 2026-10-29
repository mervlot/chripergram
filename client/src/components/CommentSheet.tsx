import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Heart, Send, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { toast } from '../store/toast';
import { useAuth } from '../store/auth';
import { relativeTime, compactNumber } from '../lib/format';
import { useIntersection } from '../hooks/useIntersection';
import { Avatar } from './Avatar';
import { RichText } from './RichText';
import { Spinner } from './Spinner';
import { GlassSheet, IconButton } from './ui';
import { ICON_SIZE } from '../lib/ui';
import type { Post } from '../types';
import { mergeThreadRows, replyAttribution, uniqueById } from './commentThread';

interface Props {
  postId: string;
  count: number;
  onClose: () => void;
  onCountChange: (delta: number) => void;
}

// Who the next comment answers. `id` becomes the new comment's real parentId; `rootId` is the
// top-level comment whose thread it appears in (the same as `id` when replying to that comment).
type ReplyTarget = { id: string; username: string; displayName: string; authorId: string; rootId: string };
type Expand = { rootId: string; n: number };
type ThreadPage = { items: Post[]; nextCursor: string | null; total: number };

// TikTok-style bottom sheet. Top-level comments are ranked by engagement (likes + replies).
// Under each one there is a single, flat reply list holding every descendant (replies to
// replies included), oldest first, each labelled "Replying to @name" when it answers someone
// other than the comment owner. The flattening is presentation only: every reply keeps its
// real parentId, and the server (GET /posts/:id/replies/flat) supplies rootCommentId and
// replyTo from those links.
export function CommentSheet({ postId, count, onClose, onCountChange }: Props) {
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [expand, setExpand] = useState<Expand | null>(null);
  // Replies the viewer just posted, per top-level comment, newest first.
  const [fresh, setFresh] = useState<Record<string, Post[]>>({});
  const sending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const query = useInfiniteQuery({
    queryKey: ['black-comments', postId],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<{ items: Post[]; nextCursor: string | null }>(`/posts/${postId}/replies`, {
        params: { cursor: pageParam, sort: 'top' },
      });
      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const sentinel = useIntersection(
    () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
    !!query.hasNextPage && !query.isFetchingNextPage,
  );

  const comments = uniqueById(query.data?.pages.flatMap((p) => p.items) ?? []);

  async function send() {
    const content = text.trim();
    // A ref, not state: two taps in the same frame must not create two comments.
    if (!content || sending.current) return;
    sending.current = true;
    const target = replyTo;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('content', content);
      form.append('parentId', target?.id ?? postId); // the real parent, even for a reply to a reply
      const { data } = await api.post<{ post: Post }>('/posts', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setText('');
      setReplyTo(null);
      if (target) {
        const item: Post = {
          ...data.post,
          depth: undefined,
          rootCommentId: target.rootId,
          replyTo: { id: target.authorId, username: target.username, displayName: target.displayName },
        };
        setFresh((f) => ({ ...f, [target.rootId]: [item, ...(f[target.rootId] ?? []).filter((p) => p.id !== item.id)] }));
        // If this thread is already loaded, keep its total in step; otherwise the first fetch counts it.
        queryClient.setQueryData<{ pages: ThreadPage[]; pageParams: unknown[] }>(
          ['black-comments-flat', target.rootId],
          (old) => (old ? { ...old, pages: old.pages.map((pg) => ({ ...pg, total: pg.total + 1 })) } : old),
        );
        queryClient.invalidateQueries({ queryKey: ['black-comments-flat', target.rootId], refetchType: 'none' });
        setExpand({ rootId: target.rootId, n: Date.now() });
      } else {
        onCountChange(1);
        await queryClient.invalidateQueries({ queryKey: ['black-comments', postId] });
      }
      // Other screens showing this post's replies pick the change up next time they open.
      queryClient.invalidateQueries({ queryKey: ['thread', postId], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['replies', postId], refetchType: 'none' });
    } catch (err) {
      // The draft and the reply target stay, so it can simply be sent again.
      toast(errorMessage(err, 'Could not post comment'), 'error');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 animate-fade-in"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <GlassSheet
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
        className="h-[72dvh] w-full max-w-[520px] animate-slide-up sm:rounded-b-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex shrink-0 flex-col items-center px-4 pb-3 pt-2.5">
          <span className="mb-2 h-1 w-10 rounded-full bg-white/20" />
          <h3 className="text-sm text-stone-200">
            {compactNumber(count)} {count === 1 ? 'comment' : 'comments'}
          </h3>
          <IconButton label="Close comments" size="sm" onClick={onClose} className="absolute right-2 top-2">
            <X size={ICON_SIZE.md} />
          </IconButton>
        </div>

        <div className="scrollbar-none flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.07] px-4 py-3">
          {query.isLoading ? (
            <Spinner />
          ) : comments.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-500">No comments yet. Start the conversation.</p>
          ) : (
            <ul className="space-y-5">
              {comments.map((c) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  fresh={fresh[c.id] ?? NO_ROWS}
                  expand={expand}
                  onNavigate={onClose}
                  onReply={(t) => {
                    setReplyTo(t);
                    inputRef.current?.focus();
                  }}
                />
              ))}
            </ul>
          )}
          <div ref={sentinel} />
          {query.isFetchingNextPage && <Spinner />}
        </div>

        {replyTo && (
          <div className="flex shrink-0 items-center justify-between border-t border-white/[0.07] bg-white/[0.03] px-4 py-1.5 text-xs text-stone-400">
            <span>
              Replying to <span className="text-stone-200">@{replyTo.username}</span>
            </span>
            <IconButton label="Cancel reply" size="sm" onClick={() => setReplyTo(null)}>
              <X size={ICON_SIZE.sm} />
            </IconButton>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-2.5 border-t border-white/[0.07] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
          {me && <Avatar user={me} size="sm" linkable={false} />}
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
            maxLength={280}
            placeholder={replyTo ? `Reply to @${replyTo.username}...` : 'Add comment...'}
            className="input min-h-10 flex-1 rounded-full px-4 py-2 text-sm"
          />
          <IconButton label="Send comment" variant="primary" onClick={send} disabled={!text.trim()} loading={busy}>
            <Send size={ICON_SIZE.md} />
          </IconButton>
        </div>
      </GlassSheet>
    </div>,
    document.body,
  );
}

function useLike(comment: Post) {
  const [liked, setLiked] = useState(comment.viewer.liked);
  const [likes, setLikes] = useState(comment.counts.likes);
  async function toggle() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const { data } = next
        ? await api.post(`/posts/${comment.id}/like`)
        : await api.delete(`/posts/${comment.id}/like`);
      setLikes(data.counts.likes);
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  }
  return { liked, likes, toggle };
}

function LikeButton({ like }: { like: ReturnType<typeof useLike> }) {
  return (
    <button onClick={like.toggle} aria-label="Like comment" aria-pressed={like.liked} className="flex w-9 shrink-0 flex-col items-center gap-0.5 pt-1">
      <Heart size={16} className="text-brand" fill={like.liked ? 'currentColor' : 'none'} />
      {like.likes > 0 && <span className="text-[11px] tabular-nums text-stone-500">{compactNumber(like.likes)}</span>}
    </button>
  );
}

const LINE = 'bg-white/15';
const NO_ROWS: Post[] = [];
const THREAD_PAGE = 10;

const targetOf = (p: Post, rootId: string): ReplyTarget => ({
  id: p.id,
  username: p.author.username,
  displayName: p.author.displayName,
  authorId: p.author.id,
  rootId,
});

// A top-level comment and its flat reply list (loaded on demand, cursor-paginated).
function CommentRow({
  comment,
  fresh,
  expand,
  onNavigate,
  onReply,
}: {
  comment: Post;
  fresh: Post[];
  expand: Expand | null;
  onNavigate: () => void;
  onReply: (t: ReplyTarget) => void;
}) {
  const like = useLike(comment);
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(0);

  const thread = useInfiniteQuery({
    queryKey: ['black-comments-flat', comment.id],
    queryFn: async ({ pageParam }) =>
      (await api.get<ThreadPage>(`/posts/${comment.id}/replies/flat`, { params: { cursor: pageParam, limit: THREAD_PAGE } }))
        .data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  });

  const fetched = thread.data?.pages.flatMap((p) => p.items) ?? [];
  const replies = mergeThreadRows(fresh, fetched);
  const loadedTotal = thread.data?.pages[thread.data.pages.length - 1]?.total;
  // `counts.replies` is only the DIRECT replies; `threadCount` covers every depth.
  const total = loadedTotal ?? (comment.threadCount ?? comment.counts.replies) + bump;
  const remaining = Math.max(0, total - replies.length);

  // A reply was just posted somewhere in this thread: show the thread.
  useEffect(() => {
    if (expand && expand.rootId === comment.id) {
      setOpen(true);
      setBump((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expand?.n]);

  const hasReplies = total > 0 || replies.length > 0;

  return (
    <li className="relative">
      {/* Thread rail: joins the comment to the replies under it. */}
      {open && replies.length > 0 && <span className={`absolute left-4 top-10 bottom-3 w-px -translate-x-1/2 ${LINE}`} />}

      <div className="flex gap-3">
        <Avatar user={comment.author} size="sm" />
        <div className="min-w-0 flex-1">
          <Link to={`/${comment.author.username}`} onClick={onNavigate} className="text-xs font-semibold text-stone-400 hover:underline">
            {comment.author.username}
          </Link>
          {comment.content && (
            <p className="mt-0.5 break-words text-sm leading-5 text-stone-200">
              <RichText text={comment.content} />
            </p>
          )}
          <p className="mt-1 flex items-center gap-4 text-xs text-stone-600">
            <span>{relativeTime(comment.createdAt)}</span>
            <button
              onClick={() => onReply(targetOf(comment, comment.id))}
              className="font-semibold text-stone-500 hover:text-stone-200"
            >
              Reply
            </button>
          </p>
        </div>
        <LikeButton like={like} />
      </div>

      {open && (
        <ul className="ml-11 mt-3">
          {thread.isLoading && <Spinner />}
          {thread.isError && fetched.length === 0 && (
            <li className="pb-3 text-xs text-stone-500">
              Couldn’t load replies.{' '}
              <button onClick={() => thread.refetch()} className="font-semibold text-stone-300 hover:underline">
                Retry
              </button>
            </li>
          )}
          {replies.map((r) => (
            <ReplyRow key={r.id} item={r} rootId={comment.id} onNavigate={onNavigate} onReply={onReply} />
          ))}
        </ul>
      )}

      {hasReplies && (
        <div className="ml-11 mt-1 flex items-center gap-4">
          {(!open || remaining > 0) && (
            <button
              onClick={() => (open ? thread.fetchNextPage() : setOpen(true))}
              disabled={thread.isFetchingNextPage}
              className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-300"
            >
              <span className="h-px w-5 bg-stone-700" />
              {open
                ? thread.isFetchingNextPage
                  ? 'Loading…'
                  : `View ${compactNumber(remaining)} more ${remaining === 1 ? 'reply' : 'replies'}`
                : `View ${compactNumber(total)} ${total === 1 ? 'reply' : 'replies'}`}
              <ChevronDown size={13} />
            </button>
          )}
          {open && (
            <button
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 text-xs font-semibold text-stone-600 hover:text-stone-300"
            >
              Hide <ChevronUp size={13} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// One reply in a thread. Every reply sits on the same level, whatever its real depth; a
// small "Replying to @name" label (from the real parent) says whom it answers.
function ReplyRow({
  item,
  rootId,
  onNavigate,
  onReply,
}: {
  item: Post;
  rootId: string;
  onNavigate: () => void;
  onReply: (t: ReplyTarget) => void;
}) {
  const like = useLike(item);
  const answering = replyAttribution(item, rootId);

  return (
    <li className="flex gap-2.5 pb-4">
      <Avatar user={item.author} size="xs" />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
          <Link to={`/${item.author.username}`} onClick={onNavigate} className="truncate font-semibold text-stone-400 hover:underline">
            {item.author.username}
          </Link>
          {answering && (
            <span className="truncate text-stone-600">
              · Replying to{' '}
              <Link to={`/${answering}`} onClick={onNavigate} className="font-semibold text-stone-500 hover:underline">
                @{answering}
              </Link>
            </span>
          )}
        </p>
        {item.content && (
          <p className="mt-0.5 break-words text-sm leading-5 text-stone-200">
            <RichText text={item.content} />
          </p>
        )}
        <p className="mt-1 flex items-center gap-4 text-xs text-stone-600">
          <span>{relativeTime(item.createdAt)}</span>
          <button
            onClick={() => onReply(targetOf(item, rootId))}
            className="font-semibold text-stone-500 hover:text-stone-200"
          >
            Reply
          </button>
        </p>
      </div>
      <LikeButton like={like} />
    </li>
  );
}
