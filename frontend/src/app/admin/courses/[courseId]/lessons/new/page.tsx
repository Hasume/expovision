"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminCourseLessons, adminUpsertCourseLesson, type KinescopeVideo } from "@/features/api";
import { Button, Card } from "@/shared/ui/components";
import { KinescopeLibraryPicker } from "@/features/admin/kinescope-library-picker";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

export default function AdminNewLessonPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { toast } = useToast();
  const { t } = useAdminLang();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const nextSortOrder = useCallback(async () => {
    try {
      const list = await adminCourseLessons(courseId);
      if (list.length === 0) return 1;
      return Math.max(...list.map((l) => l.sortOrder)) + 1;
    } catch {
      return 1;
    }
  }, [courseId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await adminCourseLessons(courseId);
      } catch {
        toast(t("Курс не найден", "Course not found"), "error");
        router.replace("/admin/courses");
        return;
      }
      setLoading(false);
    })();
  }, [courseId, router, toast, t]);

  const onPickVideo = async (v: KinescopeVideo) => {
    setSaving(true);
    try {
      const title = v.title?.trim() || t("Без названия", "Untitled");
      const sort = await nextSortOrder();
      const res = await adminUpsertCourseLesson({
        courseId,
        titleRu: title,
        titleEn: title,
        contentRu: "",
        contentEn: "",
        videoUrl: "",
        kinescopeVideoId: v.id,
        sortOrder: sort,
      });
      toast(t("Урок создан", "Lesson created"), "success");
      router.replace(`/admin/courses/${courseId}/lessons/${res.lessonId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
    setSaving(false);
  };

  const createEmpty = async () => {
    setSaving(true);
    try {
      const titleRu = t("Новый урок", "New lesson");
      const titleEn = t("New lesson", "New lesson");
      const sort = await nextSortOrder();
      const res = await adminUpsertCourseLesson({
        courseId,
        titleRu,
        titleEn,
        contentRu: "",
        contentEn: "",
        videoUrl: "",
        kinescopeVideoId: null,
        sortOrder: sort,
      });
      toast(t("Урок создан", "Lesson created"), "success");
      router.replace(`/admin/courses/${courseId}/lessons/${res.lessonId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="stack" style={{ padding: 32 }}>
        <p className="muted">{t("Загрузка...", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <nav style={{ marginBottom: 8 }}>
        <Link href={`/admin/courses/${courseId}`} className="link-button ghost small">
          ← {t("К курсу", "Back to course")}
        </Link>
      </nav>

      <header className="page-header">
        <h1 className="page-title">{t("Новый урок — Kinescope", "New lesson — Kinescope")}</h1>
        <p className="page-subtitle">
          {t(
            "Выберите папку и видео. Название урока подставится из ролика.",
            "Pick a folder and a video. The lesson title comes from the video.",
          )}
        </p>
      </header>

      <Card>
        <KinescopeLibraryPicker onSelect={(v) => void onPickVideo(v)} disabled={saving} />
        <p className="muted text-body-sm" style={{ marginTop: 20 }}>
          <button type="button" className="link-button ghost" style={{ padding: 0 }} onClick={() => void createEmpty()} disabled={saving}>
            {t("Создать пустой урок без видео", "Create empty lesson without video")}
          </button>
        </p>
        <div className="row" style={{ marginTop: 24 }}>
          <Link href={`/admin/courses/${courseId}`} className="button secondary">
            {t("Отмена", "Cancel")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
