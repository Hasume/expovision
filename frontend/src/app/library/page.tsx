"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Badge, Button, InlineAlert } from "@/shared/ui/components";
import { getLibraryLessons } from "@/features/api";
import { getLang } from "@/features/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function libraryCoverSrc(coverUrl: string): string {
  const u = coverUrl.trim();
  if (!u) return "";
  return u.startsWith("/") ? `${API_BASE}${u}` : u;
}

type LibraryResponse = Awaited<ReturnType<typeof getLibraryLessons>>;

function BookIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function CheckSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export default function LibraryPage() {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [error, setError] = useState("");
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void (async () => {
      try {
        const result = await getLibraryLessons();
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : (lang === "ru" ? "Не удалось загрузить каталог" : "Failed to load catalog"));
      }
    })();
  }, [lang]);

  const courses = data?.courses ?? [];

  const t = {
    pageTitle: lang === "ru" ? "Библиотека курсов" : "Course library",
    subtitle: lang === "ru"
      ? "Выбери курс и начни своё обучение. Все материалы подготовлены экспертами AI Academy. Библиотека полных курсов откроется после завершения интенсива. Сейчас доступен просмотр структуры и уроков."
      : "Choose a course and start learning. All materials are prepared by AI Academy experts. The full course library opens after the intensive. You can now browse the structure and lessons.",
    subtitleAfterIntensive: lang === "ru"
      ? "Интенсив завершён — материалы закреплены: проходи уроки в удобном темпе. Выбери курс в каталоге и продолжай обучение, всё остаётся с тобой."
      : "The intensive is over — your course materials are here to stay. Pick a course from the catalog and keep learning at your own pace.",
    preview: lang === "ru" ? "Предпросмотр" : "Preview",
    emptyTitle: lang === "ru" ? "Курсы ещё не добавлены" : "No courses yet",
    emptyDesc: lang === "ru" ? "Каталог курсов появится здесь после публикации." : "The course catalog will appear here once published.",
    lessons: lang === "ru" ? "уроков" : "lessons",
    lessonOne: lang === "ru" ? "урок" : "lesson",
    lessonFew: lang === "ru" ? "урока" : "lessons",
    done: lang === "ru" ? "пройдено" : "done",
    selectCourse: lang === "ru" ? "Выбрать" : "Select",
    expandCourse: lang === "ru" ? "Подробнее и уроки" : "Details and lessons",
    collapseCourse: lang === "ru" ? "Свернуть" : "Collapse",
    mandatory: lang === "ru" ? "Обязательный" : "Mandatory",
    optional: lang === "ru" ? "Дополнительный" : "Optional",
    doneBadge: lang === "ru" ? "Пройден" : "Done",
    openBadge: lang === "ru" ? "Открыт" : "Open",
    soonBadge: lang === "ru" ? "Скоро" : "Soon",
    chipOpen: lang === "ru" ? "Открыт" : "Open",
    chipDone: lang === "ru" ? "Завершён" : "Completed",
    fullAccess: lang === "ru" ? "Полный доступ" : "Full access",
    afterIntensive: lang === "ru" ? "После интенсива" : "After intensive",
    more: lang === "ru" ? "Показать полностью" : "Show full text",
    less: lang === "ru" ? "Свернуть" : "Collapse",
    intensiveDone: lang === "ru" ? "Интенсив завершён — полный доступ ко всем урокам." : "Intensive complete — full access to every lesson.",
  };

  const lessonWord = (n: number) => {
    if (lang !== "ru") return n === 1 ? t.lessonOne : t.lessons;
    if (n === 1) return t.lessonOne;
    if (n >= 2 && n <= 4) return t.lessonFew;
    return t.lessons;
  };

  const chipForCourse = (course: (typeof courses)[0]): { kind: "soon" | "open" | "done"; label: string } => {
    const totalCount = course.lessons.length;
    const completedCount = course.lessons.filter((l) => l.completed).length;
    const hasOpen = Boolean(data?.canAccess && course.lessons.some((l) => l.access === "open"));
    if (totalCount > 0 && completedCount === totalCount) return { kind: "done", label: t.chipDone };
    if (hasOpen) return { kind: "open", label: t.chipOpen };
    return { kind: "soon", label: t.soonBadge };
  };

  return (
    <AppShell role="student" lang={lang}>
      <div className="library-page">
        <div className="library-stack">
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

          {data?.intensiveEnded && data.canAccess ? (
            <InlineAlert tone="success">{t.intensiveDone}</InlineAlert>
          ) : null}

          <header className="library-intro-card">
            <h1 className="library-intro-title">{t.pageTitle}</h1>
            <p className="library-intro-sub">
              {data?.intensiveEnded ? t.subtitleAfterIntensive : t.subtitle}
            </p>
            {data && !data.canAccess && data.publicationMessage ? (
              <p className="library-intro-extra">
                <span className="library-intro-extra-label">{t.preview}</span>
                {data.publicationMessage}
              </p>
            ) : null}
          </header>

        {courses.length === 0 && !error ? (
          <div className="library-empty-card">
            <div className="empty-state">
              <div className="empty-state-icon"><BookIcon /></div>
              <p className="empty-state-title">{t.emptyTitle}</p>
              <p className="empty-state-desc">{t.emptyDesc}</p>
            </div>
          </div>
        ) : (
          <div className="library-course-list">
            {courses.map((course) => {
              const completedCount = course.lessons.filter((l) => l.completed).length;
              const totalCount = course.lessons.length;
              const desc = course.description?.trim() ?? "";
              const descLong = desc.length > 400;
              const showFull = expandedDesc[course.id];
              const isOpenCard = expandedCourse === course.id;
              const panelId = `course-panel-${course.id}`;
              const chip = chipForCourse(course);

              return (
                <article
                  key={course.id}
                  className={`library-course-article${isOpenCard ? " is-open" : ""}`}
                >
                  <div className="library-course-shell">
                  <div className="library-course-folio">
                    <div className="library-course-folio__main">
                      <div className="library-course-folio__top">
                        <div className="library-course-folio__lead">
                          <div className={`library-course-chip library-course-chip--${chip.kind}`}>
                            {chip.kind === "soon" ? <ClockIcon /> : null}
                            {chip.kind === "open" ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                              </svg>
                            ) : null}
                            {chip.kind === "done" ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            ) : null}
                            <span>{chip.label}</span>
                          </div>
                          <div className="library-course-folio__texts">
                            <h2 className="library-course-heading">{course.title}</h2>
                            {desc ? (
                              <div className="library-course-desc-wrap">
                                <p className={`library-course-body ${!showFull && descLong ? "is-clamped" : ""}`}>{desc}</p>
                                {descLong ? (
                                  <button
                                    type="button"
                                    className="library-course-desc-toggle"
                                    onClick={() => setExpandedDesc((prev) => ({ ...prev, [course.id]: !showFull }))}
                                  >
                                    {showFull ? t.less : t.more}
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {totalCount > 0 ? (
                          <p className="library-course-progress-line">
                            {totalCount} {lessonWord(totalCount)}
                            {completedCount > 0 ? ` · ${completedCount} ${t.done}` : ""}
                            {" · "}
                            {data?.canAccess ? t.fullAccess : t.afterIntensive}
                          </p>
                        ) : (
                          <p className="library-course-progress-line">
                            {lang === "ru" ? "Уроки появятся позже" : "Lessons coming soon"}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        className="library-course-cta"
                        tone="primary"
                        aria-expanded={isOpenCard}
                        aria-controls={panelId}
                        onClick={() => setExpandedCourse(isOpenCard ? null : course.id)}
                      >
                        {isOpenCard ? t.collapseCourse : t.selectCourse}
                      </Button>
                    </div>
                    <div className="library-course-folio__visual" aria-hidden>
                      {course.coverUrl ? (
                        <img src={libraryCoverSrc(course.coverUrl)} alt="" />
                      ) : (
                        <div className="library-course-folio__placeholder">
                          <BookIcon />
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    id={panelId}
                    className="library-course-lesson-panel"
                    aria-hidden={!isOpenCard}
                    inert={!isOpenCard ? true : undefined}
                  >
                    <div className="library-course-lesson-panel-inner">
                      {totalCount > 0 ? (
                        <div className="course-lesson-list library-course-inner-lessons">
                          {course.lessons.map((lesson, idx) => {
                            const isOpen = data?.canAccess && lesson.access === "open";
                            const isDone = lesson.completed;

                            const inner = (
                              <div
                                className="course-lesson-row"
                                style={!isOpen ? { pointerEvents: "none", opacity: 0.6 } : {}}
                              >
                                <div className={`course-lesson-num ${isDone ? "done" : ""}`}>
                                  {isDone ? <CheckSm /> : idx + 1}
                                </div>
                                <div className="course-lesson-info">
                                  <p className="course-lesson-title">{lesson.title}</p>
                                  <p className="course-lesson-type">
                                    {lesson.kind === "mandatory" ? t.mandatory : t.optional}
                                  </p>
                                </div>
                                <Badge tone={isDone ? "success" : isOpen ? "primary" : "neutral"}>
                                  {isDone ? t.doneBadge : isOpen ? t.openBadge : t.soonBadge}
                                </Badge>
                              </div>
                            );

                            return isOpen ? (
                              <Link key={lesson.id} href={`/lesson/${lesson.id}${qs}`} style={{ textDecoration: "none", color: "inherit" }}>
                                {inner}
                              </Link>
                            ) : (
                              <div key={lesson.id}>{inner}</div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        </div>
      </div>
    </AppShell>
  );
}
