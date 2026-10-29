import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, ImagePlus, Smile, X, Phone, Video, Search, Gamepad2, Mic, CircleDot, Trash2, Reply, Pencil, ChevronDown, Check, CheckCheck, Forward } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../store/auth';
import { toast as toastGlobal } from '../store/toast';
import { useT } from '../lib/i18n';
import { useRealtime } from '../store/realtime';
import { usePresence } from '../store/presence';
import { useCall } from '../store/call';
import { Avatar } from '../components/Avatar';
import { EmojiPicker } from '../components/EmojiPicker';
import { Lightbox } from '../components/Lightbox';
import { Modal } from '../components/Modal';
import { Dismiss } from '../components/Dismiss';
import { GameInviteCard } from '../components/GameInviteCard';
import { VoiceMessage } from '../components/VoiceMessage';
import { VideoCircle } from '../components/VideoCircle';
import { GameStatus } from '../components/GameStatus';
import { mediaErrorDetails, openMediaSettings, requestUserMedia } from '../lib/mediaAccess';
import type { MediaAccessKind } from '../lib/desktop';
import { relativeTime } from '../lib/format';
import { encodeGameInvite, messagePreview, parseGameInvite } from '../lib/gameInvite';
import { isEmojiOnly, parsePostShare, parseStoryReply } from '../lib/messageCards';
import {
  canRecordMedia,
  extensionForMime,
  supportedAudioMime,
  supportedVideoMime,
} from '../lib/recorder';
import type { Conversation, Media, Message } from '../types';
import { buttonClass, cn, iconButtonClass, ICON_SIZE, glass } from '../lib/ui';
import { BackButton, IconButton } from '../components/ui';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢'];

