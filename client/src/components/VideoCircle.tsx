import { useRef, useState } from 'react';
import { PlayButton } from './ui';

// Telegram-style round "video circle" message. Tap to play/pause with sound.
export function VideoCircle({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setFailed(true));
    else v.pause();
  };

  return (
    <div className="relative block h-48 w-48 max-w-[70vw] overflow-hidden rounded-full ring-1 ring-white/20 sm:h-56 sm:w-56">
      <video
        ref={ref}
        src={url}
        playsInline
        preload="metadata"
        loop
        onError={() => setFailed(true)}
        className="h-full w-full cursor-pointer object-cover"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 text-center text-xs font-semibold text-white">
          Video unavailable
        </p>
      )}
      {!playing && !failed && (
        <PlayButton
          size="lg"
          subject="video message"
          onClick={toggle}
          className="absolute inset-0 m-auto h-14 w-14"
        />
      )}
    </div>
  );
}
