import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePresence } from '../store/presence';
import { getUsernameInitial } from '../lib/avatar';
import type { UserSummary } from '../types';

const sizes = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
  xl: 'h-28 w-28 border-4 border-[#f7f4ec] sm:h-32 sm:w-32 dark:border-black',
};

const dotSizes = {
  xs: 'h-2 w-2',
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
  xl: 'h-6 w-6',
};

interface Props {
  user: Pick<UserSummary, 'username' | 'displayName' | 'avatarUrl'> & { id?: string };
  size?: keyof typeof sizes;
  linkable?: boolean;
  showPresence?: boolean;
}

export function Avatar({ user, size = 'md', linkable = true, showPresence }: Props) {
  const online = usePresence((s) => (user.id ? s.online[user.id] : false));
  const [imageFailed, setImageFailed] = useState(false);
  const initial = getUsernameInitial(user.username);

  useEffect(() => setImageFailed(false), [user.avatarUrl]);

  const avatar = user.avatarUrl && !imageFailed ? (
    <img
      src={user.avatarUrl}
      alt={user.displayName}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setImageFailed(true)}
      className={`${sizes[size]} animate-avatar-reveal rounded-full bg-stone-200 object-cover ring-1 ring-stone-300 dark:bg-stone-800 dark:ring-stone-700`}
    />
  ) : (
    <div
      role="img"
      aria-label={`${user.displayName} avatar`}
      title={`@${user.username}`}
      className={`${sizes[size]} flex select-none items-center justify-center rounded-full bg-stone-800 font-semibold text-white ring-1 ring-stone-950/15 dark:bg-stone-200 dark:text-stone-950 dark:ring-white/10`}
    >
      {initial}
    </div>
  );

  const content = (
    <div className="relative shrink-0">
      {avatar}
      {showPresence && online && (
        <span
          className={`absolute bottom-0 right-0 ${dotSizes[size]} rounded-full border-2 border-[#f7f4ec] bg-emerald-600 dark:border-black`}
          title="Online"
          aria-label="Online"
        />
      )}
    </div>
  );

  if (!linkable) return content;

  return (
    <Link
      to={`/${user.username}`}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 rounded-full transition-opacity hover:opacity-85"
    >
      {content}
    </Link>
  );
}
