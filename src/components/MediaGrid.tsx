import { useEffect, useRef, useState } from 'react';
import { Lightbox } from './Lightbox';
import type { Media } from '../types';

// Renders 1–4 media attachments in a responsive grid, matching common
// social-media layouts. Clicking opens a full-screen lightbox.
// Plays inline (no full-screen overlay, so the feed stays scrollable) and
// pauses automatically once it scrolls out of view.
function InlineVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) el.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      preload="metadata"
      className="max-h-[510px] w-full bg-black object-contain"
      style={{ touchAction: 'pan-y' }}
    />
  );
}

export function MediaGrid({ media }: { media: Media[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (!media.length) return null;
  const count = media.length;

  const gridClass = count === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <>
      <div
        className={`mt-3 grid ${gridClass} gap-0.5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/[0.05]`}
        onClick={(e) => e.stopPropagation()}
      >
        {media.map((m, i) => {
          const span = count === 3 && i === 0 ? 'row-span-2' : '';
          if (m.type === 'VIDEO') {
            return (
              <div key={m.id} className={`relative ${span} ${count === 1 ? '' : 'aspect-square'} overflow-hidden bg-black`}>
                <InlineVideo src={m.url} />
              </div>
            );
          }
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className={`group relative ${span} ${count === 1 ? '' : 'aspect-square'} overflow-hidden`}
            >
              <img
                src={m.url}
                loading="lazy"
                className={`transition duration-300 group-hover:brightness-90 ${
                  count === 1 ? 'max-h-[510px] w-full object-cover' : 'h-full w-full object-cover'
                }`}
              />
            </button>
          );
        })}
      </div>

      {lightboxIndex !== null && (
        <Lightbox media={media} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
}
