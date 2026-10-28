"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStudentBootstrap } from "@/features/api";
import { getLang } from "@/features/i18n";
import { AppShell, Badge, ButtonLink, InlineAlert } from "@/shared/ui/components";

type RoadmapDay = {
  dayNumber: number;
  title: string;
  // "done" = all lessons completed, "partial" = some done, "today" = current day,
  // "available" = past day with nothing done, "locked" = future day,
  // "track_required" = days 8+ blocked by missing track selection
  state: "done" | "partial" | "available" | "today" | "locked" | "track_required";
  lessonsCompleted: number;
  lessonsTotal: number;
  trackRequired: boolean;
  webinars: Array<{ title: string; startsAtIso: string | null }>;
};

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LockSmIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function GitBranchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
    </svg>
  );
}

export default function LessonsPage() {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;
  const [currentDay, setCurrentDay] = useState(1);
  const [trackSelected, setTrackSelected] = useState<string | null>(null);
  const [splitAvailable, setSplitAvailable] = useState(false);
  const [roadmap, setRoadmap] = useState<RoadmapDay[]>([]);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [reportCompleted, setReportCompleted] = useState(false);
  const [intensiveEnded, setIntensiveEnded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const boot = await getStudentBootstrap();
        const dashboard = boot.dashboard;
        if (!dashboard) return;

        setCurrentDay(dashboard.currentDay);
        setPlatformOpen(dashboard.platformOpen);
        setReportCompleted(dashboard.reportCompleted);
        setIntensiveEnded(dashboard.intensiveEnded);
        setTrackSelected(dashboard.trackSelected);
        setSplitAvailable(dashboard.splitAvailable);

        const roadmapAllowed =
          dashboard.platformOpen && (dashboard.reportCompleted || dashboard.intensiveEnded);

        if (roadmapAllowed) {
          const rawDays = boot.roadmap ?? [];
          const built: RoadmapDay[] = Array.from({ length: 14 }, (_, i) => {
            const dayNumber = i + 1;
            const row = rawDays.find((d) => d.dayNumber === dayNumber);
            const lessons = row?.lessons ?? [];
            const trackRequired =
              Boolean(row?.trackRequired) && !dashboard.intensiveEnded;
            const lessonsCompleted = lessons.filter((l) => l.status === "completed").length;
            const lessonsTotal = lessons.length;

            let state: RoadmapDay["state"];
            if (dashboard.intensiveEnded) {
              if (lessonsTotal === 0) {
                state = "available";
              } else if (lessonsCompleted === lessonsTotal) {
                state = "done";
              } else if (lessonsCompleted > 0) {
                state = "partial";
              } else {
                state = "available";
              }
            } else if (dayNumber > dashboard.currentDay) {
              state = "locked";
            } else if (dayNumber === dashboard.currentDay) {
              if (trackRequired && dayNumber >= 8) {
                state = "track_required";
              } else {
                state = "today";
              }
            } else {
              if (trackRequired && dayNumber >= 8) {
                state = "track_required";
              } else if (lessonsTotal === 0) {
                state = "available";
              } else if (lessonsCompleted === lessonsTotal) {
                state = "done";
              } else if (lessonsCompleted > 0) {
                state = "partial";
              } else {
                state = "available";
              }
            }

            const title = lessons[0]?.title ?? (lang === "ru" ? `День ${dayNumber}` : `Day ${dayNumber}`);
            const webinars = row?.webinars ?? [];
            return {
              dayNumber,
              title,
              state,
              lessonsCompleted,
              lessonsTotal,
              trackRequired,
              webinars,
            };
          });
          setRoadmap(built);
        } else {
          setRoadmap(Array.from({ length: 14 }, (_, i) => ({
            dayNumber: i + 1,
            title: lang === "ru" ? `День ${i + 1}` : `Day ${i + 1}`,
            state: "locked" as const,
            lessonsCompleted: 0,
            lessonsTotal: 0,
            trackRequired: false,
            webinars: [],
          })));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [lang]);

  const hasTrackGate = splitAvailable && !trackSelected && !intensiveEnded;

  return (
    <AppShell role="student" lang={lang} currentDay={currentDay}>
      <div className="stack">
        <header className="page-header">
          <h1 className="page-title">{lang === "ru" ? "Программа" : "Programme"}</h1>
          <p className="page-subtitle">
            {lang === "ru"
              ? "14-дневный интенсив · каждый день открывается по расписанию"
              : "14-day intensive · each day unlocks on schedule"}
          </p>
        </header>

        {/* Platform not started */}
        {!platformOpen && !loading ? (
          <div className="next-day-card next-day-card--elevated">
            <div className="next-day-card-body">
              <p className="next-day-card-label">{lang === "ru" ? "Интенсив ещё не начался" : "Intensive hasn't started yet"}</p>
              <p className="next-day-card-title">
                {lang === "ru" ? "Уроки откроются автоматически в день старта" : "Lessons will open automatically on start day"}
              </p>
            </div>
            {!reportCompleted ? (
              <ButtonLink href={`/report/start${qs}`} className="small">
                {lang === "ru" ? "Заполнить отчёт" : "Complete report"}
              </ButtonLink>
            ) : null}
          </div>
        ) : null}

        {/* Report gate — clear CTA explaining what's blocked and why */}
        {platformOpen && !reportCompleted && !intensiveEnded && !loading ? (
          <div className="next-day-card next-day-card--elevated">
            <div className="next-day-card-icon" aria-hidden>
              <span className="next-day-card-emoji" role="img">
                📋
              </span>
            </div>
            <div className="next-day-card-body">
              <p className="next-day-card-kicker">
                {lang === "ru" ? "Программа заблокирована" : "Programme is locked"}
              </p>
              <p className="next-day-card-title">
                {lang === "ru"
                  ? "Заполни стартовый отчёт — это открывает все 14 дней программы."
                  : "Complete the initial report — it unlocks all 14 days of the programme."}
              </p>
            </div>
            <ButtonLink href={`/report/start${qs}`}>
              {lang === "ru" ? "Заполнить отчёт →" : "Complete report →"}
            </ButtonLink>
          </div>
        ) : null}

        {/* Track selection gate — shown prominently when days 8-14 are locked by track */}
        {!loading && hasTrackGate && currentDay >= 7 ? (
          <div className="next-day-card next-day-card--elevated">
            <div className="next-day-card-icon" aria-hidden>
              <GitBranchIcon />
            </div>
            <div className="next-day-card-body">
              <p className="next-day-card-kicker">
                {lang === "ru" ? "Нужно выбрать направление" : "Choose your direction"}
              </p>
              <p className="next-day-card-title">
                {lang === "ru"
                  ? "Дни 8–14 откроются после выбора трека. Это займёт 1 минуту."
                  : "Days 8–14 unlock after you pick a track. Takes 1 minute."}
              </p>
            </div>
            <ButtonLink href={`/split${qs}`} className="small">
              {lang === "ru" ? "Выбрать трек →" : "Pick a track →"}
            </ButtonLink>
          </div>
        ) : null}

        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

        <div className="day-timeline">
          {loading
            ? Array.from({ length: 14 }, (_, i) => (
                <div key={i} className="day-item locked">
                  <div className="day-item-spine">
                    <div className="day-item-node skeleton" style={{ border: "none", background: "var(--surface-muted)" }} />
                  </div>
                  <div className="day-item-body">
                    <div className="day-item-card" style={{ borderColor: "transparent", background: "var(--surface-muted)" }}>
                      <div className="skeleton" style={{ height: 14, width: "55%", borderRadius: 4 }} />
                      <div className="skeleton" style={{ height: 12, width: "35%", borderRadius: 4, marginTop: 8 }} />
                    </div>
                  </div>
                </div>
              ))
            : roadmap.map((day) => {
                const { dayNumber, title, state, lessonsCompleted, lessonsTotal, trackRequired, webinars } = day;
                const isLocked = state === "locked";
                const isTrackGate = state === "track_required";
                const isToday = state === "today";
                const isDone = state === "done";
                const isPartial = state === "partial";
                const isAvailable = state === "available";

                // Track-gated days: clickable but show gate message
                const isClickable = !isLocked;
                const href = isClickable
                  ? isTrackGate
                    ? `/split${qs}`
                    : `/day/${dayNumber}${qs}`
                  : undefined;

                const nodeMod = isDone ? "completed" : isToday ? "today" : isTrackGate ? "track-gate" : isLocked ? "locked" : "";

                const badge = isDone ? (
                  <Badge tone="success">{lang === "ru" ? "Готово" : "Done"}</Badge>
                ) : isPartial ? (
                  <Badge tone="warning">{lang === "ru" ? "Не завершён" : "Incomplete"}</Badge>
                ) : isToday ? (
                  <Badge tone="primary">{lang === "ru" ? "Сегодня" : "Today"}</Badge>
                ) : isTrackGate ? (
                  <Badge tone="neutral">{lang === "ru" ? "Нужен трек" : "Track needed"}</Badge>
                ) : isAvailable ? (
                  <Badge tone="neutral">{lang === "ru" ? "Открыт" : "Open"}</Badge>
                ) : (
                  <Badge tone="neutral">{lang === "ru" ? "Закрыт" : "Locked"}</Badge>
                );

                const cardContent = (
                  <div className={`day-item-card${isTrackGate ? " track-gate-card" : ""}`}>
                    <div className="day-item-head">
                      <p className="day-item-title">{title}</p>
                      {badge}
                    </div>

                    {/* Track gate message inline */}
                    {isTrackGate ? (
                      <p className="day-item-meta" style={{ color: "var(--accent)", fontWeight: 500 }}>
                        {lang === "ru" ? "Выбери трек, чтобы открыть этот день →" : "Choose a track to unlock this day →"}
                      </p>
                    ) : lessonsTotal > 0 ? (
                      <p className="day-item-meta">
                        {lessonsCompleted}/{lessonsTotal} {lang === "ru" ? "уроков" : "lessons"}
                      </p>
                    ) : null}

                    {webinars.length > 0 ? (
                      <p className="day-item-meta" style={{ marginTop: 6 }}>
                        <span style={{ fontWeight: 600, color: "var(--accent)" }}>{lang === "ru" ? "Эфир" : "Live"}</span>
                        {": "}
                        {webinars.map((w, i) => (
                          <span key={`${w.title}-${i}`}>
                            {i > 0 ? " · " : ""}
                            {w.title}
                            {w.startsAtIso
                              ? ` (${new Date(w.startsAtIso).toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })})`
                              : ""}
                          </span>
                        ))}
                      </p>
                    ) : null}

                    {isToday ? (
                      <div className="day-item-foot">
                        <span className="day-item-meta">{lang === "ru" ? "Открыт сейчас" : "Open now"}</span>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--accent)", display: "flex", alignItems: "center", gap: 3 }}>
                          {lang === "ru" ? "Перейти" : "Open"} <ArrowRightIcon />
                        </span>
                      </div>
                    ) : null}
                  </div>
                );

                return (
                  <div
                    key={dayNumber}
                    className={`day-item ${isDone ? "completed" : isToday ? "today" : isLocked ? "locked" : isTrackGate ? "track-gate" : "available"}`}
                  >
                    <div className="day-item-spine">
                      <div className={`day-item-node ${nodeMod}`}>
                        {isDone ? <CheckIcon /> : isLocked ? <LockSmIcon /> : isTrackGate ? <GitBranchIcon /> : dayNumber}
                      </div>
                    </div>
                    <div className="day-item-body">
                      {href ? (
                        <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                          {cardContent}
                        </Link>
                      ) : (
                        cardContent
                      )}
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </AppShell>
  );
}
