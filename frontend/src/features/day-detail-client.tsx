"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDashboard, getDayCurriculum, myHomeworkSubmissions } from "@/features/api";
import type { DayCurriculumResult } from "@/features/api";
import { AppShell, Badge, ButtonLink, Card, CheckIcon, InlineAlert, LockIcon } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

/* ── types ─────────────────────────────────────────── */

type Lesson = DayCurriculumResult["lessons"][number];

type HwSubmission = {
  submissionId: string;
  dayNumber: number;
  status: "pending_review" | "approved" | "rejected" | "overdue";
  reviewComment: string | null;
  reviewedAt: string | null;
};

/* ── icons ──────────────────────────────────────────── */

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function GitBranchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function ClipboardCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/* ── helpers ────────────────────────────────────────── */

function hwStatusText(status: string, lang: "ru" | "en"): string {
  const map: Record<string, [string, string]> = {
    approved: ["Принято", "Approved"],
    pending_review: ["На проверке", "In review"],
    rejected: ["Нужно доработать", "Needs revision"],
    overdue: ["Сдано с опозданием", "Late submission"],
    not_started: ["Не отправлено", "Not submitted"],
  };
  const pair = map[status];
  return pair ? (lang === "ru" ? pair[0] : pair[1]) : status;
}

function hwStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "pending_review" || status === "overdue") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

/* ── lesson row ─────────────────────────────────────── */

function LessonItem({ lesson, lessonHref, lang }: { lesson: Lesson; lessonHref: string; lang: "ru" | "en" }) {
  const isDone = lesson.status === "completed";
  const isLocked = lesson.status === "locked";

  const inner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        padding: "12px 14px",
        background: isDone ? "rgba(13,159,110,0.04)" : "var(--surface)",
        opacity: isLocked ? 0.5 : 1,
        cursor: isLocked ? "default" : "pointer",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
    >
      {/* Status circle */}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          flexShrink: 0,
          background: isDone ? "var(--success)" : isLocked ? "var(--surface-muted)" : "var(--accent-soft)",
          color: isDone ? "#fff" : isLocked ? "var(--text-muted)" : "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isDone ? (
          <CheckIcon />
        ) : isLocked ? (
          <LockIcon />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 6.8v10.4c0 .8.9 1.3 1.6.9l8.2-5.2a1.1 1.1 0 0 0 0-1.8L9.6 5.9c-.7-.4-1.6.1-1.6.9z" />
          </svg>
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {lesson.title}
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
          {lesson.kind === "mandatory"
            ? (lang === "ru" ? "обязательный" : "mandatory")
            : (lang === "ru" ? "дополнительный" : "optional")}
        </p>
      </div>

      {/* Arrow */}
      {!isLocked ? (
        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
          <ChevronRightIcon />
        </span>
      ) : null}
    </div>
  );

  if (isLocked) return inner;
  return (
    <Link href={lessonHref} style={{ textDecoration: "none", display: "block" }}>
      {inner}
    </Link>
  );
}

/* ── main component ─────────────────────────────────── */

