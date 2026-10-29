import { useEffect, useRef, useState } from 'react';
import { PostCard } from './PostCard';
import { trackView } from '../lib/views';
import type { Post } from '../types';

interface Props {
  posts: Post[];
  subscribeRealtime?: boolean;
}

const DEFAULT_ROW_HEIGHT = 240;
// Rows farther than this from the viewport are unmounted and replaced by a spacer of
// their measured height, so a 1,000-post session costs about as much as ~15 posts.
const WINDOW_MARGIN = '1600px 0px';

// Measured row heights survive unmounts (and navigating to a post and back), which keeps
// the scroll offset exact when a feed is restored.
const rowHeights = new Map<string, number>();
const MAX_REMEMBERED = 4000;

function remember(id: string, height: number) {
  if (height <= 0) return;
  if (rowHeights.size >= MAX_REMEMBERED) {
    const oldest = rowHeights.keys().next().value;
    if (oldest !== undefined) rowHeights.delete(oldest);
  }
  rowHeights.set(id, Math.round(height));
}

function FeedRow({ post, index, subscribeRealtime }: { post: Post; index: number; subscribeRealtime?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(true);
  const viewedId = (post.repostOf && !post.content && post.media.length === 0 ? post.repostOf.id : post.id) as string;

  // Window: mount only while near the viewport.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => setMounted(entries[entries.length - 1].isIntersecting), {
      rootMargin: WINDOW_MARGIN,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure while mounted so the spacer matches exactly.
  useEffect(() => {
    const el = ref.current;
    if (!el || !mounted || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.borderBoxSize?.[0];
      remember(post.id, box ? box.blockSize : el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [post.id, mounted]);

  // Impression: >=60% visible for 700ms counts as "seen".
  useEffect(() => {
    const el = ref.current;
    if (!el || !mounted || typeof IntersectionObserver === 'undefined') return;
    let dwell: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          dwell ??= setTimeout(() => trackView(viewedId), 700);
        } else if (dwell) {
          clearTimeout(dwell);
          dwell = undefined;
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(el);
    return () => {
      if (dwell) clearTimeout(dwell);
      observer.disconnect();
    };
  }, [viewedId, mounted]);

  return (
    <div ref={ref} style={mounted ? undefined : { height: rowHeights.get(post.id) ?? DEFAULT_ROW_HEIGHT }}>
      {mounted && <PostCard post={post} index={index} subscribeRealtime={subscribeRealtime} />}
    </div>
  );
}

// Plain flow layout with windowed rows. Keys are post ids so rows keep their identity when
// pages are appended by infinite scroll.
export function VirtualizedPostList({ posts, subscribeRealtime }: Props) {
  return (
    <div>
      {posts.map((post, index) => (
        <FeedRow key={post.id} post={post} index={index} subscribeRealtime={subscribeRealtime} />
      ))}
    </div>
  );
}
