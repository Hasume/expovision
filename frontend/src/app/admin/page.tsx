"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminReport, adminAuditLogs, adminUsers, adminListTokens, adminFlows } from "@/features/api";
import { Badge } from "@/shared/ui/components";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const [report, setReport] = useState<Awaited<ReturnType<typeof adminReport>> | null>(null);
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof adminAuditLogs>>>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof adminUsers>>>([]);
  const [tokens, setTokens] = useState<Awaited<ReturnType<typeof adminListTokens>>>([]);
  const [flows, setFlows] = useState<Awaited<ReturnType<typeof adminFlows>>>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const [r, l, u, tk, f] = await Promise.all([
        adminReport(),
        adminAuditLogs(),
        adminUsers(),
        adminListTokens().catch(() => []),
        adminFlows(),
      ]);
      setReport(r);
      setLogs(l.slice(0, 10));
      setUsers(u);
      setTokens(tk);
      setFlows(f);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Не удалось загрузить дашборд", "Failed to load dashboard"), "error");
    }
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  const studentsWithoutFlow = users.filter(
    (u) => u.role === "student" && !tokens.some((tk) => tk.usedByUserId === u.id && tk.flowId)
  );

  const activeFlows = flows.filter((f) => f.isActive);

  if (loading) {
    return (
      <div className="stack">
        <header className="page-header"><h1 className="page-title">{t("Дашборд", "Admin Dashboard")}</h1></header>
        <p className="muted">{t("Загрузка...", "Loading dashboard...")}</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div className="row between">
          <div>
            <h1 className="page-title">{t("Дашборд", "Admin Dashboard")}</h1>
            <p className="page-subtitle">{t("Обзор интенсивной платформы", "Overview of your intensive platform")}</p>
          </div>
          <button type="button" className="button secondary small" onClick={() => { setLoading(true); void reload(); }}>{t("Обновить", "Refresh")}</button>
        </div>
      </header>

      <div className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">{t("ПОЛЬЗОВАТЕЛИ", "USERS")}</p>
          <p className="kpi-value">{report?.totalUsers ?? "—"}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">{t("БЕЗ ПОТОКА", "NO FLOW")}</p>
          <p className="kpi-value" style={studentsWithoutFlow.length > 0 ? { color: "var(--warning)" } : undefined}>{studentsWithoutFlow.length}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">{t("ОЖИДАЕТ ПРОВЕРКИ", "PENDING HW")}</p>
          <p className="kpi-value" style={{ color: "var(--warning)" }}>{report?.pendingHomeworkReviews ?? "—"}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">{t("ПРОСРОЧЕНО", "OVERDUE")}</p>
          <p className="kpi-value" style={{ color: "var(--danger)" }}>{report?.overdueHomework ?? "—"}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">{t("ТОКЕНЫ", "TOKENS")}</p>
          <p className="kpi-value">{report ? `${report.usedTokens}/${report.totalTokens}` : "—"}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">{t("АКТИВНЫЕ ПОТОКИ", "ACTIVE FLOWS")}</p>
          <p className="kpi-value">{activeFlows.length}</p>
        </article>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
        <div className="admin-section">
          <h3 className="admin-section-title">{t("Быстрые действия", "Quick Actions")}</h3>
          <div className="stack" style={{ gap: "8px", marginTop: "8px" }}>
            <Link href="/admin/content" className="button secondary" style={{ justifyContent: "flex-start", textDecoration: "none" }}>
              {t("Программа", "Programme")}
            </Link>
            <Link href="/admin/homework" className="button secondary" style={{ justifyContent: "flex-start", textDecoration: "none" }}>
              {t("Очередь проверки", "Review Queue")} {report?.pendingHomeworkReviews ? <Badge tone="danger">{report.pendingHomeworkReviews}</Badge> : null}
            </Link>
            <Link href="/admin/tokens" className="button secondary" style={{ justifyContent: "flex-start", textDecoration: "none" }}>
              {t("Сгенерировать токены", "Generate Tokens")}
            </Link>
            <Link href="/admin/flows" className="button secondary" style={{ justifyContent: "flex-start", textDecoration: "none" }}>
              {t("Управление потоками", "Manage Flows")}
            </Link>
            <Link href="/admin/settings" className="button secondary" style={{ justifyContent: "flex-start", textDecoration: "none" }}>
              {t("Настройки", "Settings")}
            </Link>
          </div>
        </div>

        <div className="admin-section">
          <div className="admin-section-header">
            <h3 className="admin-section-title">{t("Последняя активность", "Recent Activity")}</h3>
            <Link href="/admin/audit" className="button ghost small" style={{ textDecoration: "none" }}>{t("Все записи", "View all")}</Link>
          </div>
          {logs.length === 0 ? (
            <p className="muted text-body-sm" style={{ marginTop: "8px" }}>{t("Нет недавней активности", "No recent activity")}</p>
          ) : (
            <div style={{ marginTop: "8px", display: "grid", gap: "4px" }}>
              {logs.map((log) => (
                <div key={log.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{log.action}</span>
                    <span className="muted" style={{ fontSize: "0.72rem", marginLeft: "8px" }}>{log.method} {log.endpoint}</span>
                  </div>
                  <span className="muted" style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}>{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {studentsWithoutFlow.length > 0 && (
        <div className="admin-section" style={{ borderColor: "rgba(217,119,6,0.3)" }}>
          <div className="admin-section-header">
            <h3 className="admin-section-title" style={{ color: "var(--warning)" }}>{t("Студенты без потока", "Students Without Flow")} ({studentsWithoutFlow.length})</h3>
            <Link href="/admin/students" className="button ghost small" style={{ textDecoration: "none" }}>{t("Все пользователи", "View all users")}</Link>
          </div>
          <div style={{ marginTop: "8px", display: "grid", gap: "4px", maxHeight: "200px", overflow: "auto" }}>
            {studentsWithoutFlow.slice(0, 10).map((u) => (
              <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ fontSize: "0.85rem" }}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</span>
                <Badge tone="neutral">{u.stage}</Badge>
              </div>
            ))}
            {studentsWithoutFlow.length > 10 && (
              <p className="muted text-body-sm">...{t("и ещё", "and")} {studentsWithoutFlow.length - 10} {t("больше", "more")}</p>
            )}
          </div>
        </div>
      )}

      {report && (
        <div className="admin-section">
          <h3 className="admin-section-title">{t("Распределение по трекам", "Track Distribution")}</h3>
          <div className="row" style={{ gap: "16px", marginTop: "8px" }}>
            <div style={{ textAlign: "center" }}>
              <p className="kpi-value">{report.trackDistribution.A}</p>
              <p className="text-caption-strong">{t("Трек A", "Track A")}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p className="kpi-value">{report.trackDistribution.B}</p>
              <p className="text-caption-strong">{t("Трек B", "Track B")}</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <p className="kpi-value">{report.trackDistribution.C}</p>
              <p className="text-caption-strong">{t("Трек C", "Track C")}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