export function DayDetailClient({ dayNumber }: { dayNumber: number }) {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dayData, setDayData] = useState<DayCurriculumResult | null>(null);
  const [hwSubmission, setHwSubmission] = useState<HwSubmission | null>(null);
  const [currentDay, setCurrentDay] = useState(1);
  const [trackSelected, setTrackSelected] = useState<string | null>(null);
  const [intensiveEnded, setIntensiveEnded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [dashboard, submissions] = await Promise.all([
          getDashboard(),
          myHomeworkSubmissions().catch(() => [] as HwSubmission[]),
        ]);
        setCurrentDay(dashboard.currentDay);
        setTrackSelected(dashboard.trackSelected);
        setIntensiveEnded(dashboard.intensiveEnded);

        const needsTrack = !dashboard.intensiveEnded && dayNumber >= 8 && !dashboard.trackSelected;
        const isLocked = !dashboard.intensiveEnded && dayNumber > dashboard.currentDay;

        if (!needsTrack && !isLocked) {
          const data = await getDayCurriculum(dayNumber);
          setDayData(data);
        }

        const found = submissions.find((s) => s.dayNumber === dayNumber);
        setHwSubmission(found ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [dayNumber]);

  const isLocked = !loading && !intensiveEnded && dayNumber > currentDay;
  const needsTrack = !loading && !intensiveEnded && dayNumber >= 8 && !trackSelected;
  const hwHref = `/homework/${dayNumber}${qs}`;
  const hwStatus: string = hwSubmission?.status ?? "not_started";

  const mandatory = dayData?.lessons.filter((l) => l.kind === "mandatory") ?? [];
  const optional = dayData?.lessons.filter((l) => l.kind === "optional") ?? [];
  const mandatoryDone = mandatory.filter((l) => l.status === "completed").length;
  const optionalDone = optional.filter((l) => l.status === "completed").length;

  const prevHref = dayNumber > 1 ? `/day/${dayNumber - 1}${qs}` : undefined;
  const nextHref = dayNumber < 14 ? `/day/${dayNumber + 1}${qs}` : undefined;

  /* locked state */
  if (isLocked) {
    return (
      <AppShell role="student" lang={lang} currentDay={currentDay}>
        <div className="day-page">
          <div className="day-page-nav">
            <ButtonLink href={`/lessons${qs}`} tone="ghost" className="small">
              ← {lang === "ru" ? "Программа" : "Programme"}
            </ButtonLink>
          </div>
          <div style={{ maxWidth: 480, margin: "64px auto", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>
              {lang === "ru" ? `День ${dayNumber} ещё не открылся` : `Day ${dayNumber} isn't open yet`}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 24 }}>
              {lang === "ru"
                ? "Этот день откроется по расписанию. Пока продолжи с текущего дня."
                : "This day opens on schedule. Continue with your current day."}
            </p>
            <ButtonLink href={`/day/${currentDay}${qs}`}>
              {lang === "ru" ? `Перейти к дню ${currentDay}` : `Go to day ${currentDay}`}
            </ButtonLink>
          </div>
        </div>
      </AppShell>
    );
  }

  /* track gate state */
  if (needsTrack) {
    return (
      <AppShell role="student" lang={lang} currentDay={currentDay}>
        <div className="day-page">
          <div className="day-page-nav">
            <ButtonLink href={`/lessons${qs}`} tone="ghost" className="small">
              ← {lang === "ru" ? "Программа" : "Programme"}
            </ButtonLink>
          </div>
          <div style={{ maxWidth: 480, margin: "64px auto", textAlign: "center" }}>
            <div style={{ color: "var(--accent)", display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <GitBranchIcon />
            </div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: 8 }}>
              {lang === "ru" ? "Сначала выбери трек" : "Choose your track first"}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: 24 }}>
              {lang === "ru"
                ? `Уроки дня ${dayNumber} откроются сразу после выбора направления. Займёт 1 минуту.`
                : `Day ${dayNumber} lessons unlock right after you pick a direction. Takes 1 minute.`}
            </p>
            <ButtonLink href={`/split${qs}`}>
              {lang === "ru" ? "Выбрать трек →" : "Pick a track →"}
            </ButtonLink>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role="student" lang={lang} currentDay={currentDay}>
      <div className="day-page">

        {/* Top nav */}
        <div className="day-page-nav">
          <ButtonLink href={`/lessons${qs}`} tone="ghost" className="small">
            ← {lang === "ru" ? "Программа" : "Programme"}
          </ButtonLink>
          <span className="day-page-nav-center">
            {lang === "ru" ? `День ${dayNumber} из 14` : `Day ${dayNumber} of 14`}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {prevHref ? (
              <Link href={prevHref} className="link-button ghost small">←</Link>
            ) : <span style={{ width: 32, display: "inline-block" }} />}
            {nextHref ? (
              <Link href={nextHref} className="link-button ghost small">→</Link>
            ) : null}
          </div>
        </div>

        {/* Header */}
        <div className="day-page-header">
          <p className="day-page-day-label">
            {lang === "ru" ? `День ${dayNumber}` : `Day ${dayNumber}`}
          </p>
          <h1 className="day-page-title">
            {loading
              ? (lang === "ru" ? "Загрузка..." : "Loading...")
              : (dayData?.lessons[0]?.title ?? (lang === "ru" ? `День ${dayNumber}` : `Day ${dayNumber}`))}
          </h1>
        </div>

        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

        {loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 58, borderRadius: "var(--radius-md)" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 24 }}>

            {/* Mandatory lessons */}
            {mandatory.length > 0 ? (
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p className="day-section-label" style={{ margin: 0 }}>
                    {lang === "ru" ? "ОБЯЗАТЕЛЬНЫЕ УРОКИ" : "MANDATORY LESSONS"}
                  </p>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    {mandatoryDone}/{mandatory.length}
                  </span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {mandatory.map((lesson) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      lessonHref={`/lesson/${lesson.id}${qs}`}
                      lang={lang}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Optional lessons */}
            {optional.length > 0 ? (
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p className="day-section-label" style={{ margin: 0 }}>
                    {lang === "ru" ? "ДОПОЛНИТЕЛЬНЫЕ УРОКИ" : "OPTIONAL LESSONS"}
                  </p>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    {optionalDone}/{optional.length}
                  </span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {optional.map((lesson) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      lessonHref={`/lesson/${lesson.id}${qs}`}
                      lang={lang}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {(dayData?.webinars?.length ?? 0) > 0 ? (
              <section>
                <p className="day-section-label" style={{ margin: 0 }}>
                  {lang === "ru" ? "ВЕБИНАР" : "WEBINAR"}
                </p>
                <Card>
                  <div style={{ display: "grid", gap: 16 }}>
                    {dayData!.webinars!.map((w) => (
                      <div key={w.id}>
                        <p style={{ fontWeight: 700, margin: 0, fontSize: "1.02rem" }}>{w.title}</p>
                        {w.startsAtIso ? (
                          <p className="muted text-body-sm" style={{ margin: "6px 0 0" }}>
                            {new Date(w.startsAtIso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" · "}
                            {w.durationMinutes}
                            {lang === "ru" ? " мин" : " min"}
                          </p>
                        ) : null}
                        {w.summary.trim() ? (
                          <p style={{ margin: "10px 0 0", lineHeight: 1.55, fontSize: "0.95rem" }}>{w.summary}</p>
                        ) : null}
                        <div className="section-top-sm">
                          {w.status === "available" && w.joinUrl ? (
                            <ButtonLink href={w.joinUrl} className="small">
                              {lang === "ru" ? "Подключиться" : "Join"}
                            </ButtonLink>
                          ) : (
                            <Badge tone="neutral">{lang === "ru" ? "Скоро по расписанию" : "Unlocks on schedule"}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            ) : null}

            {/* No lessons at all */}
            {mandatory.length === 0 && optional.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
                <p style={{ fontSize: "0.9rem" }}>
                  {lang === "ru" ? "Уроки для этого дня ещё не добавлены." : "No lessons added for this day yet."}
                </p>
              </div>
            ) : null}

            {/* Assignment / Homework card */}
            <section>
              <p className="day-section-label">{lang === "ru" ? "ЗАДАНИЕ" : "ASSIGNMENT"}</p>
              <Card>
                <div style={{ display: "grid", gap: 12 }}>

                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: hwStatus === "approved" ? "var(--success)" : hwStatus === "rejected" ? "var(--danger)" : "var(--accent)" }}>
                        <ClipboardCheckIcon />
                      </span>
                      <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text)" }}>
                        {lang === "ru" ? "Домашнее задание" : "Homework"}
                      </span>
                    </div>
                    <Badge tone={hwStatusTone(hwStatus)}>
                      {hwStatusText(hwStatus, lang)}
                    </Badge>
                  </div>

                  {/* Curator feedback */}
                  {hwSubmission?.reviewComment ? (
                    <div
                      style={{
                        background: hwStatus === "approved" ? "rgba(13,159,110,0.06)" : "rgba(220,53,69,0.06)",
                        border: `1px solid ${hwStatus === "approved" ? "rgba(13,159,110,0.2)" : "rgba(220,53,69,0.2)"}`,
                        borderRadius: "var(--radius-sm)",
                        padding: "10px 12px",
                      }}
                    >
                      <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {lang === "ru" ? "Обратная связь куратора" : "Curator feedback"}
                      </p>
                      <p style={{ fontSize: "0.875rem", color: "var(--text)", margin: 0, lineHeight: 1.5 }}>
                        {hwSubmission.reviewComment}
                      </p>
                      {hwSubmission.reviewedAt ? (
                        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>
                          {new Date(hwSubmission.reviewedAt).toLocaleDateString(
                            lang === "ru" ? "ru-RU" : "en-US",
                            { day: "numeric", month: "short" }
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* CTA */}
                  {hwStatus !== "approved" ? (
                    <div>
                      <ButtonLink
                        href={hwHref}
                        tone={hwStatus === "rejected" ? "primary" : hwStatus === "not_started" ? "primary" : "secondary"}
                        className="small"
                      >
                        {hwStatus === "rejected"
                          ? (lang === "ru" ? "Доработать →" : "Revise →")
                          : hwStatus === "pending_review"
                          ? (lang === "ru" ? "Посмотреть →" : "View →")
                          : (lang === "ru" ? "Выполнить задание →" : "Complete assignment →")}
                      </ButtonLink>
                    </div>
                  ) : null}

                </div>
              </Card>
            </section>

          </div>
        )}
      </div>
    </AppShell>
  );
}
