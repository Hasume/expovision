"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import {
  communityMeApi,
  communityTopics,
  communityFeed,
  communityVote,
  communityCategories,
  communityCreateTopic,
  getCommunityAuthState,
  type CommunityTopic,
  type CommunityCategory,
  type FeedItem,
} from "@/features/api";
import { formatAgo, formatUntilDeadlineShort, topicPublicSince } from "@/features/community/time";
import { communityFeedTopicPath } from "@/features/community/topic-path";
import { extractTopicCoverUrl, stripTopicBodyPreview, stripMarkdownSummaryPreview } from "@/features/community/topic-cover";
import { CommunityRichComposer } from "@/features/community/rich-text/CommunityRichComposer";
import { CommunityMarkdown } from "@/features/community/components";

// ── Icons ─────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
/** Feed card icon: discussion (filled outline, same weight as the views icon). */
const ReplyStatIcon = () => (
  <svg className="hub-topic-card__stat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 11.5a8.5 8.5 0 0 1-.63 3.24 8.58 8.58 0 0 1-7.63 5.06 8.51 8.51 0 0 1-3.24-.63L3 21l1.31-6.5A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);
const ViewStatIcon = () => (
  <svg className="hub-topic-card__stat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s4.2-7 10-7 10 7 10 7-4.2 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const MsgIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const ThumbUpIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);
const ThumbDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
    <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
  </svg>
);
const PenIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const ChatTopicIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h5" />
    <path d="M16 3h5v5" /><path d="m16 8 5-5" />
  </svg>
);
const SearchFieldIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const COMPOSE_HASH_SHORT = "compose-short";
const COMPOSE_HASH_DISCUSSION = "compose-discussion";

type CreateMode = "short" | "discussion";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 28, color = "var(--hub-accent)" }: {
  name: string; size?: number; color?: string;
}) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `${color}18`, color,
      fontSize: size * 0.38, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function HubCardImageFallbackIcon() {
  return (
    <svg className="hub-topic-card__placeholder-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="8.75" cy="8.75" r="1.65" fill="currentColor" />
      <path
        d="M3.5 17.5 9 12l4 4 3.5-3.5L20.5 19"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TopicCardMedia({ body, tint }: { body: string; tint: string }) {
  const url = extractTopicCoverUrl(body);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [url, body]);

  const showImg = !!url && !imgFailed;

  return (
    <div
      className="hub-topic-card__media"
      style={{ "--hub-placeholder-tint": tint } as CSSProperties}
    >
      {showImg && url ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} />
      ) : (
        <div className="hub-topic-card__placeholder" aria-hidden>
          <HubCardImageFallbackIcon />
        </div>
      )}
    </div>
  );
}

function TopicGridSkeleton() {
  return (
    <article className="hub-topic-card hub-topic-card--skeleton" aria-hidden>
      <div className="hub-topic-card__media" />
      <div className="hub-topic-card__body">
        <div style={{ width: "40%" }} />
        <div style={{ width: "92%", height: 16 }} />
        <div style={{ width: "72%" }} />
        <div style={{ width: "55%", marginTop: 8 }} />
      </div>
    </article>
  );
}

