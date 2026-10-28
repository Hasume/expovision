"use client";

import { useEffect, useState } from "react";
import { getDashboard, me, selectTrack } from "@/features/api";
import type { TrackCode } from "@/features/api";
import { AppShell, BackToCourseLink, Badge, Button, ButtonLink, Card, CheckIcon, CompassIcon, CpuIcon, InlineAlert, RocketIcon, TutorialTip } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

const tracks = [
  { code: "A" as TrackCode, title: { ru: "IT-профессии", en: "IT Careers" }, desc: { ru: "Roadmap профессии - понять, куда расти и какие навыки прокачивать", en: "Career roadmap - understand where to grow and which skills to build" }, who: { ru: "Для тех, кто хочет найти свой путь в IT", en: "For those who want to find their path in IT" }, outcome: { ru: "Карта профессии + план входа", en: "Career map + entry plan" }, iconClass: "a" },
  { code: "B" as TrackCode, title: { ru: "AI-система", en: "AI System" }, desc: { ru: "Набор AI-инструментов под твои задачи - от промптов до автоматизации", en: "AI toolkit for your tasks - from prompts to automation" }, who: { ru: "Для тех, кто хочет внедрить AI в свою работу", en: "For those who want to apply AI at work" }, outcome: { ru: "AI-toolkit для работы", en: "AI toolkit for work" }, iconClass: "b" },
  { code: "C" as TrackCode, title: { ru: "Первый продукт / Vibe Coding", en: "First Product / Vibe Coding" }, desc: { ru: "От идеи до работающего MVP - через Vibe Coding и no-code инструменты", en: "From idea to working MVP - through Vibe Coding and no-code tools" }, who: { ru: "Для тех, кто хочет создать свой продукт", en: "For those who want to build their own product" }, outcome: { ru: "MVP + портфолио-кейс", en: "MVP + portfolio case" }, iconClass: "c" },
] as const;

const trackIcons: Record<string, React.FC> = { A: CompassIcon, B: CpuIcon, C: RocketIcon };

