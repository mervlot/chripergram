import { useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import { PlayButton } from './ui';

function fmt(ms?: number | null) {
  if (!ms || ms < 0) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Compact voice-message player: play/pause, a progress bar and the duration.
export function VoiceMessage({
  url,
  durationMs,
  mine,
}: {
  url: string;
  durationMs?: number | null;
  mine?: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  return (
    <div className="flex min-w-[190px] items-center gap-3 px-3 py-2">
      <PlayButton playing={playing} subject="voice message" variant="secondary" onClick={toggle} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Mic size={13} className={mine ? 'text-white/80' : 'text-brand'} />
          <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${mine ? 'bg-white/30' : 'bg-slate-300/70 dark:bg-white/15'}`}>
            <div className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-brand'}`} style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className={`mt-1 text-[11px] tabular-nums ${mine ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
          {fmt(durationMs) || 'Voice message'}
        </div>
      </div>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration && Number.isFinite(a.duration)) setProgress(a.currentTime / a.duration);
        }}
      />
    </div>
  );
}
