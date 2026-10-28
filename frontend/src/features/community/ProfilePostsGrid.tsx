"use client";

import Link from "next/link";
import type { CommunityTopic } from "@/features/api";
import { extractTopicCoverUrl } from "@/features/community/topic-cover";
import { communityFeedTopicPath } from "@/features/community/topic-path";

function resolveAssetUrl(pathFromServer: string | null, apiBase: string): string | null {
  if (!pathFromServer?.trim()) return null;
  const p = pathFromServer.trim();
  if (/^https?:\/\//i.test(p)) return p;
  const base = apiBase.replace(/\/$/, "");
  return `${base}${p.startsWith("/") ? "" : "/"}${p.replace(/^\//, "")}`;
}

export function ProfilePostsGrid({ topics, apiBase }: { topics: CommunityTopic[]; apiBase: string }) {
  if (topics.length === 0) {
    return (
      <div className="hub-profile-grid-empty">
        <p className="hub-profile-grid-empty-title">Публикаций пока нет</p>
        <p className="hub-profile-grid-empty-desc">Когда пользователь создаст темы в сообществе, они появятся здесь.</p>
      </div>
    );
  }

  return (
    <div className="hub-profile-grid">
      {topics.map((topic) => (
        <ProfilePostCell key={topic.id} topic={topic} apiBase={apiBase} />
      ))}
    </div>
  );
}

function ProfilePostCell({ topic, apiBase }: { topic: CommunityTopic; apiBase: string }) {
  const coverPath = extractTopicCoverUrl(topic.body);
  const imgSrc = resolveAssetUrl(coverPath, apiBase);
  const likes = topic.votes?.likes ?? 0;
  const replies = topic.replyCount ?? 0;

  return (
    <Link href={communityFeedTopicPath(topic.id)} className="hub-profile-grid-cell">
      {topic.status === "pending" ? (
        <span className="hub-profile-grid-pending">На модерации</span>
      ) : null}
      {imgSrc ? (
        <img src={imgSrc} alt={topic.title} className="hub-profile-grid-img" loading="lazy" />
      ) : (
        <div className="hub-profile-grid-placeholder">
          <span className="hub-profile-grid-placeholder-text">{topic.title}</span>
        </div>
      )}
      <div className="hub-profile-grid-meta" aria-hidden>
        <span className="hub-profile-grid-meta-item">
          <HeartIcon />
          {likes}
        </span>
        <span className="hub-profile-grid-meta-item">
          <CommentIcon />
          {replies}
        </span>
      </div>
    </Link>
  );
}

function HeartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
