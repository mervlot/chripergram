import { ButtonHTMLAttributes, HTMLAttributes, ReactNode, forwardRef } from 'react';
import { GlassEdge, MENU_ITEM, MENU_ITEM_DANGER, RADIUS, cn, glass } from '../../lib/ui';

type DivProps = HTMLAttributes<HTMLDivElement>;

interface PanelProps extends DivProps {
  /** `floating` (default) is the exact canonical surface; `top`/`bottom` dock it to a screen edge. */
  edge?: GlassEdge;
  radius?: 'none' | 'card' | 'pill';
}

const RADIUS_CLASS = { none: '', card: RADIUS.card, pill: RADIUS.pill } as const;

/** The base glass surface. Everything else in this file is a preset of it. */
export const GlassPanel = forwardRef<HTMLDivElement, PanelProps>(function GlassPanel(
  { edge = 'floating', radius = 'card', className, ...rest },
  ref,
) {
  return <div ref={ref} className={glass(edge, edge === 'floating' && RADIUS_CLASS[radius], className)} {...rest} />;
});

/** Padded floating glass card. Use sparingly, for content that floats over media. */
export const GlassCard = forwardRef<HTMLDivElement, PanelProps>(function GlassCard({ className, ...rest }, ref) {
  return <GlassPanel ref={ref} className={cn('p-4', className)} {...rest} />;
});

/** Sticky page header docked to the top (honours the iOS/Android safe area). */
export const GlassHeader = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function GlassHeader(
  { className, ...rest },
  ref,
) {
  return <header ref={ref} className={glass('top', 'safe-top sticky top-0 z-20', className)} {...rest} />;
});

/** Compact floating pill toolbar (call controls, quick reactions). */
export const GlassToolbar = forwardRef<HTMLDivElement, DivProps>(function GlassToolbar(
  { className, role = 'toolbar', ...rest },
  ref,
) {
  return (
    <div ref={ref} role={role} className={glass('floating', RADIUS.pill, 'flex items-center gap-1 p-1', className)} {...rest} />
  );
});

/** Bottom navigation bar, docked to the bottom edge and safe-area aware. */
export const GlassNavigation = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function GlassNavigation(
  { className, ...rest },
  ref,
) {
  return (
    <nav
      ref={ref}
      className={glass('bottom', 'fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]', className)}
      {...rest}
    />
  );
});

/**
 * Full-screen scrim behind dialogs. It dims but does not blur: the dialog on top
 * is already glass, and stacking two heavy blurs is expensive on phones.
 */
export const GlassOverlay = forwardRef<HTMLDivElement, DivProps>(function GlassOverlay({ className, ...rest }, ref) {
  return <div ref={ref} className={cn('bg-black/60', className)} {...rest} />;
});

/** Dialog / bottom-sheet surface: rounded top on phones, fully rounded from `sm`. */
export const GlassSheet = forwardRef<HTMLDivElement, DivProps>(function GlassSheet({ className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={glass(
        'floating',
        'flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl',
        className,
      )}
      {...rest}
    />
  );
});

/** Context menu / popover surface. Pair with {@link MenuItem}. */
export const GlassPopover = forwardRef<HTMLDivElement, DivProps>(function GlassPopover(
  { className, role = 'menu', ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      role={role}
      className={glass('floating', RADIUS.popover, 'animate-scale-in overflow-hidden py-1.5', className)}
      {...rest}
    />
  );
});

interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  danger?: boolean;
  icon?: ReactNode;
}

/** Row inside a GlassPopover. */
export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { danger, icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} role="menuitem" className={cn(danger ? MENU_ITEM_DANGER : MENU_ITEM, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
});
