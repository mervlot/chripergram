import { useCallback, useEffect, useRef, useState } from 'react';
import { GlassPopover } from './ui';
import { cn } from '../lib/ui';

// Dependency-free picker: a few curated categories, "recent" persisted in
// localStorage, roving-tabindex keyboard navigation and a single set of
// document listeners that exist only while the picker is mounted.
const CATEGORIES: { id: string; icon: string; label: string; emojis: string }[] = [
  {
    id: 'smileys',
    icon: '😀',
    label: 'Smileys',
    emojis:
      '😀 😃 😄 😁 😆 😅 😂 🤣 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤗 🤭 🤔 😐 😏 😒 🙄 😬 😌 😔 😴 😷 🤒 🥵 🥶 😵 🤯 🥳 😎 🤓 😕 😟 🙁 😮 😲 😳 🥺 😢 😭 😱 😖 😞 😤 😡 🤬 😈 💀 🤡 👻 🙈 🙉 🙊',
  },
  {
    id: 'people',
    icon: '👍',
    label: 'Gestures',
    emojis:
      '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🖐️ 👋 🤝 👏 🙌 🙏 💪 🫶 ✍️ 🤳 👀 🧠 🫡 🤷 🤦 🙆 🙅 💃 🕺',
  },
  {
    id: 'hearts',
    icon: '❤️',
    label: 'Hearts and symbols',
    emojis:
      '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💯 ✅ ❌ ⭕ ❗ ❓ ⚡ 🔥 ✨ ⭐ 🌟 💥 💫 🎉 🎊',
  },
  {
    id: 'fun',
    icon: '🎮',
    label: 'Activities and objects',
    emojis:
      '🎮 🕹️ 🎧 🎵 🎶 🎤 🎬 📷 📱 💻 ⌨️ 🖥️ 🚀 ✈️ 🚗 ⚽ 🏀 🏈 🎯 🏆 🥇 🎁 💡 📌 📎 🔒 🔑 ⏰ 💸 💰',
  },
  {
    id: 'nature',
    icon: '🐶',
    label: 'Animals, food and nature',
    emojis:
      '🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐸 🐵 🐧 🦄 🐢 🐙 🌹 🌸 🌈 ☀️ 🌙 ❄️ 🍕 🍔 🍟 🌮 🍣 🍩 🍰 🍎 🍉 🍺 🍷 ☕ 🧋',
  },
];

const RECENT_KEY = 'chirpergram:recent-emoji';
const MAX_RECENT = 16;
const COLUMNS = 8;

export function loadRecentEmoji(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return []; // storage unavailable (private mode, blocked): degrade silently
  }
}

export function rememberEmoji(emoji: string) {
  try {
    const next = [emoji, ...loadRecentEmoji().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

interface Props {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Elements (e.g. the toggle button) whose pointer events must not count as "outside". */
  ignoreRef?: React.RefObject<HTMLElement>;
  className?: string;
  /** Render in normal flow (e.g. inside another popover) instead of floating above a trigger. */
  inline?: boolean;
  /** Keep the composer focused (and its caret) while using the picker. */
  keepFocus?: boolean;
}

export function EmojiPicker({ onPick, onClose, ignoreRef, className, inline = false, keepFocus = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [recent, setRecent] = useState<string[]>(() => loadRecentEmoji());
  const [tab, setTab] = useState<string>(() => (loadRecentEmoji().length ? 'recent' : 'smileys'));
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || ignoreRef?.current?.contains(target)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ignoreRef]);

  const emojis = tab === 'recent' ? recent : (CATEGORIES.find((c) => c.id === tab)?.emojis.split(' ') ?? []);

  const pick = useCallback(
    (emoji: string) => {
      rememberEmoji(emoji);
      setRecent(loadRecentEmoji());
      onPick(emoji);
    },
    [onPick],
  );

  function onGridKey(e: React.KeyboardEvent) {
    const move: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS };
    const delta = move[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = Math.min(emojis.length - 1, Math.max(0, active + delta));
    setActive(next);
    cellRefs.current[next]?.focus();
  }

  const tabs = [
    ...(recent.length ? [{ id: 'recent', icon: '🕘', label: 'Recently used' }] : []),
    ...CATEGORIES.map(({ id, icon, label }) => ({ id, icon, label })),
  ];

  return (
    <GlassPopover
      ref={ref}
      role="dialog"
      aria-label="Emoji picker"
      // Prevent the composer textarea from losing focus/caret on mobile.
      onMouseDown={keepFocus ? (e: React.MouseEvent) => e.preventDefault() : undefined}
      className={cn(
        inline
          ? 'relative w-full p-2'
          : cn(
              'absolute bottom-full z-30 mb-2 w-[min(20rem,calc(100vw-1.5rem))] p-2',
              className?.includes('right-') ? '' : 'left-0',
            ),
        className,
      )}
    >
      <div role="tablist" aria-label="Emoji categories" className="mb-1 flex gap-1 border-b border-white/10 pb-1">
        {tabs.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={tab === c.id}
            aria-label={c.label}
            title={c.label}
            onClick={() => {
              setTab(c.id);
              setActive(0);
            }}
            className={cn(
              'flex h-9 min-w-9 flex-1 items-center justify-center rounded-xl text-lg transition-colors motion-reduce:transition-none',
              tab === c.id ? 'bg-brand/20' : 'hover:bg-white/10',
            )}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div
        role="grid"
        aria-label="Emoji"
        onKeyDown={onGridKey}
        className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain"
      >
        {emojis.map((e, i) => (
          <button
            key={e}
            ref={(el) => {
              cellRefs.current[i] = el;
            }}
            type="button"
            role="gridcell"
            tabIndex={i === active ? 0 : -1}
            onFocus={() => setActive(i)}
            onClick={() => pick(e)}
            aria-label={e}
            className="flex aspect-square items-center justify-center rounded-lg text-xl transition-colors hover:bg-white/10 active:bg-white/15 motion-reduce:transition-none"
          >
            {e}
          </button>
        ))}
      </div>
    </GlassPopover>
  );
}
