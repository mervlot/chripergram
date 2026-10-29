// Structured "card" messages carried inside a DM's text content, following
// the same convention as lib/gameInvite: a versioned prefix + JSON payload.
// The server treats them as plain text; only the client renders them richly.

const STORY_PREFIX = 'MURMUR_STORY_REPLY_V1:';
const POST_PREFIX = 'MURMUR_POST_SHARE_V1:';

export interface StoryReplyCard {
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  caption: string;
  text: string;
}

export interface PostShareCard {
  postId: string;
  authorUsername: string;
  authorName: string;
  excerpt: string;
}

export function encodeStoryReply(card: StoryReplyCard): string {
  return `${STORY_PREFIX}${JSON.stringify({
    mediaUrl: card.mediaUrl.slice(0, 500),
    mediaType: card.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
    caption: card.caption.trim().slice(0, 200),
    text: card.text.trim().slice(0, 500),
  })}`;
}

export function parseStoryReply(value: string | null | undefined): StoryReplyCard | null {
  if (!value?.startsWith(STORY_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(STORY_PREFIX.length)) as Partial<StoryReplyCard>;
    if (typeof parsed.mediaUrl !== 'string' || !parsed.mediaUrl) return null;
    return {
      mediaUrl: parsed.mediaUrl,
      mediaType: parsed.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      caption: typeof parsed.caption === 'string' ? parsed.caption : '',
      text: typeof parsed.text === 'string' ? parsed.text : '',
    };
  } catch {
    return null;
  }
}

export function encodePostShare(card: PostShareCard): string {
  return `${POST_PREFIX}${JSON.stringify({
    postId: card.postId,
    authorUsername: card.authorUsername.slice(0, 20),
    authorName: card.authorName.slice(0, 50),
    excerpt: card.excerpt.trim().slice(0, 160),
  })}`;
}

export function parsePostShare(value: string | null | undefined): PostShareCard | null {
  if (!value?.startsWith(POST_PREFIX)) return null;
  try {
    const parsed = JSON.parse(value.slice(POST_PREFIX.length)) as Partial<PostShareCard>;
    if (typeof parsed.postId !== 'string' || !parsed.postId) return null;
    return {
      postId: parsed.postId,
      authorUsername: typeof parsed.authorUsername === 'string' ? parsed.authorUsername : '',
      authorName: typeof parsed.authorName === 'string' ? parsed.authorName : '',
      excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : '',
    };
  } catch {
    return null;
  }
}

// True when a story reply is just a single quick-reaction emoji (rendered big).
export function isEmojiOnly(text: string): boolean {
  return text.length > 0 && text.length <= 8 && !/[\w\s]/.test(text);
}
