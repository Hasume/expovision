"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { communityGetTopic, type TopicDetail } from "@/features/api";
import {
  COMMUNITY_TOPIC_BOOKMARKS_STORAGE_KEY,
  getBookmarkedTopicIds,
  toggleTopicBookmark,
} from "@/features/community/discussion-detail/bookmarks";
import { communityFeedTopicPath } from "@/features/community/topic-path";
import { formatRelative } from "@/features/community/components";

const MAX_BOOKMARKS_TO_LOAD = 50;

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconBookmark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const IconHeart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);
const IconMessage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconBell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const IconStar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const IconFolder = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const IconEdit = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconShare = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);
const IconBarChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabId = "bookmarks" | "liked" | "participated" | "later" | "following" | "insights";

interface Tab {
  id: TabId;
  label: string;
  icon: React.FC;
  description: string;
}

const TABS: Tab[] = [
  { id: "bookmarks",    label: "Закладки",      icon: IconBookmark, description: "Сохранённые темы, к которым хочешь вернуться" },
  { id: "liked",        label: "Понравилось",   icon: IconHeart,    description: "Ответы и темы, которые ты оценил положительно" },
  { id: "participated", label: "Участвовал",    icon: IconMessage,  description: "Обсуждения, в которых ты оставил ответ" },
  { id: "later",        label: "Читать позже",  icon: IconClock,    description: "Темы, отложенные для вдумчивого чтения" },
  { id: "following",    label: "Слежу",         icon: IconBell,     description: "Темы, за которыми ты наблюдаешь — получай уведомления о новых ответах" },
  { id: "insights",     label: "Инсайты",       icon: IconStar,     description: "Лучшие цитаты и выводы из обсуждений, которые ты выделил" },
];

// ─── Large icons for empty states ────────────────────────────────────────────

const LgIconBookmark = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const LgIconHeart = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);
const LgIconMessage = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const LgIconClock = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const LgIconBell = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
const LgIconStar = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// ─── Empty states ─────────────────────────────────────────────────────────────

interface EmptyDef {
  Icon: React.FC;
  title: string;
  hint: string;
  cta?: { label: string; href: string };
}

const EMPTY: Record<TabId, EmptyDef> = {
  bookmarks: {
    Icon: LgIconBookmark,
    title: "Закладок пока нет",
    hint: "Открой любую тему и нажми «Сохранить» — она появится здесь. Удобно возвращаться к важным обсуждениям.",
    cta: { label: "Перейти к обсуждениям", href: "/community/topics" },
  },
  liked: {
    Icon: LgIconHeart,
    title: "Ещё ничего не оценено",
    hint: "Когда ставишь лайк ответу или теме — они собираются здесь. Легко найти самое ценное.",
    cta: { label: "Открыть ленту", href: "/community/feed" },
  },
  participated: {
    Icon: LgIconMessage,
    title: "Ты ещё не отвечал в темах",
    hint: "Все обсуждения, где ты оставил ответ, будут собраны здесь — удобно следить за продолжением.",
    cta: { label: "Найти тему", href: "/community/topics" },
  },
  later: {
    Icon: LgIconClock,
    title: "Список пуст",
    hint: "Увидел интересную тему, но нет времени? Добавь в «Читать позже» — она будет ждать тебя здесь.",
    cta: { label: "Смотреть ленту", href: "/community/feed" },
  },
  following: {
    Icon: LgIconBell,
    title: "Ты не следишь ни за одной темой",
    hint: "Подпишись на тему — и когда кто-то ответит, ты узнаешь первым. Не пропускай важные разговоры.",
    cta: { label: "Активные обсуждения", href: "/community/topics" },
  },
  insights: {
    Icon: LgIconStar,
    title: "Инсайты ещё не добавлены",
    hint: "Выделяй лучшие цитаты и выводы из обсуждений — создавай личную базу знаний внутри платформы.",
    cta: { label: "Закрытые обсуждения", href: "/community/feed" },
  },
};

