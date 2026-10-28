"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { submitOnboarding, completeInitialReport } from "@/features/api";
import type { TrackCode } from "@/features/api";
import { Button, InlineAlert, ProgressBar, StandaloneShell, TutorialTip } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

type Answers = {
  level: "newbie" | "chatgpt_tried" | "coded_before" | "";
  interest: "it_professions" | "ai_in_work" | "build_product" | "";
  dailyTime: "30m" | "1h" | "2h_plus" | "";
  goal: "understand_market" | "build_ai_scenarios" | "build_mvp" | "";
  experience: "chatgpt" | "figma" | "coding" | "none" | "";
};

const steps = [
  { key: "level", question: { ru: "Какой у тебя уровень?", en: "What's your level?" }, options: [
    { value: "newbie", label: { ru: "Полный новичок", en: "Complete beginner" }, desc: { ru: "Никогда не работал с IT/AI", en: "Never worked with IT/AI" } },
    { value: "chatgpt_tried", label: { ru: "Пробовал ChatGPT", en: "Tried ChatGPT" }, desc: { ru: "Использовал AI-инструменты", en: "Used AI tools before" } },
    { value: "coded_before", label: { ru: "Работал с кодом", en: "Worked with code" }, desc: { ru: "Есть опыт программирования", en: "Have programming experience" } }
  ] as const },
  { key: "interest", question: { ru: "Что тебе интереснее всего?", en: "What interests you most?" }, options: [
    { value: "it_professions", label: { ru: "IT-профессии", en: "IT careers" }, desc: { ru: "Хочу понять, куда идти", en: "Want to find my direction" } },
    { value: "ai_in_work", label: { ru: "AI в работе", en: "AI at work" }, desc: { ru: "Внедрить AI в свои задачи", en: "Apply AI to my tasks" } },
    { value: "build_product", label: { ru: "Собрать продукт", en: "Build a product" }, desc: { ru: "От идеи до MVP", en: "From idea to MVP" } }
  ] as const },
  { key: "dailyTime", question: { ru: "Сколько времени в день?", en: "How much time per day?" }, options: [
    { value: "30m", label: { ru: "30 минут", en: "30 minutes" }, desc: { ru: "Минимальный фокус", en: "Minimal focus" } },
    { value: "1h", label: { ru: "1 час", en: "1 hour" }, desc: { ru: "Оптимальный темп", en: "Optimal pace" } },
    { value: "2h_plus", label: { ru: "2+ часа", en: "2+ hours" }, desc: { ru: "Максимальный результат", en: "Maximum outcome" } }
  ] as const },
  { key: "goal", question: { ru: "Цель через 14 дней?", en: "Your goal in 14 days?" }, options: [
    { value: "understand_market", label: { ru: "Понять рынок", en: "Understand the market" }, desc: { ru: "Карта профессий и навыков", en: "Map of careers and skills" } },
    { value: "build_ai_scenarios", label: { ru: "AI-сценарии", en: "AI scenarios" }, desc: { ru: "Набор готовых решений", en: "Set of ready solutions" } },
    { value: "build_mvp", label: { ru: "Сделать MVP", en: "Build MVP" }, desc: { ru: "Работающий прототип", en: "Working prototype" } }
  ] as const },
  { key: "experience", question: { ru: "Что уже пробовал?", en: "What have you tried?" }, options: [
    { value: "chatgpt", label: { ru: "ChatGPT", en: "ChatGPT" }, desc: { ru: "Генерация текста и идей", en: "Text and idea generation" } },
    { value: "figma", label: { ru: "Figma", en: "Figma" }, desc: { ru: "Дизайн и прототипы", en: "Design and prototypes" } },
    { value: "coding", label: { ru: "Кодинг", en: "Coding" }, desc: { ru: "Написание кода", en: "Writing code" } },
    { value: "none", label: { ru: "Ничего из этого", en: "None of these" }, desc: { ru: "Начинаю с нуля", en: "Starting from scratch" } }
  ] as const }
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({ level: "", interest: "", dailyTime: "", goal: "", experience: "" });
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const current = steps[index] ?? steps[0];
  const totalSteps = steps.length;
  const progress = useMemo(() => Math.round(((index + 1) / totalSteps) * 100), [index, totalSteps]);

  const submitAnswers = async (payload: Answers): Promise<void> => {
    setStatus("saving");
    try {
      await submitOnboarding({
        level: payload.level,
        interest: payload.interest,
        dailyTime: payload.dailyTime,
        goal: payload.goal,
        experience: [payload.experience],
      });
      // Unlock the route automatically — no separate /report/start screen needed
      await completeInitialReport().catch(() => null);
      router.push(`/dashboard?lang=${lang}`);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Failed");
      setStatus("error");
    }
  };

  const onPickAndAdvance = (value: Answers[keyof Answers]): void => {
    if (status === "saving") return;
    const nextAnswers: Answers = { ...answers, [current.key]: value as never };
    setAnswers(nextAnswers);
    if (index === totalSteps - 1) {
      void submitAnswers(nextAnswers);
      return;
    }
    setIndex((prev) => prev + 1);
  };

  if (status === "saving") {
    return (
      <StandaloneShell>
        <div className="text-center section-top">
          <div className="loading-spinner" />
          <p className="muted text-body-sm" style={{ marginTop: 16 }}>
            {lang === "ru" ? "Готовим твой маршрут..." : "Preparing your route..."}
          </p>
        </div>
      </StandaloneShell>
    );
  }

  return (
    <StandaloneShell>
      <div className="onboarding-shell">
        <header className="onboarding-main-header">
          <h1 className="onboarding-main-title">{lang === "ru" ? "Настроим маршрут под тебя" : "Let's set up your route"}</h1>
          <p className="onboarding-main-subtitle">
            {lang === "ru"
              ? `${index + 1} из ${totalSteps} — выбери подходящий вариант`
              : `${index + 1} of ${totalSteps} — pick the best match`}
          </p>
        </header>

        {index === 0 ? (
          <TutorialTip
            tipKey="onboarding-intro"
            title={lang === "ru" ? "Как это работает" : "How it works"}
            message={lang === "ru"
              ? "Выбирай вариант — сразу переходим к следующему шагу. Всего 5 вопросов."
              : "Pick an option — we move on instantly. Just 5 questions total."}
          />
        ) : null}

        <section className="onboarding-question-card" aria-labelledby="onboarding-question">
          <ProgressBar value={progress} />

          <div className="onboarding-question-head">
            <h2 className="onboarding-question-title" id="onboarding-question">{current.question[lang]}</h2>
          </div>

          <fieldset className="onboarding-options-group">
            <legend className="sr-only">{lang === "ru" ? "Варианты ответа" : "Answer options"}</legend>
            <div className="onboarding-options-list">
              {current.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onPickAndAdvance(option.value)}
                  className={`choice-option onboarding-choice ${answers[current.key] === option.value ? "active" : ""}`}
                  aria-pressed={answers[current.key] === option.value}
                >
                  <span className="onboarding-choice-indicator" aria-hidden="true" />
                  <span className="onboarding-choice-content">
                    <span className="entity-title">{option.label[lang]}</span>
                    <span className="muted entity-subtitle">{option.desc[lang]}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="onboarding-actions">
            <Button
              onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
              tone="ghost"
              disabled={index === 0}
            >
              {lang === "ru" ? "Назад" : "Back"}
            </Button>
          </div>
        </section>
      </div>

      {status === "error" ? <InlineAlert tone="error">{errorMsg}</InlineAlert> : null}
    </StandaloneShell>
  );
}
