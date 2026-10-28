"use client";

import { ContentLayout } from "@/features/community/components";

export function DiscussionDetailSkeleton() {
  return (
      <div className="hub-discussion-page hub-discussion-page--loading">
        <ContentLayout
          main={
            <div className="hub-d-skeleton-main">
              <div className="hub-d-skel-line hub-d-skel-line--sm" />
              <div className="hub-d-skel-line hub-d-skel-line--lg" />
              <div className="hub-d-skel-line hub-d-skel-line--md" />
              <div className="hub-d-skel-line hub-d-skel-block" />
              <div className="hub-d-skel-line hub-d-skel-line--sm" style={{ marginTop: 24 }} />
              <div className="hub-d-skel-line hub-d-skel-block hub-d-skel-block--short" />
            </div>
          }
          right={
            <div className="hub-d-skeleton-rail">
              {[1, 2, 3].map((i) => (
                <div key={i} className="hub-d-skel-card" />
              ))}
            </div>
          }
        />
      </div>
  );
}
