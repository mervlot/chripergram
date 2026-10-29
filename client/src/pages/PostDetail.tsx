import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Image as ImageIcon, Maximize2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { PageHeader } from '../components/PageHeader';
import { PostCard } from '../components/PostCard';
import { FocusedPost } from '../components/FocusedPost';
import { ReplyThread, type ReplySort } from '../components/ReplyThread';
import { PostComposer } from '../components/PostComposer';
import { Avatar } from '../components/Avatar';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/Spinner';
import { GlassPopover, MenuItem } from '../components/ui';
import { FOCUS_RING, RADIUS, glass } from '../lib/ui';
import { bumpReplyCount, hasInAppHistory, planPostBack } from '../lib/postNav';
import type { Post } from '../types';

// X-style post page at /post/:id. Every reply is its own post: tapping one PUSHES
// /post/:replyId, so the URL, the primary post and browser history always agree, and the
// back arrow (or the browser's back button) simply walks that history.
//
// The page is keyed by post id: moving between posts re-mounts it, so the sort menu, the
// reply dialog and the scroll-into-view logic never leak from one post to the next.
export function PostDetail() {
  const { id = '' } = useParams();
  return <PostDetailPage key={id} id={id} />;
}

function PostDetailPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const navType = useNavigationType();
  const focusRef = useRef<HTMLDivElement>(null);
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<ReplySort>('top');
  const [sortMenu, setSortMenu] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['thread', id],
    queryFn: async () =>
      (await api.get<{ post: Post; ancestors: Post[]; rootId?: string }>(`/posts/${id}/thread`)).data,
  });

  // Arriving by tapping a reply: bring the primary post to the top of the screen, with the
  // conversation above it one scroll away (like X). Back/forward restores its own offset.
  useEffect(() => {
    if (!data || navType === 'POP' || data.ancestors.length === 0) return;
    focusRef.current?.scrollIntoView({ block: 'start' });
  }, [data?.post.id, navType]); // eslint-disable-line react-hooks/exhaustive-deps

  function goBack() {
    // In-app history exists: just go back through it (D -> C -> B -> A -> feed).
    // Opened directly (shared link, notification, refresh of a first entry): fall back to the
    // conversation root, or Home when this already is the root. `replace` keeps that fallback
    // from becoming a loop of its own.
    const plan = planPostBack(hasInAppHistory(), id, data?.rootId ?? data?.ancestors[0]?.id);
    if (plan.type === 'history') navigate(-1);
    else navigate(plan.to, { replace: true });
  }

  return (
    <div>
      <PageHeader title="Post" back onBack={goBack} />

      {isLoading && <Spinner />}
      {isError && <p className="p-6 text-center text-red-500">This post could not be found.</p>}

      {data && (
        <>
          {/* Conversation above this post */}
          {data.ancestors.map((p) => (
            <PostCard key={p.id} post={p} variant="flat" showThreadLine />
          ))}

          <div ref={focusRef} className="scroll-mt-16">
            <FocusedPost post={data.post} hasAncestor={data.ancestors.length > 0} onReply={() => setReplyOpen(true)} />
          </div>

          <div className="relative flex items-center justify-between border-y border-white/[0.07] px-4 py-3 text-[15px] font-semibold text-slate-400">
            <button onClick={() => setSortMenu((o) => !o)} className="flex items-center gap-1 hover:text-slate-200">
              {sort === 'top' ? 'Relevant' : 'Latest'} <ChevronDown size={16} />
            </button>
            {sortMenu && (
              <GlassPopover className="absolute left-3 top-11 z-10 w-40">
                {(
                  [
                    ['top', 'Relevant'],
                    ['new', 'Latest'],
                  ] as const
                ).map(([value, label]) => (
                  <MenuItem
                    key={value}
                    role="menuitemradio"
                    aria-checked={sort === value}
                    onClick={() => {
                      setSort(value);
                      setSortMenu(false);
                    }}
                    className={sort === value ? 'text-brand' : undefined}
                  >
                    {label}
                  </MenuItem>
                ))}
              </GlassPopover>
            )}
            <Link to={`/post/${id}/quotes`} className="flex items-center gap-1 hover:text-slate-200">
              View quotes <ChevronRight size={16} />
            </Link>
          </div>

          <ReplyThread postId={id} sort={sort} />

          {/* Pinned reply bar */}
          <div className="sticky bottom-0 z-30 mt-6 px-3 pb-[calc(env(safe-area-inset-bottom)+0.6rem)]">
            <button
              type="button"
              onClick={() => setReplyOpen(true)}
              className={glass('floating', RADIUS.pill, FOCUS_RING, 'flex min-h-14 w-full items-center gap-3 px-3 text-left')}
            >
              {me && <Avatar user={me} size="sm" linkable={false} />}
              <span className="flex-1 text-slate-500">Post your reply</span>
              <ImageIcon size={20} className="text-brand" />
              <span className="rounded border border-brand px-1 text-[10px] font-bold text-brand">GIF</span>
              <Maximize2 size={18} className="text-brand" />
            </button>
          </div>

          <Modal open={replyOpen} onClose={() => setReplyOpen(false)} title="Reply">
            <PostComposer
              parentId={data.post.id}
              autoFocus
              placeholder="Post your reply"
              onPosted={() => {
                setReplyOpen(false);
                queryClient.invalidateQueries({ queryKey: ['replies', id] });
                // Patch counters in place. Refetching the ranked feeds would reorder them.
                queryClient.setQueryData<typeof data>(['thread', id], (old) =>
                  old ? { ...old, post: { ...old.post, counts: { ...old.post.counts, replies: old.post.counts.replies + 1 } } } : old,
                );
                queryClient.invalidateQueries({ queryKey: ['thread'], refetchType: 'none' });
                bumpReplyCount(queryClient, id);
              }}
            />
          </Modal>
        </>
      )}
    </div>
  );
}
