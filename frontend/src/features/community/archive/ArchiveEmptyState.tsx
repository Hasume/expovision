"use client";

import Link from "next/link";

function ArchiveIcon() {
  return (
    <svg className="hub-archive-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 7h8M8 11h8M8 15h4" strokeLinecap="round" />
    </svg>
  );
}

export function ArchiveEmptyState({
  variant,
  searchQuery,
  onResetFilters,
  isLoggedIn,
}: {
  variant: "empty" | "no_results";
  searchQuery?: string;
  onResetFilters?: () => void;
  isLoggedIn: boolean;
}) {
  if (variant === "no_results") {
    return (
      <div className="hub-archive-empty hub-archive-empty--compact">
        <h3 className="hub-archive-empty-title">Ничего не найдено</h3>
        <p className="hub-archive-empty-text">
          По запросу «{searchQuery}» нет совпадений в архиве. Попробуйте другие слова или сбросьте фильтры.
        </p>
        <div className="hub-archive-empty-actions">
          {onResetFilters ? (
            <button type="button" className="hub-btn-primary" onClick={onResetFilters}>
              Сбросить фильтры
            </button>
          ) : null}
          <Link href="/community/dashboard" className="hub-btn-ghost">
            Открыть ленту
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="hub-archive-empty">
      <div className="hub-archive-empty-inner">
        <ArchiveIcon />
        <h3 className="hub-archive-empty-title">Архив пока пуст</h3>
        <p className="hub-archive-empty-text">
          Когда активный вопрос закроется и появится AI-резюме, он окажется здесь — с итогами, ответами и выводами, чтобы знания не терялись.
        </p>
        <div className="hub-archive-empty-actions">
          {isLoggedIn ? (
            <Link href="/community/dashboard" className="hub-btn-primary">
              К активным вопросам
            </Link>
          ) : (
            <Link href="/community" className="hub-btn-primary">
              Войти, чтобы участвовать
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
