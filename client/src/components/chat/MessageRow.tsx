import { memo, useRef, useState } from 'react';
import { Check, CheckCheck, MoreHorizontal } from 'lucide-react';
import type { Message } from '../../types';
import { useT } from '../../lib/i18n';
import { relativeTime } from '../../lib/format';
import { parseGameInvite, type GameInvite } from '../../lib/gameInvite';
import { isEmojiOnly, parsePostShare, parseStoryReply } from '../../lib/messageCards';
import { iconButtonClass, cn } from '../../lib/ui';
import { VoiceMessage } from '../VoiceMessage';
import { VideoCircle } from '../VideoCircle';
import { GameInviteCard } from '../GameInviteCard';
import { MessageMenu } from '../MessageMenu';

/** Stable callbacks supplied by ChatPanel (identity never changes, so rows can be memoized). */
export interface RowActions {
  register: (id: string, el: HTMLDivElement | null) => void;
  openMenu: (id: string) => void;
  closeMenu: () => void;
  react: (id: string, emoji: string) => void;
  reply: (m: Message) => void;
  forward: (m: Message) => void;
  edit: (m: Message) => void;
  remove: (id: string) => void;
  copy: (m: Message) => void;
  jump: (id: string) => void;
  lightbox: (url: string) => void;
  joinInvite: (invite: GameInvite) => void;
  openPost: (postId: string) => void;
}

interface Props {
  m: Message;
  meId: string | undefined;
  otherName: string;
  highlighted: boolean;
  menuOpen: boolean;
  actions: RowActions;
}

function VideoAttachment({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <p className="px-3 py-2 text-sm">
        This video could not be played.{' '}
        <a href={url} target="_blank" rel="noreferrer" className="font-semibold underline">
          Open it directly
        </a>
      </p>
    );
  }
  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className="mb-1 max-h-72 w-full max-w-full rounded-2xl bg-black object-contain"
    />
  );
}

