import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Paperclip, Smile, X, Phone, Video, Search, Gamepad2, Mic, CircleDot, Trash2, Reply, Pencil, ChevronDown, Pause, Play, Loader2 } from 'lucide-react';
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
import { GameStatus } from '../components/GameStatus';
import { mediaErrorDetails, openMediaSettings, requestUserMedia } from '../lib/mediaAccess';
import type { MediaAccessKind } from '../lib/desktop';
import { relativeTime } from '../lib/format';
import { encodeGameInvite, messagePreview, parseGameInvite, type GameInvite } from '../lib/gameInvite';
import {
  canRecordMedia,
  extensionForMime,
  supportedAudioMime,
  supportedVideoMime,
} from '../lib/recorder';
import { RecorderSession, type RecKind, type RecResult, type RecState } from '../lib/recorderSession';
import { hasReacted, reconcileReactions, setReaction } from '../lib/reactions';
import { ATTACHMENT_ACCEPT, attachmentProblem, baseMime, classifyAttachment, type AttachmentKind } from '../lib/attachments';
import { MessageRow, type RowActions } from '../components/chat/MessageRow';
import type { Conversation, Media, Message } from '../types';
import { buttonClass, cn, iconButtonClass, ICON_SIZE, glass } from '../lib/ui';
import { BackButton, GlassPopover, IconButton, MenuItem } from '../components/ui';

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
  const [attachment, setAttachment] = useState<{ file: File; preview: string; kind: AttachmentKind } | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [gameInviteOpen, setGameInviteOpen] = useState(false);
  const [gameInvite, setGameInvite] = useState({ game: '', mode: '', startsAt: '', note: '' });
  const [recState, setRecState] = useState<RecState>('idle');
  const [recKind, setRecKind] = useState<RecKind>('audio');
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
  const sessionRef = useRef<RecorderSession | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval>>();
  const circlePreviewRef = useRef<HTMLVideoElement>(null);
  const sendingRef = useRef(false); // synchronous guard: state updates are too late to stop a double-tap
  const messagesRef = useRef<Message[]>([]);
  const pendingReact = useRef<Map<string, Map<string, boolean>>>(new Map()); // messageId -> emoji -> desired
  const reactBusy = useRef<Set<string>>(new Set());
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);
  const lastTypingEmit = useRef(0);
  const emojiToggleRef = useRef<HTMLButtonElement>(null);
  const mountedRef = useRef(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingRecording, setPendingRecording] = useState<RecResult | null>(null);
  messagesRef.current = messages;
  const activeConv = useRef(conversation.id);
  activeConv.current = conversation.id;
  const recording: RecKind | null = recState === 'recording' || recState === 'paused' || recState === 'finalizing' ? recKind : null;

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
                : message.videoUrl
                  ? '🎬 Video'
                  : message.imageUrl
                    ? '📷 Photo'
                    : ''),
          imageUrl: message.imageUrl,
          audioUrl: message.audioUrl,
          videoNoteUrl: message.videoNoteUrl,
          videoUrl: message.videoUrl,
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
    setLoadError('');
    setTyping(false);
    setMenuFor(null);
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
      })
      .catch((err) => {
        if (active) setLoadError(errorMessage(err, 'Could not load messages'));
      });

    getSocket()?.emit('dm:read', { conversationId: conversation.id });
    api.post(`/conversations/${conversation.id}/read`).catch(() => {});

    return () => {
      active = false;
      clearTimeout(typingTimeout.current);
    };
  }, [conversation.id, reloadKey]);

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
      // Only the other participant can trigger the indicator, never ourselves.
      if (p.fromUserId === me?.id || p.fromUserId !== conversation.other.id) return;
      setTyping(true);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTyping(false), 2500);
    };
    // Reaction added/removed, message edited or deleted → replace it in place.
    const onUpdate = (p: { conversationId: string; message: Message }) => {
      if (p.conversationId !== conversation.id) return;
      // Re-apply our own not-yet-acknowledged reaction toggles so an update that
      // was produced before the server saw them cannot flicker the UI back.
      const pend = pendingReact.current.get(p.message.id);
      const incoming =
        pend && pend.size && me
          ? { ...p.message, reactions: reconcileReactions(p.message.reactions, pend, me.id) }
          : p.message;
      setMessages((prev) => prev.map((m) => (m.id === incoming.id ? incoming : m)));
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
                  videoUrl: p.message.videoUrl,
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
      clearTimeout(typingTimeout.current);
      socket.off('dm:new', onNew);
      socket.off('dm:read', onRead);
      socket.off('dm:typing', onTyping);
      socket.off('dm:update', onUpdate);
    };
  }, [conversation.id, conversation.other.id, me?.id, queryClient]);

  // Optimistic reaction toggle. Per (message, emoji) only one request may be in
  // flight (extra taps are ignored), a realtime update is reconciled with the
  // still-pending intent, and a failed request is rolled back with feedback.
  async function toggleReaction(messageId: string, emoji: string) {
    setMenuFor(null);
    if (!me) return;
    const key = `${messageId}:${emoji}`;
    if (reactBusy.current.has(key)) return;
    const target = messagesRef.current.find((m) => m.id === messageId);
    if (!target || target.deletedAt) return;

    const desired = !hasReacted(target.reactions, emoji, me.id);
    reactBusy.current.add(key);
    const pend = pendingReact.current.get(messageId) ?? new Map<string, boolean>();
    pend.set(emoji, desired);
    pendingReact.current.set(messageId, pend);
    const apply = (present: boolean) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: setReaction(m.reactions, emoji, me.id, present) } : m)),
      );
    apply(desired);

    try {
      const { data } = await api.post<{ message: Message | null }>(
        `/conversations/${conversation.id}/messages/${messageId}/react`,
        { emoji },
      );
      pend.delete(emoji);
      if (!pend.size) pendingReact.current.delete(messageId);
      const fresh = data.message;
      if (fresh) {
        const reactions = reconcileReactions(fresh.reactions, pend, me.id);
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...fresh, reactions } : m)));
      }
    } catch (err) {
      pend.delete(emoji);
      if (!pend.size) pendingReact.current.delete(messageId);
      apply(!desired); // roll back exactly this toggle
      toastGlobal(errorMessage(err, 'Could not update reaction'), 'error');
    } finally {
      reactBusy.current.delete(key);
    }
  }

  async function copyText(m: Message) {
    setMenuFor(null);
    try {
      await navigator.clipboard.writeText(m.content ?? '');
      toastGlobal('Copied', 'success');
    } catch {
      toastGlobal('Could not copy the message', 'error');
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
  function replySnippet(m: Pick<Message, 'content' | 'imageUrl' | 'audioUrl' | 'videoNoteUrl' | 'videoUrl' | 'deletedAt'>) {
    if (m.deletedAt) return t('messageDeleted');
    if (m.audioUrl) return `🎤 ${t('voiceMessage')}`;
    if (m.videoNoteUrl) return `⭕ ${t('videoMessage')}`;
    const invite = parseGameInvite(m.content);
    if (invite) return `🎮 ${invite.game}`;
    if (m.content) return messagePreview(m.content) || m.content;
    if (m.videoUrl) return '🎬 Video';
    if (m.imageUrl) return `📷 ${t('photo')}`;
    return 'Message';
  }

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    const convId = conversation.id;
    setLoadingOlder(true);
    try {
      const { data } = await api.get<{ items: Message[]; nextCursor: string | null }>(
        `/conversations/${convId}/messages`,
        { params: { cursor: nextCursor } },
      );
      if (convId !== activeConv.current) return; // user switched chats meanwhile
      const el = scrollRef.current;
      if (el) restoreScroll.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...[...data.items].reverse().filter((m) => !seen.has(m.id)), ...prev];
      });
      setNextCursor(data.nextCursor);
    } catch (err) {
      toastGlobal(errorMessage(err, 'Could not load older messages'), 'error');
    } finally {
      setLoadingOlder(false);
    }
  }

  const progress = (e: { loaded: number; total?: number }) => {
    if (e.total) setUploadPct(Math.min(100, Math.round((e.loaded / e.total) * 100)));
  };

  // The multipart Content-Type is deliberately NOT set by hand: the browser
  // must generate the boundary itself.
  async function deliver(content: string, att: typeof attachment, replyToId?: string): Promise<boolean> {
    if ((!content && !att) || sendingRef.current) return false;
    sendingRef.current = true;
    setError('');
    setIsSending(true);
    setUploadPct(att ? 0 : null);
    try {
      let data: { message: Message };
      if (att) {
        const form = new FormData();
        if (content) form.append('content', content);
        if (replyToId) form.append('replyToId', replyToId);
        form.append(att.kind === 'video' ? 'video' : 'image', att.file);
        ({ data } = await api.post<{ message: Message }>(`/conversations/${conversation.id}/messages`, form, {
          onUploadProgress: progress,
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
      sendingRef.current = false;
      setIsSending(false);
      setUploadPct(null);
    }
  }

  // Uploads a finished recording. On failure the recording is kept so the user
  // can retry instead of losing it (the devices are already released by then).
  async function deliverMedia(rec: RecResult): Promise<boolean> {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setError('');
    setIsSending(true);
    setUploadPct(0);
    try {
      // Send only the base type: a codec list like "video/webm;codecs=vp9,opus"
      // contains an unquoted comma that multipart parsers can fail to read.
      const type = baseMime(rec.blob.type) || (rec.kind === 'audio' ? 'audio/webm' : 'video/webm');
      const field = rec.kind === 'audio' ? 'audio' : 'videoNote';
      const form = new FormData();
      form.append(field, new File([rec.blob], `${field}.${extensionForMime(type)}`, { type }));
      form.append('durationMs', String(Math.max(0, Math.round(rec.durationMs))));
      const { data } = await api.post<{ message: Message }>(`/conversations/${conversation.id}/messages`, form, {
        onUploadProgress: progress,
      });
      setPendingRecording(null);
      appendMessage(data.message);
      refreshConversationPreview(data.message);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
      return true;
    } catch (err) {
      setPendingRecording(rec);
      setError(errorMessage(err, 'Could not send the recording'));
      return false;
    } finally {
      sendingRef.current = false;
      setIsSending(false);
      setUploadPct(null);
    }
  }

  function getSession(): RecorderSession {
    if (!sessionRef.current) {
      sessionRef.current = new RecorderSession(
        {
          getUserMedia: requestUserMedia,
          createRecorder: (stream, mime) => new MediaRecorder(stream, mime ? { mimeType: mime } : undefined),
          pickMime: (k) => (k === 'audio' ? supportedAudioMime() : supportedVideoMime()),
        },
        (state) => {
          if (mountedRef.current) setRecState(state);
        },
      );
    }
    return sessionRef.current;
  }

  async function startRecording(kind: RecKind) {
    if (recState !== 'idle' || sendingRef.current) return;
    if (!canRecordMedia()) {
      setError('Recording is not supported on this device');
      return;
    }
    setPendingRecording(null);
    setError('');
    setMediaSettingsKind(null);
    setRecKind(kind);
    setRecElapsed(0);
    try {
      await getSession().start(kind);
    } catch (err) {
      if (!mountedRef.current) return;
      const details = mediaErrorDetails(err);
      setError(details.message);
      setMediaSettingsKind(details.settingsKind);
    }
  }

  async function finishRecording(shouldSend: boolean) {
    const session = sessionRef.current;
    if (!session) return;
    if (!shouldSend) {
      await session.cancel(); // never yields a result, so nothing can be uploaded
      return;
    }
    const result = await session.stop();
    if (!mountedRef.current) return;
    if (result) await deliverMedia(result);
    else setError('That recording was too short or empty. Hold the button a little longer and try again.');
  }

  function togglePause() {
    const session = sessionRef.current;
    if (!session) return;
    if (session.state === 'paused') session.resume();
    else session.pause();
  }

  // Release devices on unmount AND on tab-hide / page-hide: a backgrounded page
  // must not keep the camera or microphone open (Android shows the indicator
  // for as long as any track is live).
  useEffect(() => {
    mountedRef.current = true;
    const abandon = () => {
      void sessionRef.current?.cancel();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') abandon();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', abandon);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', abandon);
      clearInterval(recTimerRef.current);
      sessionRef.current?.dispose();
      sessionRef.current = null;
      if (circlePreviewRef.current) circlePreviewRef.current.srcObject = null;
    };
  }, []);

  // Elapsed-time ticker only runs while actually recording (not paused/finalizing).
  useEffect(() => {
    clearInterval(recTimerRef.current);
    if (recState === 'recording') {
      recTimerRef.current = setInterval(
        () => setRecElapsed(Math.floor((sessionRef.current?.elapsedMs() ?? 0) / 1000)),
        250,
      );
    }
    if (recState === 'idle') setRecElapsed(0);
    return () => clearInterval(recTimerRef.current);
  }, [recState]);

  // Attach the live stream to the round preview while recording/paused and
  // always detach it otherwise, so no camera preview outlives the recording.
  useEffect(() => {
    const video = circlePreviewRef.current;
    if (!video) return;
    const live = recKind === 'video' && (recState === 'recording' || recState === 'paused');
    video.srcObject = live ? (sessionRef.current?.stream ?? null) : null;
    return () => {
      video.srcObject = null;
    };
  }, [recState, recKind]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sendingRef.current) return;
    const content = text.trim();

    // Editing mode: PATCH the existing message instead of sending a new one.
    if (editing) {
      if (!content) return;
      sendingRef.current = true;
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
        sendingRef.current = false;
        setIsSending(false);
      }
      return;
    }

    const att = attachment;
    const reply = replyTo;
    if (!content && !att) return;
    // The draft, attachment and reply target stay in place until the server
    // accepts the message, so a failed upload never loses them.
    const sent = await deliver(content, att, reply?.id);
    if (sent) {
      setText((cur) => (cur.trim() === content ? '' : cur));
      setAttachment(null);
      setReplyTo(null);
      setEmojiOpen(false);
    }
  }

  async function sendGameInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!gameInvite.game.trim() || sendingRef.current) return;
    const sent = await deliver(encodeGameInvite(gameInvite), null);
    if (sent) {
      setGameInviteOpen(false);
      setGameInvite({ game: '', mode: '', startsAt: '', note: '' });
    }
  }

  function pickAttachment(file: File | undefined) {
    if (!file) return;
    const problem = attachmentProblem(file);
    const kind = classifyAttachment(file);
    if (problem || !kind) {
      setError(problem ?? 'Unsupported file');
      return;
    }
    setError('');
    setAttachment({ file, preview: URL.createObjectURL(file), kind });
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    setText(el.value);
    // Auto-grow up to the CSS max-height.
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    // Throttle typing pings instead of emitting one per keystroke.
    const now = Date.now();
    if (now - lastTypingEmit.current > 1500) {
      lastTypingEmit.current = now;
      getSocket()?.emit('dm:typing', { toUserId: conversation.other.id });
    }
  }

  // Insert at the caret (replacing any selection) and restore the caret after.
  const insertEmoji = useCallback((emoji: string) => {
    const el = inputRef.current;
    const base = el?.value ?? '';
    const start = el?.selectionStart ?? base.length;
    const end = el?.selectionEnd ?? base.length;
    const next = base.slice(0, start) + emoji + base.slice(end);
    if (next.length > 2000) return;
    setText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + emoji.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, []);

  // Revoke object URLs when the preview is replaced, removed, sent or unmounted.
  useEffect(() => {
    const url = attachment?.preview;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment?.preview]);

  // Restore scroll position after older messages are prepended.
  useLayoutEffect(() => {
    const saved = restoreScroll.current;
    const el = scrollRef.current;
    if (saved && el) {
      el.scrollTop = el.scrollHeight - saved.height + saved.top;
      restoreScroll.current = null;
    }
  }, [messages]);

  // Android: when the virtual keyboard resizes the visual viewport, keep the latest message visible.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const el = scrollRef.current;
      if (el && document.activeElement === inputRef.current && el.scrollHeight - el.scrollTop - el.clientHeight < 600) {
        bottomRef.current?.scrollIntoView();
      }
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // Callbacks for memoized rows. Identity is stable; they always call the latest handlers.
  const latest = useRef({ toggleReaction, removeMessage, startReply, startEdit, copyText, jumpToMessage });
  latest.current = { toggleReaction, removeMessage, startReply, startEdit, copyText, jumpToMessage };
  const rowActions: RowActions = useMemo(
    () => ({
      register: (id, el) => {
        messageRefs.current[id] = el;
      },
      openMenu: (id) => setMenuFor(id),
      closeMenu: () => setMenuFor(null),
      react: (id, emoji) => void latest.current.toggleReaction(id, emoji),
      reply: (m) => latest.current.startReply(m),
      forward: (m) => {
        setMenuFor(null);
        setForwardMsg(m);
      },
      edit: (m) => latest.current.startEdit(m),
      remove: (id) => void latest.current.removeMessage(id),
      copy: (m) => void latest.current.copyText(m),
      jump: (id) => latest.current.jumpToMessage(id),
      lightbox: (url) => setLightboxUrl(url),
      joinInvite: (invite: GameInvite) => {
        setText(`I'm in for ${invite.game}${invite.mode ? ` - ${invite.mode}` : ''}.`);
        setTimeout(() => inputRef.current?.focus(), 0);
      },
      openPost: (postId) => navigate(`/post/${postId}`),
    }),
    [navigate],
  );

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
            aria-expanded={searchOpen}
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
        {loadError && (
          <div className="mx-auto mb-4 flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
            <span>{loadError}</span>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="shrink-0 font-semibold underline">
              Retry
            </button>
          </div>
        )}
        {nextCursor && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            className="mx-auto mb-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-brand hover:bg-white/[0.05] disabled:opacity-60"
          >
            {loadingOlder && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />}
            {t('loadOlder')}
          </button>
        )}
        {normalizedSearch && visibleMessages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">{t('noMatchingMessages')}</p>
        )}
        {visibleMessages.map((m) => (
          <MessageRow
            key={m.id}
            m={m}
            meId={me?.id}
            otherName={conversation.other.displayName}
            highlighted={highlightId === m.id}
            menuOpen={menuFor === m.id}
            actions={rowActions}
          />
        ))}
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
        <div role="alert" className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
          <span className="min-w-0 break-words">{error}</span>
          <span className="flex shrink-0 items-center gap-2">
            {pendingRecording && (
              <>
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => void deliverMedia(pendingRecording)}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingRecording(null);
                    setError('');
                  }}
                  className="rounded-full px-2 py-1.5 text-xs font-semibold"
                >
                  Discard
                </button>
              </>
            )}
            {mediaSettingsKind && (
              <button
                type="button"
                onClick={() => openMediaSettings(mediaSettingsKind)}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Open settings
              </button>
            )}
          </span>
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

      {attachment && (
        <div className="flex items-center gap-3 border-t border-slate-200/80 px-3 pt-3 dark:border-white/10">
          <div className="relative shrink-0">
            {attachment.kind === 'video' ? (
              <video src={attachment.preview} muted playsInline preload="metadata" className="h-16 w-16 rounded-2xl bg-black object-cover" />
            ) : (
              <img src={attachment.preview} className="h-16 w-16 rounded-2xl object-cover" alt="" />
            )}
            <IconButton
              label={attachment.kind === 'video' ? 'Remove video' : 'Remove image'}
              variant="glass"
              size="sm"
              disabled={isSending}
              onClick={() => setAttachment(null)}
              className="absolute -right-3 -top-3"
            >
              <X size={ICON_SIZE.sm} />
            </IconButton>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-600 dark:text-slate-300">{attachment.file.name || (attachment.kind === 'video' ? 'Video' : 'Image')}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {uploadPct !== null ? `Uploading ${uploadPct}%` : `${(attachment.file.size / 1024 / 1024).toFixed(1)} MB`}
            </p>
            {uploadPct !== null && (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10" role="progressbar" aria-valuenow={uploadPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-brand transition-[width] motion-reduce:transition-none" style={{ width: `${uploadPct}%` }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live round preview while recording a video circle (detached automatically afterwards) */}
      {recording === 'video' && (
        <div className="flex justify-center pb-2">
          <div className="relative h-40 w-40 overflow-hidden rounded-full ring-2 ring-rose-400/60 sm:h-44 sm:w-44">
            <video ref={circlePreviewRef} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
          </div>
        </div>
      )}

      {recState === 'requesting' || recording ? (
        <div className={glass('bottom', 'flex min-w-0 shrink-0 items-center gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3')}>
          <button
            type="button"
            onClick={() => void finishRecording(false)}
            disabled={recState === 'finalizing'}
            className={iconButtonClass('ghost', 'md', 'danger')}
            aria-label="Cancel recording"
            title="Cancel"
          >
            <Trash2 size={20} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-slate-700 dark:text-slate-200" role="status" aria-live="polite">
            {recState === 'requesting' ? (
              <>
                <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />
                <span className="truncate text-sm font-semibold">Waiting for {recKind === 'video' ? 'camera' : 'microphone'} permission…</span>
              </>
            ) : (
              <>
                <span
                  className={cn('h-3 w-3 shrink-0 rounded-full', recState === 'recording' ? 'animate-pulse bg-rose-500 motion-reduce:animate-none' : 'bg-slate-400')}
                />
                <span className="truncate text-sm font-semibold tabular-nums">
                  {recState === 'paused' ? 'Paused' : recState === 'finalizing' ? 'Finishing…' : recKind === 'video' ? 'Recording circle' : 'Recording voice'} ·{' '}
                  {Math.floor(recElapsed / 60)}:{String(recElapsed % 60).padStart(2, '0')}
                </span>
              </>
            )}
          </div>
          {recording && (
            <button
              type="button"
              onClick={togglePause}
              disabled={recState === 'finalizing'}
              className={iconButtonClass('ghost', 'md')}
              aria-label={recState === 'paused' ? 'Resume recording' : 'Pause recording'}
              title={recState === 'paused' ? 'Resume' : 'Pause'}
            >
              {recState === 'paused' ? <Play size={20} /> : <Pause size={20} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void finishRecording(true)}
            disabled={recState !== 'recording' && recState !== 'paused'}
            className={cn(buttonClass({ variant: 'primary', iconOnly: true, pill: true }), 'shrink-0')}
            aria-label="Send recording"
          >
            {recState === 'finalizing' ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" /> : <Send size={18} />}
          </button>
        </div>
      ) : (
        <form
          onSubmit={send}
          className={glass('bottom', 'flex min-w-0 shrink-0 items-end gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 sm:gap-1.5 sm:px-3 sm:pt-3')}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            hidden
            onChange={(e) => {
              pickAttachment(e.target.files?.[0]);
              e.target.value = ''; // allow re-picking the same file
            }}
          />
          <ComposerMenu
            onAttach={() => fileRef.current?.click()}
            onGameInvite={() => setGameInviteOpen(true)}
            onVideoCircle={() => void startRecording('video')}
            videoCircleDisabled={isSending || !canRecordMedia()}
          />
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={inputRef}
              value={text}
              onChange={onInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(e);
                } else if (e.key === 'Escape' && emojiOpen) {
                  e.preventDefault();
                  setEmojiOpen(false);
                } else if (e.key === 'Escape' && (replyTo || editing)) {
                  e.preventDefault();
                  cancelComposerMode();
                }
              }}
              rows={1}
              maxLength={2000}
              enterKeyHint="send"
              placeholder={t('messagePlaceholder')}
              aria-label={t('messagePlaceholder')}
              className="input max-h-32 min-h-11 w-full min-w-0 resize-none rounded-2xl py-2 pl-3 pr-11 leading-6"
            />
            <button
              ref={emojiToggleRef}
              type="button"
              onClick={() => setEmojiOpen((o) => !o)}
              className={cn(iconButtonClass('ghost', 'sm', 'brand'), 'absolute bottom-1.5 right-1.5')}
              aria-label="Add emoji"
              aria-expanded={emojiOpen}
            >
              <Smile size={20} />
            </button>
            {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} ignoreRef={emojiToggleRef} className="right-0" />}
          </div>
          {text.trim() || attachment ? (
            <button
              type="submit"
              disabled={isSending}
              className={cn(buttonClass({ variant: 'primary', iconOnly: true, pill: true }), 'shrink-0')}
              aria-label="Send message"
            >
              {isSending ? <Loader2 size={18} className="animate-spin motion-reduce:animate-none" /> : <Send size={18} />}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRecording('audio')}
              disabled={isSending || !canRecordMedia()}
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

// "+" menu in the composer: keeps the bar compact (attach / game invite / video message).
function ComposerMenu({
  onAttach,
  onGameInvite,
  onVideoCircle,
  videoCircleDisabled,
}: {
  onAttach: () => void;
  onGameInvite: () => void;
  onVideoCircle: () => void;
  videoCircleDisabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Attach or create"
        className={iconButtonClass('ghost', 'md', 'brand')}
      >
        <Paperclip size={20} />
      </button>
      {open && (
        <GlassPopover role="menu" aria-label="Attach" className="absolute bottom-full left-0 z-30 mb-2 w-56">
          <MenuItem icon={<Paperclip size={17} />} onClick={run(onAttach)}>
            Photo or video
          </MenuItem>
          <MenuItem icon={<CircleDot size={17} />} disabled={videoCircleDisabled} onClick={run(onVideoCircle)}>
            Video message
          </MenuItem>
          <MenuItem icon={<Gamepad2 size={17} />} onClick={run(onGameInvite)}>
            Game invite
          </MenuItem>
        </GlassPopover>
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
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-white/[0.045] disabled:opacity-60"
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
