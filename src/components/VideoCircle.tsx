import { useRef, useState } from 'react';
import { PlayButton } from './ui';

// Telegram-style round "video circle" message. Tap to play/pause with sound.
export function VideoCircle({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  return (
    <div className="relative block h-48 w-48 max-w-[70vw] overflow-hidden rounded-full ring-1 ring-white/20 sm:h-56 sm:w-56">
      <video
        ref={ref}
        src={url}
        playsInline
        loop
        className="h-full w-full cursor-pointer object-cover"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {!playing && (
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
