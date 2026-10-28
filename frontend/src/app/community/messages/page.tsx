"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  type ChatLastMessage,
  type CommChatMessage,
  type CommunityChat,
  communityChats,
  communityChatMessageAttachmentBlob,
  communityChatMessages,
  communityGetChat,
  communitySendMessage,
  communityRevealIdentity,
  communityDeleteMessage,
  communityEditMessage,
  getCommunityAuthState,
} from "@/features/api";
import { CommunityMarkdown } from "@/features/community/components";
import { GroupChatSettingsModal } from "@/features/community/GroupChatSettingsModal";
import { ChatInputBar } from "@/features/community/ChatInputBar";
import { isMaskedCommunityAuthor } from "@/features/community/is-masked-author";
import { communityFeedTopicPath } from "@/features/community/topic-path";

// ── Time ──────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diffH = (Date.now() - d.getTime()) / 3600000;
  if (diffH < 24) return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function participantRuLabel(n: number): string {
  const k = n % 10;
  const kk = n % 100;
  if (kk >= 11 && kk <= 14) return "участников";
  if (k === 1) return "участник";
  if (k >= 2 && k <= 4) return "участника";
  return "участников";
}

function groupByDate(messages: CommChatMessage[]): { date: string; msgs: CommChatMessage[] }[] {
  const groups: { date: string; msgs: CommChatMessage[] }[] = [];
  for (const msg of messages) {
    const dateStr = new Date(msg.createdAt).toLocaleDateString("ru", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last && last.date === dateStr) last.msgs.push(msg);
    else groups.push({ date: dateStr, msgs: [msg] });
  }
  return groups;
}

function dedupeMembers<T extends { id: string }>(members: T[] | undefined): T[] {
  if (!members?.length) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of members) {
    const k = (m.id ?? "").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

/** Merge new delta messages into existing list, avoiding duplicates. */
function mergeMessages(existing: CommChatMessage[], incoming: CommChatMessage[]): CommChatMessage[] {
  if (incoming.length === 0) return existing;
  const existingIds = new Set(existing.map((m) => m.id));
  const fresh = incoming.filter((m) => !existingIds.has(m.id));
  if (fresh.length === 0) return existing;
  return [...existing, ...fresh];
}

// ── Avatar ────────────────────────────────────────────────────────

function ChatAvatar({
  name,
  size = 56,
  tint = "#007dff",
  photoUrl,
  className = "",
}: {
  name: string;
  size?: number;
  tint?: string;
  photoUrl?: string | null;
  className?: string;
}) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  // Only prepend API base for relative paths from our own server
  const isRelative = photoUrl && photoUrl.startsWith("/");
  const src = photoUrl ? (isRelative ? `${apiBase}${photoUrl}` : photoUrl) : null;
  const letter = (name.trim()[0] ?? "?").toUpperCase();

  return (
    <div
      className={`hub-chat-avatar ${className}`.trim()}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: src ? "#eef6ff" : `linear-gradient(135deg, ${tint}, #6366f1)`,
      }}
    >
      {src ? <img src={src} alt="" className="hub-chat-avatar__img" /> : letter}
    </div>
  );
}

// ── Chat list preview ─────────────────────────────────────────────

function formatChatLastPreview(lm: ChatLastMessage): string {
  const first = (lm.authorName.split(" ")[0] ?? lm.authorName).trim();
  const text = (lm.body ?? "").trim();
  const img = lm.hasAttachment;
  if (img && !text) return `${first}: 📷 Фото`;
  if (img && text) return `${first}: 📷 ${text}`;
  if (!text) return `${first}: Сообщение`;
  return `${first}: ${text}`;
}

// ── Chat list item ───────────────────────────────────────────────

