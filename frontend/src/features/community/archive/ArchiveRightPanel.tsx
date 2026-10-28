"use client";

import Link from "next/link";
import type { CommunityTopic } from "@/features/api";
import { PanelCard } from "@/features/community/components";
import { communityFeedTopicPath } from "@/features/community/topic-path";

function IconStats() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconTrending() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function ArchiveRightPanel({
  archiveTotal,
  savedCount,
  popularTopics,
}: {
  archiveTotal: number;
  savedCount: number;
  popularTopics: CommunityTopic[];
}) {
  return (
    <div className="hub-archive-rail" aria-label="Сводка архива">
      <PanelCard title="Сводка архива" icon={<IconStats />}>
        <ul className="hub-archive-stats-list">
          <li>
            <span className="hub-archive-stats-label">Закрытых тем в архиве</span>
            <span className="hub-archive-stats-value">{archiveTotal}</span>
          </li>
          <li>
            <span className="hub-archive-stats-label">В закладках</span>
            <span className="hub-archive-stats-value">{savedCount}</span>
          </li>
        </ul>
      </PanelCard>

      {popularTopics.length > 0 ? (
        <PanelCard title="Популярные итоги" icon={<IconTrending />}>
          <ul className="hub-archive-popular-list">
            {popularTopics.map((t) => (
              <li key={t.id}>
                <Link href={communityFeedTopicPath(t.id)} className="hub-archive-popular-link">
                  {t.title}
                </Link>
                <span className="hub-archive-popular-meta">
                  {t.replyCount ?? 0} отв. · {t.viewCount} просм.
                </span>
              </li>
            ))}
          </ul>
        </PanelCard>
      ) : null}
    </div>
  );
}
