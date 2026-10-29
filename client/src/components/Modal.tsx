import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { GlassOverlay, GlassSheet, IconButton } from './ui';
import { ICON_SIZE } from '../lib/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

const EXIT_MS = 140;
// Ignore backdrop taps for a moment after opening: the tail of the tap that opened the
// sheet (and the keyboard resize it triggers) must never be able to dismiss it.
const ARM_MS = 350;

export function Modal({ open, onClose, children, title }: Props) {
  const [closing, setClosing] = useState(false);
  const wasOpen = useRef(open);
  const armed = useRef(false);
  // Always call the latest onClose without re-running the effects below
  // (inline arrow props change identity on every parent render).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Render synchronously on open (no effect delay) so the textarea mounts, and
  // autofocuses, inside the user's tap — that is what makes the keyboard reliable.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setClosing(false);
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    setClosing(true);
    const timer = setTimeout(() => setClosing(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    armed.current = false;
    const arm = setTimeout(() => (armed.current = true), ARM_MS);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(arm);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Track the visible viewport so the sheet always sits right above the keyboard
  // (iOS keeps the layout viewport full-height; Android may shrink it).
  const overlayRef = useRef<HTMLDivElement>(null);
  const visible = open || closing;
  useEffect(() => {
    if (!visible) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const el = overlayRef.current;
      if (!el) return;
      el.style.setProperty('--vv-height', `${vv.height}px`);
      el.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    <GlassOverlay
      ref={overlayRef}
      className={`vv-fixed z-50 flex items-end justify-center sm:items-center sm:p-4 ${
        closing ? 'animate-fade-out' : 'animate-fade-in'
      }`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && armed.current) onCloseRef.current();
      }}
    >
      <GlassSheet
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        className={`max-h-full w-full sm:max-h-[min(86dvh,720px)] sm:max-w-xl ${
          closing ? 'animate-fade-out' : 'animate-fade-in'
        }`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-14 shrink-0 items-center gap-1 px-2 pt-1">
          <IconButton label="Close" onClick={() => onCloseRef.current()}>
            <X size={ICON_SIZE.md} />
          </IconButton>
          {title && <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-4">
          {children}
        </div>
      </GlassSheet>
    </GlassOverlay>,
    document.body,
  );
}
