"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  adminStudentProfile,
  adminSetUserRole,
  adminResetUserPassword,
  adminUploadCertificate,
  adminConfirmCard,
  adminUnlockFinal,
  adminRejectCertificateRequest,
  type AdminStudentProfile,
  type UserRole,
} from "@/features/api";
import { Badge } from "@/shared/ui/components";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

const ROLES: UserRole[] = ["student", "admin"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function StudentProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const { toast } = useToast();
  const { t } = useAdminLang();

  const HW_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
    approved: { tone: "success", label: t("Одобрено", "Approved") },
    pending_review: { tone: "warning", label: t("Ожидает", "Pending") },
    rejected: { tone: "danger", label: t("Отклонено", "Rejected") },
    overdue: { tone: "danger", label: t("Просрочено", "Overdue") },
  };

  const [profile, setProfile] = useState<AdminStudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [certFile, setCertFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [newPasswordDisplay, setNewPasswordDisplay] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const load = async () => {
    try { setProfile(await adminStudentProfile(userId)); } catch (e) { setError(e instanceof Error ? e.message : t("Ошибка загрузки профиля", "Failed to load profile")); }
    setLoading(false);
  };

  useEffect(() => { void load(); setNewPasswordDisplay(null); }, [userId]);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); setProfile(await adminStudentProfile(userId)); } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Action failed"), "error"); }
    setBusy(false);
  };

  const onChangeRole = (role: UserRole) => wrap(async () => { await adminSetUserRole(userId, role); toast(t(`Роль изменена на ${role}`, `Role changed to ${role}`)); });
  const onUploadCert = () => wrap(async () => { if (!certFile) return; await adminUploadCertificate(userId, certFile); setCertFile(null); if (fileRef.current) fileRef.current.value = ""; toast(t("Сертификат загружен", "Certificate uploaded")); });
  const onToggleCard = () => wrap(async () => { if (!profile) return; const next = !profile.certificate.cardConfirmed; await adminConfirmCard(userId, next); toast(next ? t("Карта подтверждена", "Card confirmed") : t("Подтверждение отменено", "Card confirmation revoked")); });
  const onUnlockFinal = () => wrap(async () => { await adminUnlockFinal(userId); toast(t("Финал разблокирован!", "Final unlocked!")); });
  const onRejectCertificate = () => wrap(async () => {
    await adminRejectCertificateRequest(userId, rejectComment);
    setRejectComment("");
    setShowRejectForm(false);
    toast(t("Заявка отклонена", "Request rejected"), "success");
  });
  const onRegeneratePassword = () => {
    if (
      !window.confirm(
        t(
          "Сгенерировать новый пароль? Текущие сессии пользователя на всех устройствах будут завершены.",
          "Generate a new password? This will sign the user out everywhere."
        )
      )
    ) {
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const r = await adminResetUserPassword(userId);
        setNewPasswordDisplay(r.newPassword);
        toast(
          t("Пароль обновлён. Передайте его пользователю по безопасному каналу.", "Password updated. Send it to the user through a secure channel."),
          "success"
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : t("Ошибка", "Action failed"), "error");
      } finally {
        setBusy(false);
      }
    })();
  };

  const toggleDay = (day: number) => setExpandedDays((prev) => { const next = new Set(prev); if (next.has(day)) next.delete(day); else next.add(day); return next; });

  if (loading) return <div className="stack" style={{ padding: "40px 0" }}><p className="muted">{t("Загрузка профиля...", "Loading profile...")}</p></div>;
  if (error || !profile) return (
    <div className="stack" style={{ padding: "40px 0" }}>
      <Link href="/admin/students" className="link-button ghost small">&larr; {t("К списку студентов", "Back to students")}</Link>
      <p className="alert error">{error || t("Профиль не найден", "Profile not found")}</p>
    </div>
  );

  const { user, stats, days, certificate } = profile;
  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const canUnlockFinal = certificate.hasCertificatePdf && certificate.cardConfirmed && stats.approvedHomework >= stats.totalHomework && stats.totalHomework > 0;

  return (
    <div className="stack">
      <Link href="/admin/students" className="link-button ghost small">&larr; {t("К списку студентов", "Back to students")}</Link>

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>{fullName}</h1>
          <p className="muted" style={{ marginTop: 2 }}>{user.email}</p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {ROLES.map((r) => (
            <button key={r} type="button" className={`button small ${user.role === r ? "primary" : "secondary"}`} disabled={busy} onClick={() => onChangeRole(r)}>{r}</button>
          ))}
        </div>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {user.selectedTrack ? <Badge tone="primary">{t("Трек", "Track")} {user.selectedTrack}</Badge> : <Badge tone="neutral">{t("Нет трека", "No track")}</Badge>}
        <Badge tone="neutral">{user.language.toUpperCase()}</Badge>
        <Badge tone={user.reportCompleted ? "success" : "neutral"}>{user.reportCompleted ? t("Отчёт готов", "Report done") : t("Нет отчёта", "No report")}</Badge>
        <Badge tone={user.onboardingDone ? "success" : "neutral"}>{user.onboardingDone ? t("Онбординг пройден", "Onboarding done") : t("Нет онбординга", "No onboarding")}</Badge>
        {user.onboardingProfile && <Badge tone="neutral">{user.onboardingProfile}</Badge>}
        {user.recommendedTrack && <Badge tone="neutral">{t("Рек.", "Rec")}: {user.recommendedTrack}</Badge>}
        <Badge tone="neutral">{t("Старт", "Started")}: {fmtDate(user.startedAt)}</Badge>
        <Badge tone="neutral">{t("Регистрация", "Joined")}: {fmtDate(user.createdAt)}</Badge>
      </div>

      <section style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
        <h2 className="text-h2" style={{ margin: "0 0 8px" }}>{t("Пароль", "Password")}</h2>
        <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
          {t(
            "Если пользователь забыл пароль, сгенерируйте новый и передайте ему. Старый пароль перестанет работать, активные сессии будут сброшены.",
            "If the user forgot their password, generate a new one and share it. The old password will stop working and all active sessions will end."
          )}
        </p>
        <button type="button" className="button secondary small" disabled={busy} onClick={onRegeneratePassword}>
          {t("Сгенерировать новый пароль", "Generate new password")}
        </button>
        {newPasswordDisplay ? (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 12, margin: 0, fontWeight: 600 }}>{t("Новый пароль (показан один раз):", "New password (shown once):")}</p>
            <code
              style={{
                display: "block",
                padding: "10px 12px",
                background: "var(--surface-elevated, rgba(0,0,0,0.04))",
                borderRadius: 6,
                fontSize: 14,
                wordBreak: "break-all",
              }}
            >
              {newPasswordDisplay}
            </code>
            <button
              type="button"
              className="button small primary"
              onClick={() => {
                void navigator.clipboard.writeText(newPasswordDisplay).then(
                  () => toast(t("Скопировано", "Copied"), "success"),
                  () => toast(t("Не удалось скопировать", "Copy failed"), "error")
                );
              }}
            >
              {t("Копировать", "Copy")}
            </button>
          </div>
        ) : null}
      </section>

      <div className="kpi-grid">
        <article className="kpi"><p className="kpi-label">{t("ПРОГРЕСС", "PROGRESS")}</p><p className="kpi-value">{stats.progressPercent}%</p></article>
        <article className="kpi"><p className="kpi-label">{t("УРОКИ", "LESSONS")}</p><p className="kpi-value">{stats.completedLessons}/{stats.totalLessons}</p></article>
        <article className="kpi"><p className="kpi-label">{t("ОДОБРЕНО", "APPROVED")}</p><p className="kpi-value" style={{ color: "var(--success)" }}>{stats.approvedHomework}</p></article>
        <article className="kpi"><p className="kpi-label">{t("ОЖИДАЕТ", "PENDING")}</p><p className="kpi-value" style={{ color: "var(--warning)" }}>{stats.pendingHomework}</p></article>
        <article className="kpi"><p className="kpi-label">{t("ОТКЛОНЕНО", "REJECTED")}</p><p className="kpi-value" style={{ color: "var(--danger)" }}>{stats.rejectedHomework}</p></article>
        <article className="kpi"><p className="kpi-label">{t("ПРОСРОЧЕНО", "OVERDUE")}</p><p className="kpi-value" style={{ color: "var(--danger)" }}>{stats.overdueHomework}</p></article>
      </div>

      <section>
        <h2 className="text-h2">{t("Прогресс по дням", "Day-by-day progress")}</h2>
        <div className="stack stack-tight" style={{ marginTop: 8 }}>
          {days.length === 0 ? (
            <p className="muted">{t("Нет данных по дням.", "No day data yet.")}</p>
          ) : days.map((day) => {
            const completedCount = day.lessons.filter((l) => l.completed).length;
            const allDone = day.lessons.length > 0 && completedCount === day.lessons.length;
            const hwCfg = day.homework ? HW_BADGE[day.homework.status] : null;
            const isOpen = expandedDays.has(day.dayNumber);
            return (
              <div key={day.dayNumber} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                <button type="button" onClick={() => toggleDay(day.dayNumber)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", font: "inherit", color: "inherit" }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 700 }}>{t("День", "Day")} {day.dayNumber}</span>
                    {day.track && <Badge tone="neutral">{day.track}</Badge>}
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge tone={allDone ? "success" : completedCount > 0 ? "warning" : "neutral"}>
                      {t("Уроки", "Lessons")}: {completedCount}/{day.lessons.length}
                    </Badge>
                    {hwCfg ? <Badge tone={hwCfg.tone}>{t("ДЗ", "HW")}: {hwCfg.label}</Badge> : <Badge tone="neutral">{t("ДЗ", "HW")}: {t("нет", "none")}</Badge>}
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{isOpen ? "▲" : "▼"}</span>
                  </span>
                </button>
                {isOpen && (
                  <div style={{ padding: "0 16px 14px" }}>
                    {day.lessons.map((lesson) => (
                      <div key={lesson.lessonId} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
                        <span className={`status-dot ${lesson.completed ? "online" : "neutral"}`} />
                        <span style={{ fontSize: 13 }}>{lesson.title}</span>
                        {lesson.kind === "optional" && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>({t("доп.", "opt.")})</span>}
                      </div>
                    ))}
                    {day.homework && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                        {day.homework.submittedAt && <span>{t("Отправлено", "Submitted")}: {fmtDateTime(day.homework.submittedAt)} · </span>}
                        {day.homework.dueAt && <span>{t("Срок", "Due")}: {fmtDateTime(day.homework.dueAt)} · </span>}
                        {day.homework.reviewedAt && <span>{t("Проверено", "Reviewed")}: {fmtDateTime(day.homework.reviewedAt)} · </span>}
                        {day.homework.reviewComment && <span>{t("Комментарий", "Comment")}: {day.homework.reviewComment} · </span>}
                        {day.homework.aiIntegrityRiskScore != null && <span>{t("AI риск", "AI risk")}: {day.homework.aiIntegrityRiskScore}%</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-h2">{t("Сертификат и финал", "Certificate & Final")}</h2>

        {certificate.certificateRejectedAt && !certificate.certificateRequestedAt && (
          <div style={{ background: "var(--danger-bg, #fff1f0)", border: "1px solid var(--danger, #d32f2f)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600, color: "var(--danger, #d32f2f)", fontSize: "0.88rem" }}>
              {t("Заявка отклонена", "Request rejected")} — {fmtDateTime(certificate.certificateRejectedAt)}
            </p>
            {certificate.certificateRejectionComment && (
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                <strong>{t("Комментарий", "Comment")}:</strong> {certificate.certificateRejectionComment}
              </p>
            )}
          </div>
        )}

        {certificate.certificateRequestedAt ? (
          <div style={{ background: "var(--warning-bg, #fffde7)", border: "1px solid var(--warning, #f9a825)", borderRadius: 8, padding: "10px 14px", marginBottom: 10 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: "0.88rem" }}>
              {t("Заявка на сертификат", "Certificate request")}: {fmtDateTime(certificate.certificateRequestedAt)}
            </p>
            {!showRejectForm ? (
              <button
                type="button"
                className="button danger small"
                disabled={busy}
                onClick={() => setShowRejectForm(true)}
              >
                {t("Отклонить заявку", "Reject request")}
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                  {t("Причина (видна ученику)", "Reason (visible to student)")}
                </label>
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder={t("Укажите причину отклонения…", "Explain why the request is declined…")}
                  rows={3}
                  style={{ width: "100%", padding: "8px 10px", fontSize: "0.85rem", borderRadius: 4, border: "1px solid var(--border)", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }}
                  disabled={busy}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="button danger small" disabled={busy} onClick={() => void onRejectCertificate()}>
                    {busy ? "…" : t("Отклонить", "Reject")}
                  </button>
                  <button type="button" className="button secondary small" disabled={busy} onClick={() => { setShowRejectForm(false); setRejectComment(""); }}>
                    {t("Отмена", "Cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Badge tone={certificate.hasCertificatePdf ? "success" : "neutral"}>{certificate.hasCertificatePdf ? "✓" : "○"} {t("PDF загружен", "PDF uploaded")}</Badge>
          <Badge tone={certificate.cardConfirmed ? "success" : "neutral"}>{certificate.cardConfirmed ? "✓" : "○"} {t("Карта подтверждена", "Card confirmed")}</Badge>
          <Badge tone={certificate.finalUnlocked ? "success" : "neutral"}>{certificate.finalUnlocked ? "✓" : "○"} {t("Финал открыт", "Final unlocked")}</Badge>
        </div>

        <div className="stack stack-tight" style={{ marginTop: 12 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>{t("Шаг 1. Загрузить PDF-сертификат", "Step 1. Upload PDF certificate")}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input ref={fileRef} type="file" accept=".pdf" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} style={{ flex: 1 }} />
              <button type="button" className="button primary small" disabled={!certFile || busy} onClick={() => void onUploadCert()}>{t("Загрузить", "Upload")}</button>
            </div>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>{t("Шаг 2. Подтвердить доставку карты", "Step 2. Confirm card delivery")}</p>
            <button type="button" className={`button small ${certificate.cardConfirmed ? "secondary" : "primary"}`} disabled={busy} onClick={() => void onToggleCard()}>
              {certificate.cardConfirmed ? t("Отменить подтверждение", "Revoke confirmation") : t("Подтвердить карту", "Confirm card")}
            </button>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>{t("Шаг 3. Разблокировать финальный раздел", "Step 3. Unlock final section")}</p>
            {certificate.finalUnlocked ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge tone="success">{t("Разблокировано", "Unlocked")}</Badge>
                {certificate.unlockedAt && <span className="muted" style={{ fontSize: 12 }}>{fmtDateTime(certificate.unlockedAt)}</span>}
              </div>
            ) : (
              <>
                <button type="button" className="button primary small" disabled={!canUnlockFinal || busy} onClick={() => void onUnlockFinal()}>{t("Разблокировать финал", "Unlock final")}</button>
                {!canUnlockFinal && (
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    {!certificate.hasCertificatePdf && `← ${t("Сначала загрузите PDF.", "Upload PDF first.")} `}
                    {!certificate.cardConfirmed && `← ${t("Подтвердите карту.", "Confirm card.")} `}
                    {stats.approvedHomework < stats.totalHomework && `← ${t("Не все ДЗ одобрены.", "Not all homework approved.")}`}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
