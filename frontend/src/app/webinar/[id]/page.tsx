"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getWebinar, type WebinarPageData } from "@/features/api";
import { KINESCOPE_CHAT_ALLOW, KINESCOPE_EMBED_ALLOW } from "@/features/kinescope-constants";
import { AppShell, ButtonLink, InlineAlert } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

export default function WebinarPage() {
  const params = useParams();
  const webinarId = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const lang =
    typeof window !== "undefined"
      ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined)
      : "ru";

  const qs = `?lang=${lang}`;

  const [webinar, setWebinar] = useState<WebinarPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!webinarId) {
      setLoading(false);
      setError("Invalid webinar");
      return;
    }
    void (async () => {
      try {
        const data = await getWebinar(webinarId);
        setWebinar(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load webinar");
      } finally {
        setLoading(false);
      }
    })();
  }, [webinarId]);

  const title = webinar ? (lang === "ru" ? webinar.titleRu : webinar.titleEn) || webinar.title : "";

  const formattedDate = webinar?.startsAtIso
    ? new Date(webinar.startsAtIso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const isReplay = webinar?.webinarStatus === "completed";
  const isLive = webinar?.webinarStatus === "active";
  const showLiveChat = isLive && Boolean(webinar?.kinescopeChatUrl);

  return (
    <AppShell role="student" lang={lang}>
      {loading ? (
        <div style={{ padding: "48px 36px" }}>
          <p className="muted">{lang === "ru" ? "Загрузка..." : "Loading..."}</p>
        </div>
      ) : error ? (
        <div style={{ padding: "48px 36px" }}>
          <InlineAlert tone="error">{error}</InlineAlert>
        </div>
      ) : webinar && isReplay ? (
        <div className="day-page" style={{ maxWidth: 920, margin: "0 auto", paddingBottom: 48 }}>
          <div className="day-page-nav">
            <ButtonLink href={`/webinars${qs}`} tone="ghost" className="small">
              ← {lang === "ru" ? "Вебинары" : "Webinars"}
            </ButtonLink>
          </div>

          <div className="day-page-header">
            <p className="day-page-day-label">
              {lang === "ru" ? "Запись эфира" : "Live recording"}
            </p>
            <h1 className="day-page-title">{title}</h1>
          </div>

          <p className="day-section-label">{lang === "ru" ? "ВИДЕО" : "VIDEO"}</p>
          <div className="day-material-card">
            <div className="day-material-video">
              <div className="media-frame" style={{ borderRadius: 0, border: "none" }}>
                {webinar.recordingPending && !webinar.kinescopeEmbedUrl ? (
                  <div className="video-placeholder" style={{ minHeight: 220, padding: 24 }}>
                    <p className="muted" style={{ margin: 0, lineHeight: 1.5, textAlign: "center" }}>
                      {lang === "ru"
                        ? "Запись ещё обрабатывается на стороне Kinescope или не привязана к событию. Откройте страницу позже или сообщите администратору (нужен video_id записи, см. вебхук live.finished)."
                        : "The recording is still processing on Kinescope or isn’t linked to this event yet. Try again later or ask an admin to attach the VOD id (live.finished webhook video_id)."}
                    </p>
                  </div>
                ) : webinar.kinescopeEmbedUrl ? (
                  <div className="kinescope-player-wrap">
                    <iframe
                      src={webinar.kinescopeEmbedUrl}
                      title={title}
                      className="frame-full"
                      allow={KINESCOPE_EMBED_ALLOW}
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ) : webinar.joinUrl ? (
                  <div className="video-placeholder" style={{ minHeight: 200 }}>
                    <a className="button primary" href={webinar.joinUrl} target="_blank" rel="noopener noreferrer">
                      {lang === "ru" ? "Открыть запись →" : "Open recording →"}
                    </a>
                  </div>
                ) : (
                  <div className="video-placeholder">
                    <span className="muted">
                      {lang === "ru" ? "Запись скоро появится" : "Recording will appear soon"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, padding: "0 4px" }}>
            <div className="webinar-info-meta" style={{ marginBottom: 12 }}>
              {formattedDate ? <span>{formattedDate}</span> : null}
              {formattedDate && webinar.durationMinutes ? <span>·</span> : null}
              {webinar.durationMinutes ? (
                <span>
                  {webinar.durationMinutes} {lang === "ru" ? "мин" : "min"}
                </span>
              ) : null}
            </div>
            {(webinar.summaryRu || webinar.summaryEn) ? (
              <div
                className="webinar-info-summary"
                style={{ marginTop: 0, whiteSpace: "pre-wrap" }}
              >
                {lang === "ru" ? webinar.summaryRu : webinar.summaryEn}
              </div>
            ) : null}
          </div>
        </div>
      ) : webinar ? (
        <div className="webinar-page">
          <div className="webinar-video-section">
            {webinar.kinescopeEmbedUrl ? (
              <div className="webinar-embed-wrap">
                <iframe
                  src={webinar.kinescopeEmbedUrl}
                  allow={KINESCOPE_EMBED_ALLOW}
                  allowFullScreen
                  className="webinar-embed"
                  title={title}
                />
              </div>
            ) : (
              <div className="webinar-join-placeholder">
                {webinar.joinUrl ? (
                  <>
                    <p style={{ margin: 0 }}>
                      {lang === "ru" ? "Эфир доступен по внешней ссылке" : "Webinar is available via external link"}
                    </p>
                    <a className="button primary" href={webinar.joinUrl} target="_blank" rel="noopener noreferrer">
                      {lang === "ru" ? "Войти в эфир →" : "Join webinar →"}
                    </a>
                  </>
                ) : (
                  <p style={{ margin: 0 }}>
                    {lang === "ru" ? "Трансляция ещё не началась" : "Stream not started yet"}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="webinar-info-section">
            <h1 className="webinar-info-title">{title}</h1>
            <div className="webinar-info-meta">
              <span>Expovision Mentor</span>
              {isLive ? (
                <>
                  <span>·</span>
                  <span style={{ color: "#4ade80", fontWeight: 600 }}>{lang === "ru" ? "Эфир идёт" : "Live"}</span>
                </>
              ) : null}
              {formattedDate ? (
                <>
                  <span>·</span>
                  <span>{formattedDate}</span>
                </>
              ) : null}
              {webinar.durationMinutes ? (
                <>
                  <span>·</span>
                  <span>
                    {webinar.durationMinutes} {lang === "ru" ? "мин" : "min"}
                  </span>
                </>
              ) : null}
            </div>
            {(webinar.summaryRu || webinar.summaryEn) ? (
              <p className="webinar-info-summary">
                {lang === "ru" ? webinar.summaryRu : webinar.summaryEn}
              </p>
            ) : null}
          </div>

          {showLiveChat ? (
            <div className="webinar-info-section" style={{ paddingTop: 8, paddingBottom: 32 }}>
              <p className="day-section-label" style={{ margin: "0 0 10px" }}>
                {lang === "ru" ? "Чат эфира" : "Live chat"}
              </p>
              <div className="kinescope-chat-frame-wrap">
                <iframe
                  src={webinar.kinescopeChatUrl!}
                  allow={KINESCOPE_CHAT_ALLOW}
                  title={lang === "ru" ? "Чат трансляции" : "Stream chat"}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}
