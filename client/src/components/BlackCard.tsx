import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Heart, MessageCircle, Repeat2, Volume2, VolumeX } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../store/toast';
import { compactNumber } from '../lib/format';
import { Avatar } from './Avatar';
import { RichText } from './RichText';
import { CommentSheet } from './CommentSheet';
import { GlassPanel, IconButton, PlayButton } from './ui';
import { ICON_SIZE } from '../lib/ui';
import type { Post } from '../types';

// One full-screen "reel" for the Black tab. Media is fitted inside the frame
// (object-contain) so nothing is cropped or overflows.
export function BlackCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(post.viewer.liked);
  const [likes, setLikes] = useState(post.counts.likes);
  const [reposted, setReposted] = useState(post.viewer.reposted);
  const [reposts, setReposts] = useState(post.counts.reposts);
  const [bookmarked, setBookmarked] = useState(post.viewer.bookmarked);
  const [replies, setReplies] = useState(post.counts.replies);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [slide, setSlide] = useState(0);
  const [muted, setMuted] = useState(true);
  const [burst, setBurst] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    setLiked(post.viewer.liked);
    setLikes(post.counts.likes);
    setReposted(post.viewer.reposted);
    setReposts(post.counts.reposts);
    setBookmarked(post.viewer.bookmarked);
    setReplies(post.counts.replies);
  }, [post.viewer, post.counts]);

  async function setLike(next: boolean) {
    if (next === liked) return;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const { data } = next ? await api.post(`/posts/${post.id}/like`) : await api.delete(`/posts/${post.id}/like`);
      setLikes(data.counts.likes);
    } catch {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  }

  async function toggleRepost() {
    const next = !reposted;
    setReposted(next);
    setReposts((n) => n + (next ? 1 : -1));
    try {
      const { data } = next ? await api.post(`/posts/${post.id}/repost`) : await api.delete(`/posts/${post.id}/repost`);
      setReposts(data.counts.reposts);
      toast(next ? 'Reposted' : 'Repost removed', 'success');
    } catch {
      setReposted(!next);
      setReposts((n) => n + (next ? -1 : 1));
    }
  }

  async function toggleBookmark() {
    const next = !bookmarked;
    setBookmarked(next);
    try {
      if (next) await api.post(`/posts/${post.id}/bookmark`);
      else await api.delete(`/posts/${post.id}/bookmark`);
    } catch {
      setBookmarked(!next);
    }
  }

  // Double-tap anywhere on the media to like (TikTok style).
  function onMediaTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      setBurst(true);
      setTimeout(() => setBurst(false), 600);
      setLike(true);
    }
    lastTap.current = now;
  }

  function onScroll() {
    const el = scroller.current;
    if (el) setSlide(Math.round(el.scrollLeft / el.clientWidth));
  }

  const hasVideo = post.media.some((m) => m.type === 'VIDEO');

  return (
    <section className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-[#07090b]">
      <div
        ref={scroller}
        onScroll={onScroll}
        onClick={onMediaTap}
        className="scrollbar-none absolute inset-0 flex touch-pan-x touch-pan-y snap-x snap-mandatory overflow-x-auto"
      >
        {post.media.map((m) => (
          <div key={m.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
            {m.type === 'VIDEO' ? (
              <ReelVideo src={m.url} muted={muted} />
            ) : (
              <img src={m.url} alt="" loading="lazy" draggable={false} className="max-h-full max-w-full object-contain" />
            )}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      {burst && (
        <Heart
          size={96}
          fill="currentColor"
          className="pointer-events-none absolute inset-0 m-auto animate-heart-burst text-brand"
        />
      )}

      {post.media.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] flex justify-center gap-1.5">
          {post.media.map((m, i) => (
            <span key={m.id} className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`} />
          ))}
        </div>
      )}

      {hasVideo && (
        <IconButton
          label={muted ? 'Unmute' : 'Mute'}
          variant="glass"
          size="sm"
          onClick={() => setMuted((v) => !v)}
          className="absolute right-3 top-[4.5rem]"
        >
          {muted ? <VolumeX size={ICON_SIZE.sm} /> : <Volume2 size={ICON_SIZE.sm} />}
        </IconButton>
      )}

      {/* Right action rail */}
      <div className="absolute bottom-[7.5rem] right-3 flex flex-col items-center gap-4 md:bottom-10">
        <Link to={`/${post.author.username}`} aria-label={`@${post.author.username}`} className="rounded-full">
          <Avatar user={post.author} linkable={false} />
        </Link>
        <RailButton label="Like" count={likes} onClick={() => setLike(!liked)}>
          <Heart size={24} className="text-brand" fill={liked ? 'currentColor' : 'none'} />
        </RailButton>
        <RailButton label="Comments" count={replies} onClick={() => setCommentsOpen(true)}>
          <MessageCircle size={24} className="text-brand" />
        </RailButton>
        <RailButton label="Repost" count={reposts} onClick={toggleRepost}>
          <Repeat2 size={24} className="text-brand" strokeWidth={reposted ? 2.8 : 2} />
        </RailButton>
        <RailButton label="Save" onClick={toggleBookmark}>
          <Bookmark size={24} className="text-brand" fill={bookmarked ? 'currentColor' : 'none'} />
        </RailButton>
      </div>

      {/* Author + caption */}
      <div className="absolute bottom-[7.5rem] left-4 right-20 md:bottom-10">
        <Link to={`/${post.author.username}`} className="text-[15px] text-white hover:underline">
          @{post.author.username}
        </Link>
        {post.content && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={`mt-1.5 block w-full text-left text-sm leading-5 text-white/85 ${expanded ? 'max-h-40 overflow-y-auto' : 'line-clamp-2'}`}
          >
            <RichText text={post.content} />
          </button>
        )}
      </div>

      {commentsOpen && (
        <CommentSheet
          postId={post.id}
          count={replies}
          onClose={() => setCommentsOpen(false)}
          onCountChange={(d) => setReplies((n) => n + d)}
        />
      )}
    </section>
  );
}

function RailButton({
  label,
  count,
  onClick,
  children,
}: {
  label: string;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <IconButton label={label} variant="glass" size="lg" onClick={onClick}>
        {children}
      </IconButton>
      {count !== undefined && <span className="text-xs text-white/85 tabular-nums">{compactNumber(count)}</span>}
    </div>
  );
}

// Plays while mostly on screen; tap to pause/resume.
function ReelVideo({ src, muted }: { src: string; muted: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const inView = useRef(false);
  const userPaused = useRef(false);

  // React doesn't reliably sync the `muted` attribute; autoplay needs the DOM property.
  useEffect(() => {
    const el = ref.current;
    if (el) el.muted = muted;
  }, [muted]);

  function tryPlay() {
    const el = ref.current;
    if (!el || userPaused.current) return;
    el.muted = muted;
    el
      .play()
      .then(() => setPaused(false))
      // Browser blocked autoplay: show the play button so a tap starts it.
      .catch(() => setPaused(true));
  }

  useEffect(() => {
    const target = box.current;
    const el = ref.current;
    if (!target || !el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView.current = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        if (inView.current) {
          tryPlay();
        } else {
          el.pause();
          el.currentTime = 0;
          userPaused.current = false;
          setPaused(false);
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      userPaused.current = false;
      el.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      userPaused.current = true;
      el.pause();
      setPaused(true);
    }
  }

  return (
    <div ref={box} className="relative flex h-full w-full items-center justify-center" onClick={toggle}>
      <video
        ref={ref}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onCanPlay={() => {
          setFailed(false);
          if (inView.current) tryPlay();
        }}
        onError={() => setFailed(true)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) setProgress(v.currentTime / v.duration);
        }}
        className="max-h-full max-w-full object-contain"
      />
      {failed && (
        <GlassPanel className="pointer-events-none absolute px-4 py-2 text-sm text-white">
          This video can&rsquo;t be played in your browser
        </GlassPanel>
      )}
      {paused && !failed && (
        // Clicks bubble to the reel container, which owns the toggle.
        <PlayButton size="lg" subject="video" className="absolute h-16 w-16" />
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
        <span className="block h-full bg-brand" style={{ width: `${progress * 100}%` }} />
      </span>
    </div>
  );
}
