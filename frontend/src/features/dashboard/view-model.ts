"use client";

import {
  getCurriculumRoadmap,
  getStudentBootstrap,
  getWebinar,
  myHomeworkSubmissions,
  type DayCurriculumResult,
  type StudentBootstrapResponse,
} from "@/features/api";

type DashboardResponse = NonNullable<StudentBootstrapResponse["dashboard"]>;
type DayCurriculum = DayCurriculumResult;
type HomeworkStatus = "pending_review" | "approved" | "rejected" | "overdue";

type RoadmapState = "completed" | "unlocked" | "locked";

// Derived day quality for mini-roadmap badge rendering
export type DayCompletionQuality = "done" | "partial" | "open" | "locked";

export type HomeworkItem = {
  dayNumber: number;
  dayTitle: string;
  status: "approved" | "pending_review" | "rejected" | "overdue" | "not_started";
  reviewComment: string | null;
  reviewedAt: string | null;
  hwHref: string;
};

export type DashboardRoadmapDay = {
  dayNumber: number;
  title: string;
  state: RoadmapState;
  lessonsTotal: number;
  lessonsCompleted: number;
  completionQuality: DayCompletionQuality;
  lessons: Array<{ id: string; title: string; kind: "mandatory" | "optional"; status: "locked" | "available" | "completed" }>;
};

export type DashboardTodayPlan = {
  lessonTitle: string;
  lessonId: string | null;
  nextLessonId: string | null;
  nextLessonTitle: string | null;
  lessonHref: string;
  nextLessonHref: string;
  homeworkHref: string;
  homeworkStatus: HomeworkStatus | "not_started";
  webinarTitle: string | null;
  webinarAt: string | null;
  deadlineLabel: string;
  recommendedAction: string;
};

export type WebinarSpotlight = {
  id: string;
  title: string;
  summary: string;
  joinUrl: string;
  startsAtIso: string;
  durationMinutes: number;
  secondsUntilStart: number;
  isLive: boolean;
  isFirstInProgram: boolean;
  calendarUrl: string;
};

export type DashboardViewModel = {
  currentDay: number;
  stageLabel: string;
  dayLabel: string;
  progressPercent: number;
  trueProgressPercent: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  missedDays: number;
  isReturnAfterPause: boolean;
  homeworkCompleted: number;
  homeworkApproved: number;
  homeworkMissed: number;
  nextStepLabel: string;
  nextStepHref: string;
  intensiveEndsIn: string;
  showPreStartGate: boolean;
  showReportGate: boolean;
  intensiveEnded: boolean;
  preStartMessage: string;
  reportGateMessage: string;
  secondsToStart: number | null;
  intensiveStartAtIso: string | null;
  reportCompleted: boolean;
  splitAvailable: boolean;
  trackSelected: string | null;
  roadmap: DashboardRoadmapDay[];
  homeworkItems: HomeworkItem[];
  needsAttention: HomeworkItem[];
  todayPlan: DashboardTodayPlan | null;
  achievements: string[];
  stats: {
    learningHours: number;
    learningMinutes: number;
    actionCount: number;
    modulesUnlocked: number;
    modulesTotal: number;
    gradeAverage: number;
    aiToolsMastered: number;
    certificatePoints: number;
  };
  nextEvent: {
    id: string;
    title: string;
    summary: string;
    at: string;
    speaker: string;
    joinUrl: string;
    joinHref: string;
    calendarUrl: string | null;
    isUnlocked: boolean;
    secondsUntilStart: number | null;
    startsAtIso: string | null;
    durationMinutes: number;
    thumbnailUrl: string;
    kinescopeVideoId: string | null;
    kinescopeEmbedUrl: string | null;
    status: "upcoming" | "live" | "ended" | "no_time";
  } | null;
  webinarSpotlight: WebinarSpotlight | null;
  announcements: string[];
  motivationText: string;
  finalGoalText: string;
  recommendedTools: Array<{ name: string; useCase: string }>;
  assistantStarters: string[];
  nextBestAction: string;
  insightsSource: "ai" | "fallback";
};

