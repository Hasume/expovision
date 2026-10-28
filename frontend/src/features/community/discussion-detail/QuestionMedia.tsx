"use client";

import { useEffect, useState, type CSSProperties } from "react";

type QuestionMediaProps = {
  coverUrl: string | null;
  accentColor: string;
  /** When provided, clicking the cover opens a full-screen view (handler lives on the page). */
  onOpenLightbox?: () => void;
};

export function QuestionMedia({ coverUrl, accentColor, onOpenLightbox }: QuestionMediaProps) {
  const api = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");
  const resolved = coverUrl
    ? /^https?:\/\//i.test(coverUrl)
      ? coverUrl
      : `${api}${coverUrl.startsWith("/") ? "" : "/"}${coverUrl.replace(/^\//, "")}`
    : null;

  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [resolved]);

  if (!resolved) {
    return null;
  }

  if (failed) {
    return (
      <div className="hub-q-media hub-q-media--error" style={{ "--hub-q-accent": accentColor } as CSSProperties}>
        <p className="hub-q-media-error-msg">Изображение не загрузилось</p>
        <button type="button" className="hub-btn-ghost hub-q-media-retry" onClick={() => setFailed(false)}>
          Повторить
        </button>
      </div>
    );
  }

  const inner = (
    <img
      src={resolved}
      alt=""
      loading="lazy"
      decoding="async"
      className={loaded ? "hub-q-media-img hub-q-media-img--visible" : "hub-q-media-img"}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );

  return (
    <div className="hub-q-media" style={{ "--hub-q-accent": accentColor } as CSSProperties}>
      {!loaded && <div className="hub-q-media-skeleton" aria-hidden />}
      {onOpenLightbox ? (
        <button type="button" className="hub-q-media-frame" onClick={onOpenLightbox} aria-label="Открыть изображение крупно">
          {inner}
        </button>
      ) : (
        <div className="hub-q-media-frame hub-q-media-frame--static">{inner}</div>
      )}
    </div>
  );
}
