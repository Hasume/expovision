"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import type { CommunityCategory, CommunityTopic } from "@/features/api";
import { AuthorAvatar } from "@/features/community/components";
import { formatAgo } from "@/features/community/time";
import { stripTopicBodyPreview, stripMarkdownSummaryPreview } from "@/features/community/topic-cover";
import { communityFeedTopicPath } from "@/features/community/topic-path";
import { isTopicBookmarked, toggleTopicBookmark } from "@/features/community/discussion-detail/bookmarks";

function BookmarkIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function ArchiveQuestionCard({
  topic,
  categories,
}: {
  topic: CommunityTopic;
  categories: CommunityCategory[];
}) {
  const category = categories.find((c) => c.id === topic.categoryId);
  const href = communityFeedTopicPath(topic.id);
  const excerpt = stripTopicBodyPreview(topic.body ?? "", 130);
  const summaryText = topic.aiSummary ? stripMarkdownSummaryPreview(topic.aiSummary, 200) : "";
  const votesNet = topic.votes.likes - topic.votes.dislikes;
  const closedLabel = topic.closesAt ? formatAgo(topic.closesAt) : formatAgo(topic.updatedAt);

  const participantsDeduped = useMemo(() => {
    const raw = topic.participants ?? [];
    const seen = new Set<string>();
    const out: typeof raw = [];
    for (const p of raw) {
      const k = (p.id ?? "").trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }, [topic.participants]);

  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(isTopicBookmarked(topic.id));
  }, [topic.id]);

  const onToggleSave = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setSaved(toggleTopicBookmark(topic.id));
    },
    [topic.id],
  );

  return (
    <article className="hub-archive-q-card">
      {/* Top line: category + AI badge */}
      <div className="hub-archive-q-card__badges">
        {category ? (
          <span
            className="hub-archive-badge hub-archive-badge--cat"
            style={{ color: category.color, background: `${category.color}14` }}
          >
            {category.nameRu}
          </span>
        ) : null}
        {summaryText ? (
          <span className="hub-archive-badge hub-archive-badge--ai">Итог обсуждения</span>
        ) : null}
        {topic.isPinned ? (
          <span className="hub-archive-badge hub-archive-badge--pin">Закреплено</span>
        ) : null}
      </div>

      {/* Title */}
      <h2 className="hub-archive-q-card__title">
        <Link href={href}>{topic.title}</Link>
      </h2>

      {/* Excerpt — only when no AI summary */}
      {!summaryText && excerpt ? (
        <p className="hub-archive-q-card__excerpt">{excerpt}</p>
      ) : null}

      {/* AI summary */}
      {summaryText ? (
        <div className="hub-archive-q-card__ai">
          <p className="hub-archive-q-card__ai-text">{summaryText}</p>
        </div>
      ) : null}

      {/* Meta: author · stats · participants · save */}
      <div className="hub-archive-q-card__meta">
        <div className="hub-archive-q-card__author">
          <AuthorAvatar author={topic.author} size={26} />
          <span className="hub-archive-q-card__author-name">
            {topic.author.firstName} {topic.author.lastName}
          </span>
          <span className="hub-archive-q-card__closed">· {closedLabel}</span>
        </div>

        <div className="hub-archive-q-card__stats">
          {(topic.replyCount ?? 0) > 0 ? (
            <span className="hub-archive-stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {topic.replyCount}
            </span>
          ) : null}
          {topic.viewCount > 0 ? (
            <span className="hub-archive-stat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" aria-hidden>
                <path d="M2 12s4.2-7 10-7 10 7 10 7-4.2 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {topic.viewCount}
            </span>
          ) : null}
          {votesNet !== 0 ? (
            <span className="hub-archive-stat">
              {votesNet > 0 ? `+${votesNet}` : votesNet}
            </span>
          ) : null}

          {/* Participant avatars inline */}
          {participantsDeduped.length > 1 ? (
            <span className="hub-archive-participants-mini">
              {participantsDeduped.slice(0, 4).map((p, i) => (
                <span
                  key={`${p.id}-${i}`}
                  className="hub-archive-participants-mini__avatar"
                  title={`${p.firstName} ${p.lastName}`.trim()}
                >
                  <AuthorAvatar author={p} size={22} />
                </span>
              ))}
              {participantsDeduped.length > 4 ? (
                <span className="hub-archive-participants-mini__more">
                  +{participantsDeduped.length - 4}
                </span>
              ) : null}
            </span>
          ) : null}

          <button
            type="button"
            className={`hub-archive-q-card__save-icon${saved ? " hub-archive-q-card__save-icon--on" : ""}`}
            onClick={onToggleSave}
            aria-pressed={saved}
            aria-label={saved ? "Убрать из сохранённых" : "Сохранить"}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>
      </div>
    </article>
  );
}
