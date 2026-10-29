const PREFIX = 'MURMUR_GAME_INVITE_V1:';

export interface GameInvite {
  game: string;
  mode: string;
  startsAt: string;
  note: string;
}

export function encodeGameInvite(invite: GameInvite): string {
  return `${PREFIX}${JSON.stringify({
    game: invite.game.trim().slice(0, 60),
    mode: invite.mode.trim().slice(0, 60),
    startsAt: invite.startsAt.trim().slice(0, 80),
    note: invite.note.trim().slice(0, 240),
  })}`;
}

export function parseGameInvite(value: string | null | undefined): GameInvite | null {
  if (!value?.startsWith(PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(PREFIX.length)) as Partial<GameInvite>;
    if (typeof parsed.game !== 'string' || !parsed.game.trim()) return null;
    return {
      game: parsed.game.trim(),
      mode: typeof parsed.mode === 'string' ? parsed.mode.trim() : '',
      startsAt: typeof parsed.startsAt === 'string' ? parsed.startsAt.trim() : '',
      note: typeof parsed.note === 'string' ? parsed.note.trim() : '',
    };
  } catch {
    return null;
  }
}

import { parsePostShare, parseStoryReply } from './messageCards';

export function messagePreview(value: string | null | undefined): string {
  const invite = parseGameInvite(value);
  if (invite) return `Game invite: ${invite.game}`;
  const storyReply = parseStoryReply(value);
  if (storyReply) return storyReply.text ? `Story reply: ${storyReply.text}` : 'Replied to a story';
  const postShare = parsePostShare(value);
  if (postShare) return `Shared @${postShare.authorUsername}'s post`;
  return value ?? '';
}
