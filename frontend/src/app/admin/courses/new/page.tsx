"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminUpsertCourse } from "@/features/api";
import { Button, Card } from "@/shared/ui/components";
import { CourseFormFields, emptyCourseForm, type CourseFormState } from "@/features/admin/course-lesson-forms";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

export default function AdminNewCoursePage() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const router = useRouter();
  const [form, setForm] = useState<CourseFormState>(emptyCourseForm);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminUpsertCourse({ ...form });
      toast(t("Курс создан", "Course created"), "success");
      router.replace(`/admin/courses/${res.courseId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
    setSaving(false);
  };

  return (
    <div className="stack" style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <nav style={{ marginBottom: 8 }}>
        <Link href="/admin/courses" className="link-button ghost small">
          ← {t("Все курсы", "All courses")}
        </Link>
      </nav>
      <header className="page-header">
        <h1 className="page-title">{t("Новый курс", "New course")}</h1>
        <p className="page-subtitle">{t("Название, описание и обложка", "Title, description, cover")}</p>
      </header>

      <Card>
        <CourseFormFields value={form} onChange={setForm} />
        <div className="row" style={{ gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <Button tone="primary" onClick={() => void save()} disabled={saving}>
            {t("Создать", "Create")}
          </Button>
          <Link href="/admin/courses" className="button secondary">
            {t("Отмена", "Cancel")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