function ChatListItem({
  chat,
  active,
  onClick,
  viewerId,
}: {
  chat: CommunityChat;
  active: boolean;
  onClick: () => void;
  viewerId: string | null;
}) {
  const fallbackName = chat.name ?? (chat.type === "dm" ? "Личное сообщение" : "Группа");
  const isDM = chat.type === "dm";
  const peer = isDM && viewerId ? chat.members.find((m) => m.id !== viewerId) : null;
  const name =
    isDM && peer
      ? `${peer.firstName} ${peer.lastName}`.trim() || peer.firstName || fallbackName
      : fallbackName;
  const preview = chat.lastMessage ? formatChatLastPreview(chat.lastMessage) : "Нет сообщений";

  return (
    <button type="button" onClick={onClick} className={`hub-chat-room-item${active ? " hub-chat-room-item--active" : ""}`}>
      <div className="hub-chat-room-item__avatar-wrap">
        <ChatAvatar
          name={peer?.firstName ?? name}
          size={56}
          tint={isDM ? "#10b981" : "#007dff"}
          photoUrl={peer?.avatarUrl ?? null}
        />
        {isDM ? <span className="hub-chat-room-item__dm-dot" aria-hidden /> : null}
      </div>
      <div className="hub-chat-room-info">
        <div className="hub-chat-room-info__top">
          <span className={`hub-chat-room-name${chat.unreadCount > 0 ? " hub-chat-room-name--unread" : ""}`}>{name}</span>
          {chat.lastMessage ? (
            <span className="hub-chat-room-time">{fmtTime(chat.lastMessage.createdAt)}</span>
          ) : null}
        </div>
        <div className="hub-chat-room-info__bottom">
          <span className="hub-chat-room-last">{preview}</span>
          {chat.unreadCount > 0 ? <span className="hub-chat-unread">{chat.unreadCount}</span> : null}
        </div>
      </div>
    </button>
  );
}

