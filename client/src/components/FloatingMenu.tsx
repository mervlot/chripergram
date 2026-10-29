import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GlassPopover } from './ui';

interface Props {
  anchor: HTMLElement | null;
  onClose: () => void;
  width?: number;
  align?: 'left' | 'right';
  children: ReactNode;
}

// Popover rendered in a portal on <body>, positioned with fixed coordinates.
// It can never be covered by neighbouring posts, and every click is stopped
// before it reaches the post card underneath (which would open the thread).
export function FloatingMenu({ anchor, onClose, width = 192, align = 'left', children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight ?? 160;
    const margin = 8;
    let left = align === 'right' ? rect.right - width : rect.left;
    left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 6);
    setPos({ top, left });
  }, [anchor, align, width]);

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <GlassPopover
        ref={panelRef}
        className="absolute"
        style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </GlassPopover>
    </div>,
    document.body,
  );
}
