import { z } from 'zod';

// Names that would collide with app routes or impersonate the service.
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'support', 'help', 'root', 'system', 'moderator', 'mod', 'staff', 'official',
  'chirpergram', 'security', 'privacy', 'terms', 'cookies', 'acceptable', 'login', 'logout', 'register',
  'settings', 'home', 'explore', 'search', 'messages', 'notifications', 'bookmarks', 'black', 'api', 'null',
  'undefined', 'verify', 'about', 'legal',
]);
const username = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers and underscore are allowed')
  .refine((v) => !RESERVED_USERNAMES.has(v.toLowerCase()), 'That username is reserved');

// bcrypt only uses the first 72 bytes, so anything longer is silently
// truncated; cap it explicitly instead of pretending it all counts.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyuiop',
  'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'letmein123', 'abc12345', '11111111',
  'chirpergram', 'chirpergram1',
]);
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(72, 'Password must be at most 72 characters')
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), 'Password must include at least one letter and one number')
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), 'That password is too common — choose another');

// ───────────────────────── Auth ─────────────────────────

export const registerSchema = z.object({
  email: z.string().trim().email('Invalid email').max(254),
  username,
  displayName: z.string().trim().min(1, 'Display name is required').max(50),
  password,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms and Privacy Policy to create an account' }),
  }),
  // Optional, unticked by default: consent to non-essential email.
  marketingOptIn: z.boolean().optional(),
});

const otpCode = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const verifyEmailSchema = z.object({
  email: z.string().trim().email('Invalid email').max(254),
  code: otpCode,
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().email('Invalid email').max(254),
});

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or username is required').max(100),
});

export const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or username is required').max(100),
  code: otpCode,
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: password,
});

// ──────────────────────── Profile ────────────────────────

const emptyToNull = (v: unknown) => (v === '' ? null : v);

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.preprocess(emptyToNull, z.string().max(160).nullable().optional()),
  link: z.preprocess(emptyToNull, z.string().url('Must be a valid URL').max(200).nullable().optional()),
  location: z.preprocess(emptyToNull, z.string().max(50).nullable().optional()),
  gameStatus: z.preprocess(emptyToNull, z.string().max(60).nullable().optional()),
});

// ───────────────────────── Posts ─────────────────────────

export const createPostSchema = z.object({
  // Content is optional because a post may be media-only.
  content: z.string().max(280, 'Posts are limited to 280 characters').optional(),
  parentId: z.string().uuid().optional(),
  quotedPostId: z.string().uuid().optional(),
  // When set, the post is published into a community (group) feed.
  communityId: z.string().uuid().optional(),
  // Optional attached poll as a JSON string ({ options, durationHours });
  // parsed by the controller and validated in the service.
  poll: z.string().max(1000).optional(),
});

export const votePollSchema = z.object({
  optionId: z.string().uuid(),
});

export const postIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const quoteSchema = z.object({
  content: z.string().max(280).optional(),
});

export const updatePostSchema = z.object({
  content: z.string().max(280, 'Posts are limited to 280 characters').optional(),
});

// ─────────────────────── Stories ───────────────────────

export const createStorySchema = z.object({
  caption: z.string().max(200, 'Captions are limited to 200 characters').optional(),
});

// ─────────────────────── Messages ───────────────────────

export const startConversationSchema = z.object({
  username: z.string().min(1),
});

export const sendMessageSchema = z.object({
  // Optional because a message may be an image / voice / video note with no text.
  content: z.string().max(2000).optional(),
  // Length of a voice message or video note (ms), sent alongside the file.
  durationMs: z.coerce.number().int().nonnegative().max(86_400_000).optional(),
  // Reply to another message in the same conversation.
  replyToId: z.string().uuid().optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
});

export const reactMessageSchema = z.object({
  emoji: z.string().min(1).max(16),
});

// ────────────────────── Communities ──────────────────────

export const createCommunitySchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50),
  slug: z
    .string()
    .max(30)
    .regex(/^[a-zA-Z0-9-]+$/, 'Only letters, numbers and hyphens are allowed')
    .optional(),
  description: z.preprocess(emptyToNull, z.string().max(280).nullable().optional()),
  isPrivate: z.coerce.boolean().optional(),
});

export const communityMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
});

// ───────────────── Pagination / queries ─────────────────

export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const repliesQuerySchema = cursorQuerySchema.extend({
  sort: z.enum(['top', 'new']).optional(),
});

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  // Opaque token that pins a ranked "For you" session so paging stays stable.
  token: z.string().max(64).optional(),
});

// Batch of post ids the viewer actually saw on screen.
export const recordViewsSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(50),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  type: z.enum(['top', 'users', 'posts']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const profileTabQuerySchema = z.object({
  tab: z.enum(['posts', 'replies', 'media', 'likes']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
