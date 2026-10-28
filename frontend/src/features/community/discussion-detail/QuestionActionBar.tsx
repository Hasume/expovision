"use client";

import { useCallback, useEffect, useState } from "react";
import { VoteButtons } from "@/features/community/components";
import type { VoteCounts } from "@/features/api";
import { toggleTopicBookmark, isTopicBookmarked } from "./bookmarks";

const BookmarkIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const ShareIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const FlagIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
  </svg>
);

const ReplyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export function QuestionActionBar({
  topicId,
  topicTitle,
  publicUrl,
  votes,
  myVote,
  voteDisabled,
  canAnswer,
  onAnswerClick,
  onReportTopic,
}: {
  topicId: string;
  topicTitle: string;
  publicUrl: string;
  votes: VoteCounts;
  myVote: 1 | -1 | null;
  voteDisabled: boolean;
  canAnswer: boolean;
  onAnswerClick: () => void;
  onReportTopic: () => void;
}) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isTopicBookmarked(topicId));
  }, [topicId]);

  const handleSave = useCallback(() => {
    const next = toggleTopicBookmark(topicId);
    setSaved(next);
  }, [topicId]);

  const handleShare = useCallback(async () => {
    const url = publicUrl;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: topicTitle, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }, [publicUrl, topicTitle]);

  return (
    <div className="hub-q-actionbar" role="toolbar" aria-label="Действия с вопросом">
      <div className="hub-q-actionbar-votes">
        <VoteButtons
          targetType="topic"
          targetId={topicId}
          initialVotes={votes}
          initialMyVote={myVote}
          disabled={voteDisabled}
          visual="social"
        />
      </div>
      <div className="hub-q-actionbar-actions">
        <button type="button" className={`hub-q-icon-action${saved ? " hub-q-icon-action--active" : ""}`} onClick={handleSave} aria-pressed={saved} title="Сохранить в закладки">
          <BookmarkIcon filled={saved} />
          <span className="hub-q-icon-action-label">{saved ? "Сохранено" : "Сохранить"}</span>
        </button>
        <button type="button" className="hub-q-icon-action" onClick={handleShare} title="Поделиться">
          <ShareIcon />
          <span className="hub-q-icon-action-label">Поделиться</span>
        </button>
        <button type="button" className="hub-q-icon-action" onClick={onReportTopic} title="Пожаловаться">
          <FlagIcon />
          <span className="hub-q-icon-action-label">Жалоба</span>
        </button>
        {canAnswer ? (
          <button type="button" className="hub-q-icon-action hub-q-icon-action--primary" onClick={onAnswerClick}>
            <ReplyIcon />
            <span className="hub-q-icon-action-label">Ответить</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
