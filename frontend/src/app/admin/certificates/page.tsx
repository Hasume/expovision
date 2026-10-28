"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminCertificateRequests, type AdminCertificateRequestRow } from "@/features/api";
import { Badge } from "@/shared/ui/components";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function AdminCertificateRequestsPage() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const [rows, setRows] = useState<AdminCertificateRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "needs_pdf">("all");

  const reload = async () => {
    try {
      setRows(await adminCertificateRequests());
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка загрузки", "Failed to load"), "error");
    }
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "needs_pdf") return rows.filter((r) => !r.hasCertificatePdf);
    return rows;
  }, [rows, filter]);

  const needsPdfCount = useMemo(() => rows.filter((r) => !r.hasCertificatePdf).length, [rows]);

  if (loading) {
    return (
      <div className="stack">
        <header className="page-header">
          <h1 className="page-title">{t("Заявки на сертификат", "Certificate requests")}</h1>
        </header>
        <p className="muted">{t("Загрузка...", "Loading...")}</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 className="page-title">{t("Заявки на сертификат", "Certificate requests")}</h1>
            <p className="page-subtitle">
              {t(
                "Студенты нажали «Запросить сертификат» после окончания интенсива. Обработайте PDF и финал в карточке пользователя.",
                "Students tapped “Request certificate” after the intensive ended. Upload PDF and complete the flow on the user profile.",
              )}
            </p>
          </div>
          <button type="button" className="button secondary small" onClick={() => void reload()}>
            {t("Обновить", "Refresh")}
          </button>
        </div>
      </header>

      <div className="row" style={{ gap: "6px", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`button small ${filter === "all" ? "primary" : "secondary"}`}
          onClick={() => setFilter("all")}
        >
          {t("Все", "All")} ({rows.length})
        </button>
        <button
          type="button"
          className={`button small ${filter === "needs_pdf" ? "primary" : "secondary"}`}
          onClick={() => setFilter("needs_pdf")}
        >
          {t("Без PDF", "No PDF yet")} ({needsPdfCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-section">
          <div className="admin-empty-state">
            <p className="muted" style={{ margin: 0 }}>
              {filter === "needs_pdf"
                ? t("Нет заявок без загруженного PDF.", "No requests still missing a PDF.")
                : t("Пока нет заявок на сертификат.", "No certificate requests yet.")}
            </p>
          </div>
        </div>
      ) : (
        <div className="admin-section" style={{ overflowX: "auto" }}>
          <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 8px" }}>{t("Студент", "Student")}</th>
                <th style={{ padding: "10px 8px" }}>{t("Заявка", "Requested")}</th>
                <th style={{ padding: "10px 8px" }}>{t("Статус", "Status")}</th>
                <th style={{ padding: "10px 8px" }}>{t("Действие", "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const name = `${r.firstName} ${r.lastName}`.trim() || r.email;
                return (
                  <tr key={r.userId} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 8px", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 600 }}>{name}</div>
                      <div className="muted" style={{ fontSize: "0.82rem" }}>
                        {r.email}
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {fmtDateTime(r.certificateRequestedAt)}
                    </td>
                    <td style={{ padding: "12px 8px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <Badge tone={r.hasCertificatePdf ? "success" : "warning"}>
                          {r.hasCertificatePdf ? t("PDF ✓", "PDF ✓") : t("Нет PDF", "No PDF")}
                        </Badge>
                        <Badge tone={r.cardConfirmed ? "success" : "neutral"}>
                          {r.cardConfirmed ? t("Карта ✓", "Card ✓") : t("Карта", "Card")}
                        </Badge>
                        <Badge tone={r.finalUnlocked ? "success" : "neutral"}>
                          {r.finalUnlocked ? t("Финал ✓", "Final ✓") : t("Финал", "Final")}
                        </Badge>
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px", verticalAlign: "top" }}>
                      <Link href={`/admin/students/${r.userId}`} className="link-button small">
                        {t("Профиль", "Profile")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
