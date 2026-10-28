"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuthorPreview, CommunityReply, CommunityTopic, VoteCounts } from "@/features/api";
import { communityPublicAssetUrl, communityVote } from "@/features/api";
import { formatAgo, topicPublicSince } from "@/features/community/time";
import { stripTopicBodyPreview } from "@/features/community/topic-cover";
import { isMaskedCommunityAuthor } from "@/features/community/is-masked-author";

// ─── XP badge ─────────────────────────────────────────────────────────────────

export function XpBadge({ xp }: { xp: number }) {
  const level = xp < 50 ? 1 : xp < 200 ? 2 : xp < 500 ? 3 : xp < 1000 ? 4 : 5;
  const labels = ["Новичок", "Участник", "Активист", "Эксперт", "Легенда"];
  return (
    <span className="hub-xp-pill" title={`${xp} XP`}>
      Lv{level} · {labels[level - 1]}
    </span>
  );
}

// ─── UserCard ─────────────────────────────────────────────────────────────────

export function UserCard({ author, size = "sm" }: { author: AuthorPreview; size?: "sm" | "md" }) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const avatarSrc = author.avatarUrl ? `${apiBase}${author.avatarUrl}` : null;
  const isAnon = isMaskedCommunityAuthor(author);
  const initials = isAnon
    ? "?"
    : `${author.firstName[0] ?? ""}${author.lastName[0] ?? ""}`.toUpperCase();

  const sizePx = size === "md" ? 36 : 28;

  const inner = (
    <>
      <div
        className={`cf-avatar${isAnon ? " cf-avatar--anon" : ""}`}
        style={{ width: sizePx, height: sizePx, borderRadius: "50%", flexShrink: 0 }}
      >
        {!isAnon && avatarSrc ? (
          <img src={avatarSrc} alt={`${author.firstName} ${author.lastName}`} />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="cf-user-card-info">
        <span className="cf-user-card-name">{author.firstName} {author.lastName}</span>
        {!isAnon && author.position && <span className="cf-user-card-pos">{author.position}</span>}
        {!isAnon && <XpBadge xp={author.communityXp} />}
      </div>
    </>
  );

  if (isAnon) {
    return <div className={`cf-user-card cf-user-card--${size} cf-user-card--anon`}>{inner}</div>;
  }

  return (
    <Link href={`/community/profile/${author.id}`} className={`cf-user-card cf-user-card--${size}`}>
      {inner}
    </Link>
  );
}

// ─── AuthorAvatar (ring / IG-style, reusable) ────────────────────────────────

export function AuthorAvatar({ author, size = 32 }: { author: AuthorPreview; size?: number }) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const avatarSrc = author.avatarUrl ? `${apiBase}${author.avatarUrl}` : null;
  const isAnon = isMaskedCommunityAuthor(author);
  const initials = isAnon
    ? "?"
    : `${author.firstName[0] ?? ""}${author.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div
      className={`hub-ig-avatar${isAnon ? " hub-ig-avatar--anon" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {!isAnon && avatarSrc ? (
        <img src={avatarSrc} alt="" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

// ─── VoteButtons (horizontal like / dislike at bottom of block) ───────────────

function HeartIcon({ filled, size = 22 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function ThumbUpIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}
function ThumbDownIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
      <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

export function VoteButtons({
  targetType,
  targetId,
  initialVotes,
  initialMyVote,
  disabled,
  compact,
  visual = "default",
}: {
  targetType: "topic" | "reply";
  targetId: string;
  initialVotes: VoteCounts;
  initialMyVote: 1 | -1 | null;
  disabled?: boolean;
  /** Smaller icons for dense rows */
  compact?: boolean;
  /** "Heart" plus an action row, as in social media feeds */
  visual?: "default" | "social";
}) {
  const [votes, setVotes] = useState(initialVotes);
  const [myVote, setMyVote] = useState(initialMyVote);
  const [loading, setLoading] = useState(false);

  const handleVote = async (value: 1 | -1) => {
    if (disabled || loading) return;
    setLoading(true);
    try {
      const res = await communityVote({ targetType, targetId, value });
      setVotes(res.votes);
      setMyVote(res.action === "removed" ? null : (res.value as 1 | -1));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const net = votes.likes - votes.dislikes;
  const iconSize = compact ? 14 : 16;
  const socialHeart = compact ? 20 : 22;
  const socialDown = compact ? 18 : 20;

  if (visual === "social") {
    return (
      <div className={`hub-vote hub-vote--social${compact ? " hub-vote--social-compact" : ""}`} role="group" aria-label="Оценка">
        <button
          type="button"
          className={`hub-vote-social-btn hub-vote-social-btn--like${myVote === 1 ? " hub-vote-social-btn--active-like" : ""}`}
          onClick={() => handleVote(1)}
          disabled={disabled || loading}
          aria-label="Нравится"
          aria-pressed={myVote === 1}
        >
          <HeartIcon filled={myVote === 1} size={socialHeart} />
        </button>
        <span className="hub-vote-social-score" title={`Лайков: ${votes.likes}, дизлайков: ${votes.dislikes}`}>
          {net > 0 ? `${net}` : net < 0 ? `${net}` : "0"}
        </span>
        <button
          type="button"
          className={`hub-vote-social-btn hub-vote-social-btn--down${myVote === -1 ? " hub-vote-social-btn--active-down" : ""}`}
          onClick={() => handleVote(-1)}
          disabled={disabled || loading}
          aria-label="Не нравится"
          aria-pressed={myVote === -1}
        >
          <ThumbDownIcon size={socialDown} />
        </button>
      </div>
    );
  }

  return (
    <div className={`hub-vote${compact ? " hub-vote--compact" : ""}`} role="group" aria-label="Оценка">
      <button
        type="button"
        className={`hub-vote-btn hub-vote-btn--like${myVote === 1 ? " hub-vote-btn--active-like" : ""}`}
        onClick={() => handleVote(1)}
        disabled={disabled || loading}
        aria-label="Лайк"
        aria-pressed={myVote === 1}
        title={`Нравится · ${votes.likes}`}
      >
        <ThumbUpIcon size={iconSize} />
      </button>
      <span className="hub-vote-score" title={`Лайков: ${votes.likes}, дизлайков: ${votes.dislikes}`}>
        {net > 0 ? `+${net}` : net}
      </span>
      <button
        type="button"
        className={`hub-vote-btn hub-vote-btn--dislike${myVote === -1 ? " hub-vote-btn--active-dislike" : ""}`}
        onClick={() => handleVote(-1)}
        disabled={disabled || loading}
        aria-label="Дизлайк"
        aria-pressed={myVote === -1}
        title={`Не нравится · ${votes.dislikes}`}
      >
        <ThumbDownIcon size={iconSize} />
      </button>
    </div>
  );
}

// ─── CommunityMarkdown ────────────────────────────────────────────────────────

export function CommunityMarkdown({ body }: { body: string }) {
  return (
    <div
      className="cf-markdown"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
    />
  );
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Undo minimal entities in a slice matched after global HTML pre-escape (for URLs in src). */
function unescapeMinimalForUrl(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function renderMarkdown(md: string): string {
  const imgFromBareUrl = (raw: string): string => {
    const trimmed = raw.trim();
    const safeRaw = trimmed.replace(/"/g, "");
    let safe = "#";
    if (/^https?:\/\//i.test(safeRaw)) safe = safeRaw;
    else if (safeRaw.startsWith("/uploads/")) safe = communityPublicAssetUrl(safeRaw);
    else if (/^\//.test(safeRaw)) safe = safeRaw;
    return `<img src="${escapeHtmlAttr(safe)}" alt="" loading="lazy" style="max-width:100%;height:auto;border-radius:8px" />`;
  };

  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^(\s*)(https?:\/\/[^\s]+\.(?:webp|jpg|jpeg|png|gif|avif)(?:\?[^\s]*)?)(\s*)$/gim, (_, __, urlEsc) =>
      imgFromBareUrl(unescapeMinimalForUrl(String(urlEsc))),
    )
    .replace(
      /^(\s*)(\/uploads\/[^\s]+\.(?:webp|jpg|jpeg|png|gif|avif)(?:\?[^\s]*)?)(\s*)$/gim,
      (_, __, pathEsc) => imgFromBareUrl(unescapeMinimalForUrl(String(pathEsc))),
    )
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, rawUrl) => {
      const trimmed = String(rawUrl).trim();
      const safeRaw = trimmed.replace(/"/g, "");
      let safe = "#";
      if (/^https?:\/\//i.test(safeRaw)) safe = safeRaw;
      else if (safeRaw.startsWith("/uploads/")) safe = communityPublicAssetUrl(safeRaw);
      else if (/^\//.test(safeRaw)) safe = safeRaw;
      const a = String(alt).replace(/"/g, "&quot;");
      return `<img src="${safe}" alt="${a}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px" />`;
    })
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/```[\w]*\n?([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    .replace(/^---$/gm, "<hr>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, rawUrl) => {
      const trimmed = rawUrl.trim();
      const safe = /^(https?:\/\/|\/|#)/i.test(trimmed) ? trimmed : "#";
      const isExternal = /^https?:\/\//i.test(trimmed);
      const attrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${safe}"${attrs}>${text}</a>`;
    })
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(.+)$/, "<p>$1</p>");
  // Newline pipeline injects <br> and </p><p> between adjacent <li> after <ul> is built — removes giant gaps.
  html = html
    .replace(/<\/li>\s*<\/p>\s*<p>\s*<li>/gi, "</li><li>")
    .replace(/<\/li>\s*<br\s*\/?>\s*<li>/gi, "</li><li>");
  return html;
}

// ─── CategoryTag ──────────────────────────────────────────────────────────────

export function CategoryTag({ name, color }: { name: string; color: string }) {
  return (
    <span className="hub-badge" style={{ background: `${color}22`, color, border: "none" }}>
      {name}
    </span>
  );
}

// ─── TopicStatusBadge ─────────────────────────────────────────────────────────

export function TopicStatusBadge({ status }: { status: string }) {
  if (status === "pending") return <span className="hub-badge hub-badge--yellow">На проверке</span>;
  if (status === "active") return <span className="hub-badge hub-badge--green">Активно</span>;
  if (status === "closed") return <span className="hub-badge hub-badge--gray">Закрыто</span>;
  return null;
}

// ─── TopicCard (hub-disc-card based) ─────────────────────────────────────────

export function TopicCard({
  topic,
  categoryName,
  categoryColor,
}: {
  topic: CommunityTopic;
  categoryName?: string;
  categoryColor?: string;
  currentUserId?: string;
}) {
  const score = topic.votes.likes - topic.votes.dislikes;
  const excerpt = stripTopicBodyPreview(topic.body, 120);

  return (
    <Link
      href={`/community/topics/${topic.id}`}
      className="hub-disc-card"
    >
      <div className="hub-disc-card-title">{topic.title}</div>
      {excerpt ? <div className="hub-disc-card-excerpt">{excerpt}</div> : null}
      <div className="hub-disc-card-footer">
        <UserCard author={topic.author} size="sm" />
        <div className="hub-disc-card-stats">
          {categoryName && categoryColor && (
            <CategoryTag name={categoryName} color={categoryColor} />
          )}
          <TopicStatusBadge status={topic.status ?? (topic.isClosed ? "closed" : "active")} />
          <span className="hub-disc-card-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {topic.replyCount}
          </span>
          <span className="hub-disc-card-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
            {topic.viewCount}
          </span>
          <span className="hub-disc-card-stat" title={`Рейтинг: ${score}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            {score > 0 ? `+${score}` : score}
          </span>
          <span className="hub-disc-card-stat">{formatRelative(topicPublicSince(topic))}</span>
        </div>
      </div>
    </Link>
  );
}

// ─── Reply tree (threaded discussions) ───────────────────────────────────────

export type ReplyNode = CommunityReply & { children: ReplyNode[] };

export function buildReplyTree(replies: CommunityReply[]): ReplyNode[] {
  const byId = new Map<string, ReplyNode>();
  for (const r of replies) {
    byId.set(r.id, { ...r, children: [] });
  }
  const roots: ReplyNode[] = [];
  for (const r of replies) {
    const node = byId.get(r.id)!;
    if (r.parentId && byId.has(r.parentId)) {
      byId.get(r.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const byCreated = (a: ReplyNode, b: ReplyNode) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const walk = (nodes: ReplyNode[]) => {
    nodes.sort(byCreated);
    for (const n of nodes) walk(n.children);
  };
  walk(roots);
  return roots;
}

export function ReplyThread({
  nodes,
  depth,
  currentUserId,
  onDelete,
  onEdit,
  onReply,
  variant = "default",
  topicAuthorId,
  onReportReply,
}: {
  nodes: ReplyNode[];
  depth: number;
  currentUserId?: string;
  onDelete?: (id: string) => void;
  onEdit?: (reply: CommunityReply) => void;
  onReply?: (reply: CommunityReply) => void;
  variant?: "default" | "instagram" | "discussion";
  /** Highlight replies by the topic author */
  topicAuthorId?: string;
  onReportReply?: (reply: CommunityReply) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id} className={depth > 0 ? (variant === "instagram" ? "hub-ig-reply-thread-branch" : variant === "discussion" ? "hub-disc-reply-branch" : "hub-reply-thread-branch") : undefined}>
          <ReplyItem
            reply={node}
            variant={variant}
            {...(topicAuthorId ? { topicAuthorId } : {})}
            {...(currentUserId ? { currentUserId } : {})}
            {...(onDelete ? { onDelete } : {})}
            {...(onEdit ? { onEdit } : {})}
            {...(onReply ? { onReply } : {})}
            {...(onReportReply ? { onReportReply } : {})}
          />
          {node.children.length > 0 && (
            <div className={variant === "instagram" ? "hub-ig-reply-thread-children" : variant === "discussion" ? "hub-disc-reply-children" : "hub-reply-thread-children"}>
              <ReplyThread
                nodes={node.children}
                depth={depth + 1}
                variant={variant}
                {...(topicAuthorId ? { topicAuthorId } : {})}
                {...(currentUserId ? { currentUserId } : {})}
                {...(onDelete ? { onDelete } : {})}
                {...(onEdit ? { onEdit } : {})}
                {...(onReply ? { onReply } : {})}
                {...(onReportReply ? { onReportReply } : {})}
              />
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// ─── ReplyItem (hub-based) ────────────────────────────────────────────────────

export function ReplyItem({
  reply,
  currentUserId,
  onDelete,
  onEdit,
  onReply,
  onReportReply,
  variant = "default",
  topicAuthorId,
}: {
  reply: CommunityReply;
  currentUserId?: string;
  onDelete?: (id: string) => void;
  onEdit?: (reply: CommunityReply) => void;
  onReply?: (reply: CommunityReply) => void;
  onReportReply?: (reply: CommunityReply) => void;
  variant?: "default" | "instagram" | "discussion";
  topicAuthorId?: string;
}) {
  const isOwn = currentUserId === reply.author.id;
  const isAnon = isMaskedCommunityAuthor(reply.author);
  const profileHref = isAnon ? undefined : `/community/profile/${reply.author.id}`;
  const isTopicAuthor = !!topicAuthorId && reply.author.id === topicAuthorId;

  if (variant === "discussion") {
    const av = (
      profileHref ? (
        <Link href={profileHref} className="hub-disc-reply__avatar-link" aria-label={`Профиль ${reply.author.firstName}`}>
          <AuthorAvatar author={reply.author} size={40} />
        </Link>
      ) : (
        <AuthorAvatar author={reply.author} size={40} />
      )
    );

    return (
      <div
        className={`hub-disc-reply${reply.isAccepted ? " hub-disc-reply--accepted" : ""}${isTopicAuthor ? " hub-disc-reply--topic-author" : ""}`}
        id={`reply-${reply.id}`}
      >
        {av}
        <div className="hub-disc-reply__body">
          <div className="hub-disc-reply__head">
            <div className="hub-disc-reply__head-main">
              {profileHref ? (
                <Link href={profileHref} className="hub-disc-reply__author">
                  {reply.author.firstName} {reply.author.lastName}
                </Link>
              ) : (
                <span className="hub-disc-reply__author">
                  {reply.author.firstName} {reply.author.lastName}
                </span>
              )}
              <XpBadge xp={reply.author.communityXp} />
              {isTopicAuthor ? <span className="hub-disc-reply__pill">Автор вопроса</span> : null}
              {reply.isAccepted ? <span className="hub-disc-reply__pill hub-disc-reply__pill--ok">Лучший ответ</span> : null}
            </div>
            <div className="hub-disc-reply__head-aside">
              <span className="hub-disc-reply__time">{formatAgo(reply.createdAt)}</span>
              <details className="hub-disc-reply-menu">
                <summary className="hub-disc-reply-menu-summary" aria-label="Действия">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
                    <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </summary>
                <div className="hub-disc-reply-menu-panel">
                  {isOwn && onEdit ? (
                    <button type="button" className="hub-disc-reply-menu-item" onClick={() => onEdit(reply)}>
                      Изменить
                    </button>
                  ) : null}
                  {isOwn && onDelete ? (
                    <button type="button" className="hub-disc-reply-menu-item hub-disc-reply-menu-item--danger" onClick={() => onDelete(reply.id)}>
                      Удалить
                    </button>
                  ) : null}
                  {!isOwn && onReportReply ? (
                    <button type="button" className="hub-disc-reply-menu-item" onClick={() => onReportReply(reply)}>
                      Пожаловаться
                    </button>
                  ) : null}
                </div>
              </details>
            </div>
          </div>
          <div className="hub-disc-reply__content md-compact">
            <CommunityMarkdown body={reply.body} />
          </div>
          <div className="hub-disc-reply__toolbar">
            <VoteButtons
              targetType="reply"
              targetId={reply.id}
              initialVotes={reply.votes}
              initialMyVote={reply.myVote}
              disabled={!currentUserId || isOwn}
              compact
              visual="social"
            />
            {onReply ? (
              <button type="button" className="hub-disc-reply__reply-btn" onClick={() => onReply(reply)}>
                Ответить
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "instagram") {
    const av = (
      profileHref ? (
        <Link href={profileHref} className="hub-ig-comment__avatar-link" aria-label={`Профиль ${reply.author.firstName}`}>
          <AuthorAvatar author={reply.author} size={36} />
        </Link>
      ) : (
        <span className="hub-ig-comment__avatar-link">
          <AuthorAvatar author={reply.author} size={36} />
        </span>
      )
    );

    return (
      <div
        className={`hub-ig-comment${reply.isAccepted ? " hub-ig-comment--accepted" : ""}`}
        id={`reply-${reply.id}`}
      >
        {av}
        <div className="hub-ig-comment__main">
          <div className="hub-ig-comment__top">
            {profileHref ? (
              <Link href={profileHref} className="hub-ig-comment__author">
                {reply.author.firstName} {reply.author.lastName}
              </Link>
            ) : (
              <span className="hub-ig-comment__author">
                {reply.author.firstName} {reply.author.lastName}
              </span>
            )}
            {reply.isAccepted && (
              <span className="hub-ig-comment__badge">Решение</span>
            )}
            <span className="hub-ig-comment__time">{formatAgo(reply.createdAt)}</span>
            {isOwn && (
              <span className="hub-ig-comment__own-actions">
                {onEdit && (
                  <button type="button" className="hub-ig-comment__mini-btn" onClick={() => onEdit(reply)}>
                    Изм.
                  </button>
                )}
                {onDelete && (
                  <button type="button" className="hub-ig-comment__mini-btn hub-ig-comment__mini-btn--danger" onClick={() => onDelete(reply.id)}>
                    Удалить
                  </button>
                )}
              </span>
            )}
          </div>
          <div className="hub-ig-comment__body md-compact">
            <CommunityMarkdown body={reply.body} />
          </div>
          <div className="hub-ig-comment__toolbar">
            <VoteButtons
              targetType="reply"
              targetId={reply.id}
              initialVotes={reply.votes}
              initialMyVote={reply.myVote}
              disabled={!currentUserId || isOwn}
              compact
              visual="social"
            />
            {onReply && (
              <button type="button" className="hub-ig-comment__reply-inline" onClick={() => onReply(reply)}>
                Ответить
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`hub-reply${reply.isAccepted ? " hub-reply--accepted" : ""}`}
      id={`reply-${reply.id}`}
    >
      <div className="hub-reply-body">
        <div className="hub-reply-header">
          <UserCard author={reply.author} size="sm" />
          <div className="hub-reply-meta">
            {reply.isAccepted && (
              <span className="hub-reply-accepted-tag">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Принятый ответ
              </span>
            )}
            <span className="hub-reply-time">{formatRelative(reply.createdAt)}</span>
            {isOwn && (
              <div className="hub-reply-actions">
                {onEdit && (
                  <button className="hub-reply-action-btn" onClick={() => onEdit(reply)}>
                    Редактировать
                  </button>
                )}
                {onDelete && (
                  <button className="hub-reply-action-btn hub-reply-action-btn--danger" onClick={() => onDelete(reply.id)}>
                    Удалить
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <CommunityMarkdown body={reply.body} />
        <div className="hub-reply-vote-row hub-reply-footer-row">
          <VoteButtons
            targetType="reply"
            targetId={reply.id}
            initialVotes={reply.votes}
            initialMyVote={reply.myVote}
            disabled={!currentUserId || isOwn}
            compact
          />
          {onReply && (
            <button type="button" className="hub-reply-to-btn" onClick={() => onReply(reply)}>
              Ответить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  action,
  breadcrumbs,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}) {
  return (
    <div className="hub-page-header">
      <div className="hub-page-header-left">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="hub-breadcrumb" aria-label="Навигация">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span className="hub-breadcrumb-sep">/</span>}
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span className="hub-breadcrumb-current">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="hub-page-header-title">{title}</h1>
        {subtitle && <p className="hub-page-header-sub">{subtitle}</p>}
      </div>
      {action && <div className="hub-page-header-actions">{action}</div>}
    </div>
  );
}

// ─── RightPanel ───────────────────────────────────────────────────────────────

export function RightPanel({ children }: { children: React.ReactNode }) {
  return <aside className="hub-right-panel">{children}</aside>;
}

// ─── PanelCard ────────────────────────────────────────────────────────────────

export function PanelCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="hub-panel-card">
      <div className="hub-panel-card-header">
        {icon && <span style={{ color: "var(--hub-accent)", display: "flex", alignItems: "center" }}>{icon}</span>}
        <span className="hub-panel-card-title">{title}</span>
      </div>
      <div className="hub-panel-card-body">{children}</div>
    </div>
  );
}

// ─── ContentLayout ────────────────────────────────────────────────────────────

export function ContentLayout({
  main,
  right,
}: {
  main: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="hub-content-layout">
      <div className="hub-content-main">{main}</div>
      <RightPanel>{right}</RightPanel>
    </div>
  );
}

// ─── utils ────────────────────────────────────────────────────────────────────

export function formatRelative(isoString: string): string {
  return formatAgo(isoString);
}
