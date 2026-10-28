"use client";

import { useEffect, useState } from "react";
import { adminAuditLogs } from "@/features/api";
import { useToast } from "@/features/admin/toast";
import { DataTable, type Column } from "@/features/admin/data-table";
import { useAdminLang } from "@/features/admin/i18n";

type LogEntry = Awaited<ReturnType<typeof adminAuditLogs>>[number];

export default function AuditPage() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setLogs(await adminAuditLogs());
      } catch (e) {
        toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
      }
      setLoading(false);
    })();
  }, []);

  const actions = [...new Set(logs.map((l) => l.action))].sort();
  const filtered = filterAction ? logs.filter((l) => l.action === filterAction) : logs;

  const columns: Column<LogEntry>[] = [
    {
      key: "action", label: t("Действие", "Action"),
      render: (l) => <span style={{ fontWeight: 600 }}>{l.action}</span>,
      sortable: true, sortValue: (l) => l.action, width: "200px",
    },
    {
      key: "method", label: t("Метод", "Method"),
      render: (l) => (
        <span className={`badge ${l.method === "DELETE" ? "danger" : l.method === "POST" ? "primary" : "neutral"}`} style={{ fontSize: "0.7rem" }}>{l.method}</span>
      ),
      width: "80px",
    },
    {
      key: "endpoint", label: t("Эндпоинт", "Endpoint"),
      render: (l) => <code style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{l.endpoint}</code>,
    },
    {
      key: "payload", label: t("Данные", "Payload"),
      render: (l) => l.payloadJson ? (
        <button type="button" className="admin-icon-btn" onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === l.id ? null : l.id); }} title={t("Показать/скрыть данные", "Toggle payload")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={expandedId === l.id ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
          </svg>
        </button>
      ) : <span className="muted">—</span>,
      width: "70px",
    },
    {
      key: "createdAt", label: t("Время", "Time"),
      render: (l) => <span style={{ fontSize: "0.78rem" }}>{new Date(l.createdAt).toLocaleString()}</span>,
      sortable: true, sortValue: (l) => new Date(l.createdAt).getTime(), width: "160px",
    },
  ];

  if (loading) {
    return (
      <div className="stack">
        <header className="page-header"><h1 className="page-title">{t("Журнал действий", "Audit Log")}</h1></header>
        <p className="muted">{t("Загрузка...", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="page-header">
        <h1 className="page-title">{t("Журнал действий", "Audit Log")}</h1>
        <p className="page-subtitle">{t("Все действия администраторов записываются автоматически", "All admin actions are recorded automatically")}</p>
      </header>

      <div className="row" style={{ gap: "8px" }}>
        <select className="input" style={{ width: "220px", padding: "6px 10px", fontSize: "0.82rem" }} value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
          <option value="">{t("Все действия", "All actions")} ({logs.length})</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button type="button" className="button secondary small" onClick={async () => {
          setLoading(true);
          try { setLogs(await adminAuditLogs()); } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
          setLoading(false);
        }}>{t("Обновить", "Refresh")}</button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(l) => l.id}
        emptyText={t("Нет записей в журнале", "No audit log entries")}
        pageSize={50}
        searchFilter={(l, q) => l.action.toLowerCase().includes(q) || l.endpoint.toLowerCase().includes(q)}
        searchPlaceholder={t("Поиск по действиям или эндпоинтам...", "Search actions or endpoints...")}
      />

      {expandedId && (() => {
        const log = logs.find((l) => l.id === expandedId);
        if (!log?.payloadJson) return null;
        let formatted: string;
        try { formatted = JSON.stringify(JSON.parse(log.payloadJson), null, 2); } catch { formatted = log.payloadJson; }
        return (
          <div className="admin-section" style={{ padding: "14px" }}>
            <p className="text-caption-strong" style={{ marginBottom: "6px" }}>{t("Данные для", "Payload for")}: {log.action}</p>
            <pre style={{ margin: 0, fontSize: "0.78rem", lineHeight: "1.5", overflow: "auto", maxHeight: "300px", background: "var(--surface-muted)", borderRadius: "6px", padding: "10px" }}>{formatted}</pre>
          </div>
        );
      })()}
    </div>
  );
}