function buildGoogleCalendarUrl(params: {
  title: string;
  startsAtIso: string;
  durationMinutes: number;
  joinUrl: string;
}): string {
  const start = new Date(params.startsAtIso);
  const end = new Date(start.getTime() + params.durationMinutes * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", params.title);
  url.searchParams.set("dates", `${fmt(start)}/${fmt(end)}`);
  url.searchParams.set("details", `Join: ${params.joinUrl}`);
  url.searchParams.set("location", params.joinUrl);
  return url.toString();
}

/** In-app webinar page when Kinescope is set; otherwise external join URL; fallback to /webinar/[id]. */
function webinarStudentOpenHref(
  w: { id: string; kinescopeVideoId?: string | null; joinUrl?: string | null },
  lang: "ru" | "en",
): string {
  const raw = (w.joinUrl ?? "").trim();
  if (w.kinescopeVideoId) {
    return `/webinar/${w.id}?lang=${lang}`;
  }
  if (raw) {
    return raw;
  }
  return `/webinar/${w.id}?lang=${lang}`;
}

/** Absolute in-app webinar page URL for calendar invites; otherwise the external join URL. */
function webinarCalendarPageUrl(w: { id: string; kinescopeVideoId?: string | null; joinUrl?: string | null }): string {
  if (w.kinescopeVideoId) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/webinar/${w.id}`;
  }
  return (w.joinUrl ?? "").trim();
}

function formatCountdown(seconds: number | null, lang: string): string {
  if (seconds === null || seconds <= 0) return lang === "ru" ? "Скоро" : "Soon";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return lang === "ru" ? `${days}д ${hours}ч ${mins}м` : `${days}d ${hours}h ${mins}m`;
}

function defaultDayTitle(dayNumber: number, lang: string): string {
  return lang === "ru" ? `День ${dayNumber}` : `Day ${dayNumber}`;
}

function extractDayTitle(day: DayCurriculum | null, dayNumber: number, lang: string): string {
  if (!day || day.lessons.length === 0) return defaultDayTitle(dayNumber, lang);
  return day.lessons[0]?.title ?? defaultDayTitle(dayNumber, lang);
}

function resolveStageLabel(data: DashboardResponse, lang: string): string {
  if (!data.platformOpen) return lang === "ru" ? "Ожидание старта" : "Waiting for start";
  if (data.intensiveEnded) return lang === "ru" ? "Интенсив завершён" : "Intensive completed";
  if (!data.reportCompleted) return lang === "ru" ? "Нужен стартовый отчет" : "Initial report required";
  if (data.currentDay <= 7) return lang === "ru" ? "Ядро программы" : "Core program";
  if (!data.trackSelected) return lang === "ru" ? "Выбор трека" : "Track selection";
  return lang === "ru" ? "Персональный трек" : "Personal track";
}

export async function buildDashboardViewModel(lang: "ru" | "en"): Promise<DashboardViewModel> {
  const boot = await getStudentBootstrap();
  const dashboard = boot.dashboard;
  if (!dashboard) {
    throw new Error(lang === "ru" ? "Нет данных дашборда" : "Dashboard unavailable");
  }
  const actionStats = dashboard.actionStats ?? {
    lessonsCompleted: 0,
    homeworkSubmitted: 0,
    fluencyGenerated: 0,
    reflectionAdded: 0,
    actionCount: 0,
    minutesSpent: 0,
  };
  const homework =
    boot.homeworkMine ??
    (dashboard.platformOpen ? await myHomeworkSubmissions().catch(() => []) : []);
  const homeworkMap = new Map<number, HomeworkStatus>();
  for (const row of homework) homeworkMap.set(row.dayNumber, row.status);

  const showPreStartGate = !dashboard.platformOpen;
  const showReportGate = dashboard.platformOpen && !dashboard.reportCompleted;

  let roadmap: DashboardRoadmapDay[] = [];
  let lessonsTotal = 0;
  let lessonsCompleted = 0;
  let todayPlan: DashboardTodayPlan | null = null;
  if (dashboard.platformOpen && dashboard.reportCompleted) {
    const rawDays =
      boot.roadmap ?? (await getCurriculumRoadmap().catch(() => [] as DayCurriculumResult[]));
    // Normalise to a fixed 14-element array indexed by day number (1-based)
    const dayRows: (DayCurriculum | null)[] = Array.from({ length: 14 }, (_, i) => {
      return rawDays.find((d) => d.dayNumber === i + 1) ?? null;
    });
    const intensiveOver = Boolean(dashboard.intensiveEnded);
    roadmap = dayRows.map((row, idx) => {
      const dayNumber = idx + 1;
      const rowLessons = row?.lessons ?? [];
      const dayLessonsTotal = rowLessons.length;
      const dayLessonsCompleted = rowLessons.filter((lesson) => lesson.status === "completed").length;
      lessonsTotal += dayLessonsTotal;
      lessonsCompleted += dayLessonsCompleted;
      const state: RoadmapState = intensiveOver
        ? "completed"
        : dayNumber < dashboard.currentDay
          ? "completed"
          : dayNumber === dashboard.currentDay
            ? "unlocked"
            : "locked";

      let completionQuality: DayCompletionQuality;
      if (state === "locked") {
        completionQuality = "locked";
      } else if (state === "unlocked") {
        completionQuality = "open";
      } else if (intensiveOver) {
        completionQuality = dayLessonsTotal === 0 ? "open" : "done";
      } else {
        // Past day — use real data
        if (dayLessonsTotal === 0) completionQuality = "open";
        else if (dayLessonsCompleted === dayLessonsTotal) completionQuality = "done";
        else if (dayLessonsCompleted > 0) completionQuality = "partial";
        else completionQuality = "open";
      }

      return {
        dayNumber,
        title: extractDayTitle(row, dayNumber, lang),
        state,
        lessonsTotal: dayLessonsTotal,
        lessonsCompleted: dayLessonsCompleted,
        completionQuality,
        lessons: rowLessons,
      };
    });

    const todayData = dayRows[dashboard.currentDay - 1];
    const todayLesson = todayData?.lessons.find((lesson) => lesson.status !== "completed") ?? todayData?.lessons[0] ?? null;
    const nextLesson = dayRows
      .flatMap((row, rowIdx) => (row?.lessons ?? []).map((lesson) => ({ lesson, dayNumber: rowIdx + 1 })))
      .find(({ dayNumber, lesson }) => dayNumber >= dashboard.currentDay && lesson.status === "available" && lesson.id !== todayLesson?.id)
      ?.lesson ?? null;
    const todayHomework = homeworkMap.get(dashboard.currentDay) ?? "not_started";
    const webinar = dashboard.weekOneWebinars.find((item) => item.day === dashboard.currentDay) ?? null;
    const deadlineDate = dashboard.intensiveStartAtIso ? new Date(new Date(dashboard.intensiveStartAtIso).getTime() + dashboard.currentDay * 24 * 60 * 60 * 1000) : null;
    const needsTrackSelection =
      !intensiveOver && !dashboard.trackSelected && dashboard.splitAvailable && dashboard.currentDay >= 7;
    const recommendedAction = needsTrackSelection && !todayLesson
      ? (lang === "ru"
          ? "Выбери трек — это откроет уроки дней 8–14 под твои цели."
          : "Pick a track — it unlocks days 8–14 lessons tailored to your goals.")
      : todayLesson
          ? (lang === "ru"
              ? `Сначала открой урок «${todayLesson.title}», затем выполни практику и отправь домашку.`
              : `Start with lesson "${todayLesson.title}", then finish practice and submit homework.`)
          : (lang === "ru" ? "Открой задания дня и продолжи по плану." : "Open today's tasks and continue.");
    const webinarTimeLabel = webinar?.startsAtIso
      ? new Date(webinar.startsAtIso).toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })
      : null;
    todayPlan = {
      lessonTitle: todayLesson?.title ?? (lang === "ru" ? "Урок дня не назначен" : "No lesson assigned"),
      lessonId: todayLesson?.id ?? null,
      nextLessonId: nextLesson?.id ?? null,
      nextLessonTitle: nextLesson?.title ?? null,
      lessonHref: todayLesson?.id ? `/lessons?lang=${lang}&day=${dashboard.currentDay}&lesson=${todayLesson.id}` : `/lessons?lang=${lang}&day=${dashboard.currentDay}`,
      nextLessonHref: nextLesson?.id ? `/lessons?lang=${lang}&day=${dashboard.currentDay}&lesson=${nextLesson.id}` : `/lessons?lang=${lang}&day=${dashboard.currentDay}`,
      homeworkHref: `/homework/${dashboard.currentDay}?lang=${lang}`,
      homeworkStatus: todayHomework,
      webinarTitle: webinar ? `${webinar.title}${webinarTimeLabel ? ` (${webinarTimeLabel})` : ""}` : null,
      webinarAt: webinar?.startsAtIso ?? null,
      deadlineLabel: intensiveOver
        ? (lang === "ru" ? "Материалы открыты без дедлайна" : "No deadline — all materials stay open")
        : deadlineDate
          ? deadlineDate.toLocaleString()
          : (lang === "ru" ? "До начала следующего дня" : "Before next day starts"),
      recommendedAction,
    };
  }

  // Build homework items for all past/current days (submitted or overdue)
  const homeworkItems: HomeworkItem[] = [];
  if (dashboard.platformOpen && dashboard.reportCompleted) {
    const pastDays = roadmap.filter((d) => d.state !== "locked");
    for (const day of pastDays) {
      const sub = homework.find((h) => h.dayNumber === day.dayNumber);
      const hwHref = `/homework/${day.dayNumber}?lang=${lang}`;
      if (sub) {
        homeworkItems.push({
          dayNumber: day.dayNumber,
          dayTitle: day.title,
          status: sub.status,
          reviewComment: sub.reviewComment,
          reviewedAt: sub.reviewedAt,
          hwHref,
        });
      } else if (dashboard.intensiveEnded || day.dayNumber < dashboard.currentDay) {
        // No submission: show as not_started for all programme days once intensive ended;
        // during intensive, only past days (before currentDay) appear here.
        homeworkItems.push({
          dayNumber: day.dayNumber,
          dayTitle: day.title,
          status: "not_started",
          reviewComment: null,
          reviewedAt: null,
          hwHref,
        });
      }
    }
  }
  const needsAttention = homeworkItems.filter(
    (h) => h.status === "rejected" || h.status === "overdue" || h.status === "not_started",
  );

  // True course progress: after intensive ends (including early close), align ring with full programme.
  const trueProgressPercent =
    dashboard.intensiveEnded && lessonsTotal > 0
      ? 100
      : lessonsTotal > 0
        ? Math.round((lessonsCompleted / lessonsTotal) * 100)
        : 0;

  // Missed days: past days with lessons but 0 completed
  const missedDays = roadmap.filter(
    (d) => d.state === "completed" && d.lessonsTotal > 0 && d.lessonsCompleted === 0,
  ).length;
  const isReturnAfterPause = !dashboard.intensiveEnded && missedDays >= 2;

  const homeworkCompleted = homework.filter((row) => row.status !== "overdue").length;
  const homeworkApproved = homework.filter((row) => row.status === "approved").length;
  const homeworkMissed = homework.filter((row) => row.status === "overdue").length;
  const needsTrackGate =
    !dashboard.intensiveEnded && !dashboard.trackSelected && dashboard.splitAvailable && dashboard.currentDay >= 8;
  const nextStepHref = showPreStartGate
    ? `/report/start?lang=${lang}`
    : showReportGate
    ? `/report/start?lang=${lang}`
    : needsTrackGate
    ? `/split?lang=${lang}`
    : `/lessons?lang=${lang}&day=${dashboard.currentDay}`;
  const nextStepLabel = showPreStartGate
    ? (lang === "ru" ? "Пройти стартовый отчет" : "Complete initial report")
    : showReportGate
    ? (lang === "ru" ? "Завершить стартовый отчет" : "Finish initial report")
    : needsTrackGate
    ? (lang === "ru" ? "Выбрать трек" : "Pick a track")
    : (lang === "ru" ? "Продолжить обучение" : "Continue learning");

  const achievements: string[] = [];
  if (dashboard.reportCompleted) achievements.push(lang === "ru" ? "Стартовый отчет завершен" : "Initial report completed");
  if (dashboard.trackSelected) achievements.push(`${lang === "ru" ? "Выбран трек" : "Track selected"}: ${dashboard.trackSelected}`);
  if (lessonsCompleted >= 5) achievements.push(lang === "ru" ? "Prompt Master" : "Prompt Master");
  if (lessonsCompleted >= 9) achievements.push(lang === "ru" ? "Automation Starter" : "Automation Starter");
  if (homeworkCompleted >= 3) achievements.push(lang === "ru" ? "Content Builder" : "Content Builder");

  const now = Date.now();
  const webinarCandidates = dashboard.weekOneWebinars.filter((w) => w.webinarStatus !== "completed");
  const liveUnlocked = webinarCandidates.find((w) => w.unlocked && w.webinarStatus === "active");
  const upcomingWebinar =
    liveUnlocked
    ?? webinarCandidates.find((w) => w.startsAtIso && new Date(w.startsAtIso).getTime() > now)
    ?? webinarCandidates[0]
    ?? null;

  // Fetch fresh metadata from /webinar/{id} when we have a player id or a live session (embed URL may be resolved server-side).
  let webinarDetail: Awaited<ReturnType<typeof getWebinar>> | null = null;
  if (
    upcomingWebinar?.id
    && (Boolean(upcomingWebinar.kinescopeVideoId) || upcomingWebinar.webinarStatus === "active")
  ) {
    try {
      webinarDetail = await getWebinar(upcomingWebinar.id);
    } catch {
      // fallback to bootstrap data
    }
  }

  const nextEvent = upcomingWebinar
    ? (() => {
        const startsAtIso = upcomingWebinar.startsAtIso;
        const durationMinutes = upcomingWebinar.durationMinutes || 90;
        let at: string = lang === "ru" ? "Время не назначено" : "Time not set";
        let secondsUntilStart: number | null = null;
        let status: "upcoming" | "live" | "ended" | "no_time" = "no_time";
        if (upcomingWebinar.webinarStatus === "completed") {
          status = "ended";
          if (startsAtIso) {
            at = new Date(startsAtIso).toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
          }
        } else if (upcomingWebinar.webinarStatus === "active") {
          status = "live";
          if (startsAtIso) {
            const startDate = new Date(startsAtIso);
            const startMs = startDate.getTime();
            at = startDate.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            secondsUntilStart = Math.max(0, Math.floor((startMs - now) / 1000));
          } else {
            at = lang === "ru" ? "Эфир идёт" : "Live now";
            secondsUntilStart = 0;
          }
        } else if (startsAtIso) {
          const startDate = new Date(startsAtIso);
          const startMs = startDate.getTime();
          const endMs = startMs + durationMinutes * 60 * 1000;
          at = startDate.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          secondsUntilStart = Math.max(0, Math.floor((startMs - now) / 1000));
          if (now < startMs) status = "upcoming";
          else if (now <= endMs) status = "live";
          else status = "ended";
        }
        // Prefer fresh data from webinar endpoint (has bilingual fields + live Kinescope poster)
        const title = webinarDetail
          ? (lang === "ru" ? webinarDetail.titleRu : webinarDetail.titleEn) || webinarDetail.title || upcomingWebinar.title
          : upcomingWebinar.title;
        const summary = webinarDetail
          ? (lang === "ru" ? webinarDetail.summaryRu : webinarDetail.summaryEn) || webinarDetail.summary || upcomingWebinar.summary || ""
          : upcomingWebinar.summary ?? "";
        const thumbnailUrl = webinarDetail?.thumbnailUrl || upcomingWebinar.thumbnailUrl || "";
        const webinarPageUrl = webinarCalendarPageUrl(upcomingWebinar);
        const calendarUrl = startsAtIso
          ? buildGoogleCalendarUrl({
              title: `Expovision: ${title}`,
              startsAtIso,
              durationMinutes,
              joinUrl: webinarPageUrl || webinarStudentOpenHref(upcomingWebinar, lang),
            })
          : null;
        const joinHref = webinarStudentOpenHref(upcomingWebinar, lang);
        return {
          id: upcomingWebinar.id,
          title,
          summary,
          at,
          speaker: "Expovision Mentor",
          joinUrl: upcomingWebinar.joinUrl,
          joinHref,
          calendarUrl: calendarUrl ?? null,
          isUnlocked: upcomingWebinar.unlocked,
          secondsUntilStart,
          startsAtIso,
          durationMinutes,
          thumbnailUrl,
          kinescopeVideoId: upcomingWebinar.kinescopeVideoId ?? null,
          kinescopeEmbedUrl: webinarDetail?.kinescopeEmbedUrl ?? null,
          status,
        };
      })()
    : null;

  let webinarSpotlight: WebinarSpotlight | null = null;
  if (dashboard.platformOpen && dashboard.reportCompleted) {
    const items = dashboard.weekOneWebinars.filter((w) => w.unlocked);
    const withPo = items.filter((w) => w.programOrder != null);
    const minPo = withPo.length ? Math.min(...withPo.map((w) => w.programOrder!)) : null;
    const pool = minPo != null ? items.filter((w) => w.programOrder === minPo) : items.slice(0, 1);
    const w =
      pool.find((x) => x.webinarStatus === "active")
      ?? pool.find((x) => x.webinarStatus !== "completed")
      ?? pool[0];
    if (w && w.webinarStatus !== "completed") {
      const nowSpot = Date.now();
      if (w.webinarStatus === "active") {
        const startsAtIso = w.startsAtIso ?? new Date(nowSpot).toISOString();
        const startMs = new Date(startsAtIso).getTime();
        const calJoin = webinarCalendarPageUrl(w) || webinarStudentOpenHref(w, lang);
        const calendarUrl = buildGoogleCalendarUrl({
          title: `Expovision: ${w.title}`,
          startsAtIso,
          durationMinutes: w.durationMinutes ?? 90,
          joinUrl: calJoin,
        });
        webinarSpotlight = {
          id: w.id,
          title: w.title,
          summary: w.summary ?? "",
          joinUrl: webinarStudentOpenHref(w, lang),
          startsAtIso,
          durationMinutes: w.durationMinutes ?? 90,
          secondsUntilStart: Math.floor((startMs - nowSpot) / 1000),
          isLive: true,
          isFirstInProgram: w.programOrder === 1 && minPo === 1,
          calendarUrl,
        };
      } else if (w.startsAtIso) {
        const start = new Date(w.startsAtIso).getTime();
        const durMs = (w.durationMinutes ?? 90) * 60 * 1000;
        const end = start + durMs;
        if (nowSpot <= end) {
          const secondsUntilStart = Math.floor((start - nowSpot) / 1000);
          const calJoin = webinarCalendarPageUrl(w) || webinarStudentOpenHref(w, lang);
          const calendarUrl = buildGoogleCalendarUrl({
            title: `Expovision: ${w.title}`,
            startsAtIso: w.startsAtIso,
            durationMinutes: w.durationMinutes ?? 90,
            joinUrl: calJoin,
          });
          webinarSpotlight = {
            id: w.id,
            title: w.title,
            summary: w.summary ?? "",
            joinUrl: webinarStudentOpenHref(w, lang),
            startsAtIso: w.startsAtIso,
            durationMinutes: w.durationMinutes ?? 90,
            secondsUntilStart,
            isLive: nowSpot >= start && nowSpot <= end,
            isFirstInProgram: w.programOrder === 1 && minPo === 1,
            calendarUrl,
          };
        }
      }
    }
  }

  const announcements = dashboard.intensiveEnded
    ? [
        lang === "ru" ? "Интенсив завершён — все дни программы открыты" : "Intensive ended — all programme days are open",
        lang === "ru" ? "Курсы в библиотеке доступны без ограничений" : "Library courses stay available",
        lang === "ru" ? "Сертификат и итоги — в разделе «Финал»" : "Certificate and wrap-up — open Final",
      ]
    : [
        lang === "ru" ? `Открыт доступ к дню ${dashboard.currentDay}` : `Day ${dashboard.currentDay} is now unlocked`,
        lang === "ru" ? "Добавлены новые подсказки по домашке" : "New homework hints were added",
        lang === "ru" ? "Обновлен блок финального проекта" : "Final project block updated",
      ];

  const lessonsCompletedDisplay =
    dashboard.intensiveEnded && lessonsTotal > 0 ? lessonsTotal : lessonsCompleted;

  return {
    currentDay: dashboard.currentDay,
    stageLabel: resolveStageLabel(dashboard, lang),
    dayLabel: lang === "ru" ? `День ${dashboard.currentDay} из 14` : `Day ${dashboard.currentDay} of 14`,
    progressPercent: dashboard.progressPercent,
    trueProgressPercent,
    lessonsCompleted: lessonsCompletedDisplay,
    lessonsTotal,
    missedDays,
    isReturnAfterPause,
    homeworkCompleted,
    homeworkApproved,
    homeworkMissed,
    nextStepLabel,
    nextStepHref,
    intensiveEndsIn: dashboard.intensiveEnded
      ? (lang === "ru" ? "Завершён" : "Ended")
      : formatCountdown(dashboard.secondsToEnd, lang),
    showPreStartGate,
    showReportGate,
    intensiveEnded: dashboard.intensiveEnded ?? false,
    preStartMessage: lang === "ru" ? "Интенсив еще не стартовал. Доступен только стартовый отчет." : "Intensive has not started yet. Only initial report is available.",
    reportGateMessage: lang === "ru" ? "Для доступа к урокам заверши стартовый отчет." : "Finish initial report to unlock lessons.",
    secondsToStart: dashboard.secondsToStart,
    intensiveStartAtIso: dashboard.intensiveStartAtIso,
    reportCompleted: dashboard.reportCompleted,
    splitAvailable: dashboard.splitAvailable,
    trackSelected: dashboard.trackSelected,
    roadmap,
    homeworkItems,
    needsAttention,
    todayPlan,
    achievements,
    stats: {
      learningHours: Math.floor((actionStats.minutesSpent || 0) / 60),
      learningMinutes: actionStats.minutesSpent || 0,
      actionCount: actionStats.actionCount || 0,
      modulesUnlocked: Math.min(2, dashboard.currentDay <= 7 ? 1 : 2),
      modulesTotal: 2,
      gradeAverage: Number(Math.max(0, Math.min(100, dashboard.masteryAvgScore || 0)).toFixed(1)),
      aiToolsMastered: Math.min(9, Math.max(1, Math.floor(lessonsCompletedDisplay / 2))),
      certificatePoints: lessonsCompletedDisplay * 10 + homeworkCompleted * 20,
    },
    nextEvent,
    webinarSpotlight,
    announcements,
    motivationText: dashboard.intensiveEnded
      ? (lang === "ru"
          ? "Интенсив завершён: все дни и библиотека открыты. Заверши хвосты и оформи сертификат в разделе «Финал»."
          : "Intensive is over: all programme days and the library stay open. Wrap up loose ends and get your certificate under Final.")
      : (lang === "ru" ? "Продолжай учиться каждый день, чтобы ускорить финальный результат." : "Keep daily momentum to accelerate your final result."),
    finalGoalText: dashboard.intensiveEnded
      ? (lang === "ru"
          ? "Итог: закрепить навыки и оформить сертификат при выполнении условий."
          : "Wrap-up: consolidate skills and claim your certificate when requirements are met.")
      : (lang === "ru" ? "Финальная цель: применить AI в реальных задачах." : "Final goal: apply AI in real tasks."),
    recommendedTools: [],
    assistantStarters: [],
    nextBestAction: dashboard.intensiveEnded
      ? (lang === "ru"
          ? "Досмотри оставшиеся уроки и зайди в «Финал» за сертификатом при выполнении условий."
          : "Finish any remaining lessons, then open Final for your certificate when you meet the requirements.")
      : dashboard.nextBestAction,
    insightsSource: "fallback",
  };
}
