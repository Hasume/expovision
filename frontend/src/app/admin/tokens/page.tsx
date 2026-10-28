"use client";

import { useEffect, useState } from "react";
import { adminListTokens, adminGenerateTokens, adminFlows, adminReport, type AdminToken } from "@/features/api";
import { Badge } from "@/shared/ui/components";
import { useToast } from "@/features/admin/toast";
import { DataTable, type Column } from "@/features/admin/data-table";
import { useAdminLang } from "@/features/admin/i18n";

export default function TokensPage() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const [tokens, setTokens] = useState<AdminToken[]>([]);
  const [flows, setFlows] = useState<Awaited<ReturnType<typeof adminFlows>>>([]);
  const [loading, setLoading] = useState(true);
  const [genCount, setGenCount] = useState(10);
  const [genFlowId, setGenFlowId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [filterFlow, setFilterFlow] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "used" | "available">("all");
  const [generating, setGenerating] = useState(false);

  const reload = async () => {
    try {
      const [tk, fl, rp] = await Promise.all([adminListTokens(), adminFlows(), adminReport()]);
      setTokens(tk); setFlows(fl);
      if (rp.intensiveStartAt && !startDate) {
        const d = new Date(rp.intensiveStartAt);
        if (!isNaN(d.getTime())) setStartDate(d.toISOString().slice(0, 16));
      }
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  const onGenerate = async () => {
    if (!startDate) { toast(t("Сначала укажите дату старта", "Set a start date first"), "warning"); return; }
    setGenerating(true);
    try {
      const res = await adminGenerateTokens(genCount, new Date(startDate).toISOString(), genFlowId || undefined);
      toast(t(`Создано ${res.tokens.length} токенов`, `Generated ${res.tokens.length} tokens`), "success");
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
    setGenerating(false);
  };

  const copyToken = (token: string) => { void navigator.clipboard.writeText(token); toast(t("Скопировано в буфер", "Copied to clipboard"), "info"); };

  const filtered = tokens.filter((tk) => {
    if (filterFlow && tk.flowId !== filterFlow) return false;
    if (filterStatus === "used" && !tk.usedByUserId) return false;
    if (filterStatus === "available" && tk.usedByUserId) return false;
    return true;
  });

  const usedCount = tokens.filter((tk) => tk.usedByUserId).length;

  const columns: Column<AdminToken>[] = [
    { key: "token", label: t("Токен", "Token"), render: (tk) => <code style={{ fontWeight: 700, fontSize: "0.82rem", letterSpacing: "0.5px", cursor: "pointer" }} onClick={() => copyToken(tk.token)}>{tk.token}</code>, width: "180px" },
    { key: "status", label: t("Статус", "Status"), render: (tk) => tk.usedByUserId ? <Badge tone="success">{t("Использован", "Used")}</Badge> : <Badge tone="warning">{t("Доступен", "Available")}</Badge>, width: "100px" },
    { key: "flow", label: t("Поток", "Flow"), render: (tk) => tk.flowCode ? <Badge tone="neutral">{tk.flowCode}</Badge> : <span className="muted">—</span>, width: "100px" },
    { key: "usedBy", label: t("Использован кем", "Used by"), render: (tk) => tk.usedByName || tk.usedByEmail || <span className="muted">—</span> },
    { key: "usedAt", label: t("Когда", "Used at"), render: (tk) => tk.usedAt ? new Date(tk.usedAt).toLocaleString() : <span className="muted">—</span>, width: "160px" },
  ];

  if (loading) {
    return (
      <div className="stack">
        <header className="page-header"><h1 className="page-title">{t("Управление токенами", "Token Management")}</h1></header>
        <p className="muted">{t("Загрузка...", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="page-header">
        <h1 className="page-title">{t("Управление токенами", "Token Management")}</h1>
        <p className="page-subtitle">{t("Генерация и управление токенами активации лицензий", "Generate and manage license activation tokens")}</p>
      </header>

      <div className="kpi-grid">
        <article className="kpi"><p className="kpi-label">{t("ВСЕГО", "TOTAL")}</p><p className="kpi-value">{tokens.length}</p></article>
        <article className="kpi"><p className="kpi-label">{t("ИСПОЛЬЗОВАНО", "USED")}</p><p className="kpi-value" style={{ color: "var(--success)" }}>{usedCount}</p></article>
        <article className="kpi"><p className="kpi-label">{t("ДОСТУПНО", "AVAILABLE")}</p><p className="kpi-value">{tokens.length - usedCount}</p></article>
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">{t("Сгенерировать токены", "Generate Tokens")}</h3>
        <div className="row" style={{ gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-field" style={{ width: "120px" }}>
            <label className="form-label">{t("Кол-во", "Count")}</label>
            <input className="input" type="number" min="1" max="500" value={genCount} onChange={(e) => setGenCount(Number(e.target.value) || 1)} />
          </div>
          <div className="form-field" style={{ width: "220px" }}>
            <label className="form-label">{t("Дата старта", "Start date")}</label>
            <input className="input" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-field" style={{ width: "180px" }}>
            <label className="form-label">{t("Поток (необязательно)", "Flow (optional)")}</label>
            <select className="input" value={genFlowId} onChange={(e) => setGenFlowId(e.target.value)}>
              <option value="">{t("Без потока", "No flow")}</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
            </select>
          </div>
          <button type="button" className="button primary" disabled={generating} onClick={() => void onGenerate()}>
            {generating ? t("Генерация...", "Generating...") : t("Сгенерировать", "Generate")}
          </button>
        </div>
      </div>

      <div className="admin-section">
        <div className="admin-section-header">
          <h3 className="admin-section-title">{t("Все токены", "All Tokens")} ({filtered.length})</h3>
          <div className="row" style={{ gap: "6px" }}>
            <select className="input" style={{ width: "140px", padding: "6px 10px", fontSize: "0.82rem" }} value={filterFlow} onChange={(e) => setFilterFlow(e.target.value)}>
              <option value="">{t("Все потоки", "All flows")}</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.code}</option>)}
            </select>
            <select className="input" style={{ width: "120px", padding: "6px 10px", fontSize: "0.82rem" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "all" | "used" | "available")}>
              <option value="all">{t("Все", "All")}</option>
              <option value="used">{t("Использованные", "Used")}</option>
              <option value="available">{t("Доступные", "Available")}</option>
            </select>
          </div>
        </div>
        <DataTable columns={columns} data={filtered} rowKey={(tk) => tk.token} emptyText={t("Нет токенов по фильтру", "No tokens match filters")} pageSize={30} />
      </div>
    </div>
  );
}
