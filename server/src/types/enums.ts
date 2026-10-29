// Application-level enums. Stored as plain strings in the database so the
// schema works on both SQLite (local dev) and PostgreSQL (production), where
// these could alternatively be native enums.

export type MediaType = 'IMAGE' | 'VIDEO' | 'GIF';

export type NotificationType =
  | 'LIKE'
  | 'REPOST'
  | 'QUOTE'
  | 'FOLLOW'
  | 'MENTION'
  | 'REPLY';
