// Extracts #hashtags and @mentions from post text.
// Hashtags are normalised to lowercase, mentions keep their original case
// for lookup (usernames are matched case-insensitively in the service).

const HASHTAG_RE = /#(\w{1,50})/g;
const MENTION_RE = /@(\w{1,30})/g;

export function extractHashtags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(HASHTAG_RE)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

export function extractMentions(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    names.add(match[1].toLowerCase());
  }
  return [...names];
}