function CreateTopicForm({
  variant,
  categories,
  loggedIn,
  onPublished,
  onCancel,
}: {
  variant: CreateMode;
  categories: CommunityCategory[];
  loggedIn: boolean;
  onPublished: () => void;
  onCancel: () => void;
}) {
  const bodyMin = variant === "short" ? 10 : 30;
  const bodyRows = variant === "short" ? 4 : 10;
  const heading = variant === "short" ? "Короткий пост" : "Тема на обсуждение";
  const hint =
    variant === "short"
      ? "После одобрения пост появится в ленте."
      : "После одобрения тема откроется для участников.";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [feedPreviewOpen, setFeedPreviewOpen] = useState(false);
  const [moderationAck, setModerationAck] = useState<CreateMode | null>(null);
  /** Synchronous double-submit guard until re-render (the button's disabled state lags behind). */
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (!feedPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setFeedPreviewOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [feedPreviewOpen]);

  const scopedCategories = useMemo(() => {
    const want = variant === "short" ? "short" : "discussion";
    return categories.filter((c) => {
      const ks = c.kindScope ?? "both";
      return ks === "both" || ks === want;
    });
  }, [categories, variant]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setErr(null);
    if (title.trim().length < 5) {
      setErr("Заголовок не короче 5 символов");
      submitInFlightRef.current = false;
      return;
    }
    if (variant === "short" && body.trim().length > 10000) {
      setErr("Текст не длиннее 10 000 символов");
      submitInFlightRef.current = false;
      return;
    }
    if (body.trim().length < bodyMin) {
      setErr(variant === "short" ? "Текст не короче 10 символов" : "Опишите тему подробнее (от 30 символов)");
      submitInFlightRef.current = false;
      return;
    }
    setBusy(true);
    try {
      await communityCreateTopic({
        title: title.trim(),
        body: body.trim(),
        categoryId: categoryId || null,
        isAnonymous: anon,
        topicKind: variant === "short" ? "short" : "discussion",
      });
      setModerationAck(variant);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Не удалось отправить на модерацию");
    } finally {
      submitInFlightRef.current = false;
      setBusy(false);
    }
  };

  const finishModerationNotice = () => {
    setTitle("");
    setBody("");
    setCategoryId("");
    setAnon(false);
    setErr(null);
    setModerationAck(null);
    setComposerKey((k) => k + 1);
    setFeedPreviewOpen(false);
    onPublished();
    onCancel();
  };

  if (!loggedIn) {
    return (
      <div className="hub-dash-modal-guest">
        <p className="hub-feed-composer__guest-text">
          Войдите, чтобы публиковать в ленте сообщества.
        </p>
        <div className="hub-dash-modal-guest-actions">
          <Link href="/community" className="hub-btn-primary">
            Войти
          </Link>
          <button type="button" className="hub-btn-ghost" onClick={onCancel}>
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  if (moderationAck) {
    const v = moderationAck;
    return (
      <div className="hub-feed-composer hub-feed-composer--modal hub-feed-composer--moderation-sent">
        <div className="hub-dash-modal-head">
          <h2 className="hub-feed-composer__title" id="hub-create-title">
            Отправлено на модерацию
          </h2>
          <button type="button" className="hub-dash-modal-close" onClick={finishModerationNotice} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="hub-moderation-sent-body">
          <p className="hub-moderation-sent-lead">
            {v === "short" ? "Пост отправлен на модерацию." : "Тема отправлена на модерацию."}
          </p>
          <p className="hub-moderation-sent-sub">
            {v === "short"
              ? "После одобрения появится в ленте."
              : "После одобрения обсуждение откроется для участников."}
          </p>
        </div>
        <div className="hub-dash-modal-actions">
          <button type="button" className="hub-btn-primary" onClick={finishModerationNotice}>
            Понятно
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="hub-feed-composer hub-feed-composer--modal" onSubmit={submit}>
      <div className="hub-dash-modal-head">
        <h2 className="hub-feed-composer__title" id="hub-create-title">{heading}</h2>
        <button
          type="button"
          className="hub-dash-modal-close"
          onClick={() => {
            setFeedPreviewOpen(false);
            onCancel();
          }}
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
      <div className="hub-feed-composer__moderation-banner" role="status">
        <strong>На модерации</strong>
        <span>{hint}</span>
      </div>
      {err ? <div className="hub-feed-composer__err">{err}</div> : null}
      <input
        type="text"
        className="hub-feed-composer__input"
        placeholder={variant === "short" ? "Заголовок" : "Суть вопроса или темы"}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        autoComplete="off"
        aria-labelledby="hub-create-title"
      />
      <CommunityRichComposer
        key={composerKey}
        className="hub-feed-composer__rich"
        value={body}
        onChange={setBody}
        placeholder={
          variant === "short"
            ? "Напишите мысль, кейс, вопрос или короткое обновление…"
            : "Контекст и детали темы…"
        }
        disabled={busy}
        aria-invalid={!!err}
      />
      {variant === "short" && (
        <button
          type="button"
          className="hub-feed-composer__preview-feed"
          onClick={() => setFeedPreviewOpen(true)}
        >
          Посмотреть как в ленте
        </button>
      )}
      <div className="hub-feed-composer__row hub-feed-composer__row--modal">
        <select
          className="hub-feed-composer__select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Категория"
        >
          <option value="">Категория (необязательно)</option>
          {scopedCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameRu}
            </option>
          ))}
        </select>
        <label className="hub-feed-composer__check">
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          Анонимно
        </label>
      </div>
      <div className="hub-dash-modal-actions">
        <button
          type="button"
          className="hub-btn-ghost"
          onClick={() => {
            setFeedPreviewOpen(false);
            onCancel();
          }}
          disabled={busy}
        >
          Отмена
        </button>
        <button type="submit" className="hub-btn-primary" disabled={busy}>
          {busy ? "Отправка на модерацию…" : "Отправить на модерацию"}
        </button>
      </div>
      {variant === "short" && feedPreviewOpen ? (
        <div className="hub-feed-as-feed-root" role="dialog" aria-modal="true" aria-labelledby="hub-feed-as-feed-heading">
          <button
            type="button"
            className="hub-feed-as-feed-backdrop"
            aria-label="Закрыть просмотр"
            onClick={() => setFeedPreviewOpen(false)}
          />
          <div className="hub-feed-as-feed-panel">
            <div className="hub-feed-as-feed-head">
              <h3 id="hub-feed-as-feed-heading">Как в ленте</h3>
              <button
                type="button"
                className="hub-dash-modal-close"
                onClick={() => setFeedPreviewOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="hub-feed-as-feed-body">
              <div className="hub-feed-as-feed-title">{title.trim() ? title.trim() : "Заголовок"}</div>
              <CommunityMarkdown body={body.trim() ? body : "*Текст поста появится здесь.*"} />
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function CreateTopicModal({
  mode,
  onClose,
  categories,
  loggedIn,
  onPublished,
}: {
  mode: CreateMode | null;
  onClose: () => void;
  categories: CommunityCategory[];
  loggedIn: boolean;
  onPublished: () => void;
}) {
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mode, onClose]);

  if (!mode) return null;

  return (
    <div className="hub-dash-modal-root" role="dialog" aria-modal="true" aria-labelledby="hub-create-title">
      <button type="button" className="hub-dash-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="hub-dash-modal-panel">
        <CreateTopicForm
          variant={mode}
          categories={categories}
          loggedIn={loggedIn}
          onPublished={onPublished}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

// ── Active topic card ─────────────────────────────────────────────────────────

function ActiveCard({ topic, categories }: { topic: CommunityTopic; categories: CommunityCategory[] }) {
  const cat = categories.find(c => c.id === topic.categoryId);
  const tint = cat?.color ?? "var(--hub-accent)";
  const closesAt = topic.closesAt;
  const closesRemainMs = closesAt ? new Date(closesAt).getTime() - Date.now() : 0;
  const showClose = closesAt && closesRemainMs > 0;
  const excerpt = stripTopicBodyPreview(topic.body, 160);

  const timeRight =
    showClose && closesAt
      ? `осталось ${formatUntilDeadlineShort(closesAt)}`
      : formatAgo(topicPublicSince(topic));

  return (
    <article className="hub-topic-card">
      <Link href={communityFeedTopicPath(topic.id)} className="hub-topic-card__media-link" aria-label={topic.title}>
        <TopicCardMedia body={topic.body} tint={tint} />
      </Link>
      <div className="hub-topic-card__body">
        <div className="hub-topic-card__meta">
          {cat && (
            <span
              className="hub-topic-card__pill hub-topic-card__pill--cat"
              style={{
                color: cat.color,
                background: `${cat.color}14`,
              }}
            >
              {cat.nameRu}
            </span>
          )}
          <span className="hub-topic-card__pill hub-topic-card__pill--active">Активно</span>
          <span className="hub-topic-card__meta-time">{timeRight}</span>
        </div>

        <Link href={communityFeedTopicPath(topic.id)} className="hub-topic-card__title">
          {topic.title}
        </Link>

        {excerpt ? <p className="hub-topic-card__excerpt">{excerpt}</p> : null}

        <div className="hub-topic-card__footer">
          <div className="hub-topic-card__author">
            <Avatar name={topic.author.firstName} size={22} />
            <span>
              {topic.author.firstName} {topic.author.lastName}
            </span>
          </div>
          <div className="hub-topic-card__stats">
            <span>
              <ReplyStatIcon />
              {topic.replyCount ?? 0}
            </span>
            <span>
              <ViewStatIcon />
              {topic.viewCount}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Closed (feed) card ────────────────────────────────────────────────────────

function ClosedCard({ item, categories, loggedIn }: {
  item: FeedItem; categories: CommunityCategory[]; loggedIn: boolean;
}) {
  const [likes, setLikes] = useState(item.votes.likes);
  const [dislikes, setDislikes] = useState(item.votes.dislikes);
  const [myVote, setMyVote] = useState<1 | -1 | null>(item.myVote);
  const [busy, setBusy] = useState(false);
  const cat = categories.find(c => c.id === item.categoryId);
  const tint = cat?.color ?? "var(--hub-accent)";
  const excerpt = stripTopicBodyPreview(item.body, 160);

  const vote = async (value: 1 | -1) => {
    if (!loggedIn || busy) return;
    setBusy(true);
    try {
      const res = await communityVote({ targetType: "topic", targetId: item.id, value });
      setLikes(res.votes.likes);
      setDislikes(res.votes.dislikes);
      setMyVote(res.action === "removed" ? null : (res.value as 1 | -1));
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  return (
    <article className="hub-topic-card">
      <Link href={communityFeedTopicPath(item.id)} className="hub-topic-card__media-link" aria-label={item.title}>
        <TopicCardMedia body={item.body} tint={tint} />
      </Link>
      <div className="hub-topic-card__body">
        <div className="hub-topic-card__meta">
          {cat && (
            <span
              className="hub-topic-card__pill hub-topic-card__pill--cat"
              style={{
                color: cat.color,
                background: `${cat.color}14`,
              }}
            >
              {cat.nameRu}
            </span>
          )}
          <span className="hub-topic-card__pill hub-topic-card__pill--done">Завершено</span>
          <span className="hub-topic-card__meta-time">
            {item.closesAt ? formatAgo(item.closesAt) : formatAgo(item.updatedAt)}
          </span>
        </div>

        <Link href={communityFeedTopicPath(item.id)} className="hub-topic-card__title">
          {item.title}
        </Link>

        {excerpt ? <p className="hub-topic-card__excerpt">{excerpt}</p> : null}

        {item.aiSummary && (
          <div>
            <div className="hub-topic-card__summary-label">
              Итог
            </div>
            <p className="hub-topic-card__summary">{stripMarkdownSummaryPreview(item.aiSummary, 280)}</p>
          </div>
        )}

        <div className="hub-topic-card__footer">
          <div className="hub-topic-card__author">
            <Avatar name={item.author.firstName} size={22} />
            <span>
              {item.author.firstName} {item.author.lastName}
            </span>
          </div>
          <div className="hub-topic-card__stats">
            <span>
              <ReplyStatIcon />
              {item.replyCount}
            </span>
            <span>
              <ViewStatIcon />
              {item.viewCount}
            </span>
          </div>
        </div>

        <div className="hub-topic-card__actions">
          <button
            type="button"
            onClick={() => vote(1)}
            disabled={!loggedIn || busy}
            className={`hub-vote-btn hub-vote-btn--up${myVote === 1 ? " hub-vote-btn--active" : ""}`}
            style={{
              width: "auto",
              minHeight: 30,
              padding: "4px 10px",
              border: "none",
              borderRadius: 4,
              gap: 5,
              display: "flex",
              alignItems: "center",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--fw-medium)",
              background: "var(--hub-bg)",
            }}
          >
            <ThumbUpIcon />
            {likes}
          </button>
          <button
            type="button"
            onClick={() => vote(-1)}
            disabled={!loggedIn || busy}
            className={`hub-vote-btn hub-vote-btn--down${myVote === -1 ? " hub-vote-btn--active" : ""}`}
            style={{
              width: "auto",
              minHeight: 30,
              padding: "4px 10px",
              border: "none",
              borderRadius: 4,
              gap: 5,
              display: "flex",
              alignItems: "center",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--fw-medium)",
              background: "var(--hub-bg)",
            }}
          >
            <ThumbDownIcon />
            {dislikes}
          </button>
          <Link href={communityFeedTopicPath(item.id)} className="hub-dash-link" style={{ marginLeft: "auto" }}>
            Читать →
          </Link>
        </div>
      </div>
    </article>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabId = "all" | "active" | "closed";
type FeedScope = "all" | "following";

export default function CommunityHome() {
  const [firstName, setFirstName] = useState("");
  const [xp, setXp] = useState(0);
  const [loggedIn, setLoggedIn] = useState(false);
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [createOpen, setCreateOpen] = useState<CreateMode | null>(null);

  const closeCreate = useCallback(() => {
    setCreateOpen(null);
    if (typeof window === "undefined") return;
    const h = window.location.hash.slice(1);
    if (h === COMPOSE_HASH_SHORT || h === COMPOSE_HASH_DISCUSSION) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  const [tab, setTab] = useState<TabId>("all");
  /** Whole platform or only authors from "My subscriptions". */
  const [feedScope, setFeedScope] = useState<FeedScope>("all");
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [activeItems, setActiveItems] = useState<CommunityTopic[]>([]);
  const [closedItems, setClosedItems] = useState<FeedItem[]>([]);
  const [total, setTotal] = useState(0);
  /** Page size reported by the backend (/topics vs /feed); otherwise pagination is computed incorrectly. */
  const [listPageSize, setListPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  /** AbortController for the current in-flight fetchData request. */
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const applyHash = () => {
      const h = window.location.hash.slice(1);
      if (h === COMPOSE_HASH_SHORT) setCreateOpen("short");
      else if (h === COMPOSE_HASH_DISCUSSION) setCreateOpen("discussion");
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const auth = getCommunityAuthState();
    setLoggedIn(!!auth);
    communityCategories({ suggested: !!auth }).then(setCategories).catch(() => {});
    if (auth) {
      communityMeApi()
        .then(u => { setFirstName(u.firstName ?? ""); setXp(u.communityXp ?? 0); })
        .catch(() => {});
    }
  }, []);

  const fetchData = useCallback(async () => {
    // Cancel any previous in-flight request before starting a new one.
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const auth = getCommunityAuthState();
      const isAuthed = !!auth;
      const fromFollowed = feedScope === "following" && isAuthed;

      const catParam = selectedCat ?? undefined;
      const qParam = debouncedQ || undefined;
      const params = {
        ...(catParam ? { category: catParam } : {}),
        ...(qParam ? { q: qParam } : {}),
        page,
        ...(fromFollowed ? { fromFollowed: true } : {}),
      };

      if (tab === "active" || tab === "all") {
        if (feedScope === "following" && !isAuthed) {
          setActiveItems([]);
          setTotal(0);
          setListPageSize(20);
        } else {
          const res = await communityTopics({ ...params, signal });
          setActiveItems(res.items ?? []);
          setTotal(res.total ?? 0);
          setListPageSize(res.pageSize ?? 20);
        }
      } else {
        setActiveItems([]);
      }

      if (tab === "closed") {
        if (feedScope === "following" && !isAuthed) {
          setClosedItems([]);
          setTotal(0);
          setListPageSize(15);
        } else {
          const res = await communityFeed({ ...params, signal });
          setClosedItems(res.items ?? []);
          setTotal(res.total ?? 0);
          setListPageSize(res.pageSize ?? 15);
        }
      } else {
        setClosedItems([]);
      }
    } catch (err) {
      // Silently ignore AbortError — it means a newer fetch superseded this one.
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      setLoading(false);
    }
  }, [tab, selectedCat, debouncedQ, page, feedScope]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, listPageSize)));

  /** The "All" tab shows only active topics; finished ones are loaded separately in the "Finished" tab. */
  const dashboardActiveTopics = useMemo(
    () => activeItems.filter(t => t.status === "active"),
    [activeItems],
  );

  type PostItem = { date: string; type: "active"; data: CommunityTopic } | { date: string; type: "closed"; data: FeedItem };
  const merged: PostItem[] = tab === "all"
    ? dashboardActiveTopics.map(d => ({ date: d.createdAt, type: "active" as const, data: d }))
    : tab === "active"
      ? dashboardActiveTopics.map(d => ({ date: d.createdAt, type: "active" as const, data: d }))
      : closedItems.map(d => ({ date: d.closesAt ?? d.updatedAt, type: "closed" as const, data: d }));

  const TABS = [
    { id: "all" as TabId, label: "Все" },
    { id: "active" as TabId, label: "Активные" },
    { id: "closed" as TabId, label: "Завершённые" },
  ];

  const FEED_SCOPE_TABS = [
    { id: "all" as FeedScope, label: "Вся лента" },
    { id: "following" as FeedScope, label: "Мои подписки" },
  ];

  const subscriptionsGuest = feedScope === "following" && !loggedIn;

  return (
    <>
      <div className="hub-content-layout hub-dashboard-page" style={{ maxWidth: 1180 }}>
        <div className="hub-content-main">

          {/* ── Page Header ── */}
          <div className="hub-page-header">
            <div className="hub-page-header-left">
              <h1 className="hub-page-header-title">
                {firstName ? `Привет, ${firstName}` : "Сообщество"}
              </h1>
              {loggedIn && xp > 0 && (
                <p className="hub-page-header-sub">{xp} XP</p>
              )}
            </div>
            <div className="hub-page-header-actions">
              <Link href="/community/topics" className="hub-btn-ghost" style={{ fontSize: "var(--text-sm)" }}>
                Вопросы и ответы
              </Link>
            </div>
          </div>

          {/* ── Feed: whole platform or subscriptions only ── */}
          <div className="hub-disc-tabs" style={{ marginBottom: 10 }}>
            {FEED_SCOPE_TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setFeedScope(t.id); setPage(1); }}
                className={`hub-disc-tab${feedScope === t.id ? " hub-disc-tab--active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Tabs ── */}
          <div className="hub-disc-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setPage(1); }}
                className={`hub-disc-tab${tab === t.id ? " hub-disc-tab--active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Search — hide when feed is genuinely empty ── */}
          {(!loading && merged.length === 0 && !query && !selectedCat) ? null : (
            <div className="hub-disc-search" style={{ marginBottom: 18 }}>
              <span className="hub-disc-search-icon"><SearchIcon /></span>
              <input
                ref={searchRef}
                type="text"
                className="hub-disc-search-input"
                placeholder="Поиск по темам…"
                value={query}
                onChange={e => { setQuery(e.target.value); setPage(1); }}
              />
            </div>
          )}

          {/* ── Category chips — only when there's content or an active filter ── */}
          {(!loading && merged.length === 0 && !query && !selectedCat) ? null : (
            <div className="hub-mat-cats" style={{ marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => { setSelectedCat(null); setPage(1); }}
                className={`hub-mat-cat-btn${!selectedCat ? " hub-mat-cat-btn--active" : ""}`}
              >
                Все категории
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => { setSelectedCat(cat.id); setPage(1); }}
                  className={`hub-mat-cat-btn${selectedCat === cat.id ? " hub-mat-cat-btn--active" : ""}`}
                  style={
                    selectedCat === cat.id
                      ? { color: cat.color, background: `${cat.color}14` }
                      : undefined
                  }
                >
                  {cat.nameRu}
                </button>
              ))}
            </div>
          )}

          {/* ── Content ── */}
          {loading ? (
            <div className="hub-topic-grid">
              {[1, 2, 3, 4, 5, 6].map(i => <TopicGridSkeleton key={i} />)}
            </div>
          ) : merged.length === 0 ? (
            <div className="hub-empty">
              <div className="hub-empty-icon">
                <MsgIcon />
              </div>
              <div className="hub-empty-title">
                {query || selectedCat
                  ? "Ничего не найдено"
                  : subscriptionsGuest
                    ? "Войдите, чтобы видеть «Мои подписки»"
                    : feedScope === "following"
                      ? "Пока нет публикаций от подписок"
                      : "В ленте пока пусто"}
              </div>
              <div className="hub-empty-desc">
                {query || selectedCat
                  ? "Попробуйте другой запрос или категорию"
                  : subscriptionsGuest
                    ? "Только темы от авторов, на которых вы подписаны."
                    : feedScope === "following"
                      ? "Откройте профиль автора и подпишитесь — его темы появятся здесь."
                      : "Будьте первым — создайте тему для обсуждения"}
              </div>
              {subscriptionsGuest && !query && !selectedCat ? (
                <Link href="/community" className="hub-btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  Войти в сообщество
                </Link>
              ) : null}
              {!query && !selectedCat && !subscriptionsGuest && (
                <button
                  type="button"
                  className="hub-btn-primary"
                  onClick={() => setCreateOpen("discussion")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <PlusIcon /> Создать тему
                </button>
              )}
            </div>
          ) : (
            <div className="hub-topic-grid">
              {merged.map(item =>
                item.type === "active"
                  ? <ActiveCard key={item.data.id} topic={item.data} categories={categories} />
                  : <ClosedCard key={item.data.id} item={item.data} categories={categories} loggedIn={loggedIn} />
              )}
            </div>
          )}

          {/* ── Pagination ── */}
          {totalPages > 1 && !loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 28 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="hub-btn-ghost"
                style={{ padding: "8px 18px", fontSize: "var(--text-sm)" }}
              >
                ← Назад
              </button>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--hub-text-muted)" }}>{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="hub-btn-ghost"
                style={{ padding: "8px 18px", fontSize: "var(--text-sm)" }}
              >
                Вперёд →
              </button>
            </div>
          )}

        </div>
      </div>

      <nav className="hub-dash-create-dock" aria-label="Действия в ленте">
        {loggedIn ? (
          <>
            <button type="button" className="hub-dash-dock-btn" onClick={() => setCreateOpen("short")}>
              <span className="hub-dash-dock-ico" aria-hidden><PenIcon /></span>
              <span className="hub-dash-dock-label">Короткий пост</span>
            </button>
            <button type="button" className="hub-dash-dock-btn" onClick={() => setCreateOpen("discussion")}>
              <span className="hub-dash-dock-ico" aria-hidden><ChatTopicIcon /></span>
              <span className="hub-dash-dock-label">Тема на обсуждение</span>
            </button>
            <button
              type="button"
              className="hub-dash-dock-btn"
              onClick={() => {
                searchRef.current?.focus();
                searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              <span className="hub-dash-dock-ico" aria-hidden><SearchFieldIcon /></span>
              <span className="hub-dash-dock-label">Поиск</span>
            </button>
          </>
        ) : (
          <Link href="/community" className="hub-dash-dock-btn hub-dash-dock-btn--wide">
            <span className="hub-dash-dock-label">Войти, чтобы публиковать</span>
          </Link>
        )}
      </nav>

      <CreateTopicModal
        mode={createOpen}
        onClose={closeCreate}
        categories={categories}
        loggedIn={loggedIn}
        onPublished={() => { void fetchData(); }}
      />
    </>
  );
}
