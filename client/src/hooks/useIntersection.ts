import { useEffect, useRef } from 'react';

// Calls `onIntersect` when the returned sentinel ref scrolls into view.
// Used to drive infinite scrolling.
export function useIntersection(onIntersect: () => void, enabled = true) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onIntersect();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onIntersect, enabled]);

  return ref;
}
