"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/features/api";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
function absMediaUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) return `${API_ORIGIN}${pathOrUrl}`;
  return pathOrUrl;
}
import { AppShell, Badge, Button, ButtonLink, Card, InlineAlert } from "@/shared/ui/components";
import { KINESCOPE_EMBED_ALLOW } from "@/features/kinescope-constants";
import { buildDashboardViewModel, type DashboardViewModel, type HomeworkItem } from "@/features/dashboard/view-model";
import {
  WebinarSpotlightModal,
  readWebinarSpotlightDismissed,
  writeWebinarSpotlightDismissed,
} from "@/features/dashboard/webinar-spotlight-modal";
import { getLang } from "@/features/i18n";

function formatCountdownParts(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return { days, hours, minutes, seconds };
}

function PreStartScreen({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;
  const qs = `?lang=${lang}`;

  const [countdown, setCountdown] = useState(() => vm.secondsToStart ?? 0);

  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); window.location.reload(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const parts = formatCountdownParts(Math.max(0, countdown));
  const startDate = vm.intensiveStartAtIso ? new Date(vm.intensiveStartAtIso) : null;

  return (
    <div className="prestart-screen">
      <div className="prestart-bg-orb prestart-bg-orb--1" />
      <div className="prestart-bg-orb prestart-bg-orb--2" />
      <div className="prestart-bg-orb prestart-bg-orb--3" />
      <div className="prestart-content">
        <img src="/brand/logo-icon.png" alt="Expovision" width={64} height={64} className="prestart-icon" />
        <div className="prestart-hero-text">
          <h1 className="prestart-title">Expovision AI Academy</h1>
          <p className="prestart-subtitle">
            {t("Платформа откроется автоматически, когда наступит время старта", "The platform will open automatically when it's time to start")}
          </p>
        </div>
        {countdown > 0 ? (
          <div className="prestart-countdown">
            <p className="prestart-countdown-label">{t("До старта интенсива", "Intensive starts in")}</p>
            <div className="prestart-timer">
              {[
                { value: parts.days, label: t("дней", "days") },
                { value: parts.hours, label: t("часов", "hours") },
                { value: parts.minutes, label: t("минут", "min") },
                { value: parts.seconds, label: t("секунд", "sec") },
              ].map((block, i) => (
                <div key={block.label} className="prestart-timer-cell">
                  {i > 0 && <span className="prestart-timer-sep">:</span>}
                  <div className="prestart-timer-block">
                    <span className="prestart-timer-value">{String(block.value).padStart(2, "0")}</span>
                    <span className="prestart-timer-unit">{block.label}</span>
                  </div>
                </div>
              ))}
            </div>
            {startDate ? (
              <p className="prestart-start-date">
                {startDate.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="prestart-countdown">
            <div className="prestart-soon-pulse" />
            <p className="prestart-soon-text">{t("Старт совсем скоро!", "Starting very soon!")}</p>
          </div>
        )}
        {!vm.reportCompleted ? (
          <div className="prestart-report">
            <div className="prestart-report-card">
              <div className="prestart-report-icon-wrap">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <div className="prestart-report-text">
                <p className="prestart-report-heading">{t("Стартовый отчёт", "Initial Report")}</p>
                <p className="prestart-report-desc">
                  {t("Заполните отчёт сейчас, чтобы открыть персональный учебный маршрут", "Complete the report now to unlock your personalized learning route")}
                </p>
              </div>
              <a href={`/report/start${qs}`} className="prestart-report-btn">
                {t("Начать отчёт", "Start report")}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </a>
            </div>
          </div>
        ) : null}
        <button type="button" className="prestart-logout" onClick={() => { void logout(); window.location.href = `/login${qs}`; }}>
          {t("Выйти из аккаунта", "Sign out")}
        </button>
      </div>
    </div>
  );
}

function HomeworkStatusText(status: string, lang: "ru" | "en", isPastDay = false): string {
  const map: Record<string, [string, string]> = {
    approved: ["Принято", "Approved"],
    pending_review: ["На проверке", "In review"],
    rejected: ["Нужно доработать", "Needs revision"],
    overdue: ["Сдано с опозданием", "Late submission"],
  };
  const pair = map[status];
  if (pair) return lang === "ru" ? pair[0] : pair[1];
  // "not_started" — meaning depends on context
  if (isPastDay) return lang === "ru" ? "Пропущено" : "Missed";
  return lang === "ru" ? "Не отправлено" : "Not submitted";
}

function HomeworkStatusTone(status: string, isPastDay = false): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "pending_review") return "warning";
  if (status === "overdue") return "warning";
  if (status === "rejected") return "danger";
  // not_started on a past day = missed = danger signal
  if (isPastDay) return "danger";
  return "neutral";
}

function HomeworkSection({ items, needsAttention, lang, qs }: { items: HomeworkItem[]; needsAttention: HomeworkItem[]; lang: "ru" | "en"; qs: string }) {
  if (items.length === 0) return null;

  const attentionCount = needsAttention.length;

  // Show: needs-attention items first, then approved, then pending_review. Max 5 displayed by default.
  const sorted = [
    ...items.filter((h) => h.status === "rejected"),
    ...items.filter((h) => h.status === "not_started"),
    ...items.filter((h) => h.status === "overdue"),
    ...items.filter((h) => h.status === "pending_review"),
    ...items.filter((h) => h.status === "approved"),
  ];

  return (
    <div>
      <div className="row between" style={{ marginBottom: 10 }}>
        <p className="day-section-label" style={{ margin: 0 }}>
          {lang === "ru" ? "ЗАДАНИЯ" : "ASSIGNMENTS"}
        </p>
        {attentionCount > 0 ? (
          <Badge tone="danger">
            {lang === "ru" ? `${attentionCount} требуют внимания` : `${attentionCount} need attention`}
          </Badge>
        ) : (
          <Badge tone="success">{lang === "ru" ? "Всё сдано" : "All submitted"}</Badge>
        )}
      </div>
      <Card>
        <div className="stack" style={{ gap: 8 }}>
          {sorted.map((item) => {
            const isPast = item.status === "not_started" || item.status === "overdue";
            const tone = HomeworkStatusTone(item.status, isPast);
            const label = HomeworkStatusText(item.status, lang, isPast);

            const isLast = sorted.indexOf(item) === sorted.length - 1;
            return (
              <div
                key={item.dayNumber}
                style={{
                  borderBottom: isLast ? "none" : "1px solid var(--border)",
                  paddingBottom: 12,
                }}
              >
                <div className="row between items-start" style={{ gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)", margin: "0 0 2px" }}>
                      {lang === "ru" ? `День ${item.dayNumber}` : `Day ${item.dayNumber}`}
                      <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6, fontSize: "0.8rem" }}>
                        {item.dayTitle !== (lang === "ru" ? `День ${item.dayNumber}` : `Day ${item.dayNumber}`) ? item.dayTitle : ""}
                      </span>
                    </p>
                    {item.reviewComment ? (
                      <p style={{ fontSize: "0.8rem", color: item.status === "rejected" ? "var(--danger)" : "var(--text-secondary)", margin: "4px 0 0", lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 500 }}>
                          {lang === "ru" ? "Куратор: " : "Curator: "}
                        </span>
                        {item.reviewComment}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                {(item.status === "rejected" || item.status === "not_started" || item.status === "overdue") ? (
                  <div style={{ marginTop: 8 }}>
                    <ButtonLink href={item.hwHref} tone="primary" className="small">
                      {item.status === "rejected"
                        ? (lang === "ru" ? "Доработать →" : "Revise →")
                        : (lang === "ru" ? "Сдать задание →" : "Submit →")}
                    </ButtonLink>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;
  const [vm, setVm] = useState<DashboardViewModel | null>(null);
  const [error, setError] = useState("");
  const [webinarSpotlightShut, setWebinarSpotlightShut] = useState(false);
  const prevSpotlightId = useRef<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const vm = await buildDashboardViewModel(lang);
        setVm(vm);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [lang]);

  useEffect(() => {
    const id = vm?.webinarSpotlight?.id ?? null;
    if (id && id !== prevSpotlightId.current) {
      prevSpotlightId.current = id;
      setWebinarSpotlightShut(false);
    }
  }, [vm?.webinarSpotlight?.id]);

  if (!vm && !error) {
    return (
      <div className="prestart-screen">
        <div className="prestart-content">
          <img src="/brand/logo-icon.png" alt="Expovision" width={64} height={64} className="prestart-icon" />
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="prestart-screen">
        <div className="prestart-content">
          <img src="/brand/logo-icon.png" alt="Expovision" width={64} height={64} className="prestart-icon" />
          <InlineAlert tone="error">{error}</InlineAlert>
          <Button type="button" tone="secondary" onClick={() => window.location.reload()}>
            {lang === "ru" ? "Попробовать снова" : "Try again"}
          </Button>
        </div>
      </div>
    );
  }

  if (!vm) return null;

  if (vm.showPreStartGate) {
    return <PreStartScreen vm={vm} lang={lang} />;
  }

  const currentDay = vm.currentDay;
  const todayPlan = vm.todayPlan;
  const needsTrack = vm.splitAvailable && !vm.trackSelected && !vm.intensiveEnded;
  const todayLessonHref = needsTrack && currentDay >= 8
    ? `/split${qs}`
    : (todayPlan?.lessonHref ?? `/lessons${qs}&day=${currentDay}`);
  const todayHomeworkHref = todayPlan?.homeworkHref ?? `/homework/${currentDay}${qs}`;
  const hwStatus = todayPlan?.homeworkStatus ?? "not_started";
  const hwDone = hwStatus === "approved" || hwStatus === "pending_review";
  const nextDay = vm.roadmap.find((d) => d.dayNumber === currentDay + 1);
  // During intensive: days with at least one completed lesson. After close: all programme days count as done.
  const daysWithWork = vm.intensiveEnded
    ? vm.roadmap.filter((d) => d.state === "completed").length
    : vm.roadmap.filter((d) => d.state === "completed" && d.lessonsCompleted > 0).length;

  const showWebinarSpotlight =
    !vm.showReportGate &&
    !vm.intensiveEnded &&
    vm.webinarSpotlight &&
    !webinarSpotlightShut &&
    !readWebinarSpotlightDismissed(vm.webinarSpotlight);

  return (
    <AppShell role="student" lang={lang} currentDay={currentDay}>
      <div className="stack">
        {showWebinarSpotlight ? (
          <WebinarSpotlightModal
            spotlight={vm.webinarSpotlight!}
            lang={lang}
            onDismiss={() => {
              writeWebinarSpotlightDismissed(vm.webinarSpotlight!);
              setWebinarSpotlightShut(true);
            }}
          />
        ) : null}

        {/* Next event — first content block when a webinar is configured */}
        {vm.nextEvent ? (
          <div>
            <p className="day-section-label">{lang === "ru" ? "Ближайшее событие" : "Next event"}</p>
            <div className="event-card event-card--embed">
              {/* Kinescope player: shown directly when embed URL is available */}
              {vm.nextEvent.kinescopeEmbedUrl ? (
                <div className="event-card-embed-wrap">
                  <iframe
                    src={vm.nextEvent.kinescopeEmbedUrl}
                    allow={KINESCOPE_EMBED_ALLOW}
                    allowFullScreen
                    className="event-card-embed"
                    title={vm.nextEvent.title}
                  />
                </div>
              ) : vm.nextEvent.thumbnailUrl ? (
                <img
                  src={absMediaUrl(vm.nextEvent.thumbnailUrl)}
                  alt={vm.nextEvent.title}
                  className="event-card-thumb"
                />
              ) : null}
              <div className="event-card-body">
                <div className="event-card-header">
                  {vm.nextEvent.status === "live" ? (
                    <span className="event-status-badge live">{lang === "ru" ? "● Идет сейчас" : "● Live now"}</span>
                  ) : vm.nextEvent.status === "upcoming" ? (
                    <span className="event-status-badge upcoming">{lang === "ru" ? `Скоро · ${vm.nextEvent.at}` : `Soon · ${vm.nextEvent.at}`}</span>
                  ) : vm.nextEvent.status === "ended" ? (
                    <span className="event-status-badge ended">{lang === "ru" ? "Завершен" : "Ended"}</span>
                  ) : (
                    <span className="event-status-badge no-time">{lang === "ru" ? "Время не назначено" : "Time not set"}</span>
                  )}
                </div>
                <p className="entity-title" style={{ marginBottom: 4 }}>{vm.nextEvent.title}</p>
                <p className="entity-subtitle" style={{ marginBottom: vm.nextEvent.summary ? 6 : 12 }}>{vm.nextEvent.speaker}</p>
                {vm.nextEvent.summary ? (
                  <p className="event-card-summary">{vm.nextEvent.summary}</p>
                ) : null}
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  {vm.nextEvent.status === "ended" ? (
                    <span className="button small disabled" aria-disabled="true">{lang === "ru" ? "Открыть вебинар" : "View webinar"}</span>
                  ) : (
                    <ButtonLink href={vm.nextEvent.joinHref} className="small">
                      {vm.nextEvent.status === "live"
                        ? (lang === "ru" ? "Открыть на полный экран →" : "Open fullscreen →")
                        : (lang === "ru" ? "Открыть вебинар →" : "Open webinar →")}
                    </ButtonLink>
                  )}
                  {vm.nextEvent.calendarUrl ? (
                    <a href={vm.nextEvent.calendarUrl} target="_blank" rel="noreferrer" className="link-button secondary small">
                      {lang === "ru" ? "В календарь" : "Add to calendar"}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Report gate — inline, non-blocking */}
        {vm.showReportGate ? (
          <InlineAlert tone="warning">
            {vm.reportGateMessage}
            {" "}
            <a href={`/report/start${qs}`}>
              {lang === "ru" ? "Заполнить отчёт →" : "Complete report →"}
            </a>
          </InlineAlert>
        ) : null}

        {/* Track selection gate — shown prominently when on day 7+ without track */}
        {vm.splitAvailable && !vm.trackSelected && !vm.intensiveEnded ? (
          <div className="next-day-card next-day-card--elevated">
            <div className="next-day-card-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
              </svg>
            </div>
            <div className="next-day-card-body">
              <p className="next-day-card-kicker">
                {lang === "ru" ? "Нужно выбрать направление" : "Choose your direction"}
              </p>
              <p className="next-day-card-title">
                {lang === "ru"
                  ? "Без трека уроки дней 8–14 недоступны. Выбор займёт 1 минуту."
                  : "Without a track, days 8–14 are locked. Pick one in 1 minute."}
              </p>
            </div>
            <ButtonLink href={`/split${qs}`}>
              {lang === "ru" ? "Выбрать трек →" : "Pick a track →"}
            </ButtonLink>
          </div>
        ) : null}

        {/* Hero */}
        <div className="home-hero">
          <div className="home-hero-day">
            <span className="home-hero-day-badge">
              {lang === "ru" ? `День ${currentDay}` : `Day ${currentDay}`}
            </span>
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              {lang === "ru" ? `из 14` : `of 14`}
            </span>
          </div>

          <div>
            <h1 className="home-hero-title">
              {vm.intensiveEnded
                ? (lang === "ru" ? "Интенсив завершён" : "Intensive completed")
                : needsTrack && currentDay >= 8
                  ? (lang === "ru" ? "Выбери своё направление" : "Choose your direction")
                  : (todayPlan?.lessonTitle ?? (lang === "ru" ? "Добро пожаловать!" : "Welcome!"))}
            </h1>
            <p className="home-hero-subtitle">
              {vm.intensiveEnded
                ? (lang === "ru"
                    ? "Все дни программы и курсы доступны. Раздел «Финал» — сертификат и итоги. Можно выбрать трек в настройках, чтобы удобнее смотреть дни 8–14."
                    : "All programme days and courses stay open. Use Final for your certificate. You can still pick a track in settings to filter days 8–14.")
                : needsTrack && currentDay >= 8
                  ? (lang === "ru"
                      ? "Уроки дней 8–14 откроются сразу после выбора трека"
                      : "Days 8–14 unlock right after you pick a track")
                  : (todayPlan?.recommendedAction ?? "")}
            </p>
          </div>

          <div className="home-progress">
            <div className="home-progress-meta">
              <span className="home-progress-label">
                {lang === "ru"
                  ? `${vm.lessonsCompleted} из ${vm.lessonsTotal} уроков`
                  : `${vm.lessonsCompleted} of ${vm.lessonsTotal} lessons`}
              </span>
              <span className="home-progress-pct">{vm.trueProgressPercent}%</span>
            </div>
            <div className="home-progress-track">
              <div className="home-progress-fill" style={{ width: `${vm.trueProgressPercent}%` }} />
            </div>
          </div>

          <div className="home-actions">
            <ButtonLink href={todayLessonHref}>
              {needsTrack && currentDay >= 8
                ? (lang === "ru" ? "Выбрать трек →" : "Pick a track →")
                : (lang === "ru" ? "Продолжить →" : "Continue →")}
            </ButtonLink>
            {!hwDone && !needsTrack ? (
              <ButtonLink href={todayHomeworkHref} tone="secondary" className="small">
                {lang === "ru" ? "Сдать задание" : "Submit assignment"}
              </ButtonLink>
            ) : null}
          </div>
        </div>

        {/* Welcome back banner — shown when user missed 2+ days */}
        {vm.isReturnAfterPause ? (
          <div className="next-day-card next-day-card--elevated">
            <div className="next-day-card-icon" aria-hidden><span className="next-day-card-emoji" role="img">👋</span></div>
            <div className="next-day-card-body">
              <p className="next-day-card-kicker">
                {lang === "ru" ? `Ты вернулся! Пропущено ${vm.missedDays} ${vm.missedDays === 1 ? "день" : "дня"}` : `Welcome back! You missed ${vm.missedDays} day${vm.missedDays !== 1 ? "s" : ""}`}
              </p>
              <p className="next-day-card-title">
                {lang === "ru"
                  ? "Прошлые задания можно сдать до конца интенсива. Начни с сегодняшнего дня."
                  : "Past assignments can still be submitted before the intensive ends. Start with today."}
              </p>
            </div>
          </div>
        ) : null}

        {/* Stats row */}
          <div className="home-stats-row">
          <Link href={todayHomeworkHref} className="home-stat-card">
            <span className="home-stat-value">
              <Badge tone={HomeworkStatusTone(hwStatus)}>{HomeworkStatusText(hwStatus, lang)}</Badge>
            </span>
            <span className="home-stat-label">
              {vm.intensiveEnded
                ? (lang === "ru" ? "Задание (день программы)" : "Assignment (programme day)")
                : (lang === "ru" ? "Задание сегодня" : "Today's assignment")}
            </span>
          </Link>
          <div className="home-stat-card">
            <span className="home-stat-value">{vm.homeworkApproved}</span>
            <span className="home-stat-label">{lang === "ru" ? "Заданий принято" : "Assignments approved"}</span>
          </div>
          <div className="home-stat-card">
            <span className="home-stat-value">{daysWithWork}</span>
            <span className="home-stat-label">{lang === "ru" ? "Дней завершено" : "Days done"}</span>
          </div>
          <div className="home-stat-card">
            <span className="home-stat-value">{vm.intensiveEndsIn}</span>
            <span className="home-stat-label">
              {vm.intensiveEnded ? (lang === "ru" ? "Статус интенсива" : "Intensive status") : (lang === "ru" ? "До конца интенсива" : "Until end")}
            </span>
          </div>
        </div>

        {/* Homework section */}
        <HomeworkSection
          items={vm.homeworkItems}
          needsAttention={vm.needsAttention}
          lang={lang}
          qs={qs}
        />

        {/* What's next */}
        {!vm.intensiveEnded && nextDay && nextDay.state === "locked" ? (
          <div>
            <p className="day-section-label">{lang === "ru" ? "Следующий шаг" : "Up next"}</p>
            <div className="next-day-card">
              <div className="next-day-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div className="next-day-card-body">
                <p className="next-day-card-label">
                  {lang === "ru" ? `День ${nextDay.dayNumber}` : `Day ${nextDay.dayNumber}`}
                  {" — "}
                  {lang === "ru" ? "откроется завтра" : "opens tomorrow"}
                </p>
                <p className="next-day-card-title">{nextDay.title || (lang === "ru" ? "Следующий урок" : "Next lesson")}</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Nearby days from roadmap — hidden when intensive ended */}
        {!vm.intensiveEnded ? (
          <div>
            <div className="row between" style={{ marginBottom: "10px" }}>
              <p className="day-section-label" style={{ margin: 0 }}>{lang === "ru" ? "Маршрут" : "Programme"}</p>
              <ButtonLink href={`/lessons${qs}&day=${currentDay}`} tone="ghost" className="small">
                {lang === "ru" ? "Все дни →" : "All days →"}
              </ButtonLink>
            </div>
            <Card>
              <div className="stack stack-tight">
                {vm.roadmap.slice(Math.max(0, currentDay - 2), Math.min(vm.roadmap.length, currentDay + 1)).map((dayBlock) => {
                  const qualityTone =
                    dayBlock.completionQuality === "done" ? "success" :
                    dayBlock.completionQuality === "partial" ? "warning" :
                    dayBlock.completionQuality === "open" ? "primary" :
                    "neutral";
                  return (
                    <div key={dayBlock.dayNumber} className="student-lesson-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="entity-title">{lang === "ru" ? `День ${dayBlock.dayNumber}` : `Day ${dayBlock.dayNumber}`}</p>
                        <p className="entity-subtitle">{dayBlock.title}</p>
                      </div>
                      <Badge tone={qualityTone}>
                        {dayBlock.lessonsTotal > 0
                          ? `${dayBlock.lessonsCompleted}/${dayBlock.lessonsTotal}`
                          : (dayBlock.completionQuality === "locked" ? "—" : "·")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        ) : null}

      </div>
    </AppShell>
  );
}
