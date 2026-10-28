"use client";

import { createContext, useCallback, useContext, useState, type PropsWithChildren } from "react";
import { getPreferredLang, persistLang } from "@/features/i18n";

type Lang = "ru" | "en";

type AdminI18nCtx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (ru: string, en: string) => string;
};

const Ctx = createContext<AdminI18nCtx>({
  lang: "ru",
  setLang: () => {},
  t: (ru) => ru,
});

export function useAdminLang() {
  return useContext(Ctx);
}

export function AdminI18nProvider({ children }: PropsWithChildren) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "ru";
    return getPreferredLang();
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    persistLang(l);
  }, []);

  const t = useCallback((ru: string, en: string) => lang === "ru" ? ru : en, [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
