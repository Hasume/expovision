"use client";

import { useState } from "react";

type Props = {
  labelRu?: string;
  labelEn?: string;
  valueRu: string;
  valueEn: string;
  onChangeRu: (v: string) => void;
  onChangeEn: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
};

export function BilingualField({ labelRu = "RU", labelEn = "EN", valueRu, valueEn, onChangeRu, onChangeEn, placeholder, multiline, rows = 4 }: Props) {
  const [tab, setTab] = useState<"ru" | "en">("ru");

  return (
    <div className="admin-bilingual">
      <div className="admin-bilingual-tabs">
        <button type="button" className={`admin-bilingual-tab${tab === "ru" ? " active" : ""}`} onClick={() => setTab("ru")}>{labelRu}</button>
        <button type="button" className={`admin-bilingual-tab${tab === "en" ? " active" : ""}`} onClick={() => setTab("en")}>{labelEn}</button>
      </div>
      {multiline ? (
        <textarea
          className="textarea"
          rows={rows}
          value={tab === "ru" ? valueRu : valueEn}
          onChange={(e) => (tab === "ru" ? onChangeRu : onChangeEn)(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className="input"
          value={tab === "ru" ? valueRu : valueEn}
          onChange={(e) => (tab === "ru" ? onChangeRu : onChangeEn)(e.target.value)}
          placeholder={placeholder}
        />
      )}
      {((tab === "ru" && valueEn) || (tab === "en" && valueRu)) && (
        <p className="admin-bilingual-hint">
          {tab === "ru" ? "EN" : "RU"}: {(tab === "ru" ? valueEn : valueRu).slice(0, 80)}{(tab === "ru" ? valueEn : valueRu).length > 80 ? "..." : ""}
        </p>
      )}
    </div>
  );
}
