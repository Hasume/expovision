"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  completeLesson,
  getDashboard,
  getLesson,
  getHomeworkDraft,
  getHomeworkTemplate,
  myHomeworkSubmissions,
  saveHomeworkDraft,
  submitHomeworkWithEvidence,
  getHomeworkAiCoach,
} from "@/features/api";
import { KINESCOPE_EMBED_ALLOW } from "@/features/kinescope-constants";
import { AppShell, Badge, Button, ButtonLink, Card, CheckIcon, InlineAlert, Textarea } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

/* ── helpers ─────────────────────────────── */

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|m3u8)(\?.*)?$/i.test(url);
}

function isImageMaterial(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/** Links from Artifact.resourceUrl: external URL or path served by API (e.g. /uploads/...) */
function normalizeArtifactUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "#";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("mailto:")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${API_BASE}${trimmed}`;
  return trimmed.startsWith("www.") ? `https://${trimmed}` : `https://${trimmed}`;
}

function normalizeMaterialUrl(rawUrl: string, lessonId: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "#";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("mailto:")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("www.")) return `https://${trimmed}`;
  const materialPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const legacyMatch = materialPath.match(/^\/materials\/lessons\/([a-z0-9-]+)\.html$/i);
  if (legacyMatch) {
    const slug = (legacyMatch[1] ?? "").toLowerCase();
    if (!slug) return `/materials/lessons/${lessonId}.html`;
    const dayTrack = slug.match(/^lesson-(\d+)-(a|b|c)$/);
    if (dayTrack) return `/materials/lessons/lesson-${dayTrack[1]}-${dayTrack[2]}.html`;
    const split = slug.match(/^lesson-(\d+)-(a|b|c)-(core|mandatory|optional|extra)$/);
    if (split) {
      const track = split[2] as string;
      const suffix = split[3] === "optional" || split[3] === "extra" ? "o" : "m";
      return `/materials/lessons/d${split[1]}-${track}-${suffix}.html`;
    }
    const coreOptional = slug.match(/^lesson-(\d+)-(core|mandatory|optional|extra)$/);
    if (coreOptional) {
      const suffix = coreOptional[2] === "optional" || coreOptional[2] === "extra" ? "o" : "m";
      return `/materials/lessons/d${coreOptional[1]}-${suffix}.html`;
    }
    return `/materials/lessons/${lessonId}.html`;
  }
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("materials/")) return `/${trimmed}`;
  return `/${trimmed}`;
}

const LESSON_VIEWS_LS = "expovision_lesson_views_v1";

function readLessonViewMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LESSON_VIEWS_LS) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Client-side: page was opened (distinct from server "completed"). */
function touchLessonViewed(lessonId: string): void {
  const m = readLessonViewMap();
  if (m[lessonId]) return;
  m[lessonId] = new Date().toISOString();
  window.localStorage.setItem(LESSON_VIEWS_LS, JSON.stringify(m));
}

/* ── speech hook ─────────────────────────── */

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionInstance) | null;
}

function useSpeechToText(lang: "ru" | "en", onTranscript: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const ref = useRef<SpeechRecognitionInstance | null>(null);
  const supported = typeof window !== "undefined" && getSpeechCtor() !== null;

  const toggle = useCallback(() => {
    if (listening) { ref.current?.stop(); return; }
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang === "ru" ? "ru-RU" : "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    ref.current = rec;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r?.isFinal) text += r[0]?.transcript ?? "";
      }
      if (text.trim()) onTranscript(text.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  }, [listening, lang, onTranscript]);

  useEffect(() => () => { ref.current?.abort(); }, []);
  return { listening, toggle, supported };
}

function NotesChevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function LessonHomeworkAccordion({
  lang,
  open,
  onToggle,
  children,
}: {
  lang: "ru" | "en";
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = "lesson-homework-panel";
  const title = lang === "ru" ? "Домашнее задание" : "Homework";
  const hint =
    lang === "ru"
      ? "Разверни, когда будешь готов выполнить задание: формулировка, поля ответа и отправка."
      : "Expand when you are ready to work: instructions, answer fields, and submit.";
  const expandLabel = lang === "ru" ? "Развернуть задание" : "Expand homework";
  const collapseLabel = lang === "ru" ? "Свернуть задание" : "Collapse homework";

  return (
    <div className={`lesson-notes-accordion lesson-homework-accordion${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="lesson-notes-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${title}. ${open ? collapseLabel : expandLabel}`}
        onClick={onToggle}
      >
        <div className="lesson-notes-trigger-row">
          <div className="lesson-notes-icon-wrap" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-4" />
              <path d="M9 7V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3" />
              <path d="M9 15h6" />
              <path d="M12 12v6" />
            </svg>
          </div>
          <div className="lesson-notes-trigger-text">
            <p className="lesson-notes-title">{title}</p>
            <p className="lesson-notes-hint">{hint}</p>
          </div>
          <NotesChevron className="lesson-notes-chevron" />
        </div>
      </button>
      <div id={panelId} className="lesson-notes-expandable" aria-hidden={!open} inert={!open ? true : undefined}>
        <div className="lesson-notes-expandable-inner">
          <div className="lesson-notes-body lesson-homework-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

function LessonNotesAccordion({
  markdown,
  lang,
  open,
  onToggle,
}: {
  markdown: string;
  lang: "ru" | "en";
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = "lesson-notes-panel";
  const title = lang === "ru" ? "Конспект урока" : "Lesson notes";
  const hint =
    lang === "ru"
      ? "Кратко по теме — открой, когда удобно: после видео или для повторения."
      : "A concise outline — open when it suits you: after the video or for review.";
  const expandLabel = lang === "ru" ? "Развернуть конспект" : "Expand notes";
  const collapseLabel = lang === "ru" ? "Свернуть конспект" : "Collapse notes";

  return (
    <div className={`lesson-notes-accordion${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="lesson-notes-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${title}. ${open ? collapseLabel : expandLabel}`}
        onClick={onToggle}
      >
        <div className="lesson-notes-trigger-row">
          <div className="lesson-notes-icon-wrap" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <line x1="8" y1="7" x2="16" y2="7" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </div>
          <div className="lesson-notes-trigger-text">
            <p className="lesson-notes-title">{title}</p>
            <p className="lesson-notes-hint">{hint}</p>
          </div>
          <NotesChevron className="lesson-notes-chevron" />
        </div>
      </button>
      <div id={panelId} className="lesson-notes-expandable" aria-hidden={!open} inert={!open ? true : undefined}>
        <div className="lesson-notes-expandable-inner">
          <div className="lesson-notes-body">
            <div className="prose">
              <ReactMarkdown>{markdown}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MicButton({ listening, onClick, supported }: { listening: boolean; onClick: () => void; supported: boolean }) {
  if (!supported) return null;
  return (
    <button type="button" className={`mic-btn ${listening ? "active" : ""}`} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}

/* ── Assignment section ───────────────────── */

function AssignmentSection({ day, lang, embedded }: { day: number; lang: "ru" | "en"; embedded?: boolean }) {
  const [answer, setAnswer] = useState("");
  const [reflection, setReflection] = useState("");
  const [aiDisclosure, setAiDisclosure] = useState("");
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof getHomeworkTemplate>> | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "no_assignment" | "loaded" | "error">("loading");
  const [submitStatus, setSubmitStatus] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState("");
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof getHomeworkAiCoach>> | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const isErrorStatus = /fail|error|ошиб|не удалось|invalid|denied|forbidden|unauthorized/i.test(submitStatus);

  useEffect(() => {
    setDraftLoaded(false);
    setLoadState("loading");
    void (async () => {
      try {
        const [tpl, mine, draft] = await Promise.all([
          getHomeworkTemplate(day),
          myHomeworkSubmissions(),
          getHomeworkDraft(day),
        ]);
        if (!tpl) {
          setLoadState("no_assignment");
          return;
        }
        setTemplate(tpl);
        const found = mine.find((i) => i.dayNumber === day);
        setCurrentStatus(found?.status ?? null);
        if (draft.exists) {
          setAnswer(draft.answerText ?? "");
          setReflection(draft.reflectionText ?? "");
          setAiDisclosure(draft.aiUsageDisclosure ?? "");
          setCoach(draft.coach ?? null);
          setDraftSavedAt(draft.updatedAt ?? null);
        }
        setDraftLoaded(true);
        setLoadState("loaded");
      } catch {
        // 404 = no homework template for this day — not an error
        setLoadState("no_assignment");
        setDraftLoaded(true);
      }
    })();
  }, [day]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      setDraftState("saving");
      void saveHomeworkDraft({ dayNumber: day, answerText: answer, reflectionText: reflection, aiUsageDisclosure: aiDisclosure, coach, evidence: null })
        .then((r) => { setDraftState("saved"); setDraftSavedAt(r.updatedAt); })
        .catch(() => setDraftState("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [day, answer, reflection, aiDisclosure, coach, draftLoaded]);

  const onSubmit = async (): Promise<void> => {
    try {
      const r = await submitHomeworkWithEvidence({ dayNumber: day, answerText: answer, reflectionText: reflection, aiUsageDisclosure: aiDisclosure });
      setCurrentStatus(r.status);
      setSubmitStatus(r.status === "overdue"
        ? (lang === "ru" ? "Отправлено после дедлайна" : "Submitted past deadline")
        : (lang === "ru" ? "Отправлено! Ожидает проверки." : "Submitted! Awaiting review."));
    } catch (e) { setSubmitStatus(e instanceof Error ? e.message : "Failed"); }
  };

  const onCoach = async (): Promise<void> => {
    setCoachLoading(true);
    setCoachError("");
    try {
      const result = await getHomeworkAiCoach(day, answer);
      setCoach(result);
      await saveHomeworkDraft({ dayNumber: day, answerText: answer, reflectionText: reflection, aiUsageDisclosure: aiDisclosure, coach: result, evidence: null });
      setDraftState("saved");
    } catch (e) { setCoachError(e instanceof Error ? e.message : "Failed"); }
    finally { setCoachLoading(false); }
  };

  const answerMic = useSpeechToText(lang, useCallback((t: string) => setAnswer((p) => p ? `${p} ${t}` : t), []));
  const reflectionMic = useSpeechToText(lang, useCallback((t: string) => setReflection((p) => p ? `${p} ${t}` : t), []));

  const statusTone = currentStatus === "approved" ? "success" : currentStatus === "pending_review" ? "warning" : currentStatus === "rejected" || currentStatus === "overdue" ? "danger" : "neutral";
  const statusLabel = currentStatus === "approved" ? (lang === "ru" ? "Принято" : "Approved")
    : currentStatus === "pending_review" ? (lang === "ru" ? "На проверке" : "In review")
    : currentStatus === "rejected" ? (lang === "ru" ? "Нужно доработать" : "Needs revision")
    : currentStatus === "overdue" ? (lang === "ru" ? "Сдано с опозданием" : "Submitted late")
    : null;

  const wrapClass = embedded ? "day-assignment-embedded" : "day-assignment-card";

  if (loadState === "loading") {
    return (
      <div className={wrapClass}>
        {!embedded ? <p className="day-section-label">{lang === "ru" ? "ЗАДАНИЕ" : "ASSIGNMENT"}</p> : null}
        <div className="skeleton" style={{ height: 14, width: "60%", borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 12, width: "40%", borderRadius: 4, marginTop: 8 }} />
      </div>
    );
  }

  if (loadState === "no_assignment" || !template) {
    return (
      <div className={wrapClass} style={{ opacity: 0.65 }}>
        {!embedded ? <p className="day-section-label">{lang === "ru" ? "ЗАДАНИЕ" : "ASSIGNMENT"}</p> : null}
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          {lang === "ru"
            ? "Для этого дня задание не предусмотрено."
            : "No assignment for this day."}
        </p>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {(!embedded || statusLabel) ? (
        <div
          className={`row items-start${!embedded ? " between" : ""}`}
          style={embedded && statusLabel ? { justifyContent: "flex-end", width: "100%" } : undefined}
        >
          {!embedded ? <p className="day-section-label" style={{ margin: 0 }}>{lang === "ru" ? "ЗАДАНИЕ" : "ASSIGNMENT"}</p> : null}
          {statusLabel ? <Badge tone={statusTone}>{statusLabel}</Badge> : null}
        </div>
      ) : null}

      <div className="prose">
        <ReactMarkdown>{template.instructionMd}</ReactMarkdown>
      </div>

      {template.sampleMd ? (
        <div className="content-muted-panel">
          <div className="prose muted">
            <ReactMarkdown>{template.sampleMd}</ReactMarkdown>
          </div>
        </div>
      ) : null}

      {currentStatus === "approved" ? (
        <div className="assign-status approved">
          <CheckIcon />
          {lang === "ru" ? "Задание принято куратором" : "Assignment approved by curator"}
        </div>
      ) : (
        <div className="stack stack-tight">
          <div className="textarea-with-mic">
            <Textarea
              value={answer}
              onChange={setAnswer}
              rows={7}
              placeholder={lang === "ru" ? "Напишите ответ..." : "Write your answer..."}
            />
            <MicButton listening={answerMic.listening} onClick={answerMic.toggle} supported={answerMic.supported} />
          </div>
          <div className="textarea-with-mic">
            <Textarea
              value={reflection}
              onChange={setReflection}
              rows={3}
              placeholder={lang === "ru" ? "Reflection: как вы пришли к решению?" : "Reflection: how did you arrive at your solution?"}
            />
            <MicButton listening={reflectionMic.listening} onClick={reflectionMic.toggle} supported={reflectionMic.supported} />
          </div>
          <Textarea
            value={aiDisclosure}
            onChange={setAiDisclosure}
            rows={2}
            placeholder={lang === "ru" ? "AI disclosure: какие инструменты использовали?" : "AI disclosure: which tools did you use?"}
          />

          {draftLoaded ? (
            <p className="text-caption text-muted">
              {draftState === "saving" ? (lang === "ru" ? "Сохраняем черновик..." : "Saving draft...")
                : draftState === "saved" ? (lang === "ru" ? `Черновик сохранён${draftSavedAt ? ` · ${new Date(draftSavedAt).toLocaleTimeString()}` : ""}` : `Draft saved${draftSavedAt ? ` · ${new Date(draftSavedAt).toLocaleTimeString()}` : ""}`)
                : draftState === "error" ? (lang === "ru" ? "Ошибка сохранения черновика" : "Draft save failed")
                : ""}
            </p>
          ) : null}

          <div className="section-actions">
            <Button onClick={() => void onSubmit()} disabled={!answer.trim()}>
              {lang === "ru" ? "Отправить задание" : "Submit assignment"}
            </Button>
            <Button onClick={() => void onCoach()} disabled={!answer.trim() || coachLoading} tone="secondary">
              {coachLoading ? "..." : (lang === "ru" ? "AI-фидбек" : "AI feedback")}
            </Button>
          </div>
        </div>
      )}

      {coach ? (
        <div className="card soft" style={{ marginTop: 0 }}>
          <p className="section-title">{lang === "ru" ? "AI-коуч" : "AI coach"}</p>
          <p className="text-caption"><strong>{lang === "ru" ? "Оценка:" : "Score:"}</strong> {coach.score}/100</p>
          <div className="prose muted"><ReactMarkdown>{coach.summary}</ReactMarkdown></div>
          {coach.nextSteps?.length ? (
            <ul className="compact-list">
              {coach.nextSteps.map((s) => <li key={s}>{s}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      {coachError ? <InlineAlert tone="error">{coachError}</InlineAlert> : null}
      {submitStatus ? <InlineAlert tone={isErrorStatus ? "error" : "success"}>{submitStatus}</InlineAlert> : null}
    </div>
  );
}

/* ── Main component ───────────────────────── */

export function LessonPageClient({ lessonId }: { lessonId: string }) {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;
  const [initialLoading, setInitialLoading] = useState(true);
  const [lesson, setLesson] = useState<Awaited<ReturnType<typeof getLesson>> | null>(null);
  const [completeStatus, setCompleteStatus] = useState<"idle" | "loading" | "done">("idle");
  const [completeError, setCompleteError] = useState("");
  const [dayLocked, setDayLocked] = useState(false);
  const [, setViewGen] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [homeworkOpen, setHomeworkOpen] = useState(false);

  const reloadLesson = useCallback(async () => {
    const fresh = await getLesson(lessonId);
    setLesson(fresh);
    if (fresh.lessonCompleted) setCompleteStatus("done");
    return fresh;
  }, [lessonId]);

  useEffect(() => {
    void (async () => {
      try {
        const [lessonData, dashboard] = await Promise.all([
          getLesson(lessonId),
          getDashboard().catch(() => null),
        ]);
        setLesson(lessonData);
        if (lessonData.lessonCompleted) setCompleteStatus("done");
        touchLessonViewed(lessonId);
        setViewGen((g) => g + 1);
        // Front-end lock: future day vs current schedule (after intensive ends, all days are open)
        if (
          dashboard &&
          !dashboard.intensiveEnded &&
          lessonData.dayNumber &&
          lessonData.dayNumber > dashboard.currentDay
        ) {
          setDayLocked(true);
        }
      } catch (e) {
        setCompleteError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [lessonId]);

  const onComplete = async (): Promise<void> => {
    setCompleteStatus("loading");
    try {
      await completeLesson(lessonId);
      await reloadLesson();
      setCompleteStatus("done");
    } catch (e) {
      setCompleteError(e instanceof Error ? e.message : "Failed");
      setCompleteStatus("idle");
    }
  };

  const dayNumber = lesson?.dayNumber;
  /** When videoUrl is set, it is the main player; Kinescope embed is ignored (matches API). */
  const hasPrimaryVideoUrl = Boolean((lesson?.videoUrl ?? "").trim());
  const showKinescopeEmbed = Boolean(lesson?.kinescopeEmbedUrl) && !hasPrimaryVideoUrl;
  const backHref = dayNumber ? `/day/${dayNumber}${qs}` : `/library${qs}`;
  const prevHref = dayNumber && dayNumber > 1 ? `/day/${dayNumber - 1}${qs}` : undefined;
  const nextHref = dayNumber && dayNumber < 14 ? `/day/${dayNumber + 1}${qs}` : undefined;

  // Day locked state — shown as a blocking overlay above content
  if (dayLocked && lesson?.dayNumber) {
    return (
      <AppShell role="student" lang={lang} currentDay={lesson.dayNumber}>
        <div className="day-page">
          <div className="day-page-nav">
            <ButtonLink href={`/lessons${qs}&day=${lesson.dayNumber}`} tone="ghost" className="small">
              ← {lang === "ru" ? "Программа" : "Programme"}
            </ButtonLink>
          </div>
          <div style={{ maxWidth: 520, margin: "48px auto", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              {lang === "ru" ? `День ${lesson.dayNumber} ещё не открылся` : `Day ${lesson.dayNumber} isn't open yet`}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: 24 }}>
              {lang === "ru"
                ? "Этот день откроется по расписанию. Пока продолжи с текущего дня."
                : "This day opens on schedule. Keep going with your current day."}
            </p>
            <ButtonLink href={`/dashboard${qs}`}>
              {lang === "ru" ? "Вернуться на главную" : "Back to home"}
            </ButtonLink>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role="student" lang={lang} currentDay={dayNumber ?? 1}>
      <div className="day-page">

        {/* Navigation bar */}
        <div className="day-page-nav">
          <ButtonLink href={backHref} tone="ghost" className="small">
            ← {dayNumber ? (lang === "ru" ? "Программа" : "Programme") : (lang === "ru" ? "Курсы" : "Courses")}
          </ButtonLink>
          {dayNumber ? (
            <span className="day-page-nav-center">
              {lang === "ru" ? `День ${dayNumber} из 14` : `Day ${dayNumber} of 14`}
            </span>
          ) : null}
          <div className="row row-tight">
            {prevHref ? (
              <Link href={prevHref} className="link-button ghost small">←</Link>
            ) : <span />}
            {nextHref ? (
              <Link href={nextHref} className="link-button ghost small">→</Link>
            ) : null}
          </div>
        </div>

        {/* Header */}
        <div className="day-page-header">
          {dayNumber ? (
            <p className="day-page-day-label">
              {lang === "ru" ? `День ${dayNumber}` : `Day ${dayNumber}`}
              {lesson?.kind ? ` · ${lesson.kind === "mandatory" ? (lang === "ru" ? "обязательный" : "mandatory") : (lang === "ru" ? "дополнительный" : "optional")}` : ""}
              {lesson?.durationMinutes ? ` · ${lesson.durationMinutes} ${lang === "ru" ? "мин" : "min"}` : ""}
            </p>
          ) : null}
          <h1 className="day-page-title">
            {initialLoading ? (lang === "ru" ? "Загрузка..." : "Loading...") : (lesson?.title ?? (lang === "ru" ? "Урок" : "Lesson"))}
          </h1>
          {!dayNumber && lesson?.durationMinutes ? (
            <p className="day-page-day-label">
              {lesson.durationMinutes} {lang === "ru" ? "мин" : "min"}
            </p>
          ) : null}
        </div>

        {/* Material section */}
        <div>
          <p className="day-section-label">{lang === "ru" ? "МАТЕРИАЛ" : "MATERIAL"}</p>
          <div className="day-material-card">

            {/* Video */}
            <div className="day-material-video">
              <div className="media-frame" style={{ borderRadius: 0, border: "none" }}>
                {showKinescopeEmbed && lesson ? (
                  <div className="kinescope-player-wrap">
                    <iframe
                      src={lesson.kinescopeEmbedUrl!}
                      title={lesson.title}
                      className="frame-full"
                      allow={KINESCOPE_EMBED_ALLOW}
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ) : lesson?.videoUrl ? (
                  isDirectVideo(lesson.videoUrl) ? (
                    <video
                      src={lesson.videoUrl}
                      className="frame-full"
                      controls
                      controlsList="nodownload noplaybackrate"
                      disablePictureInPicture
                      playsInline
                    />
                  ) : (
                    <iframe
                      src={lesson.videoUrl}
                      title={lesson.title}
                      className="frame-full"
                      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  )
                ) : !initialLoading ? (
                  <div className="video-placeholder">
                    <span className="video-placeholder-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 6.8v10.4c0 .8.9 1.3 1.6.9l8.2-5.2a1.1 1.1 0 0 0 0-1.8L9.6 5.9c-.7-.4-1.6.1-1.6.9z" />
                      </svg>
                    </span>
                    <span className="muted">{lang === "ru" ? "Видео появится здесь" : "Video will appear here"}</span>
                  </div>
                ) : (
                  <div className="video-placeholder">
                    <div className="loading-spinner sm" />
                  </div>
                )}
              </div>
            </div>

            {/* Lesson notes, expanded on click */}
            <div className="day-material-text">
              {initialLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
                  <div className="loading-spinner sm" />
                </div>
              ) : (lesson?.content ?? "").trim() ? (
                <LessonNotesAccordion
                  markdown={lesson!.content}
                  lang={lang}
                  open={notesOpen}
                  onToggle={() => setNotesOpen((v) => !v)}
                />
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
                  {lang === "ru" ? "Конспект пока недоступен." : "Notes are not available yet."}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Reading materials — only shown when images exist in DB */}
        {!initialLoading && (lesson?.images?.length ?? 0) > 0 ? (
          <div>
            <p className="day-section-label">{lang === "ru" ? "МАТЕРИАЛЫ ДЛЯ ЧТЕНИЯ" : "READING MATERIALS"}</p>
            <div style={{ display: "grid", gap: 10 }}>
              {lesson!.images.map((mat) => {
                const url = normalizeMaterialUrl(mat.url, lessonId);
                const label = mat.caption ?? (lang === "ru" ? "Материал урока" : "Lesson material");
                return (
                  <div key={mat.url} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>{label}</span>
                      </div>
                      <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem", color: "var(--accent)", fontWeight: 500 }}>
                        {lang === "ru" ? "Открыть ↗" : "Open ↗"}
                      </a>
                    </div>
                    {isImageMaterial(mat.url) ? (
                      <img src={url} alt={label} className="lesson-reading-material-img" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Day artifacts (admin → day) */}
        {!initialLoading && (lesson?.artifacts?.length ?? 0) > 0 ? (
          <div>
            <p className="day-section-label">{lang === "ru" ? "АРТЕФАКТЫ ДНЯ" : "DAY ARTIFACTS"}</p>
            <p className="lesson-artifacts-read-important">
              {lang === "ru" ? (
                <>
                  <strong className="lesson-artifacts-read-emphasis">Обязательно прочитай</strong>
                  {" "}эти материалы перед заданием — в них ключевые тезисы и контекст дня.
                </>
              ) : (
                <>
                  <strong className="lesson-artifacts-read-emphasis">Important: read these</strong>
                  {" "}before the assignment — they contain key points and day context.
                </>
              )}
            </p>
            <div className="lesson-artifacts-grid">
              {lesson!.artifacts!.map((art, idx) => {
                const href = art.resourceUrl ? normalizeArtifactUrl(art.resourceUrl) : "";
                const label = art.title.trim() || (lang === "ru" ? "Артефакт" : "Artifact");
                return (
                  <div key={`${art.resourceUrl}-${idx}`} className="lesson-artifact-card">
                    <div className="lesson-artifact-card-row">
                      <div className="lesson-artifact-card-title-wrap">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                        <span className="lesson-artifact-card-title">{label}</span>
                      </div>
                      {href && href !== "#" ? (
                        <a href={href} target="_blank" rel="noreferrer" className="lesson-artifact-card-link">
                          {lang === "ru" ? "Читать ↗" : "Read ↗"}
                        </a>
                      ) : (
                        <span className="muted lesson-artifact-card-nolink">{lang === "ru" ? "Без ссылки" : "No link"}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Mark complete */}
        <div className="day-complete-btn-wrap">
          <Button
            onClick={() => void onComplete()}
            disabled={completeStatus === "loading" || completeStatus === "done"}
            tone="secondary"
          >
            {completeStatus === "done" ? (
              <span className="row row-tight"><CheckIcon /> {lang === "ru" ? "Материал пройден" : "Material complete"}</span>
            ) : completeStatus === "loading" ? "..." : (
              lang === "ru" ? "✓ Отметить как пройденный" : "✓ Mark as complete"
            )}
          </Button>
          {completeError ? <span className="text-danger" style={{ fontSize: "0.82rem", marginLeft: 10 }}>{completeError}</span> : null}
          {completeStatus === "done" ? (
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginLeft: 8 }}>
              {lang === "ru" ? "↓ Теперь выполни задание ниже" : "↓ Now complete the assignment below"}
            </span>
          ) : (
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: 8 }}>
              {lang === "ru"
                ? "«Просмотрен» — открывали страницу; «Пройден» — нажали кнопку выше."
                : "“Viewed” means you opened the lesson; “Done” means you marked it complete."}
            </span>
          )}
        </div>

        {/* Same day — other lessons */}
        {!initialLoading && dayNumber && (lesson?.dayLessons?.length ?? 0) > 0 ? (
          <div style={{ marginTop: 28 }}>
            <p className="day-section-label">
              {lang === "ru" ? "УРОКИ ЭТОГО ДНЯ" : "LESSONS THIS DAY"}
            </p>
            <p className="muted text-body-sm" style={{ margin: "0 0 12px" }}>
              {lang === "ru"
                ? "Пройдите доступные обязательные и дополнительные уроки, если ещё не отметили их пройденными."
                : "Complete any mandatory and optional lessons for this day you have not finished yet."}
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {lesson!.dayLessons!.map((row) => {
                const viewed = !!readLessonViewMap()[row.id];
                const isDone = row.completed;
                const isCurrent = row.isCurrent;
                let tone: "success" | "primary" | "neutral" | "warning" = "neutral";
                let label: string;
                if (row.locked) {
                  tone = "warning";
                  label = lang === "ru" ? "Скоро" : "Soon";
                } else if (isDone) {
                  tone = "success";
                  label = lang === "ru" ? "Пройден" : "Done";
                } else if (viewed || isCurrent) {
                  tone = "primary";
                  label = lang === "ru" ? "Просмотрен" : "Viewed";
                } else {
                  tone = "neutral";
                  label = lang === "ru" ? "Не начат" : "Not started";
                }
                const kindLabel =
                  row.kind === "mandatory"
                    ? (lang === "ru" ? "Обязательный" : "Mandatory")
                    : (lang === "ru" ? "Дополнительный" : "Optional");
                const rowInner = (
                  <div
                    className="course-lesson-row"
                    style={{
                      opacity: row.locked ? 0.55 : 1,
                      borderLeft: isCurrent ? "3px solid var(--accent)" : undefined,
                      paddingLeft: isCurrent ? 13 : 16,
                    }}
                  >
                    <div className="course-lesson-info" style={{ minWidth: 0 }}>
                      <p className="course-lesson-title">{row.title}</p>
                      <p className="course-lesson-type">
                        {kindLabel}
                        {isCurrent ? (lang === "ru" ? " · сейчас здесь" : " · you are here") : ""}
                      </p>
                    </div>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                );
                if (row.locked || isCurrent) {
                  return <div key={row.id}>{rowInner}</div>;
                }
                return (
                  <Link key={row.id} href={`/lesson/${row.id}${qs}`} style={{ textDecoration: "none", color: "inherit" }}>
                    {rowInner}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Assignment, same accordion as the notes */}
        {dayNumber ? (
          <LessonHomeworkAccordion lang={lang} open={homeworkOpen} onToggle={() => setHomeworkOpen((v) => !v)}>
            <AssignmentSection day={dayNumber} lang={lang} embedded />
          </LessonHomeworkAccordion>
        ) : null}

      </div>
    </AppShell>
  );
}
