import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Window scroll position per history entry (react-router's `location.key`). Kept in memory
// and mirrored to sessionStorage so a refresh also lands where you were.
const positions = new Map<string, number>();
const STORE = 'murmur:scroll:';

function load(key: string): number | undefined {
  const mem = positions.get(key);
  if (mem !== undefined) return mem;
  try {
    const raw = sessionStorage.getItem(STORE + key);
    return raw === null ? undefined : Number(raw);
  } catch {
    return undefined;
  }
}

function persist(key: string, y: number) {
  positions.set(key, y);
  try {
    sessionStorage.setItem(STORE + key, String(Math.round(y)));
  } catch {
    /* storage unavailable: in-memory only */
  }
}

// BrowserRouter does not manage scroll. Without this, going from the feed to a post kept the
// feed's scroll offset (new pages opened mid-way), and going back relied on the browser
// guessing the position before the feed had laid out. Rules:
//   - PUSH / REPLACE: new page, start at the top.
//   - POP (back / forward / refresh): restore this entry's saved offset, waiting briefly for
//     the content to be tall enough (cached feeds are ready immediately).
export function useScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();
  const keyRef = useRef(location.key);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    // The key is captured when the event fires, so a scroll caused by the next route
    // rendering can never overwrite the previous entry's saved position.
    const onScroll = () => positions.set(keyRef.current, window.scrollY);
    const flush = () => persist(keyRef.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  useLayoutEffect(() => {
    const previousKey = keyRef.current;
    if (previousKey !== location.key) {
      const y = positions.get(previousKey);
      if (y !== undefined) persist(previousKey, y);
    }
    keyRef.current = location.key;

    const saved = navType === 'POP' ? load(location.key) : undefined;
    if (saved === undefined || saved <= 0) {
      if (!location.hash) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }

    let cancelled = false;
    let frames = 0;
    const stop = () => {
      cancelled = true;
    };
    window.addEventListener('wheel', stop, { once: true, passive: true });
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    const tick = () => {
      if (cancelled) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.min(saved, Math.max(0, max)), left: 0, behavior: 'auto' });
      if (max >= saved || ++frames > 45) return; // reached, or give up after ~0.75s
      requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelled = true;
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
}
