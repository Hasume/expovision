"use client";

import { useEffect, useState } from "react";
import {
  curatorPending,
  curatorReview,
  curatorSuggestFeedback,
  adminUsers,
  curatorAllSubmissions,
} from "@/features/api";
import { Badge } from "@/shared/ui/components";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

type Submission = Awaited<ReturnType<typeof curatorPending>>[number];
type HistoryItem = Awaited<ReturnType<typeof curatorAllSubmissions>>[number];
type User = Awaited<ReturnType<typeof adminUsers>>[number];

function pickLocale(ru: string, en: string, lang: "ru" | "en"): string {
  const primary = lang === "ru" ? ru : en;
  if (primary.trim()) return primary;
  return lang === "ru" ? en : ru;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  approved: "var(--success)",
  rejected: "var(--danger)",
  pending_review: "var(--warning)",
  overdue: "var(--warning)",
};

// ─── Review Queue Tab ──────────────────────────────────────────────────────

function ReviewQueue({
  queue,
  users,
  loading,
  reload,
  lang: adminLang,
  t,
}: {
  queue: Submission[];
  users: User[];
  loading: boolean;
  reload: () => void;
  lang: "ru" | "en";
  t: (ru: string, en: string) => string;
}) {
  const { toast } = useToast();
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [suggestBusy, setSuggestBusy] = useState<string | null>(null);

  const userName = (userId: string) => {
    const u = users.find((x) => x.id === userId);
    if (!u) return userId.slice(0, 8);
    const name = `${u.firstName} ${u.lastName}`.trim();
    return name || u.email;
  };
  const userEmail = (userId: string) => users.find((x) => x.id === userId)?.email ?? "";

  const filtered = filterDay ? queue.filter((s) => s.dayNumber === filterDay) : queue;
  const dayNumbers = [...new Set(queue.map((s) => s.dayNumber))].sort((a, b) => a - b);

  const onSuggest = async (submissionId: string, outputLanguage?: "ru" | "en") => {
    setSuggestBusy(submissionId);
    try {
      const { feedback } = await curatorSuggestFeedback({ submissionId, ...(outputLanguage ? { outputLanguage } : {}) });
      setComments((prev) => ({ ...prev, [submissionId]: feedback }));
      toast(t("Черновик обратной связи готов", "Feedback draft ready"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка AI", "AI error"), "error");
    }
    setSuggestBusy(null);
  };

  const onReview = async (submissionId: string, verdict: "approved" | "rejected") => {
    setBusy(submissionId);
    try {
      const comment = comments[submissionId]?.trim() || (verdict === "approved" ? t("Отличная работа", "Good work") : t("Требуется доработка", "Needs revision"));
      await curatorReview({ submissionId, verdict, comment });
      toast(t(`Домашка ${verdict === "approved" ? "одобрена" : "отклонена"}`, `Homework ${verdict}`), "success");
      reload();
      setExpandedId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
    setBusy(null);
  };

  if (loading) return <p className="muted">{t("Загрузка...", "Loading...")}</p>;

  return (
    <div className="stack">
      <div className="row between" style={{ flexWrap: "wrap", gap: "8px" }}>
        <p className="page-subtitle">{queue.length} {t("работ ожидают проверки", "submissions pending review")}</p>
        <button type="button" className="button secondary small" onClick={reload}>{t("Обновить", "Refresh")}</button>
      </div>

      <div className="row" style={{ gap: "6px", flexWrap: "wrap" }}>
        <button type="button" className={`button small ${filterDay === null ? "primary" : "secondary"}`} onClick={() => setFilterDay(null)}>{t("Все дни", "All days")}</button>
        {dayNumbers.map((d) => (
          <button key={d} type="button" className={`button small ${filterDay === d ? "primary" : "secondary"}`} onClick={() => setFilterDay(d)}>
            {t("День", "Day")} {d}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="admin-section">
          <div className="admin-empty-state">
            {filterDay !== null ? (
              <>
                <p className="text-h3">{t("Нет работ в этот день", "No submissions for this day")}</p>
                <p className="muted text-body-sm">{t(`В день ${filterDay} нет работ на проверке.`, `No submissions waiting on Day ${filterDay}.`)}</p>
              </>
            ) : (
              <>
                <p className="text-h3">{t("Всё чисто", "All clear")}</p>
                <p className="muted text-body-sm">{t("Нет работ, ожидающих проверки.", "No submissions waiting for review.")}</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: "8px" }}>
          {filtered.map((sub) => {
            const isExpanded = expandedId === sub.submissionId;
            const isBusy = busy === sub.submissionId;
            const isSuggestBusy = suggestBusy === sub.submissionId;
            return (
              <div key={sub.submissionId} className="admin-section" style={{ padding: "16px" }}>
                <div className="row between" style={{ cursor: "pointer" }} onClick={() => setExpandedId(isExpanded ? null : sub.submissionId)}>
                  <div>
                    <p style={{ fontWeight: 600, margin: 0 }}>{userName(sub.userId)}</p>
                    <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>{userEmail(sub.userId)}</p>
                  </div>
                  <div className="row" style={{ gap: "6px" }}>
                    <Badge tone="primary">{t("День", "Day")} {sub.dayNumber}</Badge>
                    {sub.submissionStatus === "overdue" && <Badge tone="warning">{t("После дедлайна", "Past deadline")}</Badge>}
                    {sub.aiIntegrityRiskScore != null && sub.aiIntegrityRiskScore > 50 && <Badge tone="danger">{t("AI риск", "AI Risk")}: {sub.aiIntegrityRiskScore}%</Badge>}
                    {sub.aiIntegrityRiskScore != null && sub.aiIntegrityRiskScore <= 50 && sub.aiIntegrityRiskScore > 0 && <Badge tone="warning">{t("AI риск", "AI Risk")}: {sub.aiIntegrityRiskScore}%</Badge>}
                    <Badge tone="neutral">{fmtDate(sub.dueAt)}</Badge>
                  </div>
                </div>

                {isExpanded && (
                  <div className="stack" style={{ marginTop: "12px" }}>
                    <div>
                      <p className="text-caption-strong">{t("Задание", "Assignment")} — {t("день", "day")} {sub.dayNumber}</p>
                      <p className="text-body-sm muted" style={{ marginBottom: "6px" }}>
                        {t("Мин. длина ответа", "Min. answer length")}: {sub.minLength} · {t("Язык ученика", "Student language")}: {sub.studentLanguage.toUpperCase()}
                      </p>
                      <div style={{ background: "var(--surface-muted)", borderRadius: "8px", padding: "14px", fontSize: "0.88rem", lineHeight: "1.6", whiteSpace: "pre-wrap", maxHeight: "240px", overflow: "auto" }}>
                        {pickLocale(sub.instructionRu, sub.instructionEn, adminLang) || t("(Нет текста задания)", "(No assignment text)")}
                      </div>
                      {pickLocale(sub.sampleRu, sub.sampleEn, adminLang).trim() && (
                        <div style={{ marginTop: "10px" }}>
                          <p className="text-caption-strong">{t("Пример / ориентир", "Sample / rubric")}</p>
                          <div style={{ fontSize: "0.85rem", lineHeight: "1.55", whiteSpace: "pre-wrap", color: "var(--muted-foreground)" }}>
                            {pickLocale(sub.sampleRu, sub.sampleEn, adminLang)}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-caption-strong">{t("Ответ ученика", "Student answer")}</p>
                      <div style={{ background: "var(--surface-muted)", borderRadius: "8px", padding: "14px", fontSize: "0.9rem", lineHeight: "1.6", whiteSpace: "pre-wrap", maxHeight: "300px", overflow: "auto" }}>
                        {sub.answerText}
                      </div>
                    </div>

                    {sub.reflectionText && (
                      <div>
                        <p className="text-caption-strong">{t("Рефлексия", "Reflection")}</p>
                        <p className="text-body-sm muted" style={{ whiteSpace: "pre-wrap" }}>{sub.reflectionText}</p>
                      </div>
                    )}
                    {sub.aiUsageDisclosure && (
                      <div>
                        <p className="text-caption-strong">{t("Использование AI", "AI Usage Disclosure")}</p>
                        <p className="text-body-sm muted">{sub.aiUsageDisclosure}</p>
                      </div>
                    )}
                    {sub.attachments?.length > 0 && (
                      <div className="hw-review-attachments">
                        <p className="text-caption-strong">{t("Прикреплённые файлы", "Attached files")}</p>
                        <ul className="hw-review-attachments-list">
                          {sub.attachments.map((a) => (
                            <li key={a.url}>
                              <a href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}${a.url}`} className="hw-review-attach-link" target="_blank" rel="noreferrer">
                                📎 {a.fileName}
                                {a.fileSize > 0 && <span className="muted" style={{ fontSize: "0.75rem" }}>({(a.fileSize / 1024).toFixed(0)} KB)</span>}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="form-field">
                      <div className="row between" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: "8px" }}>
                        <label className="form-label" style={{ margin: 0 }}>{t("Комментарий для ученика", "Comment to student")}</label>
                        <div className="row" style={{ gap: "6px", flexWrap: "wrap" }}>
                          <button type="button" className="button secondary small" disabled={isBusy || isSuggestBusy} onClick={() => void onSuggest(sub.submissionId)}>
                            {isSuggestBusy ? "…" : t("AI: на языке ученика", "AI: student language")}
                          </button>
                          <button type="button" className="button secondary small" disabled={isBusy || isSuggestBusy} onClick={() => void onSuggest(sub.submissionId, adminLang)}>
                            {isSuggestBusy ? "…" : t(`AI: на ${adminLang.toUpperCase()}`, `AI: ${adminLang.toUpperCase()}`)}
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="textarea"
                        rows={5}
                        value={comments[sub.submissionId] ?? ""}
                        onChange={(e) => setComments((prev) => ({ ...prev, [sub.submissionId]: e.target.value }))}
                        placeholder={t("Текст обратной связи (можно сгенерировать AI и отредактировать)", "Review comment — generate with AI and edit")}
                      />
                    </div>
                    <div className="row" style={{ gap: "8px" }}>
                      <button type="button" className="button primary small" disabled={isBusy} onClick={() => void onReview(sub.submissionId, "approved")} style={{ background: "var(--success)" }}>
                        {isBusy ? "..." : t("Одобрить", "Approve")}
                      </button>
                      <button type="button" className="button primary small" disabled={isBusy} onClick={() => void onReview(sub.submissionId, "rejected")} style={{ background: "var(--danger)" }}>
                        {isBusy ? "..." : t("Отклонить", "Reject")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── History Tab ───────────────────────────────────────────────────────────

type DayGroup = { dayNumber: number; items: HistoryItem[] };

function groupByDay(items: HistoryItem[]): DayGroup[] {
  const map = new Map<number, HistoryItem[]>();
  for (const item of items) {
    if (!map.has(item.dayNumber)) map.set(item.dayNumber, []);
    map.get(item.dayNumber)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([dayNumber, items]) => ({ dayNumber, items }));
}

function statusLabel(status: string, t: (ru: string, en: string) => string) {
  if (status === "approved") return t("Одобрено", "Approved");
  if (status === "rejected") return t("Отклонено", "Rejected");
  if (status === "overdue") return t("Просрочено", "Overdue");
  return t("На проверке", "Pending");
}

function statusTone(status: string): "success" | "danger" | "warning" | "neutral" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "overdue") return "warning";
  return "neutral";
}

function SubmissionCard({
  sub,
  users,
  adminLang,
  t,
  onReviewed,
}: {
  sub: HistoryItem;
  users: User[];
  adminLang: "ru" | "en";
  t: (ru: string, en: string) => string;
  onReviewed?: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);

  const needsReview = sub.submissionStatus === "overdue" || sub.submissionStatus === "pending_review";

  const onSuggest = async (outputLanguage?: "ru" | "en") => {
    setSuggestBusy(true);
    try {
      const { feedback } = await curatorSuggestFeedback({
        submissionId: sub.submissionId,
        ...(outputLanguage ? { outputLanguage } : {}),
      });
      setComment(feedback);
      toast(t("Черновик готов", "Draft ready"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка AI", "AI error"), "error");
    }
    setSuggestBusy(false);
  };

  const onReview = async (verdict: "approved" | "rejected") => {
    setBusy(true);
    try {
      const text = comment.trim() || (verdict === "approved" ? t("Отличная работа", "Good work") : t("Требуется доработка", "Needs revision"));
      await curatorReview({ submissionId: sub.submissionId, verdict, comment: text });
      toast(verdict === "approved" ? t("Одобрено", "Approved") : t("Отклонено", "Rejected"), "success");
      onReviewed?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
    setBusy(false);
  };

  const userName = () => {
    const u = users.find((x) => x.id === sub.userId);
    if (!u) return sub.userId.slice(0, 8);
    const name = `${u.firstName} ${u.lastName}`.trim();
    return name || u.email;
  };
  const userEmail = () => users.find((x) => x.id === sub.userId)?.email ?? "";

  const isReviewed = sub.submissionStatus === "approved" || sub.submissionStatus === "rejected";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "12px",
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      {/* Card header */}
      <div
        style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 600, margin: 0, fontSize: "0.95rem" }}>{userName()}</p>
          <p className="muted" style={{ fontSize: "0.75rem", margin: 0 }}>{userEmail()}</p>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          <Badge tone={statusTone(sub.submissionStatus)}>{statusLabel(sub.submissionStatus, t)}</Badge>
          {sub.aiIntegrityRiskScore != null && sub.aiIntegrityRiskScore > 50 && (
            <Badge tone="danger">{t("AI риск", "AI Risk")} {sub.aiIntegrityRiskScore}%</Badge>
          )}
          <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground)" }}>{fmtDate(sub.createdAt)}</span>
          <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", marginLeft: "4px" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {/* Answer */}
          <div style={{ padding: "16px", background: "var(--surface-muted)" }}>
            <p className="text-caption-strong" style={{ marginBottom: "8px" }}>{t("Ответ ученика", "Student answer")}</p>
            <div style={{ fontSize: "0.9rem", lineHeight: "1.65", whiteSpace: "pre-wrap", color: "var(--foreground)", maxHeight: "320px", overflow: "auto" }}>
              {sub.answerText}
            </div>
          </div>

          {sub.reflectionText && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <p className="text-caption-strong" style={{ marginBottom: "6px" }}>{t("Рефлексия", "Reflection")}</p>
              <p className="text-body-sm muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{sub.reflectionText}</p>
            </div>
          )}

          {sub.attachments?.length > 0 && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <p className="text-caption-strong" style={{ marginBottom: "8px" }}>{t("Прикреплённые файлы", "Attached files")}</p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {sub.attachments.map((a) => (
                  <a
                    key={a.url}
                    href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}${a.url}`}
                    className="hw-review-attach-link"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "0.82rem" }}
                  >
                    📎 {a.fileName}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Admin response */}
          {isReviewed ? (
            <div
              style={{
                padding: "16px",
                borderTop: "1px solid var(--border)",
                background: sub.submissionStatus === "approved"
                  ? "color-mix(in srgb, var(--success) 8%, var(--surface))"
                  : "color-mix(in srgb, var(--danger) 8%, var(--surface))",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <div
                  style={{
                    width: "32px", height: "32px", borderRadius: "50%",
                    background: sub.submissionStatus === "approved" ? "var(--success)" : "var(--danger)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.9rem", flexShrink: 0,
                    color: "#fff",
                  }}
                >
                  {sub.submissionStatus === "approved" ? "✓" : "✕"}
                </div>
                <div>
                  <p style={{ fontWeight: 600, margin: 0, fontSize: "0.88rem" }}>
                    {t("Ответ куратора", "Curator response")}
                    {sub.reviewerName && <span className="muted" style={{ fontWeight: 400 }}> · {sub.reviewerName}</span>}
                  </p>
                  <p className="muted" style={{ fontSize: "0.75rem", margin: 0 }}>{fmtDateTime(sub.reviewedAt)}</p>
                </div>
              </div>
              {sub.reviewComment ? (
                <blockquote
                  style={{
                    margin: 0,
                    padding: "12px 14px",
                    borderLeft: `3px solid ${STATUS_COLORS[sub.submissionStatus] ?? "var(--border)"}`,
                    background: "var(--surface)",
                    borderRadius: "0 8px 8px 0",
                    fontSize: "0.9rem",
                    lineHeight: "1.65",
                    whiteSpace: "pre-wrap",
                    color: "var(--foreground)",
                  }}
                >
                  {sub.reviewComment}
                </blockquote>
              ) : (
                <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>{t("(Комментарий не оставлен)", "(No comment left)")}</p>
              )}
            </div>
          ) : needsReview ? (
            <div style={{ padding: "16px", borderTop: "1px solid var(--border)", background: "color-mix(in srgb, var(--warning) 6%, var(--surface))" }}>
              <p className="text-caption-strong" style={{ marginBottom: "10px" }}>
                {t("Требует проверки", "Needs review")}
                {sub.submissionStatus === "overdue" && (
                  <span className="muted" style={{ fontWeight: 400, marginLeft: "8px", fontSize: "0.8rem" }}>
                    {t("(сдано после дедлайна)", "(submitted past deadline)")}
                  </span>
                )}
              </p>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy || suggestBusy}
                  onClick={() => void onSuggest()}
                >
                  {suggestBusy ? "…" : t("AI: на языке ученика", "AI: student language")}
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy || suggestBusy}
                  onClick={() => void onSuggest(adminLang)}
                >
                  {suggestBusy ? "…" : t(`AI: на ${adminLang.toUpperCase()}`, `AI: ${adminLang.toUpperCase()}`)}
                </button>
              </div>
              <textarea
                className="textarea"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("Комментарий для ученика…", "Comment for student…")}
                style={{ marginBottom: "8px" }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="button primary small"
                  disabled={busy}
                  onClick={() => void onReview("approved")}
                  style={{ background: "var(--success)" }}
                >
                  {busy ? "..." : t("Одобрить", "Approve")}
                </button>
                <button
                  type="button"
                  className="button primary small"
                  disabled={busy}
                  onClick={() => void onReview("rejected")}
                  style={{ background: "var(--danger)" }}
                >
                  {busy ? "..." : t("Отклонить", "Reject")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function HistoryView({
  history,
  users,
  loading,
  reload,
  adminLang,
  t,
}: {
  history: HistoryItem[];
  users: User[];
  loading: boolean;
  reload: () => void;
  adminLang: "ru" | "en";
  t: (ru: string, en: string) => string;
}) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDay, setFilterDay] = useState<number | null>(null);

  if (loading) return <p className="muted">{t("Загрузка...", "Loading...")}</p>;

  const dayNumbers = [...new Set(history.map((s) => s.dayNumber))].sort((a, b) => a - b);

  const filtered = history
    .filter((s) => filterStatus === "all" || s.submissionStatus === filterStatus)
    .filter((s) => filterDay === null || s.dayNumber === filterDay);

  const groups = groupByDay(filtered);

  const statCounts = {
    all: history.length,
    approved: history.filter((s) => s.submissionStatus === "approved").length,
    rejected: history.filter((s) => s.submissionStatus === "rejected").length,
    pending: history.filter((s) => s.submissionStatus === "pending_review" || s.submissionStatus === "overdue").length,
  };

  return (
    <div className="stack">
      {/* Summary row */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {[
          { key: "all", label: t("Все", "All"), count: statCounts.all, tone: "neutral" },
          { key: "approved", label: t("Одобрено", "Approved"), count: statCounts.approved, tone: "success" },
          { key: "rejected", label: t("Отклонено", "Rejected"), count: statCounts.rejected, tone: "danger" },
          { key: "pending", label: t("Ожидает", "Pending"), count: statCounts.pending, tone: "warning" },
        ].map(({ key, label, count, tone }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterStatus(key === "pending" ? (filterStatus === "pending_review" ? "all" : "pending_review") : key)}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 14px", borderRadius: "10px", border: "1px solid var(--border)",
              background: (filterStatus === key || (key === "pending" && (filterStatus === "pending_review" || filterStatus === "overdue")))
                ? "var(--primary)" : "var(--surface)",
              color: (filterStatus === key || (key === "pending" && (filterStatus === "pending_review" || filterStatus === "overdue")))
                ? "var(--primary-foreground)" : "var(--foreground)",
              cursor: "pointer", fontWeight: 500, fontSize: "0.85rem",
            }}
          >
            <span>{label}</span>
            <span
              style={{
                background: "rgba(0,0,0,0.12)", borderRadius: "6px",
                padding: "1px 7px", fontSize: "0.78rem", fontWeight: 700,
              }}
            >
              {count}
            </span>
          </button>
        ))}
        <button type="button" className="button secondary small" style={{ marginLeft: "auto" }} onClick={reload}>
          {t("Обновить", "Refresh")}
        </button>
      </div>

      {/* Day filter */}
      <div className="row" style={{ gap: "6px", flexWrap: "wrap" }}>
        <button type="button" className={`button small ${filterDay === null ? "primary" : "secondary"}`} onClick={() => setFilterDay(null)}>
          {t("Все дни", "All days")}
        </button>
        {dayNumbers.map((d) => (
          <button key={d} type="button" className={`button small ${filterDay === d ? "primary" : "secondary"}`} onClick={() => setFilterDay(d)}>
            {t("День", "Day")} {d}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="admin-section">
          <div className="admin-empty-state">
            <p className="text-h3">{t("Нет работ", "No submissions")}</p>
            <p className="muted text-body-sm">{t("По выбранным фильтрам ничего нет.", "Nothing matches the selected filters.")}</p>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: "24px" }}>
          {groups.map((group) => (
            <div key={group.dayNumber}>
              {/* Day section header */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div
                  style={{
                    width: "36px", height: "36px", borderRadius: "10px",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: "0.9rem", flexShrink: 0,
                  }}
                >
                  {group.dayNumber}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                    {t("День", "Day")} {group.dayNumber}
                  </h3>
                  <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
                    {group.items.length} {t("работ", "submissions")} ·{" "}
                    {group.items.filter((s) => s.submissionStatus === "approved").length} {t("одобрено", "approved")} ·{" "}
                    {group.items.filter((s) => s.submissionStatus === "rejected").length} {t("отклонено", "rejected")}
                  </p>
                </div>
                <div
                  style={{
                    height: "1px", flex: 1,
                    background: "var(--border)",
                    marginLeft: "4px",
                  }}
                />
              </div>

              <div className="stack" style={{ gap: "8px" }}>
                {group.items.map((sub) => (
                  <SubmissionCard key={sub.submissionId} sub={sub} users={users} adminLang={adminLang} t={t} onReviewed={reload} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function HomeworkReviewPage() {
  const { toast } = useToast();
  const { t, lang: adminLang } = useAdminLang();
  const [tab, setTab] = useState<"queue" | "history">("queue");

  const [queue, setQueue] = useState<Submission[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const reloadQueue = async () => {
    setLoadingQueue(true);
    try {
      const [q, u] = await Promise.all([curatorPending(), adminUsers()]);
      setQueue(q);
      setUsers(u);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка загрузки", "Failed to load"), "error");
    }
    setLoadingQueue(false);
  };

  const reloadHistory = async () => {
    setLoadingHistory(true);
    try {
      const h = await curatorAllSubmissions();
      setHistory(h);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка загрузки истории", "Failed to load history"), "error");
    }
    setLoadingHistory(false);
  };

  useEffect(() => {
    void reloadQueue();
    void reloadHistory();
  }, []);

  return (
    <div className="stack">
      <header className="page-header">
        <h1 className="page-title">{t("Домашние работы", "Homework")}</h1>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid var(--border)", marginBottom: "4px" }}>
        {(["queue", "history"] as const).map((key) => {
          const label = key === "queue"
            ? `${t("Очередь проверки", "Review Queue")}${queue.length > 0 ? ` (${queue.length})` : ""}`
            : t("История работ", "Submission History");
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                padding: "10px 20px",
                background: "none",
                border: "none",
                borderBottom: tab === key ? "2px solid var(--primary)" : "2px solid transparent",
                marginBottom: "-2px",
                fontWeight: tab === key ? 700 : 400,
                color: tab === key ? "var(--primary)" : "var(--muted-foreground)",
                cursor: "pointer",
                fontSize: "0.9rem",
                transition: "color 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "queue" && (
        <ReviewQueue
          queue={queue}
          users={users}
          loading={loadingQueue}
          reload={reloadQueue}
          lang={adminLang}
          t={t}
        />
      )}
      {tab === "history" && (
        <HistoryView
          history={history}
          users={users}
          loading={loadingHistory}
          reload={reloadHistory}
          adminLang={adminLang}
          t={t}
        />
      )}
    </div>
  );
}
