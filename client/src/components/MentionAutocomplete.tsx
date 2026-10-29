import { GlassPopover } from './ui';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { Avatar } from './Avatar';
import type { Trend, UserSummary } from '../types';

export interface ActiveToken {
  kind: '@' | '#';
  query: string;
  start: number;
  end: number;
}

export interface Suggestion {
  key: string;
  value: string; // text inserted (includes sigil + trailing space)
  user: UserSummary | null;
  label: string;
  sub: string;
}

// Detects an in-progress @mention or #hashtag immediately before the caret.
export function detectToken(text: string, caret: number): ActiveToken | null {
  const upto = text.slice(0, caret);
  const match = /(^|\s)([@#])([\w]{0,30})$/.exec(upto);
  if (!match) return null;
  const kind = match[2] as '@' | '#';
  const query = match[3];
  const start = caret - query.length - 1; // include the sigil
  return { kind, query, start, end: caret };
}

interface Props {
  token: ActiveToken;
  suggestions: Suggestion[];
  setSuggestions: (s: Suggestion[]) => void;
  active: number;
  setActive: (i: number) => void;
  onPick: (s: Suggestion) => void;
}

// Dropdown of user / hashtag suggestions. The parent owns the item list and
// active index so it can drive keyboard navigation from the textarea.
export function MentionAutocomplete({ token, suggestions, setSuggestions, active, setActive, onPick }: Props) {
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        if (token.kind === '@') {
          if (!token.query) {
            if (!cancelled) setSuggestions([]);
            return;
          }
          const { data } = await api.get<{ users: UserSummary[] }>('/search', {
            params: { q: token.query, type: 'users', limit: 6 },
          });
          if (cancelled) return;
          setSuggestions(
            data.users.map((u) => ({
              key: u.id,
              value: `@${u.username} `,
              user: u,
              label: u.displayName,
              sub: `@${u.username}`,
            })),
          );
        } else {
          const { data } = await api.get<{ trends: Trend[] }>('/trends');
          if (cancelled) return;
          const q = token.query.toLowerCase();
          setSuggestions(
            data.trends
              .filter((t) => (q ? t.tag.toLowerCase().includes(q) : true))
              .slice(0, 6)
              .map((t) => ({
                key: t.tag,
                value: `#${t.tag} `,
                user: null,
                label: `#${t.tag}`,
                sub: `${t.count} posts`,
              })),
          );
        }
      } catch {
        /* ignore transient search errors */
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token.kind, token.query]);

  if (suggestions.length === 0) return null;

  return (
    <GlassPopover
      role="listbox"
      aria-label="Suggestions"
      className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-72 overflow-y-auto"
      onMouseDown={(e) => e.preventDefault()} // keep textarea focus on click
    >
      {suggestions.map((item, i) => (
        <button
          key={item.key}
          type="button"
          role="option"
          aria-selected={i === active}
          onClick={() => onPick(item)}
          onMouseEnter={() => setActive(i)}
          className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 ${
            i === active ? 'bg-white/10' : 'hover:bg-white/5'
          }`}
        >
          {item.user ? (
            <Avatar user={item.user} size="sm" linkable={false} />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand">#</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{item.label}</span>
            <span className="block truncate text-xs text-stone-400">{item.sub}</span>
          </span>
        </button>
      ))}
    </GlassPopover>
  );
}
