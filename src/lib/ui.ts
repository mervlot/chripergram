/**
 * Chirpergram UI tokens.
 *
 * This file is the single source of truth for the glass design language and the
 * button system. Components in `components/ui/` compose these strings; nothing
 * else in the app should hand-write glass or button utilities. A global style
 * change means editing this file (or `index.css` for the browser fallback).
 *
 * Tailwind scans `src/**\/*.ts`, so every class below is generated.
 */

export type ClassValue = string | false | null | undefined;

/** Joins truthy class names. */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}

/* -------------------------------------------------------------------------- */
/* Glass                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The canonical glass surface. Do not edit the utilities without a design
 * decision; `glass-surface` is a marker class that lets index.css swap in a
 * solid background where `backdrop-filter` is unsupported.
 */
export const GLASS =
  'glass-surface bg-black/30 backdrop-blur-2xl backdrop-saturate-150 shadow-xl';

/**
 * Glass surfaces that are docked to a screen edge (sticky headers, the mobile
 * tab bar, composer bars) keep the canonical surface but drop the border sides
 * that touch the edge, the corner radius, and the drop shadow, so they read as
 * part of the screen instead of a floating card.
 */
export type GlassEdge = 'floating' | 'top' | 'bottom';

const EDGE: Record<GlassEdge, string> = {
  floating: '',
  /** Docked to the top of the screen: hairline on the bottom only. */
  top: 'rounded-none shadow-none',
  /** Docked to the bottom of the screen: hairline on the top only. */
  bottom: 'rounded-none shadow-none',
};

export function glass(edge: GlassEdge = 'floating', ...extra: ClassValue[]): string {
  return cn(GLASS, EDGE[edge], ...extra);
}

/* -------------------------------------------------------------------------- */
/* Radius, icon sizes, motion                                                 */
/* -------------------------------------------------------------------------- */

/** Coherent corner scale: controls < cards < sheets. Pills for floating controls. */
export const RADIUS = {
  control: 'rounded-xl',
  card: 'rounded-2xl',
  popover: 'rounded-2xl',
  sheet: 'rounded-t-3xl sm:rounded-3xl',
  pill: 'rounded-full',
} as const;

/** Lucide icon sizes (px), keyed to control size. */
export const ICON_SIZE = { sm: 16, md: 20, lg: 24 } as const;
export type ControlSize = keyof typeof ICON_SIZE;

/** Restrained press feedback; `motion-reduce` removes the transform. */
export const PRESS = 'transition duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100';

/** Visible keyboard focus that preserves the element's own shadow (glass). */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-black';

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'glass' | 'primary' | 'secondary' | 'ghost' | 'destructive' | 'transparent';

const BUTTON_BASE = cn(
  'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap font-semibold',
  PRESS,
  FOCUS_RING,
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
);

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  glass: cn(GLASS, 'text-white hover:bg-black/40 active:bg-black/50'),
  primary: 'bg-brand text-white hover:bg-brand-hover active:bg-brand-hover',
  secondary: 'bg-white/10 text-stone-100 hover:bg-white/15 active:bg-white/20',
  ghost: 'bg-transparent text-stone-200 hover:bg-white/10 active:bg-white/15',
  destructive: 'bg-red-500 text-white hover:bg-red-400 active:bg-red-600',
  transparent: 'bg-transparent text-inherit hover:text-white',
};

/** Text buttons. Touch targets are 44px (md/lg); `sm` is for dense rows. */
const BUTTON_SIZE: Record<ControlSize, string> = {
  sm: 'min-h-9 px-3.5 text-sm',
  md: 'min-h-11 px-5 text-[15px]',
  lg: 'min-h-12 px-6 text-base',
};

/**
 * Icon-only buttons are square. `sm` renders 36px but extends its hit area to
 * 44px (`.hit-area` in index.css), so dense toolbars stay tappable. Positioning
 * is deliberately not part of the base classes, so callers can pass `absolute`
 * or `fixed` without a utility-order conflict.
 */
const ICON_SIZE_CLASS: Record<ControlSize, string> = {
  sm: 'h-9 w-9 hit-area',
  md: 'h-11 w-11',
  lg: 'h-12 w-12',
};

/** Foreground accents. `!` makes the tone win regardless of variant colour order. */
export type ButtonTone = 'default' | 'brand' | 'danger';
const TONE: Record<ButtonTone, string> = {
  default: '',
  brand: '!text-brand',
  danger: '!text-red-400',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ControlSize;
  /** Square icon-only button. */
  iconOnly?: boolean;
  /** Fully round (default for icon-only) instead of the rounded-xl control radius. */
  pill?: boolean;
  fullWidth?: boolean;
}

/** Class string for any element that should look like a button (links too). */
export function buttonClass({
  variant = 'secondary',
  tone = 'default',
  size = 'md',
  iconOnly = false,
  pill,
  fullWidth = false,
}: ButtonStyleOptions = {}): string {
  const round = (pill ?? iconOnly) ? RADIUS.pill : RADIUS.control;
  return cn(
    BUTTON_BASE,
    BUTTON_VARIANT[variant],
    TONE[tone],
    iconOnly ? cn(ICON_SIZE_CLASS[size], 'p-0') : BUTTON_SIZE[size],
    round,
    fullWidth && 'w-full',
  );
}

/** Class string for icon-only buttons rendered as other elements (e.g. router links). */
export function iconButtonClass(
  variant: ButtonVariant = 'ghost',
  size: ControlSize = 'md',
  tone: ButtonTone = 'default',
): string {
  return buttonClass({ variant, size, tone, iconOnly: true });
}

/* -------------------------------------------------------------------------- */
/* Menus                                                                      */
/* -------------------------------------------------------------------------- */

export const MENU_ITEM =
  'flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] font-medium text-stone-100 transition-colors duration-150 hover:bg-white/10 active:bg-white/15 focus-visible:bg-white/10 focus-visible:outline-none disabled:opacity-50';
export const MENU_ITEM_DANGER =
  'flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 text-left text-[15px] font-medium text-red-400 transition-colors duration-150 hover:bg-red-500/15 active:bg-red-500/20 focus-visible:bg-red-500/15 focus-visible:outline-none disabled:opacity-50';
