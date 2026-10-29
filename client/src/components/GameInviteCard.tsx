import { Clock3, Gamepad2, Users } from 'lucide-react';
import type { GameInvite } from '../lib/gameInvite';

interface Props {
  invite: GameInvite;
  mine: boolean;
  onJoin?: () => void;
}

export function GameInviteCard({ invite, mine, onJoin }: Props) {
  return (
    <div className={`w-[min(19rem,76vw)] rounded-2xl p-3 ${mine ? 'bg-white/12' : 'bg-slate-50 dark:bg-white/[0.06]'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${mine ? 'bg-white/15' : 'bg-brand/10 text-brand'}`}>
          <Gamepad2 size={22} />
        </span>
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase ${mine ? 'text-white/70' : 'text-slate-500'}`}>Squad invite</p>
          <p className="break-words text-base font-semibold">{invite.game}</p>
        </div>
      </div>

      <div className={`mt-3 space-y-1.5 text-sm ${mine ? 'text-white/85' : 'text-slate-600 dark:text-slate-300'}`}>
        {invite.mode && (
          <p className="flex items-center gap-2">
            <Users size={15} className="shrink-0" /> {invite.mode}
          </p>
        )}
        {invite.startsAt && (
          <p className="flex items-center gap-2">
            <Clock3 size={15} className="shrink-0" /> {invite.startsAt}
          </p>
        )}
        {invite.note && <p className="break-words pt-1">{invite.note}</p>}
      </div>

      {!mine && onJoin && (
        <button
          type="button"
          onClick={onJoin}
          className="mt-3 min-h-11 w-full rounded-xl bg-brand px-3 font-semibold text-white transition active:scale-[0.98]"
        >
          Join squad
        </button>
      )}
    </div>
  );
}
