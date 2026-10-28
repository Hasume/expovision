"use client";

import { useEffect, useState } from "react";
import { askDashboardAssistant } from "@/features/api";
import { Badge, Button, ButtonLink, Card, InlineAlert, Input } from "@/shared/ui/components";
import type { DashboardViewModel } from "@/features/dashboard/view-model";

function formatTimer(totalSeconds: number, lang: "ru" | "en"): string {
  if (totalSeconds <= 0) return lang === "ru" ? "Сейчас!" : "Now!";
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d > 0) return lang === "ru" ? `${d}д ${h}ч ${m}м` : `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function useCountdown(secondsUntilStart: number | null): number | null {
  const [remaining, setRemaining] = useState(secondsUntilStart);
  useEffect(() => {
    setRemaining(secondsUntilStart);
    if (secondsUntilStart === null || secondsUntilStart <= 0) return;
    const interval = setInterval(() => {
      setRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsUntilStart]);
  return remaining;
}

function dayStateLabel(state: "completed" | "unlocked" | "locked", lang: "ru" | "en"): string {
  if (state === "completed") return lang === "ru" ? "Пройден" : "Completed";
  if (state === "unlocked") return lang === "ru" ? "Доступен" : "Open";
  return lang === "ru" ? "Закрыт" : "Locked";
}

export function StudentStatusHero({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  return (
    <Card>
      <div className="row between">
        <div>
          <h3 className="text-h3">{lang === "ru" ? "Статус ученика" : "Student status"}</h3>
          <p className="muted text-body-sm">{vm.stageLabel}</p>
        </div>
        <ButtonLink href={vm.nextStepHref} tone="primary">{vm.nextStepLabel}</ButtonLink>
      </div>
      <div className="kpi-grid section-top-sm">
        <article className="kpi"><p className="kpi-label">{lang === "ru" ? "ДЕНЬ" : "DAY"}</p><p className="kpi-value">{vm.dayLabel}</p></article>
        <article className="kpi"><p className="kpi-label">{lang === "ru" ? "ПРОГРЕСС" : "PROGRESS"}</p><p className="kpi-value">{vm.progressPercent}%</p></article>
        <article className="kpi"><p className="kpi-label">{lang === "ru" ? "УРОКИ" : "LESSONS"}</p><p className="kpi-value">{vm.lessonsCompleted}/{vm.lessonsTotal}</p></article>
        <article className="kpi"><p className="kpi-label">{lang === "ru" ? "ДОМАШКИ" : "HOMEWORK"}</p><p className="kpi-value">{vm.homeworkCompleted}</p></article>
      </div>
    </Card>
  );
}

export function TodayFocusSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  if (!vm.todayPlan) return null;
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Фокус дня" : "Today focus"}</h3>
      <ul className="compact-list section-top-sm">
        <li>{lang === "ru" ? "Урок" : "Lesson"}: {vm.todayPlan.lessonTitle}</li>
        <li>{lang === "ru" ? "Домашка" : "Homework"}: {vm.todayPlan.homeworkStatus}</li>
        <li>{lang === "ru" ? "Ближайший эфир" : "Nearest live"}: {vm.todayPlan.webinarTitle ?? (lang === "ru" ? "пока нет" : "none yet")}</li>
        <li>{lang === "ru" ? "Дедлайн" : "Deadline"}: {vm.todayPlan.deadlineLabel}</li>
      </ul>
      <p className="muted text-body-sm section-top-sm">{vm.todayPlan.recommendedAction}</p>
    </Card>
  );
}

export function RoadmapSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Программа интенсива" : "Intensive roadmap"}</h3>
      <div className="stack stack-tight section-top-sm">
        {vm.roadmap.map((day) => (
          <div key={day.dayNumber} className="row between">
            <div>
              <p className="entity-title">{`${lang === "ru" ? "День" : "Day"} ${day.dayNumber} — ${day.title}`}</p>
              <p className="muted text-caption">{day.lessonsCompleted}/{day.lessonsTotal} {lang === "ru" ? "уроков" : "lessons"}</p>
            </div>
            <Badge tone={day.state === "completed" ? "success" : day.state === "unlocked" ? "primary" : "neutral"}>
              {dayStateLabel(day.state, lang)}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ResultsAchievementsSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Результаты и достижения" : "Results and achievements"}</h3>
      <div className="kpi-grid section-top-sm">
        <article className="kpi"><p className="kpi-label">{lang === "ru" ? "ЧАСЫ" : "HOURS"}</p><p className="kpi-value">{vm.stats.learningHours}</p></article>
        <article className="kpi"><p className="kpi-label">{lang === "ru" ? "AI ИНСТРУМЕНТЫ" : "AI TOOLS"}</p><p className="kpi-value">{vm.stats.aiToolsMastered}</p></article>
        <article className="kpi"><p className="kpi-label">{lang === "ru" ? "POINTS" : "POINTS"}</p><p className="kpi-value">{vm.stats.certificatePoints}</p></article>
      </div>
      <div className="row section-top-sm">
        {vm.achievements.map((item) => <Badge key={item} tone="success">{item}</Badge>)}
      </div>
    </Card>
  );
}

export function EventSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  const countdown = useCountdown(vm.nextEvent?.secondsUntilStart ?? null);
  const isLive = countdown !== null && countdown <= 0;

  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Ближайшее событие" : "Nearest event"}</h3>
      {vm.nextEvent ? (
        <>
          <p className="entity-title section-top-sm">{vm.nextEvent.title}</p>
          <p className="muted text-caption">{vm.nextEvent.at} · {vm.nextEvent.speaker}</p>
          {countdown !== null && countdown > 0 ? (
            <div className="section-top-sm">
              <Badge tone="warning">{`${lang === "ru" ? "До начала" : "Starts in"}: ${formatTimer(countdown, lang)}`}</Badge>
            </div>
          ) : null}
          {isLive ? (
            <div className="section-top-sm">
              <Badge tone="success">{lang === "ru" ? "Идёт прямо сейчас!" : "Live now!"}</Badge>
            </div>
          ) : null}
          <div className="row section-top-sm">
            <ButtonLink href={vm.nextEvent.joinHref} tone={vm.nextEvent.isUnlocked ? "primary" : "ghost"}>
              {isLive
                ? (lang === "ru" ? "Подключиться (LIVE)" : "Join (LIVE)")
                : vm.nextEvent.isUnlocked
                  ? (lang === "ru" ? "Подключиться" : "Join")
                  : (lang === "ru" ? "Скоро" : "Soon")}
            </ButtonLink>
            {vm.nextEvent.calendarUrl ? (
              <a
                href={vm.nextEvent.calendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="link-button secondary"
              >
                {lang === "ru" ? "Добавить в Google Calendar" : "Add to Google Calendar"}
              </a>
            ) : null}
          </div>
        </>
      ) : (
        <div className="section-top-sm">
          <p className="muted text-body-sm">
            {lang === "ru"
              ? "Вебинары пока не назначены администратором. Следите за обновлениями."
              : "No webinars scheduled by admin yet. Stay tuned for updates."}
          </p>
        </div>
      )}
    </Card>
  );
}

export function AnnouncementsSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Новости академии" : "Announcements"}</h3>
      <ul className="compact-list section-top-sm">
        {vm.announcements.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </Card>
  );
}

export function AIAssistantSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onAsk = async (): Promise<void> => {
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await askDashboardAssistant(question);
      setAnswer(result.answer);
      setActions(result.nextActions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "AI assistant Expovision" : "AI assistant Expovision"}</h3>
      <p className="muted text-body-sm section-top-sm">{lang === "ru" ? "Встроенный помощник по урокам, домашкам и проекту." : "Built-in helper for lessons, homework, and project."}</p>
      <div className="row section-top-sm">
        {(vm.assistantStarters.length ? vm.assistantStarters : [
          lang === "ru" ? "Что делать сегодня?" : "What should I do today?",
          lang === "ru" ? "Объясни урок проще" : "Explain lesson simply",
        ]).slice(0, 2).map((starter) => (
          <Button key={starter} tone="ghost" onClick={() => setQuestion(starter)}>{starter}</Button>
        ))}
      </div>
      <div className="row section-top-sm">
        <Input value={question} onChange={setQuestion} placeholder={lang === "ru" ? "Задай вопрос ассистенту" : "Ask assistant"} />
        <Button onClick={() => void onAsk()} disabled={loading || !question.trim()}>{loading ? "..." : (lang === "ru" ? "Спросить" : "Ask")}</Button>
      </div>
      {answer ? <p className="text-body section-top-sm">{answer}</p> : null}
      {actions.length ? (
        <ul className="compact-list section-top-sm">
          {actions.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
    </Card>
  );
}

export function HomeworkSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  const qs = `?lang=${lang}`;
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Текущая домашка" : "Current homework"}</h3>
      <p className="muted text-body-sm section-top-sm">
        {lang === "ru"
          ? `Выполнено: ${vm.homeworkCompleted}, пропущено: ${vm.homeworkMissed}.`
          : `Completed: ${vm.homeworkCompleted}, missed: ${vm.homeworkMissed}.`}
      </p>
      <div className="section-top-sm">
        <ButtonLink href={`/homework/${vm.currentDay}${qs}`} tone="primary">{lang === "ru" ? "Открыть домашнее задание" : "Open homework"}</ButtonLink>
      </div>
    </Card>
  );
}

export function MaterialsSection({ lang }: { lang: "ru" | "en" }) {
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Мои материалы" : "My materials"}</h3>
      <ul className="compact-list section-top-sm">
        <li>{lang === "ru" ? "Сохраненные уроки" : "Saved lessons"}</li>
        <li>{lang === "ru" ? "Чек-листы и PDF" : "Checklists and PDF"}</li>
        <li>{lang === "ru" ? "Шаблоны промптов" : "Prompt templates"}</li>
        <li>{lang === "ru" ? "Записи эфиров" : "Live recordings"}</li>
      </ul>
    </Card>
  );
}

export function CommunitySection({ lang }: { lang: "ru" | "en" }) {
  const qs = `?lang=${lang}`;
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Комьюнити" : "Community"}</h3>
      <p className="muted text-body-sm section-top-sm">
        {lang === "ru"
          ? "Общайся с однокурсниками, отмечай успехи друг друга, задавай вопросы."
          : "Chat with classmates, celebrate each other, ask questions."}
      </p>
      <div className="section-top-sm">
        <ButtonLink href={`/chat${qs}`} tone="primary">
          {lang === "ru" ? "Открыть чат потока" : "Open cohort chat"}
        </ButtonLink>
      </div>
    </Card>
  );
}

export function MotivationSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Мотивация" : "Motivation"}</h3>
      <p className="muted text-body-sm section-top-sm">{vm.motivationText}</p>
    </Card>
  );
}

export function FinalGoalSection({ vm, lang }: { vm: DashboardViewModel; lang: "ru" | "en" }) {
  return (
    <Card>
      <h3 className="text-h3">{lang === "ru" ? "Финальная цель" : "Final goal"}</h3>
      <p className="muted text-body-sm section-top-sm">{vm.finalGoalText}</p>
      <ul className="compact-list section-top-sm">
        <li>{lang === "ru" ? "Освоить AI-инструменты" : "Master AI tools"}</li>
        <li>{lang === "ru" ? "Собрать рабочий AI-workflow" : "Build practical AI workflow"}</li>
        <li>{lang === "ru" ? "Сделать мини-проект" : "Ship mini-project"}</li>
        <li>{lang === "ru" ? "Получить сертификат" : "Get certification"}</li>
      </ul>
    </Card>
  );
}
