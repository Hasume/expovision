"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminCourses, adminUpsertCourse } from "@/features/api";
import { Button, Card } from "@/shared/ui/components";
import { CourseFormFields, emptyCourseForm, type CourseFormState } from "@/features/admin/course-lesson-forms";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

export default function AdminEditCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { toast } = useToast();
  const { t } = useAdminLang();
  const router = useRouter();
  const [form, setForm] = useState<CourseFormState>(emptyCourseForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminCourses();
      const c = list.find((x) => x.id === courseId);
      if (!c) {
        toast(t("Курс не найден", "Course not found"), "error");
        router.replace("/admin/courses");
        return;
      }
      setForm({
        titleRu: c.titleRu,
        titleEn: c.titleEn,
        descriptionRu: c.descriptionRu,
        descriptionEn: c.descriptionEn,
        coverUrl: c.coverUrl,
        sortOrder: c.sortOrder,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
      router.replace("/admin/courses");
    }
    setLoading(false);
  }, [courseId, router, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await adminUpsertCourse({ ...form, courseId });
      toast(t("Курс обновлён", "Course updated"), "success");
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
    <div className="stack" style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <nav style={{ marginBottom: 8 }}>
        <Link href={`/admin/courses/${courseId}`} className="link-button ghost small">
          ← {t("К курсу", "Back to course")}
        </Link>
      </nav>
      <header className="page-header">
        <h1 className="page-title">{t("Редактировать курс", "Edit course")}</h1>
        <p className="page-subtitle">{t("Название, описание и обложка", "Title, description, cover")}</p>
      </header>

      <Card>
        <CourseFormFields value={form} onChange={setForm} />
        <div className="row" style={{ gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <Button tone="primary" onClick={() => void save()} disabled={saving}>
            {t("Сохранить", "Save")}
          </Button>
          <Link href={`/admin/courses/${courseId}`} className="button secondary">
            {t("Отмена", "Cancel")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
