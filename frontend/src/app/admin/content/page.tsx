"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { adminContentDays, type TrackCode } from "@/features/api";
import { useToast } from "@/features/admin/toast";
import { Badge } from "@/shared/ui/components";
import { useAdminLang } from "@/features/admin/i18n";

type TrackFilter = "all" | TrackCode;

export default function AdminContentPage() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const [days, setDays] = useState<Awaited<ReturnType<typeof adminContentDays>>>([]);
  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await adminContentDays();
        if (!cancelled) setDays(list);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : t("Не удалось загрузить дни", "Failed to load curriculum days"), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const filteredDays = useMemo(() => {
    if (trackFilter === "all") return days;
    return days.filter((d) => d.track === trackFilter);
  }, [days, trackFilter]);

  const statLegend = [
    { key: "L", labelRu: "Уроки", labelEn: "Lessons" },
    { key: "W", labelRu: "Вебинары", labelEn: "Webinars" },
    { key: "A", labelRu: "Артефакты", labelEn: "Artifacts" },
    { key: "H", labelRu: "ДЗ", labelEn: "Homework" },
  ];

  return (
    <div className="stack stack-relaxed">
      <header className="page-header">
        <h1 className="page-title">{t("Программа", "Programme")}</h1>
        <p className="page-subtitle">{t("Сетка дней: откройте день для управления уроками, вебинарами, артефактами и домашними заданиями.", "Day grid: open a day to manage lessons, webinars, artifacts, and homework.")}</p>
      </header>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 6 }}>
          {(["all", "A", "B", "C"] as const).map((key) => {
            const active = trackFilter === key;
            const count = key === "all" ? days.length : days.filter((d) => d.track === key).length;
            return (
              <button
                key={key}
                type="button"
                className={`button small ${active ? "primary" : "secondary"}`}
                onClick={() => setTrackFilter(key)}
              >
                {key === "all" ? t("Все", "All") : `${t("Трек", "Track")} ${key}`}
                {" "}
                <span style={{ opacity: 0.65 }}>({count})</span>
              </button>
            );
          })}
        </div>

        <div className="row" style={{ gap: 10 }}>
          {statLegend.map(({ key, labelRu, labelEn }) => (
            <span key={key} className="muted" style={{ fontSize: 12 }}>
              <strong style={{ color: "var(--text)" }}>{key}</strong> — {t(labelRu, labelEn)}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="muted no-margin">{t("Загрузка…", "Loading…")}</p>
      ) : filteredDays.length === 0 ? (
        <div className="admin-empty-state">
          <p className="text-h3">{t("Нет дней", "No days")}</p>
          <p className="muted text-body-sm">
            {trackFilter === "all"
              ? t("Программа пуста.", "The programme is empty.")
              : t(`В треке ${trackFilter} нет дней.`, `No days in track ${trackFilter}.`)}
          </p>
        </div>
      ) : (
        <div className="admin-days-grid">
          {filteredDays.map((day) => (
            <Link key={day.id} href={`/admin/content/${day.id}`} className="admin-day-card">
              <div className="admin-day-card-header">
                <span className="admin-day-card-number">{t("День", "Day")} {day.dayNumber}</span>
                {day.track ? <Badge tone="primary">{t("Трек", "Track")} {day.track}</Badge> : null}
              </div>
              <p className="muted entity-subtitle no-margin">{day.phase}</p>
              <div className="admin-day-card-stats">
                <span className={`admin-day-card-stat${day.lessonsCount > 0 ? " has-content" : ""}`}>L: {day.lessonsCount}</span>
                <span className={`admin-day-card-stat${day.webinarsCount > 0 ? " has-content" : ""}`}>W: {day.webinarsCount}</span>
                <span className={`admin-day-card-stat${day.artifactsCount > 0 ? " has-content" : ""}`}>A: {day.artifactsCount}</span>
                <span className={`admin-day-card-stat${day.homeworkCount > 0 ? " has-content" : ""}`}>H: {day.homeworkCount}</span>
              </div>
              <p className="admin-day-card-focus">{day.focusRu || day.focusEn || day.phase}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
