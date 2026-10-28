"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adminCourses,
  adminCourseLessons,
  adminDeleteCourse,
  adminRemoveCourseLesson,
  adminReorderCourseLessons,
  type AdminCourse,
  type AdminCourseLesson,
} from "@/features/api";
import { Badge, Button, Card } from "@/shared/ui/components";
import { ConfirmDialog } from "@/features/admin/confirm-dialog";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

export default function AdminCourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { toast } = useToast();
  const { t } = useAdminLang();
  const router = useRouter();

  const [course, setCourse] = useState<AdminCourse | null>(null);
  const [lessons, setLessons] = useState<AdminCourseLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [deleteCourseOpen, setDeleteCourseOpen] = useState(false);
  const [deleteLesson, setDeleteLesson] = useState<{ id: string; title: string } | null>(null);

  const reloadCourse = useCallback(async () => {
    const list = await adminCourses();
    const c = list.find((x) => x.id === courseId) ?? null;
    setCourse(c);
    return c;
  }, [courseId]);

  const reloadLessons = useCallback(async () => {
    setLessonsLoading(true);
    try {
      setLessons(await adminCourseLessons(courseId));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
    setLessonsLoading(false);
  }, [courseId, toast, t]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const c = await reloadCourse();
        if (!c) {
          toast(t("Курс не найден", "Course not found"), "error");
          router.replace("/admin/courses");
          return;
        }
        await reloadLessons();
      } catch (e) {
        toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
        router.replace("/admin/courses");
      }
      setLoading(false);
    })();
  }, [courseId, reloadCourse, reloadLessons, router, toast, t]);

  const onDeleteCourse = async () => {
    try {
      await adminDeleteCourse(courseId);
      toast(t("Курс удалён", "Course deleted"), "success");
      setDeleteCourseOpen(false);
      router.replace("/admin/courses");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
  };

  const onRemoveLesson = async () => {
    if (!deleteLesson) return;
    try {
      await adminRemoveCourseLesson(courseId, deleteLesson.id);
      toast(t("Урок убран из курса", "Lesson removed from course"), "success");
      setDeleteLesson(null);
      await reloadLessons();
      await reloadCourse();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
  };

  const moveLesson = async (idx: number, dir: -1 | 1) => {
    const ids = lessons.map((l) => l.id);
    const si = idx + dir;
    if (si < 0 || si >= ids.length) return;
    [ids[idx], ids[si]] = [ids[si]!, ids[idx]!];
    try {
      await adminReorderCourseLessons(courseId, ids);
      await reloadLessons();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
  };

  if (loading || !course) {
    return (
      <div className="stack" style={{ padding: 32 }}>
        <p className="muted">{t("Загрузка...", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <nav style={{ marginBottom: 8 }}>
        <Link href="/admin/courses" className="link-button ghost small">
          ← {t("Все курсы", "All courses")}
        </Link>
      </nav>

      <header className="page-header">
        <div className="row between" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title" style={{ wordBreak: "break-word" }}>
              {course.titleRu || course.titleEn || t("(без названия)", "(untitled)")}
            </h1>
            {(course.descriptionRu || course.descriptionEn) && (
              <p className="page-subtitle" style={{ marginTop: 8 }}>
                {course.descriptionRu || course.descriptionEn}
              </p>
            )}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Link href={`/admin/courses/${courseId}/edit`} className="button secondary small">
              {t("Редактировать курс", "Edit course")}
            </Link>
            <Button className="small" tone="ghost" onClick={() => setDeleteCourseOpen(true)}>
              {t("Удалить курс", "Delete course")}
            </Button>
          </div>
        </div>
      </header>

      <Card>
        <div className="row between" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 className="text-h3" style={{ margin: 0 }}>{t("Уроки", "Lessons")}</h2>
          <Link href={`/admin/courses/${courseId}/lessons/new`} className="button primary small">
            + {t("Добавить урок", "Add lesson")}
          </Link>
        </div>

        {lessonsLoading && <p className="muted text-body-sm section-top-sm">{t("Загрузка...", "Loading...")}</p>}

        {!lessonsLoading && lessons.length === 0 && (
          <div className="admin-empty-state" style={{ paddingTop: 24 }}>
            <p className="muted text-body-sm">
              {t("Уроков пока нет. Добавьте урок — выберите видео в Kinescope.", "No lessons yet. Add one — pick a Kinescope video.")}
            </p>
            <Link href={`/admin/courses/${courseId}/lessons/new`} className="button primary small section-top-sm">
              + {t("Добавить урок", "Add lesson")}
            </Link>
          </div>
        )}

        <div className="entity-list section-top-sm">
          {lessons.map((l, idx) => (
            <div
              key={l.id}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                border: "1px solid var(--border)",
              }}
            >
              <Link
                href={`/admin/courses/${courseId}/lessons/${l.id}`}
                style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
              >
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-muted)", minWidth: 24 }}>#{idx + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.titleRu || l.titleEn || t("(без названия)", "(untitled)")}
                  </span>
                  <div className="row" style={{ gap: 6, marginTop: 2 }}>
                    {l.kinescopeVideoId && <Badge tone="success">{t("Видео", "Video")}</Badge>}
                    {l.videoUrl && !l.kinescopeVideoId && <Badge tone="neutral">{t("Внешнее", "External")}</Badge>}
                    {l.assignedDays.length > 0 ? (
                      <Badge tone="warning">
                        {l.assignedDays.map((d) => `${t("День", "Day")} ${d.dayNumber}${d.track ? ` (${d.track})` : ""}`).join(", ")}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t("Не назначен", "Unassigned")}</Badge>
                    )}
                  </div>
                </div>
              </Link>
              <div className="row" style={{ gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="button secondary small" disabled={idx === 0} onClick={() => void moveLesson(idx, -1)}>
                  ↑
                </button>
                <button type="button" className="button secondary small" disabled={idx === lessons.length - 1} onClick={() => void moveLesson(idx, 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  className="admin-icon-btn danger"
                  onClick={() => setDeleteLesson({ id: l.id, title: l.titleRu || l.titleEn })}
                  aria-label={t("Убрать из курса", "Remove from course")}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={deleteCourseOpen}
        title={`${t("Удалить курс", "Delete course")}?`}
        description={`"${course.titleRu || course.titleEn}" ${t("будет удалён навсегда.", "will be permanently deleted.")}`}
        confirmLabel={t("Удалить", "Delete")}
        cancelLabel={t("Отмена", "Cancel")}
        tone="danger"
        onConfirm={() => void onDeleteCourse()}
        onCancel={() => setDeleteCourseOpen(false)}
      />

      <ConfirmDialog
        open={deleteLesson !== null}
        title={`${t("Убрать урок из курса", "Remove lesson from course")}?`}
        description={
          deleteLesson
            ? `"${deleteLesson.title}" ${t("будет убран из курса. Урок останется в системе.", "will be removed from the course. The lesson stays in the system.")}`
            : undefined
        }
        confirmLabel={t("Убрать", "Remove")}
        cancelLabel={t("Отмена", "Cancel")}
        tone="danger"
        onConfirm={() => void onRemoveLesson()}
        onCancel={() => setDeleteLesson(null)}
      />
    </div>
  );
}
