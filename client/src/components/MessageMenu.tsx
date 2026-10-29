import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Forward, Pencil, Plus, Reply, Trash2 } from 'lucide-react';
import { GlassPopover, MenuItem } from './ui';
import { EmojiPicker } from './EmojiPicker';
import { cn } from '../lib/ui';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

interface Props {
  anchor: HTMLElement;
  mine: boolean;
  /** Emoji the current user has already put on this message. */
  myReactions: string[];
  canForward: boolean;
  canEdit: boolean;
  canCopy: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const MARGIN = 8;

// Floating message actions. Rendered in a portal and positioned from the
// anchor's rect so it can never be clipped by the scroll container or the
// viewport edge. Only one exists at a time (the parent holds a single menu id),
// and its document listeners live only while it is mounted.
export function MessageMenu(props: Props) {
  const { anchor, mine, myReactions, canForward, canEdit, canCopy } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Measure after render so the menu is clamped using its real size.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const a = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const above = a.top - h - 6;
    const top = above >= MARGIN ? above : Math.min(a.bottom + 6, vh - h - MARGIN);
    const preferred = mine ? a.right - w : a.left;
    const left = Math.min(Math.max(MARGIN, preferred), vw - w - MARGIN);
    setPos({ top: Math.max(MARGIN, top), left });
  }, [anchor, mine, moreOpen]);

  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLElement>('button');
    first?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchor.contains(t)) return;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    // The anchor moves with scrolling, so close instead of chasing it.
    const onScroll = () => closeRef.current();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('scroll', onScroll, true);
      anchor.focus?.();
    };
  }, [anchor]);

  return createPortal(
    <GlassPopover
      ref={menuRef}
      role="menu"
      aria-label="Message actions"
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="z-50 w-[min(18rem,calc(100vw-1rem))] py-1"
    >
      <div role="group" aria-label="Reactions" className="flex items-center justify-between gap-0.5 px-1.5 pb-1">
        {QUICK_REACTIONS.map((emoji) => {
          const pressed = myReactions.includes(emoji);
          return (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              aria-pressed={pressed}
              aria-label={`${pressed ? 'Remove reaction' : 'React with'} ${emoji}`}
              onClick={() => props.onReact(emoji)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full text-xl transition-colors motion-reduce:transition-none',
                pressed ? 'bg-brand/20 ring-1 ring-brand/40' : 'hover:bg-white/10 active:bg-white/15',
              )}
            >
              {emoji}
            </button>
          );
        })}
        <button
          type="button"
          role="menuitem"
          aria-expanded={moreOpen}
          aria-label="More reactions"
          onClick={() => setMoreOpen((o) => !o)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-white/10 dark:text-slate-300"
        >
          <Plus size={18} />
        </button>
      </div>

      {moreOpen && (
        <EmojiPicker inline keepFocus={false} onPick={props.onReact} onClose={() => setMoreOpen(false)} className="shadow-none" />
      )}

      <div className="border-t border-slate-200/70 pt-1 dark:border-white/10">
        <MenuItem icon={<Reply size={17} />} onClick={props.onReply}>
          Reply
        </MenuItem>
        {canForward && (
          <MenuItem icon={<Forward size={17} />} onClick={props.onForward}>
            Forward
          </MenuItem>
        )}
        {canCopy && (
          <MenuItem icon={<Copy size={17} />} onClick={props.onCopy}>
            Copy text
          </MenuItem>
        )}
        {canEdit && (
          <MenuItem icon={<Pencil size={17} />} onClick={props.onEdit}>
            Edit
          </MenuItem>
        )}
      </div>

      {mine && (
        <div className="mt-1 border-t border-slate-200/70 pt-1 dark:border-white/10">
          <MenuItem danger icon={<Trash2 size={17} />} onClick={props.onDelete}>
            Delete
          </MenuItem>
        </div>
      )}
    </GlassPopover>,
    document.body,
  );
}
