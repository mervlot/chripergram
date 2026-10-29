import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Smile, ListTodo, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';
import { useT } from '../lib/i18n';
import { toast } from '../store/toast';
import { Avatar } from './Avatar';
import { ProgressRing } from './ProgressRing';
import { EmojiPicker } from './EmojiPicker';
import { MentionAutocomplete, detectToken, type ActiveToken, type Suggestion } from './MentionAutocomplete';
import type { Post } from '../types';
import { buttonClass, cn, iconButtonClass, ICON_SIZE } from '../lib/ui';
import { IconButton } from './ui';

const MAX = 280;
const MAX_FILES = 4;
const DRAFT_KEY = 'murmur:composer-draft';

interface Props {
  placeholder?: string;
  parentId?: string;
  quotedPostId?: string;
  communityId?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onPosted?: (post: Post) => void;
}

interface Attachment {
  file: File;
  preview: string;
}

// Shared composer for top-level posts, replies and quotes.
export function PostComposer({
  placeholder,
  parentId,
  quotedPostId,
  communityId,
  autoFocus,
  compact,
  onPosted,
}: Props) {
  const t = useT();
  const user = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  // Top-level composers share a persisted draft so an accidental refresh or
  // closed modal never loses a half-written post.
  const isDraftable = !parentId && !quotedPostId && !communityId;
  const [text, setText] = useState(() => {
    if (!isDraftable) return '';
    try {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [files, setFiles] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [token, setToken] = useState<ActiveToken | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [pollOptions, setPollOptions] = useState<string[] | null>(null); // null = no poll
  const [pollHours, setPollHours] = useState(24);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist the draft (debounced) while typing; cleared on publish.
  useEffect(() => {
    if (!isDraftable) return;
    const timer = setTimeout(() => {
      try {
        if (text.trim()) localStorage.setItem(DRAFT_KEY, text);
        else localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* storage full/unavailable — drafts are best-effort */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [text, isDraftable]);

  const POLL_DURATIONS: Array<[label: string, hours: number]> = [
    [t('hour1'), 1],
    [t('hours6'), 6],
    [t('day1'), 24],
    [t('days3'), 72],
    [t('days7'), 168],
  ];

  function syncToken(value: string, caret: number) {
    const next = detectToken(value, caret);
    setToken(next);
    if (!next) setSuggestions([]);
    setActiveSuggestion(0);
  }

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    syncToken(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  // Replace the active @/# token with the chosen suggestion and re-place caret.
  function applySuggestion(s: Suggestion) {
    if (!token) return;
    const before = text.slice(0, token.start);
    const after = text.slice(token.end);
    const next = before + s.value + after;
    setText(next);
    setToken(null);
    setSuggestions([]);
    const caret = before.length + s.value.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (token && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestion((i) => (i + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[activeSuggestion]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setToken(null);
        setSuggestions([]);
      }
    }
  }

  const remaining = MAX - text.length;
  const overLimit = remaining < 0;
  const pollActive = pollOptions !== null;
  const pollReady = !pollActive || pollOptions.filter((o) => o.trim()).length >= 2;
  const canSubmit =
    (text.trim().length > 0 || files.length > 0) &&
    !overLimit &&
    !submitting &&
    pollReady &&
    // A poll requires question text.
    (!pollActive || text.trim().length > 0);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) break;
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setFiles(next);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      if (text.trim()) form.append('content', text.trim());
      if (parentId) form.append('parentId', parentId);
      if (quotedPostId) form.append('quotedPostId', quotedPostId);
      if (communityId) form.append('communityId', communityId);
      if (pollActive) {
        form.append(
          'poll',
          JSON.stringify({ options: pollOptions.map((o) => o.trim()).filter(Boolean), durationHours: pollHours }),
        );
      }
      files.forEach((f) => form.append('media', f.file));

      const { data } = await api.post<{ post: Post }>('/posts', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setText('');
      setFiles([]);
      setToken(null);
      setSuggestions([]);
      setPollOptions(null);
      if (isDraftable) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
      }
      // Refresh feeds / threads that may now include this post.
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile-feed'] });
      if (communityId) queryClient.invalidateQueries({ queryKey: ['community-feed'] });
      if (parentId) {
        queryClient.invalidateQueries({ queryKey: ['thread', parentId] });
        queryClient.invalidateQueries({ queryKey: ['post', parentId] });
        queryClient.invalidateQueries({ queryKey: ['replies', parentId] });
      }
      toast(parentId ? t('replyPosted') : quotedPostId ? t('quotePosted') : t('postLive'), 'success');
      onPosted?.(data.post);
    } catch (err) {
      setError(errorMessage(err, 'Could not publish your post'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <div className="flex gap-3 pt-1">
      <Avatar user={user} linkable={false} />
      <div className="relative min-w-0 flex-1">
        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={text}
          onChange={onTextChange}
          onKeyDown={onKeyDown}
          onSelect={(e) => syncToken(text, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onBlur={() => setTimeout(() => setToken(null), 120)}
          placeholder={placeholder ?? t('whatsHappening')}
          rows={compact ? 2 : 3}
          className="w-full resize-none bg-transparent text-[17px] leading-7 outline-none placeholder:text-stone-500"
        />
        {token && (
          <MentionAutocomplete
            token={token}
            suggestions={suggestions}
            setSuggestions={setSuggestions}
            active={activeSuggestion}
            setActive={setActiveSuggestion}
            onPick={applySuggestion}
          />
        )}

        {files.length > 0 && (
          <div className={`grid gap-2 ${files.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} mb-2`}>
            {files.map((f, i) => (
              <div key={i} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]">
                {f.file.type.startsWith('video/') ? (
                  <video src={f.preview} className="max-h-64 w-full object-cover" controls />
                ) : (
                  <img src={f.preview} className="max-h-64 w-full object-cover" />
                )}
                <IconButton label="Remove media" variant="glass" size="sm" onClick={() => removeFile(i)} className="absolute right-2 top-2">
                  <X size={ICON_SIZE.sm} />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        {pollActive && (
          <div className="mb-3 animate-scale-in space-y-2 rounded-2xl border border-brand/20 p-3">
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={(e) =>
                    setPollOptions((cur) => cur!.map((o, j) => (j === i ? e.target.value : o)))
                  }
                  maxLength={50}
                  placeholder={`${t('choice')} ${i + 1}${i >= 2 ? ` ${t('optionalSuffix')}` : ''}`}
                  className="input min-h-10 flex-1 rounded-xl"
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions((cur) => cur!.filter((_, j) => j !== i))}
                    className={iconButtonClass('ghost', 'sm')}
                    aria-label="Remove choice"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 pt-1">
              {pollOptions.length < 4 ? (
                <button
                  type="button"
                  onClick={() => setPollOptions((cur) => [...cur!, ''])}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand/10"
                >
                  <Plus size={15} /> {t('addChoice')}
                </button>
              ) : (
                <span />
              )}
              <label className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                {t('pollLength')}
                <select
                  value={pollHours}
                  onChange={(e) => setPollHours(Number(e.target.value))}
                  className="input min-h-9 w-auto rounded-xl py-1 text-sm"
                >
                  {POLL_DURATIONS.map(([label, hours]) => (
                    <option key={hours} value={hours}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {error && <p className="mb-2 rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={files.length >= MAX_FILES || pollActive}
              className={cn(iconButtonClass('ghost', 'md', 'brand'), 'disabled:cursor-not-allowed disabled:opacity-40')}
              title="Add media"
              aria-label="Add media"
            >
              <ImagePlus size={20} />
            </button>
            <button
              type="button"
              onClick={() => setPollOptions((cur) => (cur === null ? ['', ''] : null))}
              disabled={files.length > 0}
              className={iconButtonClass(pollActive ? 'secondary' : 'ghost', 'md', 'brand')}
              title={pollActive ? 'Remove poll' : 'Add poll'}
              aria-label={pollActive ? 'Remove poll' : 'Add poll'}
            >
              <ListTodo size={20} />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setEmojiOpen((o) => !o)}
                className={iconButtonClass('ghost', 'md', 'brand')}
                title="Add emoji"
                aria-label="Add emoji"
              >
                <Smile size={20} />
              </button>
              {emojiOpen && (
                <EmojiPicker onPick={(e) => setText((t) => t + e)} onClose={() => setEmojiOpen(false)} />
              )}
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => addFiles(e.target.files)}
          />

          <div className="flex items-center gap-3">
            {text.length > 0 && <ProgressRing value={text.length} max={MAX} />}
            <button onClick={submit} disabled={!canSubmit} className={cn(buttonClass({ variant: 'primary' }), 'min-w-24')}>
              {parentId ? t('reply') : quotedPostId ? t('quote') : t('post')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