export function ChatPanel({ conversation }: { conversation: Conversation }) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const setDmUnread = useRealtime((s) => s.setDmUnread);
  const startCall = useCall((s) => s.startCall);
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const [mediaSettingsKind, setMediaSettingsKind] = useState<MediaAccessKind | null>(null);
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [gameInviteOpen, setGameInviteOpen] = useState(false);
  const [gameInvite, setGameInvite] = useState({ game: '', mode: '', startsAt: '', note: '' });
  const [recording, setRecording] = useState<null | 'audio' | 'video'>(null);
  const [recElapsed, setRecElapsed] = useState(0);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recStartRef = useRef(0);
  const recKindRef = useRef<'audio' | 'video'>('audio');
  const recCanceledRef = useRef(false);
  const recTimerRef = useRef<ReturnType<typeof setInterval>>();
  const circlePreviewRef = useRef<HTMLVideoElement>(null);

  const online = usePresence((s) => s.online[conversation.other.id]);
  const lastSeen = usePresence((s) => s.lastSeen[conversation.other.id]) ?? conversation.other.lastSeenAt;

  useEffect(() => {
    usePresence.getState().request([conversation.other.id]);
  }, [conversation.other.id]);

  function appendMessage(message: Message) {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }

  function refreshConversationPreview(message: Message) {
    queryClient.setQueryData<Conversation[]>(['conversations'], (current) => {
      const existing = current?.find((c) => c.id === conversation.id) ?? conversation;
      const updated: Conversation = {
        ...existing,
        lastMessage: {
          id: message.id,
          content:
            messagePreview(message.content) ||
            (message.audioUrl
              ? '🎤 Voice message'
              : message.videoNoteUrl
                ? '⭕ Video message'
                : message.imageUrl
                  ? '📷 Photo'
                  : ''),
          imageUrl: message.imageUrl,
          audioUrl: message.audioUrl,
          videoNoteUrl: message.videoNoteUrl,
          senderId: message.senderId,
          createdAt: message.createdAt,
          readAt: message.readAt,
        },
        unread: 0,
        updatedAt: message.createdAt,
      };
      return [updated, ...(current ?? []).filter((c) => c.id !== conversation.id)];
    });
  }

  function clearUnreadForActiveConversation() {
    let total: number | null = null;
    queryClient.setQueryData<Conversation[]>(['conversations'], (current) => {
      if (!current) return current;
      const next = current.map((c) => (c.id === conversation.id ? { ...c, unread: 0 } : c));
      total = next.reduce((sum, c) => sum + c.unread, 0);
      return next;
    });
    if (total !== null) setDmUnread(total);
  }

  useEffect(() => {
    let active = true;
    api
      .get<{ items: Message[]; nextCursor: string | null }>(`/conversations/${conversation.id}/messages`)
      .then(({ data }) => {
        if (!active) return;
        setMessages([...data.items].reverse());
        setNextCursor(data.nextCursor);
        setReplyTo(null);
        setEditing(null);
        clearUnreadForActiveConversation();
        setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
      });

    getSocket()?.emit('dm:read', { conversationId: conversation.id });
    api.post(`/conversations/${conversation.id}/read`).catch(() => {});

    return () => {
      active = false;
    };
  }, [conversation.id]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNew = (p: { conversationId: string; message: Message }) => {
      if (p.conversationId !== conversation.id) return;
      appendMessage(p.message);
      refreshConversationPreview(p.message);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
      if (p.message.senderId !== me?.id) {
        socket.emit('dm:read', { conversationId: conversation.id });
        api
          .post(`/conversations/${conversation.id}/read`)
          .then(() => clearUnreadForActiveConversation())
          .catch(() => {});
      }
    };
    const onRead = (p: { conversationId: string; readerId: string }) => {
      if (p.conversationId !== conversation.id || p.readerId !== conversation.other.id) return;
      const readAt = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.senderId === me?.id && !m.readAt ? { ...m, readAt } : m)));
    };
    const onTyping = (p: { fromUserId: string }) => {
      if (p.fromUserId !== conversation.other.id) return;
      setTyping(true);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTyping(false), 2500);
    };
    // Reaction added/removed, message edited or deleted → replace it in place.
    const onUpdate = (p: { conversationId: string; message: Message }) => {
      if (p.conversationId !== conversation.id) return;
      setMessages((prev) => prev.map((m) => (m.id === p.message.id ? p.message : m)));
      // Keep the sidebar preview in sync when the conversation's latest
      // message was edited or deleted.
      queryClient.setQueryData<Conversation[]>(['conversations'], (current) =>
        current?.map((c) =>
          c.id === conversation.id && c.lastMessage?.id === p.message.id
            ? {
                ...c,
                lastMessage: {
                  ...c.lastMessage,
                  content: p.message.deletedAt ? 'Message deleted' : p.message.content,
                  imageUrl: p.message.imageUrl,
                  audioUrl: p.message.audioUrl,
                  videoNoteUrl: p.message.videoNoteUrl,
                },
              }
            : c,
        ),
      );
    };

    socket.on('dm:new', onNew);
    socket.on('dm:read', onRead);
    socket.on('dm:typing', onTyping);
    socket.on('dm:update', onUpdate);
    return () => {
      socket.off('dm:new', onNew);
      socket.off('dm:read', onRead);
      socket.off('dm:typing', onTyping);
      socket.off('dm:update', onUpdate);
    };
  }, [conversation.id, conversation.other.id, me?.id, queryClient]);

  async function toggleReaction(messageId: string, emoji: string) {
    setMenuFor(null);
    try {
      await api.post(`/conversations/${conversation.id}/messages/${messageId}/react`, { emoji });
    } catch {
      /* realtime dm:update will reconcile; ignore transient errors */
    }
  }

  async function removeMessage(messageId: string) {
    setMenuFor(null);
    try {
      await api.delete(`/conversations/${conversation.id}/messages/${messageId}`);
    } catch (err) {
      setError(errorMessage(err, 'Could not delete message'));
    }
  }

  function startReply(m: Message) {
    setMenuFor(null);
    setEditing(null);
    setReplyTo(m);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function startEdit(m: Message) {
    setMenuFor(null);
    setReplyTo(null);
    setEditing(m);
    setText(m.content ?? '');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelComposerMode() {
    if (editing) setText('');
    setEditing(null);
    setReplyTo(null);
  }

  // Scroll to (and briefly highlight) the message a reply points at.
  function jumpToMessage(messageId: string) {
    const el = messageRefs.current[messageId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId((cur) => (cur === messageId ? null : cur)), 1600);
  }

  // One-line summary of a message shown in reply previews.
  function replySnippet(m: Pick<Message, 'content' | 'imageUrl' | 'audioUrl' | 'videoNoteUrl' | 'deletedAt'>) {
    if (m.deletedAt) return t('messageDeleted');
    if (m.audioUrl) return `🎤 ${t('voiceMessage')}`;
    if (m.videoNoteUrl) return `⭕ ${t('videoMessage')}`;
    const invite = parseGameInvite(m.content);
    if (invite) return `🎮 ${invite.game}`;
    if (m.content) return messagePreview(m.content) || m.content;
    if (m.imageUrl) return `📷 ${t('photo')}`;
    return 'Message';
  }

  async function loadOlder() {
    if (!nextCursor) return;
    const { data } = await api.get<{ items: Message[]; nextCursor: string | null }>(
      `/conversations/${conversation.id}/messages`,
      { params: { cursor: nextCursor } },
    );
    setMessages((prev) => [...[...data.items].reverse(), ...prev]);
    setNextCursor(data.nextCursor);
  }

  async function deliver(content: string, img: typeof image, replyToId?: string): Promise<boolean> {
    if ((!content && !img) || isSending) return false;
    setError('');
    setIsSending(true);
    try {
      let data: { message: Message };
      if (img) {
        const form = new FormData();
        if (content) form.append('content', content);
        if (replyToId) form.append('replyToId', replyToId);
        form.append('image', img.file);
        ({ data } = await api.post<{ message: Message }>(`/conversations/${conversation.id}/messages`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }));
      } else {
        ({ data } = await api.post<{ message: Message }>(`/conversations/${conversation.id}/messages`, {
          content,
          ...(replyToId ? { replyToId } : {}),
        }));
      }
      appendMessage(data.message);
      refreshConversationPreview(data.message);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'Could not send message'));
      return false;
    } finally {
      setIsSending(false);
    }
  }

  async function deliverMedia(kind: 'audio' | 'video', blob: Blob, durationMs: number) {
    if (isSending) return;
    setError('');
    setIsSending(true);
    try {
      const type = blob.type || (kind === 'audio' ? 'audio/webm' : 'video/webm');
      const field = kind === 'audio' ? 'audio' : 'videoNote';
      const form = new FormData();
      form.append(field, new File([blob], `${field}.${extensionForMime(type)}`, { type }));
      form.append('durationMs', String(Math.max(0, Math.round(durationMs))));
      const { data } = await api.post<{ message: Message }>(
        `/conversations/${conversation.id}/messages`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      appendMessage(data.message);
      refreshConversationPreview(data.message);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
    } catch (err) {
      setError(errorMessage(err, 'Could not send message'));
    } finally {
      setIsSending(false);
    }
  }

  function onRecordingStop() {
    clearInterval(recTimerRef.current);
    recStreamRef.current?.getTracks().forEach((t) => t.stop());
    recStreamRef.current = null;
    const kind = recKindRef.current;
    const durationMs = Date.now() - recStartRef.current;
    const chunks = recChunksRef.current;
    recChunksRef.current = [];
    recorderRef.current = null;
    const canceled = recCanceledRef.current;
    setRecording(null);
    setRecElapsed(0);
    if (canceled || chunks.length === 0 || durationMs < 600) return;
    const type = chunks[0]?.type || (kind === 'audio' ? 'audio/webm' : 'video/webm');
    void deliverMedia(kind, new Blob(chunks, { type }), durationMs);
  }

  async function startRecording(kind: 'audio' | 'video') {
    if (recording || isSending) return;
    if (!canRecordMedia()) {
      setError('Recording is not supported on this device');
      return;
    }
    try {
      const stream = await requestUserMedia(
        kind === 'audio'
          ? { audio: true }
          : { audio: true, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } } },
      );
      recStreamRef.current = stream;
      setMediaSettingsKind(null);
      recChunksRef.current = [];
      recCanceledRef.current = false;
      recKindRef.current = kind;
      const mime = kind === 'audio' ? supportedAudioMime() : supportedVideoMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) recChunksRef.current.push(e.data);
      };
      recorder.onstop = onRecordingStop;
      recorderRef.current = recorder;
      recorder.start();
      recStartRef.current = Date.now();
      setRecording(kind);
      setRecElapsed(0);
      recTimerRef.current = setInterval(
        () => setRecElapsed(Math.floor((Date.now() - recStartRef.current) / 1000)),
        250,
      );
      if (kind === 'video') {
        setTimeout(() => {
          if (circlePreviewRef.current) circlePreviewRef.current.srcObject = stream;
        }, 0);
      }
    } catch (err) {
      const details = mediaErrorDetails(err);
      setError(details.message);
      setMediaSettingsKind(details.settingsKind);
    }
  }

  function finishRecording(shouldSend: boolean) {
    recCanceledRef.current = !shouldSend;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      clearInterval(recTimerRef.current);
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
      setRecording(null);
    }
  }

  // Stop any in-progress recording if the chat unmounts (e.g. switching chats).
  useEffect(
    () => () => {
      clearInterval(recTimerRef.current);
      recCanceledRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();

    // Editing mode: PATCH the existing message instead of sending a new one.
    if (editing) {
      if (!content || isSending) return;
      setError('');
      setIsSending(true);
      try {
        await api.patch(`/conversations/${conversation.id}/messages/${editing.id}`, { content });
        setText('');
        setEditing(null);
        setEmojiOpen(false);
      } catch (err) {
        setError(errorMessage(err, 'Could not edit message'));
      } finally {
        setIsSending(false);
      }
      return;
    }

    const img = image;
    const reply = replyTo;
    if ((!content && !img) || isSending) return;
    setText('');
    setImage(null);
    setReplyTo(null);
    setEmojiOpen(false);
    const sent = await deliver(content, img, reply?.id);
    if (!sent) {
      setText(content);
      setImage(img);
      setReplyTo(reply);
    }
  }

  async function sendGameInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!gameInvite.game.trim() || isSending) return;
    const sent = await deliver(encodeGameInvite(gameInvite), null);
    if (sent) {
      setGameInviteOpen(false);
      setGameInvite({ game: '', mode: '', startsAt: '', note: '' });
    }
  }

  function pickImage(file: File | undefined) {
    if (file) setImage({ file, preview: URL.createObjectURL(file) });
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    getSocket()?.emit('dm:typing', { toUserId: conversation.other.id });
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleMessages = normalizedSearch
    ? messages.filter((message) => {
        const invite = parseGameInvite(message.content);
        return [
          message.content,
          invite?.game,
          invite?.mode,
          invite?.startsAt,
          invite?.note,
        ].some((value) => value?.toLowerCase().includes(normalizedSearch));
      })
    : messages;

  return (
    <div className="relative flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden">
      <div className={glass('top', 'safe-top z-10 flex min-h-16 shrink-0 items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3')}>
        <BackButton to="/messages" label="Back to conversations" className="-ml-1 md:hidden" />
        <Avatar user={conversation.other} showPresence />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold text-slate-950 dark:text-white">{conversation.other.displayName}</p>
            <GameStatus userId={conversation.other.id} status={conversation.other.gameStatus} />
          </div>
          <p className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">
            {online ? (
              <span className="text-green-600 dark:text-green-400">{t('activeNow')}</span>
            ) : lastSeen ? (
              `${t('lastSeen')} ${relativeTime(lastSeen)} ${t('ago')}`
            ) : (
              `@${conversation.other.username}`
            )}
          </p>
        </div>

        {/* Voice / video call this friend */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            className={iconButtonClass('ghost', 'md', 'brand')}
            aria-label="Search conversation"
            title="Search"
          >
            <Search size={19} />
          </button>
          <button
            onClick={() => startCall(conversation.other, 'audio')}
            className={iconButtonClass('ghost', 'md', 'brand')}
            aria-label="Start voice call"
            title="Voice call"
          >
            <Phone size={20} />
          </button>
          <button
            onClick={() => startCall(conversation.other, 'video')}
            className={iconButtonClass('ghost', 'md', 'brand')}
            aria-label="Start video call"
            title="Video call"
          >
            <Video size={20} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className={glass('top', 'shrink-0 px-3 py-2')}>
          <div className="search-field min-h-11">
            <Search size={17} className="shrink-0 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchMessages')}
              className="min-w-0 flex-1 bg-transparent outline-none"
              autoFocus
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className={iconButtonClass('ghost', 'sm')} aria-label="Clear search">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          // "Jump to latest" appears once the user scrolls up a screenful.
          setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 400);
        }}
        className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
      >
        {nextCursor && (
          <button onClick={loadOlder} className="mx-auto mb-4 block rounded-full px-4 py-2 text-sm font-semibold text-brand hover:bg-violet-50 dark:hover:bg-white/[0.06]">
            {t('loadOlder')}
          </button>
        )}
        {normalizedSearch && visibleMessages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">{t('noMatchingMessages')}</p>
        )}
        {visibleMessages.map((m) => {
          const mine = m.senderId === me?.id;
          const invite = parseGameInvite(m.content);
          const storyReply = parseStoryReply(m.content);
          const postShare = parsePostShare(m.content);

          // Round video "circles" render bare (no chat bubble).
          if (m.videoNoteUrl) {
            return (
              <div
                key={m.id}
                ref={(el) => {
                  messageRefs.current[m.id] = el;
                }}
                className={`mb-3 flex animate-message-in flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <VideoCircle url={m.videoNoteUrl} />
                <p className="mt-1 px-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {relativeTime(m.createdAt)}
                  {mine && m.readAt ? ' - Read' : ''}
                </p>
              </div>
            );
          }

          const deleted = !!m.deletedAt;
          // Structured cards (invites, story replies, shared posts) carry JSON
          // in their content, so editing them as text would corrupt the card.
          const editable =
            mine && !deleted && !m.audioUrl && !m.videoNoteUrl && !!m.content && !invite && !storyReply && !postShare;
          return (
            <div
              key={m.id}
              ref={(el) => {
                messageRefs.current[m.id] = el;
              }}
              className={`group mb-2 flex animate-message-in flex-col rounded-2xl transition-colors duration-500 ${
                highlightId === m.id ? 'bg-brand/10' : ''
              } ${mine ? 'origin-bottom-right items-end' : 'origin-bottom-left items-start'}`}
            >
              <div className={`flex max-w-[88%] items-center gap-1 sm:max-w-[80%] ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`overflow-hidden rounded-3xl px-1 py-1 shadow-sm ${
                    deleted
                      ? 'border border-dashed border-slate-300 bg-transparent text-slate-400 dark:border-white/15 dark:text-slate-500'
                      : mine
                        ? 'bg-brand text-white'
                        : 'border border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100'
                  }`}
                >
                  {deleted ? (
                    <p className="px-3 py-1 text-sm italic">{t('messageDeleted')}</p>
                  ) : (
                    <>
                      {m.replyTo && (
                        <button
                          type="button"
                          onClick={() => jumpToMessage(m.replyTo!.id)}
                          className={`mx-1 mt-0.5 block w-[calc(100%-0.5rem)] rounded-xl border-l-4 px-2 py-1 text-left text-xs ${
                            mine
                              ? 'border-white/60 bg-white/15 text-white/90'
                              : 'border-brand bg-brand/10 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span className="block font-semibold">
                            {m.replyTo.senderId === me?.id ? 'You' : conversation.other.displayName}
                          </span>
                          <span className="block truncate">
                            {m.replyTo.kind === 'deleted'
                              ? t('messageDeleted')
                              : m.replyTo.kind === 'voice'
                                ? `🎤 ${t('voiceMessage')}`
                                : m.replyTo.kind === 'video'
                                  ? `⭕ ${t('videoMessage')}`
                                  : m.replyTo.content || `📷 ${t('photo')}`}
                          </span>
                        </button>
                      )}
                      {m.imageUrl && (
                        <img
                          src={m.imageUrl}
                          onClick={() => setLightboxUrl(m.imageUrl)}
                          className="mb-1 max-h-72 w-full cursor-pointer rounded-2xl object-cover"
                          alt=""
                        />
                      )}
                      {m.audioUrl ? (
                        <VoiceMessage url={m.audioUrl} durationMs={m.mediaDurationMs} mine={mine} />
                      ) : invite ? (
                        <GameInviteCard
                          invite={invite}
                          mine={mine}
                          onJoin={() => {
                            setText(`I'm in for ${invite.game}${invite.mode ? ` - ${invite.mode}` : ''}.`);
                            setTimeout(() => inputRef.current?.focus(), 0);
                          }}
                        />
                      ) : storyReply ? (
                        <div className="px-2 py-1.5">
                          <p className={`mb-1.5 text-xs font-semibold ${mine ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'}`}>
                            {mine ? t('youRepliedToStory') : t('repliedToYourStory')}
                          </p>
                          <div className="flex items-end gap-2.5">
                            <button
                              type="button"
                              onClick={() => storyReply.mediaType === 'IMAGE' && setLightboxUrl(storyReply.mediaUrl)}
                              className="shrink-0 overflow-hidden rounded-xl border-l-4 border-brand/70 transition active:scale-95"
                              aria-label="View story"
                            >
                              {storyReply.mediaType === 'VIDEO' ? (
                                <video src={storyReply.mediaUrl} muted playsInline className="h-24 w-16 object-cover" />
                              ) : (
                                <img src={storyReply.mediaUrl} className="h-24 w-16 object-cover" alt="Story" />
                              )}
                            </button>
                            {storyReply.text &&
                              (isEmojiOnly(storyReply.text) ? (
                                <span className="pb-1 text-4xl leading-none">{storyReply.text}</span>
                              ) : (
                                <p className="whitespace-pre-wrap break-words pb-1 leading-6">{storyReply.text}</p>
                              ))}
                          </div>
                        </div>
                      ) : postShare ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/post/${postShare.postId}`)}
                          className={`block w-56 max-w-full px-2 py-1.5 text-left transition active:scale-[0.98]`}
                        >
                          <p className={`mb-1 text-xs font-semibold ${mine ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'}`}>
                            {t('sharedAPost')}
                          </p>
                          <span
                            className={`block rounded-xl border p-2.5 ${
                              mine
                                ? 'border-white/25 bg-white/10'
                                : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.05]'
                            }`}
                          >
                            <span className="block truncate text-sm font-semibold">
                              {postShare.authorName}{' '}
                              <span className={mine ? 'font-medium text-white/70' : 'font-medium text-slate-500 dark:text-slate-400'}>
                                @{postShare.authorUsername}
                              </span>
                            </span>
                            {postShare.excerpt && (
                              <span className="mt-0.5 line-clamp-3 block text-sm leading-5">{postShare.excerpt}</span>
                            )}
                          </span>
                        </button>
                      ) : (
                        m.content && <p className="whitespace-pre-wrap break-words px-3 py-1 leading-6">{m.content}</p>
                      )}
                    </>
                  )}
                  <p className={`flex items-center gap-1 px-3 pb-1 text-[11px] ${mine && !deleted ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'}`}>
                    {relativeTime(m.createdAt)}
                    {m.editedAt && !deleted ? ' - edited' : ''}
                    {mine &&
                      !deleted &&
                      (m.readAt ? (
                        <CheckCheck size={13} className="shrink-0" aria-label="Read" />
                      ) : (
                        <Check size={13} className="shrink-0 opacity-60" aria-label="Sent" />
                      ))}
                  </p>
                </div>

                {/* React / delete control */}
                {!deleted && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setMenuFor((cur) => (cur === m.id ? null : m.id))}
                      className={cn(iconButtonClass('ghost', 'sm'), 'sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100')}
                      aria-label="React or delete"
                    >
                      <Smile size={16} />
                    </button>
                    {menuFor === m.id && (
                      <>
                        <Dismiss onDismiss={() => setMenuFor(null)} />
                        <div
                          className={glass('floating', 'rounded-full', `absolute bottom-full z-20 mb-1 flex items-center gap-1 p-1 ${
                            mine ? 'right-0' : 'left-0'
                          }`)}
                        >
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => toggleReaction(m.id, emoji)}
                              className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition-colors duration-150 hover:bg-white/10 active:bg-white/15 motion-reduce:transition-none"
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => startReply(m)}
                            className={iconButtonClass('ghost', 'sm')}
                            aria-label="Reply"
                            title="Reply"
                          >
                            <Reply size={16} />
                          </button>
                          {!!m.content && (
                            <button
                              type="button"
                              onClick={() => {
                                setMenuFor(null);
                                setForwardMsg(m);
                              }}
                              className={iconButtonClass('ghost', 'sm')}
                              aria-label="Forward message"
                              title="Forward"
                            >
                              <Forward size={16} />
                            </button>
                          )}
                          {editable && (
                            <button
                              type="button"
                              onClick={() => startEdit(m)}
                              className={iconButtonClass('ghost', 'sm')}
                              aria-label="Edit message"
                              title="Edit"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {mine && (
                            <button
                              type="button"
                              onClick={() => removeMessage(m.id)}
                              className={iconButtonClass('ghost', 'sm', 'danger')}
                              aria-label="Delete message"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Reaction chips */}
              {m.reactions && m.reactions.length > 0 && (
                <div className={`mt-1 flex flex-wrap gap-1 px-1 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {m.reactions.map((r) => {
                    const mineReact = !!me && r.userIds.includes(me.id);
                    return (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => toggleReaction(m.id, r.emoji)}
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 transition ${
                          mineReact
                            ? 'bg-brand/15 text-brand ring-brand/30 dark:text-violet-300'
                            : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10'
                        }`}
                      >
                        <span>{r.emoji}</span>
                        <span className="tabular-nums">{r.userIds.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {typing && (
          <div className="flex animate-message-in items-center gap-2 px-1 text-sm font-medium text-slate-500 dark:text-slate-400">
            <span>{conversation.other.displayName} {t('isTyping')}</span>
            <span className="flex items-end gap-0.5 pb-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-slate-400 dark:bg-slate-500"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showJump && (
        <IconButton
          label="Jump to latest messages"
          variant="glass"
          tone="brand"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-24 right-4 z-10 animate-scale-in"
        >
          <ChevronDown size={ICON_SIZE.lg} />
        </IconButton>
      )}

      {error && (
        <div className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
          <span>{error}</span>
          {mediaSettingsKind && (
            <button
              type="button"
              onClick={() => openMediaSettings(mediaSettingsKind)}
              className="shrink-0 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Open settings
            </button>
          )}
        </div>
      )}

      {(replyTo || editing) && (
        <div className="flex items-center gap-3 border-t border-slate-200/80 px-3 pt-2 dark:border-white/10">
          <span className="shrink-0 text-brand">{editing ? <Pencil size={18} /> : <Reply size={18} />}</span>
          <div className="min-w-0 flex-1 border-l-4 border-brand/60 pl-2">
            <p className="text-xs font-semibold text-brand">
              {editing
                ? t('editMessage')
                : `${t('replyingTo')} ${replyTo!.senderId === me?.id ? t('yourself') : conversation.other.displayName}`}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {replySnippet(editing ?? replyTo!)}
            </p>
          </div>
          <button type="button" onClick={cancelComposerMode} className={iconButtonClass('ghost', 'sm')} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>
      )}

      {image && (
        <div className="flex items-center gap-3 border-t border-slate-200/80 px-3 pt-3 dark:border-white/10">
          <div className="relative">
            <img src={image.preview} className="h-16 w-16 rounded-2xl object-cover" alt="" />
            <IconButton label="Remove image" variant="glass" size="sm" onClick={() => setImage(null)} className="absolute -right-3 -top-3">
              <X size={ICON_SIZE.sm} />
            </IconButton>
          </div>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Image attached</span>
        </div>
      )}

      {/* Live round preview while recording a video circle */}
      {recording === 'video' && (
        <div className="flex justify-center pb-2">
          <div className="relative h-44 w-44 overflow-hidden rounded-full ring-2 ring-rose-400/60">
            <video ref={circlePreviewRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
          </div>
        </div>
      )}

      {recording ? (
        <div className={glass('bottom', 'flex min-w-0 shrink-0 items-center gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3')}>
          <button type="button" onClick={() => finishRecording(false)} className={iconButtonClass('ghost', 'md', 'danger')} aria-label="Cancel recording" title="Cancel">
            <Trash2 size={20} />
          </button>
          <div className="flex flex-1 items-center gap-2 text-slate-700 dark:text-slate-200">
            <span className="h-3 w-3 animate-pulse rounded-full bg-rose-500 motion-reduce:animate-none" />
            <span className="text-sm font-semibold tabular-nums">
              {recording === 'video' ? 'Recording circle' : 'Recording voice'} · {Math.floor(recElapsed / 60)}:
              {String(recElapsed % 60).padStart(2, '0')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => finishRecording(true)}
            disabled={isSending}
            className={cn(buttonClass({ variant: 'primary', iconOnly: true, pill: true }), 'shrink-0')}
            aria-label="Send recording"
          >
            <Send size={18} />
          </button>
        </div>
      ) : (
        <form
          onSubmit={send}
          className={glass('bottom', 'flex min-w-0 shrink-0 items-end gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 sm:gap-1.5 sm:px-3 sm:pt-3')}
        >
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} className={iconButtonClass('ghost', 'md', 'brand')} aria-label="Attach image">
            <ImagePlus size={20} />
          </button>
          <button
            type="button"
            onClick={() => setGameInviteOpen(true)}
            className={iconButtonClass('ghost', 'md', 'brand')}
            aria-label="Create game invite"
            title="Game invite"
          >
            <Gamepad2 size={20} />
          </button>
          <div className="relative shrink-0">
            <button type="button" onClick={() => setEmojiOpen((o) => !o)} className={iconButtonClass('ghost', 'md', 'brand')} aria-label="Add emoji">
              <Smile size={20} />
            </button>
            {emojiOpen && <EmojiPicker onPick={(emoji) => setText((t) => t + emoji)} onClose={() => setEmojiOpen(false)} />}
          </div>
          <textarea
            ref={inputRef}
            value={text}
            onChange={onInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(e);
              } else if (e.key === 'Escape' && (replyTo || editing)) {
                e.preventDefault();
                cancelComposerMode();
              }
            }}
            rows={1}
            placeholder={t('messagePlaceholder')}
            className="input max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl px-3 py-2 leading-6"
          />
          <button
            type="button"
            onClick={() => startRecording('video')}
            className={iconButtonClass('ghost', 'md', 'brand')}
            aria-label="Record video circle"
            title="Video message"
          >
            <CircleDot size={20} />
          </button>
          {text.trim() || image ? (
            <button
              type="submit"
              disabled={isSending}
              className={cn(buttonClass({ variant: 'primary', iconOnly: true, pill: true }), 'shrink-0')}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startRecording('audio')}
              className={cn(buttonClass({ variant: 'primary', iconOnly: true, pill: true }), 'shrink-0')}
              aria-label="Record voice message"
              title="Voice message"
            >
              <Mic size={18} />
            </button>
          )}
        </form>
      )}

      {lightboxUrl && (
        <Lightbox
          media={[{ id: 'dm', url: lightboxUrl, type: 'IMAGE', width: null, height: null } as Media]}
          onClose={() => setLightboxUrl(null)}
        />
      )}

      <Modal open={gameInviteOpen} onClose={() => setGameInviteOpen(false)} title="Invite to game">
        <form onSubmit={sendGameInvite} className="space-y-4 pt-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Game</span>
            <input
              className="input"
              value={gameInvite.game}
              onChange={(e) => setGameInvite((current) => ({ ...current, game: e.target.value }))}
              maxLength={60}
              placeholder="Valorant, Minecraft, CS2..."
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Mode or squad</span>
            <input
              className="input"
              value={gameInvite.mode}
              onChange={(e) => setGameInvite((current) => ({ ...current, mode: e.target.value }))}
              maxLength={60}
              placeholder="Ranked duo, raid, casual..."
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">When</span>
            <input
              className="input"
              value={gameInvite.startsAt}
              onChange={(e) => setGameInvite((current) => ({ ...current, startsAt: e.target.value }))}
              maxLength={80}
              placeholder="Tonight at 20:00"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Note</span>
            <textarea
              className="input min-h-20 resize-none"
              value={gameInvite.note}
              onChange={(e) => setGameInvite((current) => ({ ...current, note: e.target.value }))}
              maxLength={240}
              placeholder="Need one support player. Voice chat on."
            />
          </label>
          <button type="submit" className={buttonClass({ variant: 'primary', fullWidth: true })} disabled={!gameInvite.game.trim() || isSending}>
            <Gamepad2 size={18} /> {isSending ? 'Sending...' : 'Send squad invite'}
          </button>
        </form>
      </Modal>

      {forwardMsg && (
        <ForwardModal
          message={forwardMsg}
          currentConversationId={conversation.id}
          onClose={() => setForwardMsg(null)}
        />
      )}
    </div>
  );
}

// Picker for forwarding a text/card message into another conversation.
function ForwardModal({
  message,
  currentConversationId,
  onClose,
}: {
  message: Message;
  currentConversationId: string;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () =>
      (await api.get<{ conversations: Conversation[] }>('/conversations')).data.conversations,
  });
  const targets = (conversations ?? []).filter((c) => c.id !== currentConversationId);

  async function forwardTo(target: Conversation) {
    if (sendingTo) return;
    setSendingTo(target.id);
    try {
      await api.post(`/conversations/${target.id}/messages`, { content: message.content });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toastGlobal(`${t('forwardedTo')} ${target.other.displayName}`, 'success');
      onClose();
    } catch {
      toastGlobal('Could not forward the message', 'error');
      setSendingTo(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('forwardMessage')}>
      <p className="mb-2 truncate rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
        {messagePreview(message.content) || t('messagePlaceholder')}
      </p>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : targets.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{t('noOtherConversations')}</p>
      ) : (
        <div className="max-h-80 overflow-y-auto py-1">
          {targets.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!!sendingTo}
              onClick={() => forwardTo(c)}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-violet-50 disabled:opacity-60 dark:hover:bg-white/[0.06]"
            >
              <Avatar user={c.other} linkable={false} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.other.displayName}</p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">@{c.other.username}</p>
              </div>
              <span className="text-sm font-semibold text-brand">{sendingTo === c.id ? t('sending') : t('send')}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
