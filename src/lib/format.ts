import { formatDistanceToNowStrict, format } from 'date-fns';

// Compact relative time for feeds ("3m", "5h", "2d"), absolute after a week.
export function relativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const week = 7 * 24 * 60 * 60 * 1000;
  if (diff > week) return format(d, 'MMM d');
  const full = formatDistanceToNowStrict(d);
  // "3 minutes" -> "3m", "5 hours" -> "5h", etc.
  return full
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd')
    .replace(/ months?/, 'mo')
    .replace(/ years?/, 'y');
}

export function fullDate(date: string | Date): string {
  return format(typeof date === 'string' ? new Date(date) : date, "h:mm a · MMM d, yyyy");
}

export function joinedDate(date: string | Date): string {
  return `Joined ${format(typeof date === 'string' ? new Date(date) : date, 'MMMM yyyy')}`;
}

export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
