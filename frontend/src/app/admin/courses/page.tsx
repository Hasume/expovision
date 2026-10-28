"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminCourses, type AdminCourse } from "@/features/api";
import { Badge, Button, Card } from "@/shared/ui/components";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

export default function AdminCoursesIndexPage() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setCourses(await adminCourses());
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
  }, [toast, t]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  if (loading) {
    return (
      <div className="stack" style={{ padding: 32 }}>
        <p className="muted">{t("Загрузка...", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <header className="page-header">
        <div className="row between" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 className="page-title">{t("Курсы", "Courses")}</h1>
            <p className="page-subtitle">
              {t(
                "Создавайте курсы и уроки с видео. Назначайте уроки на дни в разделе Программа.",
                "Create courses and video lessons. Assign lessons to days in Programme.",
              )}
            </p>
          </div>
          <Link href="/admin/courses/new" className="button primary">
            + {t("Новый курс", "New course")}
          </Link>
        </div>
      </header>

      {courses.length === 0 ? (
        <Card>
          <div className="admin-empty-state" style={{ padding: 32 }}>
            <p className="text-h3" style={{ margin: 0 }}>{t("Курсов пока нет", "No courses yet")}</p>
            <p className="muted text-body-sm">{t("Создайте первый курс.", "Create your first course.")}</p>
            <Link href="/admin/courses/new" className="button primary section-top-sm">
              + {t("Создать курс", "Create course")}
            </Link>
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {courses.map((c) => (
            <Link key={c.id} href={`/admin/courses/${c.id}`} className="admin-course-card-link">
              <Card>
                <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h2 className="text-h3" style={{ margin: 0 }}>
                      {c.titleRu || c.titleEn || t("(без названия)", "(untitled)")}
                    </h2>
                    {(c.descriptionRu || c.descriptionEn) && (
                      <p className="muted text-body-sm section-top-sm" style={{ marginBottom: 0 }}>
                        {c.descriptionRu || c.descriptionEn}
                      </p>
                    )}
                  </div>
                  <Badge tone="neutral">{c.lessonCount} {t("уроков", "lessons")}</Badge>
                </div>
                <p className="muted text-body-sm" style={{ margin: "12px 0 0" }}>
                  {t("Открыть курс →", "Open course →")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