export const MessageRow = memo(function MessageRow({ m, meId, otherName, highlighted, menuOpen, actions }: Props) {
  const t = useT();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const mine = m.senderId === meId;
  const deleted = !!m.deletedAt;
  const invite = parseGameInvite(m.content);
  const storyReply = parseStoryReply(m.content);
  const postShare = parsePostShare(m.content);
  const register = (el: HTMLDivElement | null) => actions.register(m.id, el);

  // Round video "circles" render bare (no chat bubble).
  if (m.videoNoteUrl && !deleted) {
    return (
      <div ref={register} className={cn('mb-3 flex animate-message-in flex-col', mine ? 'items-end' : 'items-start')}>
        <VideoCircle url={m.videoNoteUrl} />
        <p className="mt-1 px-2 text-[11px] text-slate-500 dark:text-slate-400">
          {relativeTime(m.createdAt)}
          {mine && m.readAt ? ' - Read' : ''}
        </p>
      </div>
    );
  }

  // Structured cards carry JSON in `content`, so editing them as text would corrupt them.
  const isCard = !!invite || !!storyReply || !!postShare;
  const editable = mine && !deleted && !m.audioUrl && !m.videoNoteUrl && !m.videoUrl && !!m.content && !isCard;
  const copyable = !deleted && !!m.content && !isCard;
  const emojiOnly = !!m.content && !isCard && !m.imageUrl && !m.videoUrl && isEmojiOnly(m.content);
  const plainText = !deleted && !!m.content && !isCard && !m.imageUrl && !m.videoUrl && !m.audioUrl && !m.replyTo && !emojiOnly;
  const myReactions = (m.reactions ?? []).filter((r) => !!meId && r.userIds.includes(meId)).map((r) => r.emoji);

  const meta = (
    <>
      {relativeTime(m.createdAt)}
      {m.editedAt && !deleted ? ' · edited' : ''}
      {mine &&
        !deleted &&
        (m.readAt ? (
          <CheckCheck size={12} className="shrink-0" aria-label="Read" />
        ) : (
          <Check size={12} className="shrink-0 opacity-60" aria-label="Sent" />
        ))}
    </>
  );
  const metaColor = mine && !deleted ? 'text-white/70' : 'text-slate-500 dark:text-slate-400';

  const replyLabel = (kind: NonNullable<Message['replyTo']>['kind'], content: string | null) =>
    kind === 'deleted'
      ? t('messageDeleted')
      : kind === 'voice'
        ? `🎤 ${t('voiceMessage')}`
        : kind === 'video'
          ? `⭕ ${t('videoMessage')}`
          : kind === 'attachment-video'
            ? '🎬 Video'
            : content || `📷 ${t('photo')}`;

  return (
    <div
      ref={register}
      className={cn(
        'group mb-1.5 flex animate-message-in flex-col rounded-2xl transition-colors duration-500',
        highlighted && 'bg-brand/10',
        mine ? 'items-end' : 'items-start',
      )}
    >
      <div className={cn('flex max-w-[88%] items-end gap-1 sm:max-w-[78%]', mine ? 'flex-row-reverse' : 'flex-row')}>
        <div
          className={cn(
            'min-w-0 overflow-hidden',
            plainText ? 'px-3 py-1.5' : 'p-0.5',
            mine ? 'rounded-[1.15rem] rounded-br-md' : 'rounded-[1.15rem] rounded-bl-md',
            deleted
              ? 'border border-dashed border-slate-300 bg-transparent text-slate-400 dark:border-white/15 dark:text-slate-500'
              : mine
                ? 'bg-gradient-to-br from-brand to-brand/80 text-white shadow-md shadow-brand/25'
                : 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80 dark:bg-white/[0.07] dark:text-slate-100 dark:ring-white/10',
          )}
        >
          {deleted ? (
            <p className="px-2.5 py-1 text-sm italic">{t('messageDeleted')}</p>
          ) : (
            <>
              {m.replyTo && (
                <button
                  type="button"
                  onClick={() => actions.jump(m.replyTo!.id)}
                  className={cn(
                    'mx-1 mt-0.5 block w-[calc(100%-0.5rem)] rounded-xl border-l-4 px-2 py-1 text-left text-xs',
                    mine
                      ? 'border-white/60 bg-white/15 text-white/90'
                      : 'border-brand bg-brand/10 text-slate-600 dark:text-slate-300',
                  )}
                >
                  <span className="block font-semibold">{m.replyTo.senderId === meId ? 'You' : otherName}</span>
                  <span className="block truncate">{replyLabel(m.replyTo.kind, m.replyTo.content)}</span>
                </button>
              )}
              {m.imageUrl && (
                <img
                  src={m.imageUrl}
                  onClick={() => actions.lightbox(m.imageUrl!)}
                  loading="lazy"
                  decoding="async"
                  className="mb-1 max-h-72 w-full max-w-full cursor-pointer rounded-2xl object-cover"
                  alt="Photo"
                />
              )}
              {m.videoUrl && <VideoAttachment url={m.videoUrl} />}
              {m.audioUrl ? (
                <VoiceMessage url={m.audioUrl} durationMs={m.mediaDurationMs} mine={mine} />
              ) : invite ? (
                <GameInviteCard invite={invite} mine={mine} onJoin={() => actions.joinInvite(invite)} />
              ) : storyReply ? (
                <div className="px-2 py-1.5">
                  <p className={cn('mb-1.5 text-xs font-semibold', mine ? 'text-white/75' : 'text-slate-500 dark:text-slate-400')}>
                    {mine ? t('youRepliedToStory') : t('repliedToYourStory')}
                  </p>
                  <div className="flex items-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => storyReply.mediaType === 'IMAGE' && actions.lightbox(storyReply.mediaUrl)}
                      className="shrink-0 overflow-hidden rounded-xl border-l-4 border-brand/70 transition active:scale-95"
                      aria-label="View story"
                    >
                      {storyReply.mediaType === 'VIDEO' ? (
                        <video src={storyReply.mediaUrl} muted playsInline preload="metadata" className="h-24 w-16 object-cover" />
                      ) : (
                        <img src={storyReply.mediaUrl} className="h-24 w-16 object-cover" alt="Story" />
                      )}
                    </button>
                    {storyReply.text &&
                      (isEmojiOnly(storyReply.text) ? (
                        <span className="pb-1 text-4xl leading-none">{storyReply.text}</span>
                      ) : (
                        <p className="whitespace-pre-wrap break-words pb-1 leading-6 [overflow-wrap:anywhere]">{storyReply.text}</p>
                      ))}
                  </div>
                </div>
              ) : postShare ? (
                <button
                  type="button"
                  onClick={() => actions.openPost(postShare.postId)}
                  className="block w-56 max-w-full px-2 py-1.5 text-left transition active:scale-[0.98]"
                >
                  <p className={cn('mb-1 text-xs font-semibold', mine ? 'text-white/75' : 'text-slate-500 dark:text-slate-400')}>
                    {t('sharedAPost')}
                  </p>
                  <span
                    className={cn(
                      'block rounded-xl border p-2.5',
                      mine ? 'border-white/25 bg-white/10' : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.05]',
                    )}
                  >
                    <span className="block truncate text-sm font-semibold">
                      {postShare.authorName}{' '}
                      <span className={mine ? 'font-medium text-white/70' : 'font-medium text-slate-500 dark:text-slate-400'}>
                        @{postShare.authorUsername}
                      </span>
                    </span>
                    {postShare.excerpt && <span className="mt-0.5 line-clamp-3 block text-sm leading-5">{postShare.excerpt}</span>}
                  </span>
                </button>
              ) : (
                m.content &&
                (emojiOnly ? (
                  <p className="px-2 text-4xl leading-tight">{m.content}</p>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-snug [overflow-wrap:anywhere]">
                    {m.content}
                    <span className={cn('float-right ml-3 mt-2 inline-flex items-center gap-1 text-[10px] leading-none', metaColor)}>{meta}</span>
                  </p>
                ))
              )}
            </>
          )}
          {!plainText && (
            <p className={cn('flex items-center justify-end gap-1 px-2.5 pb-0.5 pt-0.5 text-[10px] leading-none', metaColor)}>{meta}</p>
          )}
        </div>

        {/* One compact entry point; reactions and actions live in the menu. */}
        {!deleted && (
          <button
            ref={anchorRef}
            type="button"
            onClick={() => (menuOpen ? actions.closeMenu() : actions.openMenu(m.id))}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Message actions"
            className={cn(
              iconButtonClass('ghost', 'sm'),
              'shrink-0 self-center transition-opacity motion-reduce:transition-none',
              menuOpen ? 'opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100',
            )}
          >
            <MoreHorizontal size={16} />
          </button>
        )}
      </div>

      {menuOpen && anchorRef.current && (
        <MessageMenu
          anchor={anchorRef.current}
          mine={mine}
          myReactions={myReactions}
          canForward={!!m.content && !deleted}
          canEdit={editable}
          canCopy={copyable}
          onReact={(emoji) => actions.react(m.id, emoji)}
          onReply={() => actions.reply(m)}
          onForward={() => actions.forward(m)}
          onEdit={() => actions.edit(m)}
          onCopy={() => actions.copy(m)}
          onDelete={() => actions.remove(m.id)}
          onClose={actions.closeMenu}
        />
      )}

      {!deleted && m.reactions && m.reactions.length > 0 && (
        <div role="group" aria-label="Reactions" className={cn('mt-1 flex max-w-[88%] flex-wrap gap-1 px-1', mine ? 'justify-end' : 'justify-start')}>
          {m.reactions.map((r) => {
            const mineReact = !!meId && r.userIds.includes(meId);
            return (
              <button
                key={r.emoji}
                type="button"
                aria-pressed={mineReact}
                aria-label={`${r.emoji} ${r.userIds.length} ${r.userIds.length === 1 ? 'reaction' : 'reactions'}${mineReact ? ', including yours' : ''}`}
                onClick={() => actions.react(m.id, r.emoji)}
                className={cn(
                  'flex min-h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold ring-1 transition-colors motion-reduce:transition-none',
                  mineReact
                    ? 'bg-brand/15 text-brand ring-brand/40'
                    : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10',
                )}
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span className="tabular-nums" aria-hidden="true">{r.userIds.length}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
