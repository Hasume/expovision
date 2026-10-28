"use client";

import { useEffect, useState } from "react";
import { downloadCertificate, getFinal, getFinalStatus, requestCertificate } from "@/features/api";
import { AppShell, AwardIcon, BackToCourseLink, Badge, Button, Card, ClockIcon, InlineAlert, LockIcon } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

const nextStepActions = {
  ru: [
    { title: "Продолжить обучение", desc: "Углубиться в продвинутые модули Expovision Academy", href: "/library" },
    { title: "Присоединиться к сообществу", desc: "Сообщество выпускников и менторов", href: "/community" },
    { title: "Поделиться результатом", desc: "Расскажи о своём пути и вдохнови других", href: "/community/topics/new" },
  ],
  en: [
    { title: "Continue learning", desc: "Dive into advanced Expovision Academy modules", href: "/library" },
    { title: "Join the community", desc: "Community of alumni and mentors", href: "/community" },
    { title: "Share your result", desc: "Tell your story and inspire others", href: "/community/topics/new" },
  ],
};

export default function FinalPage() {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getFinalStatus>> | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof getFinal>> | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [workEmail, setWorkEmail] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const finalStatus = await getFinalStatus();
        setStatus(finalStatus);
        if (finalStatus.unlocked) {
          const finalData = await getFinal();
          setData(finalData);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  const onDownloadCertificate = async () => {
    setDownloading(true);
    try {
      const blob = await downloadCertificate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "certificate.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const onRequestCertificate = async () => {
    const trimmed = workEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError(lang === "ru" ? "Введите корректный рабочий email" : "Enter a valid work email");
      return;
    }
    setRequesting(true);
    setError("");
    try {
      const next = await requestCertificate(trimmed);
      setStatus(next);
      setShowEmailForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRequesting(false);
    }
  };

  const actions = nextStepActions[lang];
  const outcomeLabel = data?.outcomeType === "roadmap"
    ? (lang === "ru" ? "Карьерный roadmap" : "Career roadmap")
    : data?.outcomeType === "ai_toolkit"
      ? (lang === "ru" ? "AI toolkit" : "AI toolkit")
      : data?.outcomeType === "mvp_case"
        ? (lang === "ru" ? "MVP кейс" : "MVP case")
        : null;

  const requestedAt = status?.certificateRequestedAt ?? null;

  if (status && !status.intensiveEnded) {
    return (
      <AppShell role="student" lang={lang}>
        <div className="stack">
          <BackToCourseLink href={`/dashboard${qs}`} lang={lang} />

          <div className="course-hero text-center">
            <div className="icon-box-md"><LockIcon /></div>
            <h1>{lang === "ru" ? "Финальный раздел ещё не открыт" : "Final section is not open yet"}</h1>
            <p className="muted text-body-sm">
              {lang === "ru"
                ? "После завершения интенсива здесь появятся итоги и сертификат. Пока сфокусируйся на программе и домашних заданиях."
                : "After the intensive ends, your wrap-up and certificate will appear here. For now, focus on the programme and homework."}
            </p>
          </div>

          <Card>
            <div className="stack stack-tight">
              <div className="row">
                <Badge tone={status.intensiveEnded ? "success" : "neutral"}>
                  {status.intensiveEnded ? "✓" : "○"}
                </Badge>
                <span>{lang === "ru" ? "Интенсив завершён" : "Intensive completed"}</span>
              </div>
              <div className="row">
                <Badge tone={status.allHomeworkApproved ? "success" : "neutral"}>
                  {status.allHomeworkApproved ? "✓" : "○"}
                </Badge>
                <span>{lang === "ru" ? "Все домашние задания одобрены" : "All homework approved"}</span>
              </div>
              <div className="row">
                <Badge tone={status.cardConfirmed ? "success" : "neutral"}>
                  {status.cardConfirmed ? "✓" : "○"}
                </Badge>
                <span>{lang === "ru" ? "Карточка подтверждена администратором" : "Card confirmed by admin"}</span>
              </div>
              <div className="row">
                <Badge tone={status.certificatePdfUrl ? "success" : "neutral"}>
                  {status.certificatePdfUrl ? "✓" : "○"}
                </Badge>
                <span>{lang === "ru" ? "Сертификат загружен администратором" : "Certificate uploaded by admin"}</span>
              </div>
            </div>
          </Card>

          <InlineAlert tone="warning">
            {lang === "ru"
              ? "Раздел «Финал» откроется, когда закончится интенсив по расписанию."
              : "The Final section unlocks when your intensive has ended on schedule."}
          </InlineAlert>

          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        </div>
      </AppShell>
    );
  }

  if (status && status.intensiveEnded && !status.unlocked) {
    const hasPdf = !!status.certificatePdfUrl;
    return (
      <AppShell role="student" lang={lang}>
        <div className="stack">
          <BackToCourseLink href={`/dashboard${qs}`} lang={lang} />

          <div className="course-hero text-center">
            <div className="icon-box-md"><ClockIcon /></div>
            <h1>{lang === "ru" ? "Финал: сертификат и итоги" : "Final: certificate & wrap-up"}</h1>
            <p className="muted text-body-sm">
              {lang === "ru"
                ? "Интенсив завершён. Здесь статус сертификата; после выдачи откроется полная страница выпуска."
                : "Your intensive is over. This is your certificate status; the full graduation page opens once it is issued."}
            </p>
          </div>

          <Card>
            <h3 className="card-title">{lang === "ru" ? "Сертификат" : "Certificate"}</h3>
            {hasPdf ? (
              <div className="stack stack-tight">
                <p className="no-margin text-body-sm">
                  {lang === "ru"
                    ? "PDF сформирован. Ожидаем финальное открытие раздела командой (проверка домашних заданий и карты)."
                    : "Your PDF is ready. We are finalizing access (homework and card checks by the team)."}
                </p>
                <Badge tone="warning">{lang === "ru" ? "Ожидаем выдачу" : "Awaiting release"}</Badge>
              </div>
            ) : (
              <div className="stack stack-tight">
                {status?.certificateRejectedAt && !requestedAt && (
                  <div style={{ background: "var(--danger-bg, #fff1f0)", border: "1px solid var(--danger, #d32f2f)", borderRadius: 6, padding: "10px 12px" }}>
                    <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: "0.85rem", color: "var(--danger, #d32f2f)" }}>
                      {lang === "ru" ? "Заявка отклонена" : "Request declined"}
                    </p>
                    {status.certificateRejectionComment && (
                      <p style={{ margin: 0, fontSize: "0.82rem" }}>{status.certificateRejectionComment}</p>
                    )}
                    <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--text-muted, #888)" }}>
                      {lang === "ru" ? "Вы можете подать заявку повторно." : "You can submit a new request."}
                    </p>
                  </div>
                )}
                <p className="no-margin text-body-sm">
                  {lang === "ru"
                    ? "Сертификат ещё не загружен. Нажми «Запросить сертификат», чтобы команда увидела твою заявку."
                    : "No certificate file yet. Tap “Request certificate” so the team can see your request."}
                </p>
                {requestedAt ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Badge tone="primary">
                      {lang === "ru" ? "Запрос отправлен" : "Request sent"}
                    </Badge>
                    {status?.workEmail && (
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted, #888)" }}>
                        {lang === "ru" ? `Email для доставки: ${status.workEmail}` : `Delivery email: ${status.workEmail}`}
                      </p>
                    )}
                  </div>
                ) : showEmailForm ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {lang === "ru" ? "Рабочий email для доставки сертификата" : "Work email for certificate delivery"}
                      <span style={{ color: "#d32f2f", marginLeft: 2 }}>*</span>
                    </label>
                    <input
                      type="email"
                      autoFocus
                      placeholder={lang === "ru" ? "work@company.com" : "work@company.com"}
                      value={workEmail}
                      onChange={(e) => setWorkEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onRequestCertificate(); } }}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        fontSize: "0.88rem",
                        border: "1px solid var(--border, #e0e0e0)",
                        borderRadius: 4,
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                      disabled={requesting}
                      required
                    />
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted, #888)" }}>
                      {lang === "ru"
                        ? "На этот адрес придёт письмо с сертификатом. Укажите корпоративный или рабочий email."
                        : "The certificate letter will be sent to this address. Use a corporate or work email."}
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        onClick={() => void onRequestCertificate()}
                        disabled={requesting || !workEmail.trim().includes("@")}
                        tone="primary"
                      >
                        {requesting ? "…" : (lang === "ru" ? "Отправить заявку" : "Submit request")}
                      </Button>
                      <Button
                        onClick={() => { setShowEmailForm(false); setError(""); }}
                        disabled={requesting}
                      >
                        {lang === "ru" ? "Отмена" : "Cancel"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => setShowEmailForm(true)} tone="primary">
                    {lang === "ru" ? "Запросить сертификат" : "Request certificate"}
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="card-title">{lang === "ru" ? "Условия для полного доступа" : "Requirements for full access"}</h3>
            <div className="stack stack-tight">
              <div className="row">
                <Badge tone="success">✓</Badge>
                <span>{lang === "ru" ? "Интенсив завершён" : "Intensive completed"}</span>
              </div>
              <div className="row">
                <Badge tone={status.allHomeworkApproved ? "success" : "neutral"}>
                  {status.allHomeworkApproved ? "✓" : "○"}
                </Badge>
                <span>{lang === "ru" ? "Все домашние задания одобрены" : "All homework approved"}</span>
              </div>
              <div className="row">
                <Badge tone={status.cardConfirmed ? "success" : "neutral"}>
                  {status.cardConfirmed ? "✓" : "○"}
                </Badge>
                <span>{lang === "ru" ? "Карточка подтверждена" : "Card confirmed"}</span>
              </div>
              <div className="row">
                <Badge tone={hasPdf ? "success" : "neutral"}>{hasPdf ? "✓" : "○"}</Badge>
                <span>{lang === "ru" ? "PDF сертификата" : "Certificate PDF"}</span>
              </div>
            </div>
          </Card>

          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role="student" lang={lang}>
      <div className="stack">
        <BackToCourseLink href={`/dashboard${qs}`} lang={lang} />

        <div className="course-hero text-center">
          <div className="icon-box-md"><AwardIcon /></div>
          <h1>{lang === "ru" ? "Маршрут завершён!" : "Route Completed!"}</h1>
          <p className="muted text-body-sm">
            {lang === "ru"
              ? "Поздравляем! Ты прошёл 14-дневный маршрут. Теперь у тебя есть структурированный результат и план следующего шага."
              : "Congratulations! You completed the 14-day route. You now have a structured result and a clear next step."}
          </p>
          {outcomeLabel ? <div className="section-top-sm"><Badge tone="success">{lang === "ru" ? `Результат: ${outcomeLabel}` : `Outcome: ${outcomeLabel}`}</Badge></div> : null}
        </div>

        <Card>
          <div className="text-center">
            <div className="icon-box-sm"><AwardIcon /></div>
            <p className="text-caption-strong">
              {lang === "ru" ? "Сертификат" : "Certificate"}
            </p>
            <p className="text-h2">
              {lang === "ru" ? "14-дневный маршрут в IT/AI" : "14-Day IT/AI Route"}
            </p>
            <p className="muted text-body-sm">
              {data?.studentName ? (lang === "ru" ? `Выдан: ${data.studentName}` : `Issued to: ${data.studentName}`) : ""}
            </p>
            <Badge tone="primary">Expovision AI Academy</Badge>
            {data?.certificatePdfUrl ? (
              <div className="section-top-sm">
                <Button onClick={() => void onDownloadCertificate()} disabled={downloading}>
                  {downloading
                    ? (lang === "ru" ? "Загрузка..." : "Downloading...")
                    : (lang === "ru" ? "Скачать сертификат (PDF)" : "Download Certificate (PDF)")}
                </Button>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <h3 className="card-title">{lang === "ru" ? "Достижения" : "Achievements"}</h3>
          {(data?.achievements ?? []).length > 0 ? (
            <ul className="styled-list">
              {data?.achievements.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : <p className="muted no-margin">{lang === "ru" ? "Загрузка..." : "Loading..."}</p>}
        </Card>

        <Card>
          <h3 className="card-title">{lang === "ru" ? "Итоговый результат" : "Final Result"}</h3>
          <p className="no-margin text-body-sm">
            {data?.outcomeType === "roadmap"
              ? (lang === "ru" ? "Готовый roadmap профессии в IT с конкретным планом развития навыков и входа в индустрию." : "Complete IT career roadmap with a concrete skill development and industry entry plan.")
              : data?.outcomeType === "ai_toolkit"
                ? (lang === "ru" ? "Собранный набор AI-инструментов и сценариев, адаптированных под твои рабочие задачи." : "Curated set of AI tools and scenarios adapted to your work tasks.")
                : (lang === "ru" ? "Работающий MVP-продукт или портфолио-кейс, готовый к демонстрации." : "Working MVP product or portfolio case ready for demonstration.")}
          </p>
        </Card>

        <div>
          <h3 className="text-h3">
            {lang === "ru" ? "Следующие шаги" : "Next Steps"}
          </h3>
          <div className="stack stack-tight">
            {actions.map((action, i) => (
              <Card key={i}>
                <div className="stack stack-tight">
                  <div className="row items-start">
                  <div className="step-badge">{i + 1}</div>
                  <div>
                    <p className="entity-title">{action.title}</p>
                    <p className="muted entity-subtitle">{action.desc}</p>
                  </div>
                  </div>
                  <a href={action.href} className="link-button secondary small">
                    {lang === "ru" ? "Открыть" : "Open"}
                  </a>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      </div>
    </AppShell>
  );
}
