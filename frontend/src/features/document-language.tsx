"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { getLang, persistLang } from "@/features/i18n";

export function DocumentLanguageSync() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("lang") ?? undefined;
    const resolvedLang = getLang(raw);
    document.documentElement.lang = resolvedLang;
    persistLang(resolvedLang);
  }, [searchParams]);

  return null;
}
