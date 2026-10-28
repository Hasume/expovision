"use client";

import { useEffect, useState } from "react";
import type { WebinarSpotlight } from "@/features/dashboard/view-model";
import { ButtonLink } from "@/shared/ui/components";

function spotlightStorageKey(spotlight: WebinarSpotlight): string {
  const day = spotlight.startsAtIso.slice(0, 10);
  return `expo-webinar-spotlight-${spotlight.id}-${day}`;
}

export function WebinarSpotlightModal({
  spotlight,
  lang,
  onDismiss,
}: {
  spotlight: WebinarSpotlight;
  lang: "ru" | "en";
  onDismiss: () => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const t = (ru: string, en: string) => (lang === "ru" ? ru : en);
  const sec = Math.max(0, spotlight.secondsUntilStart - tick);
  const countdown = (() => {
    if (spotlight.isLive) return t("Идёт эфир", "Live now");
    if (sec >= 86400) {
      const d = Math.floor(sec / 86400);
      const h = Math.floor((sec % 86400) / 3600);
      return t(`${d} д ${h} ч`, `${d}d ${h}h`);
    }
    if (sec >= 3600) {
      return t(
        `${Math.floor(sec / 3600)} ч ${Math.floor((sec % 3600) / 60)} мин`,
        `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`,
      );
    }
    if (sec >= 60) return t(`${Math.floor(sec / 60)} мин ${sec % 60} с`, `${Math.floor(sec / 60)}m ${sec % 60}s`);
    return t(`${sec} с`, `${sec}s`);
  })();

  const headline = spotlight.isFirstInProgram
    ? t("Первый эфир интенсива", "Your first intensive live session")
    : t("Скоро вебинар", "Webinar coming up");

  return (
    <div className="modal-overlay" role="presentation" onClick={onDismiss}>
      <div
        className="modal-content webinar-spotlight-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="webinar-spotlight-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="webinar-spotlight-hero">
          <p className="webinar-spotlight-kicker">{headline}</p>
          <p id="webinar-spotlight-title" className="webinar-spotlight-title">
            {spotlight.title}
          </p>
          <p className="webinar-spotlight-countdown">{countdown}</p>
        </div>
        <div className="modal-body webinar-spotlight-body">
          {spotlight.summary.trim() ? (
            <p className="webinar-spotlight-summary">{spotlight.summary}</p>
          ) : (
            <p className="muted text-body-sm">
              {t(
                "Подключайся вовремя — менторы Expovision разберут практику и ответят на вопросы.",
                "Join on time — Expovision mentors will cover practice and Q&A.",
              )}
            </p>
          )}
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 20 }}>
            <ButtonLink href={spotlight.joinUrl} className="small">
              {spotlight.isLive ? t("Войти в эфир", "Join live") : t("Ссылка на эфир", "Join link")}
            </ButtonLink>
            <a href={spotlight.calendarUrl} target="_blank" rel="noreferrer" className="link-button secondary small">
              {t("В календарь", "Calendar")}
            </a>
            <button type="button" className="link-button ghost small" onClick={onDismiss}>
              {t("Закрыть", "Close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function readWebinarSpotlightDismissed(spotlight: WebinarSpotlight): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(spotlightStorageKey(spotlight)) === "1";
}

export function writeWebinarSpotlightDismissed(spotlight: WebinarSpotlight): void {
  window.sessionStorage.setItem(spotlightStorageKey(spotlight), "1");
}
