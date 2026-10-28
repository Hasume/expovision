"use client";

import type { CommunityCategory } from "@/features/api";
import type { ArchiveFilterPreset, ArchiveSortMode } from "./types";

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const PRESETS: { id: ArchiveFilterPreset; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "with_ai", label: "С AI-резюме" },
  { id: "trending", label: "Популярные" },
  { id: "fresh", label: "Недавно закрытые" },
  { id: "mine", label: "Мои" },
];

const SORTS: { id: ArchiveSortMode; label: string }[] = [
  { id: "closed", label: "По дате" },
  { id: "activity", label: "По активности" },
  { id: "utility", label: "По пользе" },
];

export function ArchiveFilters({
  query,
  onQueryChange,
  preset,
  onPresetChange,
  sortMode,
  onSortChange,
  sortLocked,
  categories,
  selectedCategoryId,
  onCategoryChange,
  isLoggedIn,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  preset: ArchiveFilterPreset;
  onPresetChange: (p: ArchiveFilterPreset) => void;
  sortMode: ArchiveSortMode;
  onSortChange: (s: ArchiveSortMode) => void;
  sortLocked: boolean;
  categories: CommunityCategory[];
  selectedCategoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  isLoggedIn: boolean;
}) {
  return (
    <div className="hub-archive-filters">
      {/* Search */}
      <div className="hub-archive-search-wrap">
        <span className="hub-archive-search-icon" aria-hidden>
          <SearchIcon />
        </span>
        <input
          type="search"
          className="hub-archive-search-input"
          placeholder="Поиск по вопросам и ответам…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Chips + sort + category — one compact row */}
      <div className="hub-archive-toolbar">
        <div className="hub-archive-chip-row" role="tablist" aria-label="Подборка">
          {PRESETS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={preset === id}
              className={`hub-archive-chip${preset === id ? " hub-archive-chip--active" : ""}`}
              onClick={() => onPresetChange(id)}
              disabled={id === "mine" && !isLoggedIn}
              title={id === "mine" && !isLoggedIn ? "Войдите, чтобы фильтровать свои вопросы" : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="hub-archive-toolbar-right">
          {categories.length > 0 ? (
            <select
              className="hub-archive-category-select"
              value={selectedCategoryId ?? ""}
              onChange={(e) => onCategoryChange(e.target.value ? e.target.value : null)}
              aria-label="Категория"
            >
              <option value="">Все категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameRu}
                </option>
              ))}
            </select>
          ) : null}

          <div className="hub-archive-sort-btns" aria-label="Сортировка">
            {SORTS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`hub-archive-sort-btn${sortMode === id ? " hub-archive-sort-btn--active" : ""}`}
                onClick={() => onSortChange(id)}
                disabled={sortLocked}
                title={sortLocked ? "Сортировка задана автоматически" : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