function ChatAttachmentImage({ messageId }: { messageId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void communityChatMessageAttachmentBlob(messageId).then(
      (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [messageId]);

  if (failed) {
    return <span className="hub-chat-msg__attach-fail">Не удалось загрузить вложение</span>;
  }
  if (!src) {
    return <div className="hub-chat-msg__attach-skel" aria-busy="true" aria-label="Загрузка вложения" />;
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="hub-chat-msg__attachment-link">
      <img src={src} alt="" className="hub-chat-msg__attachment-img" />
    </a>
  );
}

// ── Message bubble ────────────────────────────────────────────────

function MessageBubble({
  msg,
  isOwn,
  showAvatar,
  chatId,
  onDelete,
  onEdited,
}: {
  msg: CommChatMessage;
  isOwn: boolean;
  showAvatar: boolean;
  chatId: string;
  onDelete?: ((id: string) => void) | undefined;
  onEdited?: ((id: string, newBody: string, editedAt: string) => void) | undefined;
}) {
  const isAnon = isMaskedCommunityAuthor(msg.author);
  const bodyText = (msg.body ?? "").trim();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Focus edit textarea when entering edit mode
  useEffect(() => {
    if (isEditing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [isEditing]);

  const startEdit = () => {
    setEditDraft(bodyText);
    setIsEditing(true);
    setMenuOpen(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditDraft("");
  };

  const saveEdit = async () => {
    const trimmed = editDraft.trim();
    if (!trimmed || trimmed === bodyText || editSaving) return;
    setEditSaving(true);
    try {
      const res = await communityEditMessage(chatId, msg.id, trimmed);
      onEdited?.(msg.id, res.body, res.editedAt);
      setIsEditing(false);
    } catch {
      /* leave edit mode open so user can retry */
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void saveEdit();
    }
    if (e.key === "Escape") {
      cancelEdit();
    }
  };

  return (
    <div className={`hub-chat-msg${isOwn ? " hub-chat-msg--own" : ""}${isAnon ? " hub-chat-msg--anon" : ""}`}>
      <div className="hub-chat-msg__row">
        {!isOwn && (
          showAvatar ? (
            <ChatAvatar name={msg.author.firstName} size={48} tint={isAnon ? "#969fa3" : "#007dff"} photoUrl={msg.author.avatarUrl} />
          ) : (
            <div className="hub-chat-msg__avatar-spacer" aria-hidden />
          )
        )}
        <div className="hub-chat-msg__col">
          {!isOwn && showAvatar && (
            <div className="hub-chat-msg-author">
              {msg.author.firstName} {msg.author.lastName}
              {isAnon ? <span className="hub-chat-msg-author__anon"> · анонимно</span> : null}
            </div>
          )}

          {isEditing ? (
            <div className="hub-chat-msg-edit">
              <textarea
                ref={editRef}
                className="hub-chat-msg-edit__textarea"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={handleEditKeyDown}
                maxLength={4000}
                rows={3}
              />
              <div className="hub-chat-msg-edit__actions">
                <button
                  type="button"
                  className="hub-chat-msg-edit__cancel"
                  onClick={cancelEdit}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="hub-chat-msg-edit__save"
                  onClick={() => void saveEdit()}
                  disabled={editSaving || !editDraft.trim() || editDraft.trim() === bodyText}
                >
                  {editSaving ? "…" : "Сохранить"}
                </button>
              </div>
            </div>
          ) : (
            <div className="hub-chat-bubble hub-chat-bubble--md">
              {msg.hasAttachment ? <ChatAttachmentImage messageId={msg.id} /> : null}
              {bodyText ? <CommunityMarkdown body={msg.body} /> : null}
            </div>
          )}

          <div className={`hub-chat-msg-meta${isOwn ? " hub-chat-msg-meta--own" : ""}`}>
            {fmtFull(msg.createdAt)}
            {msg.editedAt ? <span className="hub-chat-msg-meta__edited">· изм.</span> : null}
            {isOwn && (onDelete || onEdited) ? (
              <div className="hub-chat-msg-actions" ref={menuRef}>
                <button
                  type="button"
                  className="hub-chat-msg-actions__trigger"
                  aria-label="Действия с сообщением"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  ···
                </button>
                {menuOpen ? (
                  <div className="hub-chat-msg-actions__menu" role="menu">
                    {!msg.hasAttachment && onEdited ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="hub-chat-msg-actions__item"
                        onClick={startEdit}
                      >
                        Редактировать
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="hub-chat-msg-actions__item hub-chat-msg-actions__item--danger"
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete(msg.id);
                        }}
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyChats() {
  return (
    <div className="hub-chat-empty">
      <div className="hub-chat-empty__icon hub-chat-empty__icon--accent">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="hub-chat-empty__title">Нет сообщений</div>
      <p className="hub-chat-empty__text">
        Группы появляются автоматически, когда закрывается обсуждение, в котором вы участвовали. Написать в личку можно с профиля участника.
      </p>
      <Link href="/community/topics" className="hub-btn-primary hub-chat-empty__cta">
        К обсуждениям
      </Link>
    </div>
  );
}

function NoChatSelected() {
  return (
    <div className="hub-chat-empty">
      <div className="hub-chat-empty__icon hub-chat-empty__icon--muted">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M8 10h.01M12 10h.01M16 10h.01" />
        </svg>
      </div>
      <div className="hub-chat-empty__title hub-chat-empty__title--sm">Выберите чат</div>
      <p className="hub-chat-empty__text">или начните новый разговор</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────

const POLL_INTERVAL = 4000;
/** Treat the user as "at the bottom" if they're within this many pixels of the end. */
const SCROLL_BOTTOM_THRESHOLD = 120;

type PendingChatAttachment = { file: File; previewObjectUrl: string };

function MessagesPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initChatId = params.get("chat");

  const [chats, setChats] = useState<CommunityChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(initChatId);
  const [messages, setMessages] = useState<CommChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /** Last opened chatId that we already called openChat for (prevents double-open on polling). */
  const urlChatSyncedRef = useRef<string | null>(null);

  const [pendingAttachment, setPendingAttachment] = useState<PendingChatAttachment | null>(null);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const pendingAttachRef = useRef<PendingChatAttachment | null>(null);
  pendingAttachRef.current = pendingAttachment;

  useEffect(() => () => {
    const p = pendingAttachRef.current;
    if (p?.previewObjectUrl) URL.revokeObjectURL(p.previewObjectUrl);
  }, []);

  const clearPendingAttachment = useCallback(() => {
    setPendingAttachment((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl);
      return null;
    });
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesRef = useRef(messages);
  const sendInFlightRef = useRef(false);
  /** Prevents concurrent poll ticks on slow networks where a tick takes > POLL_INTERVAL. */
  const pollingInFlightRef = useRef(false);
  messagesRef.current = messages;

  const activeChat = useMemo(() => chats.find((c) => c.id === activeChatId) ?? null, [chats, activeChatId]);
  const uniqueMembers = useMemo(() => dedupeMembers(activeChat?.members), [activeChat?.members]);
  const memberCount = uniqueMembers.length;
  const isGroup = activeChat?.type === "group";

  // ── Scroll helpers ──────────────────────────────────────────────

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // ── Data loading ────────────────────────────────────────────────

  useEffect(() => {
    const auth = getCommunityAuthState();
    if (!auth) {
      router.replace("/community");
      return;
    }
    setCurrentUserId(auth.userId);
    void loadChats();
  }, [router]);

  const loadChats = async () => {
    try {
      const data = await communityChats();
      setChats(data);
    } catch {
      /* ignore */
    }
  };

  const loadMessages = useCallback(async (chatId: string, append = false) => {
    if (!append) setMsgLoading(true);
    const atBottom = isNearBottom();
    try {
      const oldest = append && messagesRef.current.length > 0 ? messagesRef.current[0]?.id : undefined;
      const res = await communityChatMessages(chatId, oldest);
      const list = Array.isArray(res.messages) ? res.messages : [];
      if (append) {
        // Prepend older messages; preserve scroll position
        const container = scrollContainerRef.current;
        const prevScrollHeight = container?.scrollHeight ?? 0;
        setMessages((prev) => [...list, ...prev]);
        setHasMore(Boolean(res.hasMore));
        // Restore scroll position so user stays at the same spot
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop += container.scrollHeight - prevScrollHeight;
          }
        });
      } else {
        setMessages(list);
        setHasMore(Boolean(res.hasMore));
        if (atBottom) {
          requestAnimationFrame(() => scrollToBottom("instant"));
        }
      }
      await loadChats();
    } catch {
      /* ignore */
    } finally {
      setMsgLoading(false);
    }
  }, [isNearBottom, scrollToBottom]);

  const openChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId);
      /* Prevent URL sync effect from calling openChat again after replaceState (double fetch cleared UI). */
      urlChatSyncedRef.current = chatId;
      setMessages([]);
      setInput("");
      clearPendingAttachment();
      setHasMore(false);
      setMsgLoading(true);
      window.history.replaceState(null, "", `/community/messages?chat=${chatId}`);
      try {
        const [fresh, msgRes] = await Promise.all([communityGetChat(chatId), communityChatMessages(chatId)]);
        const list = Array.isArray(msgRes.messages) ? msgRes.messages : [];
        setChats((prev) => {
          const i = prev.findIndex((c) => c.id === chatId);
          if (i >= 0) {
            const next = [...prev];
            next[i] = fresh;
            return next;
          }
          return [...prev, fresh];
        });
        setMessages(list);
        setHasMore(Boolean(msgRes.hasMore));
        await loadChats();
        requestAnimationFrame(() => scrollToBottom("instant"));
      } catch {
        await loadMessages(chatId);
      } finally {
        setMsgLoading(false);
      }
    },
    [loadMessages, clearPendingAttachment, scrollToBottom],
  );

  useEffect(() => {
    if (!initChatId) {
      urlChatSyncedRef.current = null;
      return;
    }
    if (urlChatSyncedRef.current === initChatId) return;
    urlChatSyncedRef.current = initChatId;
    void openChat(initChatId);
  }, [initChatId, openChat]);

  useEffect(() => {
    setGroupSettingsOpen(false);
  }, [activeChatId]);

  // ── Delta polling ───────────────────────────────────────────────
  // Instead of replacing the whole message list, only fetch messages newer
  // than the last one we have. This preserves scroll position when the user
  // has scrolled up to read history.

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!activeChatId) return;

    pollRef.current = setInterval(async () => {
      // Skip this tick if the previous one is still in-flight (slow network).
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;

      const current = messagesRef.current;
      const lastMsg = current[current.length - 1];
      const atBottom = isNearBottom();

      try {
        const res = await communityChatMessages(
          activeChatId,
          undefined,            // before
          lastMsg?.id,          // after — delta fetch
        );
        const deltaList = Array.isArray(res.messages) ? res.messages : [];
        if (deltaList.length > 0) {
          setMessages((prev) => mergeMessages(prev, deltaList));
          if (atBottom) {
            requestAnimationFrame(() => scrollToBottom());
          }
        }
        await loadChats();
      } catch {
        /* ignore — will retry next tick */
      } finally {
        pollingInFlightRef.current = false;
      }
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeChatId, isNearBottom, scrollToBottom]);

  // ── Send ────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!activeChatId || sending || sendInFlightRef.current) return;
    const text = input.trim();
    const file = pendingAttachment?.file ?? null;
    if (!text && !file) return;
    sendInFlightRef.current = true;
    setInput("");
    const prevFile = file;
    clearPendingAttachment();
    setSending(true);
    try {
      const msg = await communitySendMessage(
        activeChatId,
        file ? { body: text, file } : text,
      );
      setMessages((prev) => mergeMessages(prev, [msg]));
      await loadChats();
      requestAnimationFrame(() => scrollToBottom());
    } catch {
      setInput(text);
      if (prevFile) {
        setPendingAttachment({
          file: prevFile,
          previewObjectUrl: URL.createObjectURL(prevFile),
        });
      }
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!activeChatId) return;
    try {
      await communityDeleteMessage(activeChatId, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      /* ignore — message may have already been deleted */
    }
  }, [activeChatId]);

  // ── Edit ────────────────────────────────────────────────────────

  const handleMessageEdited = useCallback((messageId: string, newBody: string, editedAt: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, body: newBody, editedAt } : m,
      ),
    );
  }, []);

  // ── Input ───────────────────────────────────────────────────────

  const handleImageFileSelected = useCallback((file: File) => {
    setPendingAttachment((prev) => {
      if (prev?.previewObjectUrl) URL.revokeObjectURL(prev.previewObjectUrl);
      return { file, previewObjectUrl: URL.createObjectURL(file) };
    });
  }, []);

  const refreshActiveChat = async () => {
    if (!activeChatId) return;
    try {
      const fresh = await communityGetChat(activeChatId);
      setChats((prev) => prev.map((c) => (c.id === activeChatId ? fresh : c)));
    } catch {
      /* ignore */
    }
  };

  const totalUnread = chats.reduce((acc, c) => acc + c.unreadCount, 0);
  const topicHref = activeChat?.topicId ? communityFeedTopicPath(activeChat.topicId) : null;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <>
      <div className={`hub-chat-page${activeChatId ? " hub-chat-page--thread" : ""}`}>
        <div className={`hub-chat-card${activeChatId ? " hub-chat-card--thread" : ""}`}>
          <aside className="hub-chat-sidebar">
            <div className="hub-chat-sidebar-header">
              <div className="hub-chat-sidebar-header__title-row">
                <span className="hub-chat-sidebar-header__title">Сообщения</span>
                {totalUnread > 0 ? <span className="hub-chat-unread hub-chat-unread--header">{totalUnread}</span> : null}
              </div>
              <p className="hub-chat-sidebar-header__sub">группы и личные</p>
            </div>

            <div className="hub-chat-sidebar-scroll">
              {chats.length === 0 ? (
                <div className="hub-chat-sidebar-placeholder">Чатов пока нет</div>
              ) : (
                <>
                  {chats.some((c) => c.type === "group") ? <div className="hub-chat-section-label">Группы</div> : null}
                  {chats
                    .filter((c) => c.type === "group")
                    .map((c) => (
                      <ChatListItem key={c.id} chat={c} active={activeChatId === c.id} onClick={() => void openChat(c.id)} viewerId={currentUserId} />
                    ))}

                  {chats.some((c) => c.type === "dm") ? <div className="hub-chat-section-label hub-chat-section-label--spaced">Личные сообщения</div> : null}
                  {chats
                    .filter((c) => c.type === "dm")
                    .map((c) => (
                      <ChatListItem key={c.id} chat={c} active={activeChatId === c.id} onClick={() => void openChat(c.id)} viewerId={currentUserId} />
                    ))}
                </>
              )}
            </div>
          </aside>

          <div className="hub-chat-main">
            {!activeChatId ? (
              chats.length === 0 ? (
                <EmptyChats />
              ) : (
                <NoChatSelected />
              )
            ) : (
              <>
                <header className="hub-chat-header">
                  <button
                    type="button"
                    className="hub-chat-back"
                    onClick={() => {
                      urlChatSyncedRef.current = null;
                      setActiveChatId(null);
                      window.history.replaceState(null, "", "/community/messages");
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    <span className="hub-chat-back__label">Назад</span>
                  </button>

                  <ChatAvatar name={activeChat?.name ?? "?"} size={44} tint={isGroup ? "#007dff" : "#10b981"} />

                  <div className="hub-chat-header__text">
                    <h1 className="hub-chat-header-title">{activeChat?.name ?? "Чат"}</h1>
                    {isGroup && memberCount > 0 ? (
                      <p className="hub-chat-header-sub">
                        <span>
                          {memberCount} {participantRuLabel(memberCount)}
                        </span>
                        {topicHref ? (
                          <>
                            {" · "}
                            <Link href={topicHref} className="hub-chat-header-sub__link">
                              открыть тему
                            </Link>
                          </>
                        ) : null}
                      </p>
                    ) : !isGroup ? (
                      <p className="hub-chat-header-sub hub-chat-header-sub--muted">Личный диалог</p>
                    ) : null}
                  </div>

                  <div className="hub-chat-header__actions">
                    {isGroup && activeChat?.myIsAnonymous ? (
                      <button
                        type="button"
                        className="hub-chat-reveal-btn"
                        onClick={async () => {
                          if (!activeChatId || revealing) return;
                          setRevealing(true);
                          try {
                            await communityRevealIdentity(activeChatId);
                            await refreshActiveChat();
                            await loadChats();
                          } catch {
                            /* ignore */
                          } finally {
                            setRevealing(false);
                          }
                        }}
                        disabled={revealing}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        {revealing ? "…" : <span className="hub-chat-reveal-btn__label">Раскрыть личность</span>}
                      </button>
                    ) : null}

                    {isGroup && uniqueMembers.length > 0 ? (
                      <div className="hub-chat-header-avatars" aria-hidden>
                        {uniqueMembers.slice(0, 5).map((m, i) => (
                          <span key={m.id} className="hub-chat-header-avatars__slot" style={{ zIndex: 10 - i }}>
                            <ChatAvatar name={m.firstName} size={28} tint={`hsl(${(i * 67) % 360}, 58%, 52%)`} photoUrl={m.avatarUrl} />
                          </span>
                        ))}
                        {uniqueMembers.length > 5 ? (
                          <span className="hub-chat-header-avatars__more">+{uniqueMembers.length - 5}</span>
                        ) : null}
                      </div>
                    ) : null}

                    {isGroup ? (
                      <button
                        type="button"
                        className="hub-chat-header-more"
                        aria-label="Настройки группы"
                        aria-haspopup="dialog"
                        aria-expanded={groupSettingsOpen}
                        onClick={() => setGroupSettingsOpen(true)}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </header>

                <div className="hub-chat-body" ref={scrollContainerRef}>
                  {hasMore ? (
                    <div className="hub-chat-load-more">
                      <button
                        type="button"
                        className="hub-btn-ghost hub-chat-load-more__btn"
                        onClick={() => activeChatId && void loadMessages(activeChatId, true)}
                      >
                        Загрузить старые сообщения
                      </button>
                    </div>
                  ) : null}

                  {msgLoading && messages.length === 0 ? <div className="hub-chat-loading">Загрузка…</div> : null}

                  {!msgLoading && messages.length === 0 ? (
                    <div className="hub-chat-thread-empty">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <p>Начните разговор!</p>
                    </div>
                  ) : null}

                  {groupByDate(messages).map((group) => (
                    <div key={group.date}>
                      <div className="hub-chat-day-sep">{group.date}</div>
                      {group.msgs.map((msg, i) => {
                        const isOwn = msg.author.id === currentUserId;
                        const prev = group.msgs[i - 1];
                        const showAvatar = !prev || prev.author.id !== msg.author.id;
                        return (
                          <MessageBubble
                            key={msg.id}
                            msg={msg}
                            isOwn={isOwn}
                            showAvatar={showAvatar}
                            chatId={activeChatId}
                            onDelete={isOwn ? handleDeleteMessage : undefined}
                            onEdited={isOwn ? handleMessageEdited : undefined}
                          />
                        );
                      })}
                    </div>
                  ))}

                  <div ref={bottomRef} />
                </div>

                <ChatInputBar
                  value={input}
                  onChange={setInput}
                  onSend={() => void handleSend()}
                  disabled={sending}
                  pendingAttachment={pendingAttachment}
                  onAttachFile={handleImageFileSelected}
                  onRemoveAttachment={clearPendingAttachment}
                  placeholder="Сообщение"
                />
              </>
            )}
          </div>
        </div>
      </div>

      <GroupChatSettingsModal
        open={groupSettingsOpen && !!activeChatId && isGroup}
        onClose={() => setGroupSettingsOpen(false)}
        chatId={activeChatId ?? ""}
        currentUserId={currentUserId}
        onChatUpdated={() => {
          void loadChats();
          void refreshActiveChat();
        }}
      />
    </>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
          <div className="hub-chat-page hub-chat-page--fallback">
            <p>Загрузка…</p>
          </div>
      }
    >
      <MessagesPageContent />
    </Suspense>
  );
}
