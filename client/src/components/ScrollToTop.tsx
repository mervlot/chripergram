import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { IconButton } from './ui';
import { ICON_SIZE } from '../lib/ui';

// Floating "back to top" button that appears once the page is scrolled down.
// Sits above the mobile bottom-nav / compose button.
export function ScrollToTop({ home = false }: { home?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <IconButton
      label="Scroll to top"
      variant="glass"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`animate-scale-in fixed right-4 z-30 md:bottom-6 ${
        home
          ? 'bottom-[calc(env(safe-area-inset-bottom)+9rem)]'
          : 'bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]'
      }`}
    >
      <ArrowUp size={ICON_SIZE.md} />
    </IconButton>
  );
}
