import { BadgeCheck } from 'lucide-react';
import type { UserSummary } from '../types';

interface Props {
  user: Pick<UserSummary, 'displayName' | 'username' | 'verified'>;
  className?: string;
  compact?: boolean;
}

export function UserName({ user, className = '', compact }: Props) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span className="truncate font-semibold text-slate-950 dark:text-white">
        {user.displayName}
      </span>
      {user.verified && (
        <BadgeCheck
          size={compact ? 15 : 17}
          className="shrink-0 fill-accent text-white dark:fill-blue-400 dark:text-[#0a0a0c]"
          aria-label="Verified account"
        />
      )}
    </span>
  );
}
