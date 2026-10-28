"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useAdminLang } from "./i18n";

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  width?: string;
};

type Props<T> = {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  emptyText?: string;
  pageSize?: number;
};

export function DataTable<T>({ columns, data, rowKey, onRowClick, searchPlaceholder, searchFilter, emptyText, pageSize = 25 }: Props<T>) {
  const { t } = useAdminLang();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!deferredSearch.trim() || !searchFilter) return data;
    return data.filter((row) => searchFilter(row, deferredSearch.toLowerCase()));
  }, [data, deferredSearch, searchFilter]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const sv = col.sortValue;
    return [...filtered].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const onSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="admin-dt">
      {searchFilter && (
        <div className="admin-dt-toolbar">
          <input className="input" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={searchPlaceholder ?? t("Поиск...", "Search...")} />
          <span className="admin-dt-count">{filtered.length} {t("записей", "records")}</span>
        </div>
      )}
      <div className="admin-dt-scroll">
        <table className="admin-dt-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={col.width ? { width: col.width } : undefined} className={col.sortable ? "admin-dt-sortable" : undefined} onClick={col.sortable ? () => onSort(col.key) : undefined}>
                  {col.label}
                  {col.sortable && sortKey === col.key && <span className="admin-dt-sort-icon">{sortDir === "asc" ? " ↑" : " ↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={columns.length} className="admin-dt-empty">{emptyText ?? t("Нет данных", "No data")}</td></tr>
            ) : paged.map((row) => (
              <tr key={rowKey(row)} className={onRowClick ? "admin-dt-clickable" : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((col) => (
                  <td key={col.key}>{col.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="admin-dt-pagination">
          <button type="button" className="button secondary small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("Назад", "Prev")}</button>
          <span className="admin-dt-page-info">{page + 1} / {totalPages}</span>
          <button type="button" className="button secondary small" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>{t("Далее", "Next")}</button>
        </div>
      )}
    </div>
  );
}
