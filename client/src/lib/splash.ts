/**
 * Startup splash controller.
 *
 * The splash is static markup in index.html (#splash), outside React's root,
 * so it paints before any JS runs and cannot cause hydration mismatches or
 * StrictMode double renders. It is dismissed as soon as auth bootstrap
 * settles, with a fallback timeout so it can never get stuck.
 */
import { useAuth } from '../store/auth';

const FALLBACK_MS = 4000;
const FADE_MS = 320;

let started = false;

export function initSplash(): void {
  if (started) return; // idempotent (HMR / StrictMode)
  started = true;

  const el = document.getElementById('splash');
  const root = document.documentElement;
  if (!el) {
    root.classList.remove('splash-active');
    return;
  }

  let timer: number | undefined;
  let unsubscribe: (() => void) | undefined;
  let done = false;

  const dismiss = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    unsubscribe?.();
    window.removeEventListener('pageshow', onPageShow);
    root.classList.remove('splash-active'); // restores scrolling immediately
    el.classList.add('splash-hide'); // short fade-out, then remove
    window.setTimeout(() => el.remove(), FADE_MS);
  };

  // bfcache restores: the app is already initialised, never show a stale splash.
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) dismiss();
  };
  window.addEventListener('pageshow', onPageShow);

  if (useAuth.getState().status !== 'loading') {
    dismiss();
    return;
  }

  unsubscribe = useAuth.subscribe((state) => {
    if (state.status !== 'loading') dismiss();
  });
  timer = window.setTimeout(dismiss, FALLBACK_MS);
}
