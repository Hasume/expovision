"use client";

import { useEffect, useState } from "react";
import { adminReport, adminSetStart } from "@/features/api";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

export default function SettingsPage() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<Awaited<ReturnType<typeof adminReport>> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await adminReport();
        setReport(r);
        if (r.intensiveStartAt) {
          const d = new Date(r.intensiveStartAt);
          if (!isNaN(d.getTime())) setStartDate(d.toISOString().slice(0, 16));
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : t("Ошибка загрузки", "Failed to load"), "error");
      }
    })();
  }, []);

  const autoEnd = (() => {
    if (!startDate) return "";
    const d = new Date(new Date(startDate).getTime() + 14 * 86400000);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
  })();

  const onSave = async () => {
    if (!startDate) { toast(t("Укажите дату старта", "Set a start date"), "warning"); return; }
    const d = new Date(startDate);
    if (isNaN(d.getTime())) { toast(t("Некорректная дата", "Invalid date"), "error"); return; }
    setSaving(true);
    try {
      const res = await adminSetStart(d.toISOString());
      toast(t(`Старт обновлён. Потоков обновлено: ${res.flowsUpdated}`, `Start updated. Flows updated: ${res.flowsUpdated}`), "success");
      setReport(await adminReport());
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
    setSaving(false);
  };

  return (
    <div className="stack">
      <header className="page-header">
        <h1 className="page-title">{t("Настройки", "Settings")}</h1>
        <p className="page-subtitle">{t("Глобальные настройки интенсива", "Global intensive configuration")}</p>
      </header>

      <div className="admin-section">
        <h3 className="admin-section-title">{t("Расписание интенсива", "Intensive Schedule")}</h3>
        <p className="muted text-body-sm">{t("Установите дату и время старта. Дата окончания рассчитывается автоматически (старт + 14 дней).", "Set the start date and time. End date is auto-calculated (start + 14 days).")}</p>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginTop: "12px" }}>
          <div className="form-field" style={{ width: "240px" }}>
            <label className="form-label">{t("Дата и время старта", "Start date & time")}</label>
            <input className="input" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-field" style={{ width: "240px" }}>
            <label className="form-label">{t("Дата окончания (авто)", "End date (auto)")}</label>
            <input className="input" type="datetime-local" value={autoEnd} disabled />
          </div>
          <button type="button" className="button primary" disabled={saving} onClick={() => void onSave()}>
            {saving ? t("Сохранение...", "Saving...") : t("Применить", "Apply")}
          </button>
        </div>
      </div>

      {report && (
        <div className="admin-section">
          <h3 className="admin-section-title">{t("Текущий статус", "Current Status")}</h3>
          <div className="kpi-grid" style={{ marginTop: "8px" }}>
            <article className="kpi"><p className="kpi-label">{t("ВСЕГО ПОЛЬЗОВАТЕЛЕЙ", "TOTAL USERS")}</p><p className="kpi-value">{report.totalUsers}</p></article>
            <article className="kpi"><p className="kpi-label">{t("ОТЧЁТ ГОТОВ", "REPORT DONE")}</p><p className="kpi-value">{report.reportCompletedUsers}</p></article>
            <article className="kpi"><p className="kpi-label">{t("ТОКЕНЫ", "TOKENS")}</p><p className="kpi-value">{report.usedTokens}/{report.totalTokens}</p></article>
            <article className="kpi"><p className="kpi-label">{t("ОЖИДАЕТ ПРОВЕРКИ", "PENDING HW")}</p><p className="kpi-value" style={{ color: "var(--warning)" }}>{report.pendingHomeworkReviews}</p></article>
            <article className="kpi"><p className="kpi-label">{t("ПРОСРОЧЕНО", "OVERDUE")}</p><p className="kpi-value" style={{ color: "var(--danger)" }}>{report.overdueHomework}</p></article>
          </div>
          <div style={{ marginTop: "12px" }}>
            <p className="muted text-body-sm">{t("Распределение по трекам", "Track distribution")}: A: {report.trackDistribution.A} · B: {report.trackDistribution.B} · C: {report.trackDistribution.C}</p>
          </div>
        </div>
      )}
    </div>
  );
}
