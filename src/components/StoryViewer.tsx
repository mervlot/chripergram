import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eye, Send, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import { encodeStoryReply } from '../lib/messageCards';
import { useAuth } from '../store/auth';
import { useToast } from '../store/toast';
import { useT } from '../lib/i18n';
import { Avatar } from './Avatar';
import { relativeTime } from '../lib/format';
import { GlassPanel, IconButton } from './ui';
import { ICON_SIZE } from '../lib/ui';
import type { Conversation, StoryGroup, StoryViewerEntry } from '../types';

const QUICK_STORY_REACTIONS = ['❤️', '😂', '😮', '🔥', '👏', '😢'];

const IMAGE_DURATION_MS = 5000;
const TICK_MS = 50;

// Full-screen Instagram-style story viewer: segmented progress bars,
// auto-advance, hold to pause, tap left/right or arrow keys to navigate.
export function StoryViewer({
  groups,
  initialGroup,
  onClose,
}: {
  groups: StoryGroup[];
  initialGroup: number;
  onClose: () => void;
}) {
  const t = useT();
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const toast = useToast((s) => s.show);
  // Track the current group by author id (stable across cache refreshes that
  // reorder or remove groups), and the story by index within that group.
  const [authorId, setAuthorId] = useState<string | undefined>(groups[initialGroup]?.author.id);
  const [sIdxRaw, setSIdx] = useState(() => {
    // Start a group at its first unseen story.
    const first = groups[initialGroup]?.stories.findIndex((s) => !s.viewed) ?? 0;
    return first === -1 ? 0 : first;
  });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<StoryViewerEntry[] | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyFocused, setReplyFocused] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const elapsedRef = useRef(0);

  const gIdx = groups.findIndex((g) => g.author.id === authorId);
  const group = gIdx === -1 ? undefined : groups[gIdx];
  const sIdx = group ? Math.min(sIdxRaw, group.stories.length - 1) : 0;
  const story = group?.stories[sIdx];
  const mine = !!me && group?.author.id === me.id;

  // Close when the current group disappears from the cache (e.g. its last
  // story was deleted or expired during a refresh).
  useEffect(() => {
    if (!group) onClose();
  }, [group, onClose]);

  const resetTimer = () => {
    setProgress(0);
    elapsedRef.current = 0;
    setViewersOpen(false);
    setReplyText('');
    setReplyFocused(false);
  };

  const goNext = useCallback(() => {
    if (!group) return;
    resetTimer();
    if (sIdx + 1 < group.stories.length) {
      setSIdx(sIdx + 1);
    } else if (gIdx + 1 < groups.length) {
      setAuthorId(groups[gIdx + 1].author.id);
      setSIdx(0);
    } else {
      onClose();
    }
  }, [gIdx, sIdx, group, groups, onClose]);

  const goPrev = useCallback(() => {
    if (!group) return;
    resetTimer();
    if (sIdx > 0) {
      setSIdx(sIdx - 1);
    } else if (gIdx > 0) {
      const prev = groups[gIdx - 1];
      setAuthorId(prev.author.id);
      setSIdx(prev.stories.length - 1);
    }
  }, [gIdx, sIdx, group, groups]);

  // Mark the visible story as viewed and reflect it in the stories cache.
  useEffect(() => {
    if (!story || !group || mine || story.viewed) return;
    api.post(`/stories/${story.id}/view`).catch(() => {});
    queryClient.setQueryData<StoryGroup[]>(['stories'], (current) =>
      current?.map((g) =>
        g.author.id !== group.author.id
          ? g
          : {
              ...g,
              stories: g.stories.map((s) => (s.id === story.id ? { ...s, viewed: true } : s)),
              allViewed: g.stories.every((s) => s.id === story.id || s.viewed),
            },
      ),
    );
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live view counter for the author: bump the count when someone watches
  // the story that is currently open.
  useEffect(() => {
    if (!mine) return;
    const socket = getSocket();
    if (!socket) return;
    const onViewed = (p: { storyId: string }) => {
      queryClient.setQueryData<StoryGroup[]>(['stories'], (current) =>
        current?.map((g) => ({
          ...g,
          stories: g.stories.map((s) =>
            s.id === p.storyId ? { ...s, viewCount: s.viewCount + 1 } : s,
          ),
        })),
      );
    };
    socket.on('story:viewed', onViewed);
    return () => {
      socket.off('story:viewed', onViewed);
    };
  }, [mine, queryClient]);

  const held = paused || viewersOpen || replyFocused;

  // Timer for image stories (videos drive progress via timeupdate).
  useEffect(() => {
    if (!story || story.mediaType !== 'IMAGE') return;
    if (held) return;
    const timer = setInterval(() => {
      elapsedRef.current += TICK_MS;
      const p = elapsedRef.current / IMAGE_DURATION_MS;
      if (p >= 1) goNext();
      else setProgress(p);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [story?.id, story?.mediaType, held, goNext]);

  // Pause/resume the video element together with the hold-to-pause state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (held) video.pause();
    else video.play().catch(() => {});
  }, [held, story?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.key === 'Escape') onClose();
      else if (typing) return;
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [goNext, goPrev, onClose]);

  async function openViewers() {
    setViewersOpen(true);
    setViewers(null);
    try {
      const { data } = await api.get<{ viewers: StoryViewerEntry[] }>(`/stories/${story!.id}/viewers`);
      setViewers(data.viewers);
    } catch {
      setViewers([]);
    }
  }

  // Sends a reply (text or quick emoji) to the story's author as a DM
  // carrying a compact story card.
  async function sendReply(text: string) {
    if (!story || !group || replySending) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    setReplySending(true);
    try {
      const { data } = await api.post<{ conversation: Conversation }>('/conversations', {
        username: group.author.username,
      });
      await api.post(`/conversations/${data.conversation.id}/messages`, {
        content: encodeStoryReply({
          mediaUrl: story.mediaUrl,
          mediaType: story.mediaType,
          caption: story.caption ?? '',
          text: trimmed,
        }),
      });
      setReplyText('');
      setReplyFocused(false);
      toast(t('replySent'), 'success');
    } catch (err) {
      toast(errorMessage(err, 'Could not send reply'), 'error');
    } finally {
      setReplySending(false);
    }
  }

  async function removeStory() {
    if (!story || !group) return;
    try {
      await api.delete(`/stories/${story.id}`);
      toast(t('storyDeleted'));
      // Remove the story from the cache immutably; empty groups drop out and
      // the "group disappeared" effect closes the viewer if needed.
      const removedId = story.id;
      queryClient.setQueryData<StoryGroup[]>(['stories'], (current) =>
        (current ?? [])
          .map((g) =>
            g.author.id !== group.author.id
              ? g
              : {
                  ...g,
                  stories: g.stories.filter((s) => s.id !== removedId),
                  allViewed: g.stories.filter((s) => s.id !== removedId).every((s) => s.viewed),
                }
          )
          .filter((g) => g.stories.length > 0),
      );
      setSIdx((cur) => Math.max(0, cur - 1));
      setProgress(0);
      elapsedRef.current = 0;
    } catch (err) {
      toast(errorMessage(err, 'Could not delete story'));
    }
  }

  if (!story || !group) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 animate-fade-in">
      {/* Desktop side arrows */}
      {(gIdx > 0 || sIdx > 0) && (
        <IconButton
          label="Previous story"
          variant="glass"
          onClick={goPrev}
          className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 sm:inline-flex"
        >
          <ChevronLeft size={ICON_SIZE.lg} />
        </IconButton>
      )}
      <IconButton
        label="Next story"
        variant="glass"
        onClick={goNext}
        className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 sm:inline-flex"
      >
        <ChevronRight size={ICON_SIZE.lg} />
      </IconButton>

      <div
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-black sm:h-[92dvh] sm:rounded-2xl"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {/* Progress segments */}
        <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          {group.stories.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <div
                className={`h-full rounded-full bg-white ${
                  i === sIdx ? 'transition-[width] duration-100 ease-linear' : ''
                }`}
                style={{ width: i < sIdx ? '100%' : i === sIdx ? `${progress * 100}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute inset-x-0 top-4 z-20 flex items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
          <Avatar user={group.author} size="sm" linkable={false} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{group.author.displayName}</p>
            <p className="text-[11px] font-medium text-white/70">{relativeTime(story.createdAt)} {t('ago')}</p>
          </div>
          {mine && (
            <IconButton label="Delete story" variant="glass" size="sm" onClick={removeStory}>
              <Trash2 size={ICON_SIZE.sm} />
            </IconButton>
          )}
          <IconButton label="Close stories" variant="glass" size="sm" onClick={onClose}>
            <X size={ICON_SIZE.md} />
          </IconButton>
        </div>

        {/* Media */}
        <div className="flex flex-1 items-center justify-center">
          {story.mediaType === 'VIDEO' ? (
            <video
              ref={videoRef}
              key={story.id}
              src={story.mediaUrl}
              autoPlay
              playsInline
              className="max-h-full w-full animate-story-in object-contain"
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration > 0) setProgress(v.currentTime / v.duration);
              }}
              onEnded={goNext}
            />
          ) : (
            <img key={story.id} src={story.mediaUrl} className="max-h-full w-full animate-story-in object-contain" alt="" />
          )}
        </div>

        {/* Tap zones (below header/footer controls) */}
        <button className="absolute inset-y-0 left-0 z-10 w-1/3" onClick={goPrev} aria-label="Previous" />
        <button className="absolute inset-y-0 right-0 z-10 w-2/3" onClick={goNext} aria-label="Next" />

        {/* Caption + own-story viewers / reply bar */}
        <div className="absolute inset-x-0 bottom-0 z-20 space-y-2.5 bg-gradient-to-t from-black/75 to-transparent p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {story.caption && <p className="text-sm font-medium text-white">{story.caption}</p>}
          {mine ? (
            <button
              onClick={openViewers}
              className="flex items-center gap-1.5 text-sm font-semibold text-white/90 transition hover:text-white"
            >
              <Eye size={16} /> {story.viewCount} {story.viewCount === 1 ? t('view') : t('views')}
            </button>
          ) : (
            <div className="space-y-2.5">
              {replyFocused && (
                <div className="flex animate-slide-up items-center justify-between px-1">
                  {QUICK_STORY_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`React with ${emoji}`}
                      disabled={replySending}
                      onClick={() => sendReply(emoji)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition hover:scale-125 active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendReply(replyText);
                }}
              >
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={() => setReplyFocused(true)}
                  onBlur={() => setTimeout(() => setReplyFocused(false), 150)}
                  placeholder={`${t('replyToStory')} ${group.author.displayName}...`}
                  className="min-h-11 min-w-0 flex-1 rounded-full border border-white/30 bg-white/10 px-4 text-sm text-white outline-none backdrop-blur transition placeholder:text-white/60 focus:border-white/60 focus:bg-white/15"
                />
                {replyText.trim() && (
                  <IconButton type="submit" label="Send reply" variant="primary" loading={replySending}>
                    <Send size={ICON_SIZE.md} />
                  </IconButton>
                )}
              </form>
            </div>
          )}
        </div>

        {/* Viewers sheet */}
        {viewersOpen && (
          <GlassPanel
            edge="bottom"
            className="absolute inset-x-0 bottom-0 z-30 max-h-[55%] animate-slide-up overflow-y-auto rounded-t-2xl p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-white">{t('viewers')}</p>
              <IconButton label="Close viewers" size="sm" onClick={() => setViewersOpen(false)}>
                <X size={ICON_SIZE.md} />
              </IconButton>
            </div>
            {viewers === null ? (
              <p className="py-4 text-center text-sm text-stone-400">{t('loading')}</p>
            ) : viewers.length === 0 ? (
              <p className="py-4 text-center text-sm text-stone-400">{t('noViewsYet')}</p>
            ) : (
              viewers.map((v) => (
                <div key={v.id} className="flex items-center gap-3 py-2">
                  <Avatar user={v} size="sm" linkable={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{v.displayName}</p>
                    <p className="truncate text-xs text-stone-400">@{v.username}</p>
                  </div>
                  <span className="text-xs text-stone-400">{relativeTime(v.viewedAt)}</span>
                </div>
              ))
            )}
          </GlassPanel>
        )}
      </div>
    </div>,
    document.body,
  );
}
