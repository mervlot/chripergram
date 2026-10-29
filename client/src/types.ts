export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string | null;
  link: string | null;
  location: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  createdAt: string;
  hasPassword: boolean;
  googleLinked: boolean;
  verified?: boolean;
  gameStatus?: string | null;
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  verified?: boolean;
  bio?: string | null;
  lastSeenAt?: string;
  isFollowing?: boolean;
  gameStatus?: string | null;
}

export type MediaType = 'IMAGE' | 'VIDEO' | 'GIF';

export interface Media {
  id: string;
  url: string;
  type: MediaType;
  width: number | null;
  height: number | null;
}

export interface PostCounts {
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  views: number;
}

export interface ViewerState {
  liked: boolean;
  bookmarked: boolean;
  reposted: boolean;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  endsAt: string;
  options: PollOption[];
  totalVotes: number;
  viewerVote: string | null;
}

export interface Post {
  id: string;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  parentId: string | null;
  author: UserSummary;
  media: Media[];
  hashtags: string[];
  counts: PostCounts;
  viewer: ViewerState;
  repostOf: Post | null;
  quotedPost: Post | null;
  poll?: Poll | null;
  pinned?: boolean;
  /** Set on flattened comment threads: the author of the comment this one answers (null if unavailable). */
  replyTo?: { id: string; username: string; displayName: string } | null;
  /** Flattened threads: original nesting depth below the top-level comment (1 = direct reply). */
  depth?: number;
  /** Flattened threads: id of the top-level comment that owns the thread. `parentId` stays the real parent. */
  rootCommentId?: string;
  /** Top-level comments: all descendants (replies at every depth), unlike `counts.replies` (direct only). */
  threadCount?: number;
}

export interface Relationship {
  isFollowing: boolean;
  isFollowedBy: boolean;
  isBlocked: boolean;
  isMuted: boolean;
  isSelf: boolean;
}

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  link: string | null;
  location: string | null;
  gameStatus?: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  verified?: boolean;
  lastSeenAt?: string;
  createdAt: string;
  pinnedPostId: string | null;
  counts: { followers: number; following: number; posts: number };
  relationship: Relationship;
}

export type NotificationType = 'LIKE' | 'REPOST' | 'QUOTE' | 'FOLLOW' | 'MENTION' | 'REPLY';

export interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  actor: UserSummary;
  post: { id: string; content: string | null; author: UserSummary } | null;
}

export interface Conversation {
  id: string;
  other: UserSummary;
  lastMessage: {
    id: string;
    content: string | null;
    imageUrl?: string | null;
    audioUrl?: string | null;
    videoNoteUrl?: string | null;
    videoUrl?: string | null;
    senderId: string;
    createdAt: string;
    readAt: string | null;
  } | null;
  unread: number;
  updatedAt: string;
}

export interface MessageReplySnippet {
  id: string;
  senderId: string;
  content: string | null;
  kind: 'text' | 'image' | 'voice' | 'video' | 'attachment-video' | 'deleted';
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  imageUrl: string | null;
  audioUrl?: string | null;
  videoNoteUrl?: string | null;
  /** Ordinary (non-round) video file attachment. */
  videoUrl?: string | null;
  mediaDurationMs?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyTo?: MessageReplySnippet | null;
  reactions?: MessageReaction[];
  readAt: string | null;
  createdAt: string;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface Community {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  isPrivate: boolean;
  ownerId: string;
  memberCount: number;
  postCount: number;
  isMember: boolean;
  role: 'OWNER' | 'MODERATOR' | 'MEMBER' | null;
  createdAt: string;
}

export interface CommunityMember extends UserSummary {
  role: 'OWNER' | 'MODERATOR' | 'MEMBER';
}

export interface CommunityMessage {
  id: string;
  communityId: string;
  senderId: string;
  sender: UserSummary;
  content: string;
  createdAt: string;
}

export interface Story {
  id: string;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  viewed: boolean;
  viewCount: number;
}

export interface StoryGroup {
  author: UserSummary;
  stories: Story[];
  allViewed: boolean;
}

export interface StoryViewerEntry extends UserSummary {
  viewedAt: string;
}

export interface Trend {
  tag: string;
  count: number;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface PostAnalytics {
  postId: string;
  createdAt: string;
  views: number;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  interactions: number;
  engagementRate: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