export default function SplitPage() {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;
  const [status, setStatus] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<TrackCode | null>(null);
  const [splitAvailable, setSplitAvailable] = useState(false);
  const [intensiveEnded, setIntensiveEnded] = useState(false);
  const [recommendedTrack, setRecommendedTrack] = useState<TrackCode | null>(null);
  const canPickTrack = splitAvailable || intensiveEnded;
  const isErrorStatus = /fail|error|ошиб|не удалось|invalid|denied|forbidden|unauthorized/i.test(status);

  useEffect(() => {
    void (async () => {
      try {
        const [d, user] = await Promise.all([getDashboard(), me()]);
        setSelectedTrack(d.trackSelected);
        setSplitAvailable(d.splitAvailable);
        setIntensiveEnded(Boolean(d.intensiveEnded));
        setRecommendedTrack(user.recommendedTrack);
      } catch { /* */ }
    })();
  }, []);

  const [trackJustSelected, setTrackJustSelected] = useState(false);

  const onSelect = async (track: TrackCode): Promise<void> => {
    try {
      await selectTrack(track);
      setSelectedTrack(track);
      setTrackJustSelected(true);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <AppShell role="student" lang={lang}>
      <div className="stack">
        <BackToCourseLink href={`/dashboard${qs}`} lang={lang} />

        <header className="page-header">
          <h1 className="page-title">{lang === "ru" ? "Выбери свой маршрут" : "Choose Your Route"}</h1>
          <p className="page-subtitle">{lang === "ru" ? "Дни 8–14 пойдут по выбранному направлению" : "Days 8–14 follow your chosen direction"}</p>
        </header>

        {/* Current track status — shows when already selected */}
        {selectedTrack && !trackJustSelected ? (
          <div className="next-day-card next-day-card--elevated">
            <div className="next-day-card-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="next-day-card-body">
              <p className="next-day-card-kicker">
                {lang === "ru" ? `Текущий трек: ${selectedTrack}` : `Current track: ${selectedTrack}`}
              </p>
              <p className="next-day-card-title">
                {lang === "ru"
                  ? "Можно сменить трек в любое время — новый контент откроется сразу."
                  : "You can switch tracks any time — new content unlocks immediately."}
              </p>
            </div>
          </div>
        ) : null}

        {!canPickTrack ? (
          <div className="next-day-card next-day-card--elevated">
            <div className="next-day-card-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div className="next-day-card-body">
              <p className="next-day-card-kicker">
                {lang === "ru" ? "Ещё не время" : "Not yet"}
              </p>
              <p className="next-day-card-title">
                {lang === "ru" ? "Выбор трека откроется на 7 день программы." : "Track selection unlocks on day 7 of the programme."}
              </p>
            </div>
          </div>
        ) : null}

        {/* Recommendation block */}
        {recommendedTrack && !selectedTrack ? (
          <Card>
            <div className="stack stack-tight">
              <div className="row items-start">
              <div className="step-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="lock-icon"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
              </div>
              <div>
                <p className="muted text-caption-strong no-margin">
                  {lang === "ru" ? "Твоя рекомендация" : "Your recommendation"}
                </p>
                <p className="entity-title">
                  {lang === "ru" ? `Трек ${recommendedTrack}` : `Track ${recommendedTrack}`}
                  {" - "}
                  {tracks.find((t) => t.code === recommendedTrack)?.title[lang] ?? ""}
                </p>
              </div>
              </div>
              <Button onClick={() => void onSelect(recommendedTrack)} disabled={!canPickTrack} className="small">
                {lang === "ru" ? `Иду по треку ${recommendedTrack}` : `Go with Track ${recommendedTrack}`}
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="stack">
          {tracks.map((track) => {
            const Icon = trackIcons[track.code] ?? CompassIcon;
            return (
              <div key={track.code} className="card">
                <div className="track-card">
                  <div className={`track-icon ${track.iconClass}`}><Icon /></div>
                  <div className="stack stack-tight">
                    <h3 className="text-h3">
                      {lang === "ru" ? `Трек ${track.code}: ${track.title.ru}` : `Track ${track.code}: ${track.title.en}`}
                    </h3>
                    <p className="muted entity-subtitle">{track.who[lang]}</p>
                    <p className="muted text-body-sm">{track.desc[lang]}</p>
                    <div className="flow-actions">
                      <Badge tone="neutral">{lang === "ru" ? `Результат: ${track.outcome.ru}` : `Outcome: ${track.outcome.en}`}</Badge>
                      <Button
                        onClick={() => void onSelect(track.code)}
                        disabled={!canPickTrack}
                        tone={selectedTrack === track.code ? "primary" : "secondary"}
                        className="small"
                      >
                        {selectedTrack === track.code ? (
                          <span className="row row-tight">
                            <CheckIcon /> {lang === "ru" ? "Выбран" : "Selected"}
                          </span>
                        ) : selectedTrack ? (
                          lang === "ru" ? "Сменить на этот" : "Switch to this"
                        ) : (lang === "ru" ? "Выбрать" : "Select")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {status ? <InlineAlert tone={isErrorStatus ? "error" : "success"}>{status}</InlineAlert> : null}

        {/* Success state — shown after track selection */}
        {trackJustSelected && selectedTrack ? (
          <div className="next-day-card next-day-card--elevated">
            <div className="next-day-card-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="next-day-card-body">
              <p className="next-day-card-kicker">
                {lang === "ru" ? `Трек ${selectedTrack} выбран` : `Track ${selectedTrack} selected`}
              </p>
              <p className="next-day-card-title">
                {lang === "ru"
                  ? "Дни 8–14 теперь открыты по твоему направлению."
                  : "Days 8–14 are now open for your direction."}
              </p>
            </div>
            <ButtonLink href={`/lessons${qs}`}>
              {lang === "ru" ? "К урокам →" : "Go to lessons →"}
            </ButtonLink>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
