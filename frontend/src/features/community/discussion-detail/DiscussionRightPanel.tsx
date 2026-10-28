"use client";

import Link from "next/link";
import type { AuthorPreview, CommunityCategory } from "@/features/api";
import { PanelCard, XpBadge } from "@/features/community/components";
import { formatDateTimeShort } from "@/features/community/time";
import { communityFeedTopicPath } from "@/features/community/topic-path";
import { isMaskedCommunityAuthor } from "@/features/community/is-masked-author";

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="hub-d-panel-stat">
      <span className="hub-d-panel-stat-label">{label}</span>
      <span className="hub-d-panel-stat-value">{value}</span>
    </div>
  );
}

export function DiscussionRightPanel({
  topicStatus,
  closesAt,
  acceptsNewReplies,
  countdownText,
  countdownUrgent,
  category,
  viewCount,
  replyCount,
  topicVotesNet,
  author,
  authorStatsLoading,
  authorTopicsCount,
  authorRepliesCount,
  similar,
}: {
  topicStatus: string;
  closesAt: string | null;
  /** The discussion still accepts replies (status active) */
  acceptsNewReplies: boolean;
  countdownText: string | null;
  countdownUrgent: boolean;
  category: CommunityCategory | undefined;
  viewCount: number;
  replyCount: number;
  topicVotesNet: number;
  author: AuthorPreview;
  authorStatsLoading: boolean;
  authorTopicsCount: number | null;
  authorRepliesCount: number | null;
  similar: { id: string; title: string }[];
}) {
  const authorHref = !isMaskedCommunityAuthor(author) ? `/community/profile/${author.id}` : null;

  return (
    <aside className="hub-d-rail" aria-label="Контекст обсуждения">
      <PanelCard
        title="О теме"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
          </svg>
        }
      >
        <div className={`hub-d-status-chip hub-d-status-chip--${topicStatus}${countdownUrgent ? " hub-d-status-chip--urgent" : ""}`}>
          {topicStatus === "pending" ? "На проверке" : null}
          {topicStatus === "active" ? (
            <>Открыто{closesAt && countdownText ? ` · ${countdownText}` : ""}</>
          ) : null}
          {topicStatus === "closed" ? "Закрыто" : null}
        </div>
        {closesAt ? (
          <p className="hub-d-panel-muted">
            {topicStatus === "closed" ? "Закрыто: " : "До: "}
            {formatDateTimeShort(closesAt)}
          </p>
        ) : null}
        <p className="hub-d-panel-muted hub-d-panel-muted--tight">
          {acceptsNewReplies ? "Ответ можно написать в форме выше." : "Новые ответы не принимаются."}
        </p>
        {category ? (
          <div className="hub-d-panel-cat hub-d-panel-cat--rail" style={{ color: category.color, background: `${category.color}12` }}>
            {category.nameRu}
          </div>
        ) : null}
        <StatRow label="Просмотры" value={viewCount} />
        <StatRow label="Ответы" value={replyCount} />
        <StatRow label="Рейтинг темы" value={topicVotesNet > 0 ? `+${topicVotesNet}` : topicVotesNet} />
      </PanelCard>

      <PanelCard
        title="Автор"
        icon={
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        }
      >
        <div className="hub-d-author-block">
          <div className="hub-d-author-name-row">
            {authorHref ? (
              <Link href={authorHref} className="hub-d-author-name">
                {author.firstName} {author.lastName}
              </Link>
            ) : (
              <span className="hub-d-author-name">
                {author.firstName} {author.lastName}
              </span>
            )}
            <XpBadge xp={author.communityXp} />
          </div>
          {author.position ? <p className="hub-d-panel-muted">{author.position}</p> : null}
          {authorStatsLoading ? (
            <p className="hub-d-panel-muted">Загрузка статистики…</p>
          ) : authorTopicsCount != null && authorRepliesCount != null ? (
            <p className="hub-d-panel-muted">
              Тем: {authorTopicsCount} · Ответов: {authorRepliesCount}
            </p>
          ) : null}
          {authorHref ? (
            <Link href={authorHref} className="hub-btn-ghost hub-d-author-profile" style={{ marginTop: 10, display: "inline-flex", textDecoration: "none" }}>
              Профиль
            </Link>
          ) : null}
        </div>
      </PanelCard>

      <div className="hub-panel-card hub-d-help-fold">
        <div className="hub-panel-card-body hub-d-help-fold-body">
          <details className="hub-d-help-details">
            <summary className="hub-d-help-summary">
              <span>Советы по ответу</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </summary>
            <ul className="hub-d-help-list hub-d-help-list--details">
              <li>По сути вопроса, без воды.</li>
              <li>Конкретные шаги и примеры.</li>
              <li>Без спама и токсичности.</li>
            </ul>
          </details>
        </div>
      </div>

      {similar.length > 0 ? (
        <PanelCard
          title="Похожие вопросы"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          }
        >
          <ul className="hub-d-similar-list">
            {similar.map((s) => (
              <li key={s.id}>
                <Link href={communityFeedTopicPath(s.id)} className="hub-d-similar-link">
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}
    </aside>
  );
}
