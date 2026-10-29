interface Props {
  value: number; // current count
  max: number;
}

// Circular character-count indicator (like X's compose ring). Turns amber as
// you approach the limit and red once exceeded; shows the remaining count.
export function ProgressRing({ value, max }: Props) {
  const remaining = max - value;
  const pct = Math.min(value / max, 1);
  const r = 9;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct);

  const over = remaining < 0;
  const near = remaining <= 20;
  const color = over ? '#ef4444' : near ? '#f59e0b' : '#6d5dfc';

  return (
    <div className="flex items-center gap-2">
      {near && (
        <span className={`text-sm tabular-nums ${over ? 'text-red-500' : 'text-amber-500'}`}>{remaining}</span>
      )}
      <svg width="26" height="26" viewBox="0 0 26 26" className="-rotate-90">
        <circle cx="13" cy="13" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-200 dark:text-white/10" />
        <circle
          cx="13"
          cy="13"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.2s ease, stroke 0.2s ease' }}
        />
      </svg>
    </div>
  );
}
