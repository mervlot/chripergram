import { useEffect, useState } from 'react';
import { Check, BarChart3 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import { toast } from '../store/toast';
import { useT } from '../lib/i18n';
import type { Poll } from '../types';

// How long until a poll closes, as a compact human label.
function timeLeft(endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

// Interactive poll: option buttons before voting, animated result bars after
// (or once the poll has ended). Live-updates via the post's socket room.
export function PollView({ postId, poll: initial }: { postId: string; poll: Poll }) {
  const t = useT();
  const [poll, setPoll] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ended = new Date(poll.endsAt).getTime() <= Date.now();
  const showResults = !!poll.viewerVote || ended;

  // Live vote counts pushed to everyone viewing this post.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = (p: { postId: string; poll: Poll }) => {
      if (p.postId !== postId) return;
      setPoll((prev) => ({ ...p.poll, viewerVote: prev.viewerVote }));
    };
    socket.on('poll:update', onUpdate);
    return () => {
      socket.off('poll:update', onUpdate);
    };
  }, [postId]);

  async function vote(optionId: string) {
    if (busy || ended) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ poll: Poll }>(`/posts/${postId}/poll/vote`, { optionId });
      setPoll(data.poll);
    } catch (err) {
      toast(errorMessage(err, 'Could not register your vote'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const left = timeLeft(poll.endsAt);

  return (
    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {poll.options.map((o) => {
        const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
        const mine = poll.viewerVote === o.id;
        const leading = showResults && o.votes > 0 && o.votes === Math.max(...poll.options.map((x) => x.votes));

        if (!showResults) {
          return (
            <button
              key={o.id}
              type="button"
              disabled={busy}
              onClick={() => vote(o.id)}
              className="block w-full rounded-2xl border border-brand/40 px-4 py-2.5 text-left text-sm font-semibold text-brand transition duration-200 hover:border-brand hover:bg-brand/10 active:scale-[0.98] disabled:opacity-60 dark:border-violet-400/40 dark:text-violet-300 dark:hover:bg-violet-400/10"
            >
              {o.text}
            </button>
          );
        }

        return (
          <button
            key={o.id}
            type="button"
            disabled={busy || ended}
            onClick={() => vote(o.id)}
            title={ended ? undefined : t('changeVote')}
            className="relative block w-full overflow-hidden rounded-2xl border border-slate-200/80 px-4 py-2.5 text-left text-sm disabled:cursor-default dark:border-white/10"
          >
            <span
              className={`absolute inset-y-0 left-0 animate-bar-grow rounded-r-xl ${
                leading
                  ? 'bg-gradient-to-r from-brand/30 to-accent/25 dark:from-brand/40 dark:to-accent/30'
                  : 'bg-slate-200/70 dark:bg-white/[0.08]'
              }`}
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
            <span className="relative flex items-center justify-between gap-2">
              <span className={`flex min-w-0 items-center gap-1.5 ${leading ? 'font-semibold' : 'font-medium'}`}>
                <span className="truncate">{o.text}</span>
                {mine && <Check size={14} className="shrink-0 text-brand dark:text-violet-300" />}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{pct}%</span>
            </span>
          </button>
        );
      })}
      <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        <BarChart3 size={13} />
        {poll.totalVotes} {poll.totalVotes === 1 ? t('vote') : t('votes')} · {left ? `${left} ${t('left')}` : t('finalResults')}
      </p>
    </div>
  );
}
