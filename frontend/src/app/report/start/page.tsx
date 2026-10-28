"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeInitialReport } from "@/features/api";
import { Button, InlineAlert, RocketIcon, StandaloneShell, TutorialTip } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

export default function StartReportPage() {
  const router = useRouter();
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const onComplete = async (): Promise<void> => {
    setLoading(true);
    setStatus("");
    try {
      await completeInitialReport();
      router.push(`/dashboard?lang=${lang}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StandaloneShell>
      <div className="text-center section-top">
        <div className="icon-box-md"><RocketIcon /></div>
        <h1 className="text-h1">
          {lang === "ru" ? "Последний шаг" : "One last step"}
        </h1>
        <p className="muted text-body-sm">
          {lang === "ru" ? "Зафиксируй стартовую точку, и маршрут откроется" : "Set your starting point, and the route unlocks"}
        </p>
      </div>

      <TutorialTip
        tipKey="report-unlock"
        title={lang === "ru" ? "Зачем это нужно?" : "Why this step?"}
        message={lang === "ru"
          ? "Заполнение отчёта разблокирует карту курса и ежедневные уроки."
          : "Completing this report unlocks your course map and daily lessons."}
      />

      <div className="content-muted-panel section-top-sm">
        <p className="entity-title">
          {lang === "ru" ? "Что произойдёт:" : "What happens:"}
        </p>
        <ul className="styled-list">
          <li>{lang === "ru" ? "Откроется карта маршрута на 14 дней" : "14-day route map unlocks"}</li>
          <li>{lang === "ru" ? "Появятся ежедневные уроки и задания" : "Daily lessons and assignments appear"}</li>
          <li>{lang === "ru" ? "Начнётся отсчёт прогресса" : "Progress tracking begins"}</li>
        </ul>
      </div>

      <Button onClick={() => void onComplete()} disabled={loading} className="full-width">
        {loading ? "..." : (lang === "ru" ? "Открыть маршрут" : "Unlock route")}
      </Button>

      {status ? <InlineAlert tone="error">{status}</InlineAlert> : null}
    </StandaloneShell>
  );
}