function BookmarksPanel() {
  const [items, setItems] = useState<TopicDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const ids = [...getBookmarkedTopicIds()].reverse().slice(0, MAX_BOOKMARKS_TO_LOAD);
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(ids.map((id) => communityGetTopic(id)));
      const byId = new Map<string, TopicDetail>();
      for (const r of results) {
        if (r.status === "fulfilled") byId.set(r.value.id, r.value);
      }
      const ordered = ids.map((id) => byId.get(id)).filter((t): t is TopicDetail => t != null);
      setItems(ordered);
    } catch {
      setError("Не удалось загрузить сохранённые темы");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useLayoutEffect(() => {
    if (getBookmarkedTopicIds().length === 0) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMMUNITY_TOPIC_BOOKMARKS_STORAGE_KEY) void load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [load]);

  const handleRemove = (topicId: string) => {
    toggleTopicBookmark(topicId);
    setItems((prev) => prev.filter((t) => t.id !== topicId));
  };

  if (loading) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 14, color: "#64748b" }}>
        Загрузка закладок…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "24px 20px", textAlign: "center" }}>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#b91c1c" }}>{error}</p>
        <button type="button" className="hub-btn-primary" onClick={() => void load()}>
          Повторить
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState tab="bookmarks" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {items.map((t) => (
        <div
          key={t.id}
          style={{
            display: "flex",
            alignItems: "stretch",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--hub-border)",
          }}
        >
          <Link
            href={communityFeedTopicPath(t.id)}
            style={{
              flex: 1,
              minWidth: 0,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4, lineHeight: 1.35 }}>
              {t.title}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {t.replyCount} {t.replyCount === 1 ? "ответ" : t.replyCount >= 2 && t.replyCount <= 4 ? "ответа" : "ответов"}
              {" · "}
              {formatRelative(t.createdAt)}
              {t.status === "closed" ? " · закрыто" : null}
            </div>
          </Link>
          <button type="button" className="hub-btn-ghost" style={{ flexShrink: 0, alignSelf: "flex-start" }} onClick={() => handleRemove(t.id)}>
            Убрать
          </button>
        </div>
      ))}
    </div>
  );
}

function FeatureCard({ Icon, title, desc }: { Icon: React.FC; title: string; desc: string }) {
  return (
    <div className="hub-card" style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 18px" }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: "#eff6ff", display: "flex", alignItems: "center",
        justifyContent: "center", color: "#158aeb", flexShrink: 0,
      }}>
        <Icon />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>{desc}</div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: TabId }) {
  const { Icon, title, hint, cta } = EMPTY[tab];
  return (
      <div className="hub-empty" style={{ padding: "56px 24px" }}>
      <div style={{
        width: 60, height: 60, borderRadius: 16,
        background: "#eff6ff", display: "flex", alignItems: "center",
        justifyContent: "center", color: "#158aeb",
      }}>
        <Icon />
      </div>
      <div className="hub-empty-title">{title}</div>
      <div className="hub-empty-desc" style={{ maxWidth: 360 }}>{hint}</div>
      {cta && (
        <Link href={cta.href} className="hub-btn-primary" style={{ marginTop: 4 }}>
          {cta.label}
        </Link>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SavedPage() {
  const [activeTab, setActiveTab] = useState<TabId>("bookmarks");
  const currentTab = TABS.find(t => t.id === activeTab)!;

  return (
      <div className="hub-page" style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 60px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>Сохранённое</h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>
            Личная коллекция — закладки, оценённые материалы, подписки и инсайты
          </p>
        </div>

        {/* Tabs */}
        <div className="hub-disc-tabs" style={{ marginBottom: 20 }}>
          {TABS.map(tab => {
            const active = tab.id === activeTab;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`hub-disc-tab${active ? " hub-disc-tab--active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}
              >
                <TabIcon />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Description strip */}
        <div style={{
          fontSize: 13,
          color: "var(--hub-text-muted)",
          marginBottom: 16,
          padding: "9px 14px",
          background: "var(--hub-bg)",
          borderRadius: 8,
          border: "1px solid var(--hub-border)",
          boxShadow: "none",
        }}>
          {currentTab.description}
        </div>

        {/* Content */}
        <div className="hub-card" style={{ overflow: "hidden", minHeight: 280 }}>
          {activeTab === "bookmarks" ? <BookmarksPanel /> : <EmptyState tab={activeTab} />}
        </div>

        {/* Coming soon */}
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>
            Скоро на платформе
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FeatureCard Icon={IconFolder} title="Папки и теги" desc="Организуй сохранённые темы по папкам и тегам — «Проекты», «Вопросы по ДЗ», «Идеи»." />
            <FeatureCard Icon={IconEdit} title="Личные заметки к темам" desc="Добавляй приватные заметки к любой теме — мысли, выводы, план действий. Видны только тебе." />
            <FeatureCard Icon={IconShare} title="Поделиться коллекцией" desc="Собери подборку тем и поделись ссылкой с другими участниками интенсива." />
            <FeatureCard Icon={IconBarChart} title="Статистика активности" desc="Сколько тем прочитал, сколько ответил, какие темы цепляют тебя больше всего." />
          </div>
        </div>

      </div>
  );
}
