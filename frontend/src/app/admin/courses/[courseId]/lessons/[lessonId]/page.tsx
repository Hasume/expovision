"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminCourseLessons, adminUpsertCourseLesson } from "@/features/api";
import { Button, Card } from "@/shared/ui/components";
import { LessonFormFields, emptyLessonForm, type LessonFormState } from "@/features/admin/course-lesson-forms";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

export default function AdminEditLessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = use(params);
  const { toast } = useToast();
  const { t } = useAdminLang();
  const router = useRouter();

  const [form, setForm] = useState<LessonFormState>(emptyLessonForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminCourseLessons(courseId);
      const l = list.find((x) => x.id === lessonId);
      if (!l) {
        toast(t("Урок не найден", "Lesson not found"), "error");
        router.replace(`/admin/courses/${courseId}`);
        return;
      }
      setForm({
        titleRu: l.titleRu,
        titleEn: l.titleEn,
        contentRu: l.contentRu,
        contentEn: l.contentEn,
        videoUrl: l.videoUrl,
        kinescopeVideoId: l.kinescopeVideoId ?? null,
        sortOrder: l.sortOrder,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
      router.replace(`/admin/courses/${courseId}`);
    }
    setLoading(false);
  }, [courseId, lessonId, router, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await adminUpsertCourseLesson({
        courseId,
        lessonId,
        titleRu: form.titleRu,
        titleEn: form.titleEn,
        contentRu: form.contentRu,
        contentEn: form.contentEn,
        videoUrl: form.videoUrl,
        kinescopeVideoId: form.kinescopeVideoId,
        sortOrder: form.sortOrder,
      });
      toast(t("Урок сохранён", "Lesson saved"), "success");
      router.push(`/admin/courses/${courseId}`);
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
        <h1 className="page-title">{t("Урок", "Lesson")}</h1>
        <p className="page-subtitle">{form.titleRu || form.titleEn || t("Редактирование", "Editing")}</p>
      </header>

      <Card>
        <LessonFormFields value={form} onChange={setForm} />
        <div className="row" style={{ gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <Button tone="primary" onClick={() => void save()} disabled={saving}>
            {t("Сохранить", "Save")}
          </Button>
          <Link href={`/admin/courses/${courseId}`} className="button secondary">
            {t("Закрыть", "Close")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
