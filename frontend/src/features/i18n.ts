export type LanguageCode = "ru" | "en";

export function getLang(raw?: string): LanguageCode {
  if (raw === "ru" || raw === "en") return raw;
  if (typeof window !== "undefined") {
    const fromStorage = window.localStorage.getItem(STORAGE_KEY);
    if (fromStorage === "ru" || fromStorage === "en") return fromStorage;
    return window.navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
  }
  return "ru";
}

const STORAGE_KEY = "uiLang";

export function getLangFromLocation(search: string): LanguageCode {
  const raw = new URLSearchParams(search).get("lang") ?? undefined;
  return getLang(raw);
}

export function getPreferredLang(): LanguageCode {
  if (typeof window === "undefined") return "ru";
  const fromQuery = getLangFromLocation(window.location.search);
  if (new URLSearchParams(window.location.search).has("lang")) return fromQuery;
  const fromStorage = window.localStorage.getItem(STORAGE_KEY);
  if (fromStorage === "ru" || fromStorage === "en") return fromStorage;
  return window.navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function persistLang(lang: LanguageCode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, lang);
}

export const text = {
  authTitle: {
    ru: "14-дневный маршрут в IT/AI",
    en: "14-day route in IT/AI"
  },
  authSubtitle: {
    ru: "Не курсы. Управляемый путь. Каждый день - шаг к результату.",
    en: "Not just courses. Guided path. Every day is one step to outcome."
  },
  startRoute: {
    ru: "Начать путь",
    en: "Start route"
  },
  goAdmin: {
    ru: "Перейти в Admin",
    en: "Open Admin"
  },
  chooseLanguage: {
    ru: "Язык платформы",
    en: "Platform language"
  },
  authFeaturesTitle: {
    ru: "Что тебя ждёт",
    en: "What you get"
  },
  authFeatures: {
    ru: [
      "Онбординг и персонализация маршрута",
      "Ежедневный фокус без перегруза контентом",
      "Практика, домашка и обратная связь",
      "Финальный результат по выбранному треку"
    ],
    en: [
      "Onboarding and personalized route",
      "Daily focus without content overload",
      "Practice, homework, and feedback",
      "Final outcome in your selected track"
    ]
  },
  dashboardTitle: {
    ru: "Твой маршрут",
    en: "Your route"
  },
  todayFocus: {
    ru: "Сегодняшний фокус",
    en: "Today's focus"
  },
  routeMap: {
    ru: "Карта пути",
    en: "Route map"
  },
  webinarsWeekOne: {
    ru: "Вебинары первой недели",
    en: "Week one webinars"
  },
  splitTitle: {
    ru: "Выбери свой маршрут",
    en: "Choose your path"
  },
  finalTitle: {
    ru: "Ты прошел маршрут",
    en: "You completed the route"
  },
  achievements: {
    ru: "Достижения",
    en: "Achievements"
  },
  nextSteps: {
    ru: "Следующие шаги",
    en: "Next steps"
  }
} as const;
