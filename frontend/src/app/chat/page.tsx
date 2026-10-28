"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatMessage,
  getChatMessages,
  pollChatMessages,
  readAuthState,
  sendCelebration,
  sendChatMessage,
} from "@/features/api";
import { AppShell, Card, EmptyState, InlineAlert, SectionHeader } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

const POLL_INTERVAL = 5000;

function SystemMessageBubble({ msg, lang }: { msg: ChatMessage; lang: "ru" | "en" }) {
  const body = msg.body;
  const parts = body.split(" / ");
  const display = lang === "ru" ? (parts[0] ?? body) : (parts[1] ?? parts[0] ?? body);

  const eventIcons: Record<string, string> = {
    lesson_completed: "\u2705",
    homework_submitted: "\ud83d\udcdd",
    homework_approved: "\ud83c\udf89",
    homework_rejected: "\ud83d\udd04",
    day_unlocked: "\ud83d\ude80",
    achievement: "\ud83c\udfc6",
    celebration: "\ud83c\udf8a",
  };
  const icon = eventIcons[msg.eventType ?? ""] ?? "\u2139\ufe0f";

  return (
    <div className="chat-system-msg">
      <span className="chat-system-icon">{icon}</span>
      <span className="chat-system-text">{display}</span>
    </div>
  );
}

function UserMessageBubble({
  msg,
  isOwn,
  onCelebrate,
  lang,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  onCelebrate: (userId: string) => void;
  lang: "ru" | "en";
}) {
  return (
    <div className={`chat-msg ${isOwn ? "own" : "other"}`}>
      <div className="chat-msg-header">
        <span className="chat-msg-sender">{msg.senderName ?? (lang === "ru" ? "Участник" : "Member")}</span>
        <span className="chat-msg-time">{formatTime(msg.createdAt)}</span>
      </div>
      <div className="chat-msg-body">{msg.body}</div>
      {!isOwn && msg.userId ? (
        <button
          className="chat-celebrate-btn"
          onClick={() => onCelebrate(msg.userId!)}
          title={lang === "ru" ? "Поздравить" : "Celebrate"}
          aria-label={lang === "ru" ? "Поздравить пользователя" : "Celebrate user"}
        >
          \ud83c\udf89
        </button>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDateSeparator(iso: string, lang: "ru" | "en"): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return lang === "ru" ? "Сегодня" : "Today";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return lang === "ru" ? "Вчера" : "Yesterday";
    return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

export default function ChatPage() {
  const lang =
    typeof window !== "undefined"
      ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined)
      : "ru";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const latestTimestampRef = useRef<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const currentUserId = readAuthState()?.userId ?? "";
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const checkIsAtBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    isAtBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const data = await getChatMessages(undefined, 50);
        setMessages(data.messages);
        setHasMore(data.hasMore);
        if (data.messages.length > 0) {
          latestTimestampRef.current = data.messages[data.messages.length - 1]!.createdAt;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load chat");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom();
    }
  }, [loading, messages.length === 0, scrollToBottom]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      if (!latestTimestampRef.current) return;
      void (async () => {
        try {
          const data = await pollChatMessages(latestTimestampRef.current);
          if (data.messages.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newMsgs = data.messages.filter((m) => !existingIds.has(m.id));
              if (newMsgs.length === 0) return prev;
              return [...prev, ...newMsgs];
            });
            latestTimestampRef.current = data.messages[data.messages.length - 1]!.createdAt;
            if (isAtBottomRef.current) {
              setTimeout(scrollToBottom, 50);
            }
          }
        } catch {
          // silent poll failure
        }
      })();
    }, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [scrollToBottom]);

  const handleSend = async (): Promise<void> => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      const msg = await sendChatMessage(text);
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      latestTimestampRef.current = msg.createdAt;
      setTimeout(scrollToBottom, 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleCelebrate = async (targetUserId: string): Promise<void> => {
    try {
      await sendCelebration(targetUserId);
    } catch {
      // silent
    }
  };

  const loadMore = async (): Promise<void> => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const container = chatContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    try {
      const oldest = messages[0]!.createdAt;
      const data = await getChatMessages(oldest, 50);
      setHasMore(data.hasMore);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const older = data.messages.filter((m) => !existingIds.has(m.id));
        return [...older, ...prev];
      });
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      });
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  let lastDateStr = "";

  return (
    <AppShell role="student" lang={lang}>
      <div className="chat-page">
        <SectionHeader
          title={lang === "ru" ? "Чат потока" : "Cohort Chat"}
          subtitle={lang === "ru" ? "Общайся с однокурсниками, отмечай успехи, поддерживай друг друга" : "Chat with classmates, celebrate achievements, support each other"}
        />

        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

        <Card>
          <div className="chat-container" ref={chatContainerRef} onScroll={checkIsAtBottom}>
            {hasMore ? (
              <div className="chat-load-more">
                <button className="button ghost small" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore
                    ? (lang === "ru" ? "Загрузка..." : "Loading...")
                    : (lang === "ru" ? "Загрузить ранние сообщения" : "Load older messages")}
                </button>
              </div>
            ) : null}

            {loading ? (
              <p className="muted chat-loading">{lang === "ru" ? "Загрузка чата..." : "Loading chat..."}</p>
            ) : messages.length === 0 ? (
              <div className="chat-empty">
                <EmptyState
                  title={lang === "ru" ? "Чат пока пуст" : "Chat is empty"}
                  subtitle={lang === "ru" ? "Отправьте первое сообщение, чтобы начать обсуждение." : "Send the first message to start the conversation."}
                />
              </div>
            ) : (
              messages.map((msg) => {
                const msgDate = formatDateSeparator(msg.createdAt, lang);
                let showDate = false;
                if (msgDate !== lastDateStr) {
                  lastDateStr = msgDate;
                  showDate = true;
                }
                return (
                  <div key={msg.id}>
                    {showDate ? <div className="chat-date-separator">{msgDate}</div> : null}
                    {msg.kind === "system" ? (
                      <SystemMessageBubble msg={msg} lang={lang} />
                    ) : (
                      <UserMessageBubble
                        msg={msg}
                        isOwn={msg.userId === currentUserId}
                        onCelebrate={(userId) => void handleCelebrate(userId)}
                        lang={lang}
                      />
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <textarea
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={lang === "ru" ? "Напиши сообщение..." : "Type a message..."}
              rows={1}
              disabled={sending}
              aria-label={lang === "ru" ? "Поле ввода сообщения" : "Message input"}
            />
            <button
              className="button primary chat-send-btn"
              onClick={() => void handleSend()}
              disabled={sending || !input.trim()}
            >
              {sending ? "..." : lang === "ru" ? "Отправить" : "Send"}
            </button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
