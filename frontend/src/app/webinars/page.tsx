"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFlowWebinarsArchive, getStudentBootstrap, type FlowWebinarArchiveItem } from "@/features/api";
import { getLang } from "@/features/i18n";
import { AppShell, Badge, ButtonLink, InlineAlert } from "@/shared/ui/components";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
function absMediaUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) return `${API_ORIGIN}${pathOrUrl}`;
  return pathOrUrl;
}

function webinarCardBadge(w: FlowWebinarArchiveItem, lang: "ru" | "en") {
  if (w.webinarStatus === "completed") {
    return <Badge tone="neutral">{lang === "ru" ? "Запись" : "Recording"}</Badge>;
  }
  if (w.webinarStatus === "active") {
    return <Badge tone="success">{lang === "ru" ? "Эфир" : "Live"}</Badge>;
  }
  if (w.kinescopeVideoId) {
    return <Badge tone="primary">{lang === "ru" ? "Смотреть" : "Watch"}</Badge>;
  }
  return <Badge tone="neutral">{lang === "ru" ? "Скоро" : "Soon"}</Badge>;
}

export default function FlowWebinarsPage() {
  const lang =
    typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;

  const [currentDay, setCurrentDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [items, setItems] = useState<FlowWebinarArchiveItem[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const boot = await getStudentBootstrap();
        if (boot.dashboard?.currentDay) setCurrentDay(boot.dashboard.currentDay);

        const data = await getFlowWebinarsArchive();
        setFlowId(data.flowId);
        setItems(data.webinars);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AppShell role="student" lang={lang} currentDay={currentDay}>
      <div className="stack" style={{ maxWidth: 720 }}>
        <header className="page-header">
          <h1 className="page-title">{lang === "ru" ? "Вебинары" : "Webinars"}</h1>
          <p className="page-subtitle">
            {lang === "ru"
              ? "Записи эфиров и расписание вашего потока — открывайте и пересматривайте в удобное время."
              : "Your flow’s live sessions and recordings — open and rewatch anytime."}
          </p>
        </header>

        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

        {loading ? (
          <p className="muted">{lang === "ru" ? "Загрузка…" : "Loading…"}</p>
        ) : !flowId ? (
          <div className="next-day-card">
            <div className="next-day-card-body">
              <p className="next-day-card-label">{lang === "ru" ? "Раздел для потока" : "Flow-only section"}</p>
              <p className="next-day-card-title">
                {lang === "ru"
                  ? "Архив вебинаров доступен участникам интенсивного потока. Вы сейчас на стандартной программе без отдельного потока."
                  : "Webinar archive is for intensive-flow members. You’re on the standard programme without a dedicated flow."}
              </p>
            </div>
            <ButtonLink href={`/lessons${qs}&day=${currentDay}`} className="small">
              {lang === "ru" ? "К программе →" : "Open programme →"}
            </ButtonLink>
          </div>
        ) : items.length === 0 ? (
          <p className="muted">
            {lang === "ru" ? "В потоке пока нет вебинаров." : "No webinars in this flow yet."}
          </p>
        ) : (
          <ul className="entity-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((w) => {
              const title = (lang === "ru" ? w.titleRu : w.titleEn) || w.titleRu || w.titleEn || w.id;
              const summary = (lang === "ru" ? w.summaryRu : w.summaryEn) || "";
              const hasJoin = Boolean((w.joinUrl || "").trim());
              // List payload may omit kinescopeVideoId after live ends; /webinar/{id} still resolves embed from event / DB.
              const canOpenWebinarPage =
                Boolean(w.kinescopeVideoId) ||
                w.webinarStatus === "active" ||
                w.webinarStatus === "completed" ||
                hasJoin;
              const href = `/webinar/${w.id}${qs}`;
              const openLabel =
                w.webinarStatus === "completed"
                  ? lang === "ru"
                    ? "Открыть запись →"
                    : "Open recording →"
                  : w.webinarStatus === "active"
                    ? lang === "ru"
                      ? "Открыть эфир →"
                      : "Open live →"
                    : w.kinescopeVideoId
                      ? lang === "ru"
                        ? "Открыть плеер →"
                        : "Open player →"
                      : hasJoin
                        ? lang === "ru"
                          ? "Открыть →"
                          : "Open →"
                        : lang === "ru"
                          ? "Скоро"
                          : "Soon";
              const metaParts: string[] = [];
              if (w.programOrder != null) metaParts.push(`#${w.programOrder}`);
              if (w.dayNumber > 0) {
                metaParts.push(lang === "ru" ? `День ${w.dayNumber}` : `Day ${w.dayNumber}`);
              }
              if (w.startsAtIso) {
                metaParts.push(
                  new Date(w.startsAtIso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                );
              }
              if (w.durationMinutes > 0) {
                metaParts.push(`${w.durationMinutes} ${lang === "ru" ? "мин" : "min"}`);
              }

              const inner = (
                <div
                  className="entity-item"
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                    padding: "14px 16px",
                    opacity: canOpenWebinarPage ? 1 : 0.92,
                  }}
                >
                  {w.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={absMediaUrl(w.thumbnailUrl)}
                      alt=""
                      style={{
                        width: 120,
                        height: 68,
                        objectFit: "cover",
                        borderRadius: 6,
                        flexShrink: 0,
                        background: "var(--surface-muted)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 120,
                        height: 68,
                        borderRadius: 6,
                        flexShrink: 0,
                        background: "var(--surface-muted)",
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                      <h2 className="text-h3" style={{ margin: 0, fontSize: 16, lineHeight: 1.3 }}>
                        {title}
                      </h2>
                      {webinarCardBadge(w, lang)}
                    </div>
                    <p className="muted text-caption" style={{ margin: "0 0 8px" }}>
                      {metaParts.join(" · ")}
                    </p>
                    {summary ? (
                      <p className="text-body-sm muted" style={{ margin: 0, lineHeight: 1.45 }}>
                        {summary.length > 220 ? `${summary.slice(0, 220)}…` : summary}
                      </p>
                    ) : null}
                    <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      {canOpenWebinarPage ? (
                        <span className="button small primary" style={{ pointerEvents: "none" }}>
                          {openLabel}
                        </span>
                      ) : (
                        <span className="muted text-caption">
                          {lang === "ru"
                            ? "Дата и ссылка появятся, когда администратор назначит эфир."
                            : "Date and link will appear once the admin schedules the session."}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );

              return (
                <li key={w.id} style={{ marginBottom: 12 }}>
                  {canOpenWebinarPage ? (
                    <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
