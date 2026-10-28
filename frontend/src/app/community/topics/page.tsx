"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type CommunityCategory,
  type CommunityTopic,
  communityCategories,
  communityTopics,
  communityMeApi,
  communityPendingTopics,
  communityApproveTopic,
  communityRejectTopic,
  getCommunityAuthState,
} from "@/features/api";
import { InlineAlert } from "@/shared/ui/components";
import { LoadingSkeleton } from "@/features/community/platform-components";
import {
  ArchiveQuestionCard,
  ArchiveEmptyState,
  ArchiveFilters,
  ArchiveRightPanel,
  type ArchiveFilterPreset,
  type ArchiveSortMode,
} from "@/features/community/archive";
import { getBookmarkedTopicIds } from "@/features/community/discussion-detail/bookmarks";

const PAGE_SIZE = 20;

function AdminPendingPanel({ onApprove }: { onApprove: () => void }) {
  const [pending, setPending] = useState<CommunityTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await communityPendingTopics();
      setPending(res.items);
    } catch {
      /* not an admin */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    setActionId(id);
    try {
      await communityApproveTopic(id);
      setPending((p) => p.filter((t) => t.id !== id));
      onApprove();
    } catch {
      /* ignore */
    } finally {
      setActionId(null);
    }
  };

  const reject = async (id: string) => {
    if (!confirm("Отклонить и удалить эту тему?")) return;
    setActionId(id);
    try {
      await communityRejectTopic(id);
      setPending((p) => p.filter((t) => t.id !== id));
    } catch {
      /* ignore */
    } finally {
      setActionId(null);
    }
  };

  if (loading || pending.length === 0) return null;

  return (
    <div className="hub-card hub-archive-admin-pending">
      <div className="hub-card-header">
        <h3 className="hub-card-title hub-archive-admin-pending-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          Ожидают проверки: {pending.length}
        </h3>
      </div>
      <div className="hub-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pending.map((t) => (
          <div key={t.id} className="hub-disc-card" style={{ cursor: "default" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="hub-disc-card-title" style={{ marginBottom: 2 }}>
                {t.title}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--hub-text-faint)" }}>
                {t.author.firstName} {t.author.lastName} ·{" "}
                {new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(
                  new Date(t.createdAt),
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => approve(t.id)}
                disabled={actionId === t.id}
                className="hub-btn-primary"
                style={{ padding: "6px 14px", fontSize: "var(--text-sm)", opacity: actionId === t.id ? 0.6 : 1, background: "#10b981" }}
              >
                Одобрить
              </button>
              <button
                type="button"
                onClick={() => reject(t.id)}
                disabled={actionId === t.id}
                className="hub-btn-ghost"
                style={{ padding: "6px 14px", fontSize: "var(--text-sm)", opacity: actionId === t.id ? 0.6 : 1, color: "#b91c1c", borderColor: "#fecaca" }}
              >
                Отклонить
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ArchiveQuestionsPage() {
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [topics, setTopics] = useState<CommunityTopic[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [preset, setPreset] = useState<ArchiveFilterPreset>("all");
  const [sortMode, setSortMode] = useState<ArchiveSortMode>("closed");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [railPopular, setRailPopular] = useState<CommunityTopic[]>([]);

  const sortLocked = preset === "trending" || preset === "fresh";

  const apiSort = useMemo((): "recent" | "popular" => {
    if (preset === "trending") return "popular";
    if (preset === "fresh") return "recent";
    if (sortMode === "closed") return "recent";
    return "popular";
  }, [preset, sortMode]);

  const listAuthorId = preset === "mine" && currentUserId ? currentUserId : undefined;

  useEffect(() => {
    const auth = getCommunityAuthState();
    setIsLoggedIn(!!auth);
    setCurrentUserId(auth?.userId ?? null);
    if (auth) {
      communityMeApi()
        .then((u) => setIsAdmin(u.isAdmin ?? false))
        .catch(() => {});
    }
    communityCategories({ forKind: "discussion", suggested: !!auth }).then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [selectedCategory, debouncedQuery, preset, sortMode, listAuthorId]);

  useEffect(() => {
    setBookmarkCount(getBookmarkedTopicIds().length);
  }, [topics, refreshKey]);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await communityTopics({
        page,
        sort: apiSort,
        discussionArchive: true,
        ...(selectedCategory ? { category: selectedCategory } : {}),
        ...(debouncedQuery ? { q: debouncedQuery } : {}),
        ...(listAuthorId ? { authorId: listAuthorId } : {}),
      });
      setTopics(res.items);
      setTotal(res.total);
      /* Avoid duplicate GET /community/topics: sidebar «popular» rail matches main query when sort is popular and filters align. */
      if (
        page === 1 &&
        apiSort === "popular" &&
        !debouncedQuery &&
        !listAuthorId
      ) {
        setRailPopular(res.items.slice(0, 3));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [page, selectedCategory, debouncedQuery, apiSort, listAuthorId]);

  useEffect(() => {
    /* Main list already loaded popular rail when sort matches and no extra filters. */
    if (apiSort === "popular" && !debouncedQuery && !listAuthorId) return;
    communityTopics({
      discussionArchive: true,
      sort: "popular",
      page: 1,
      ...(selectedCategory ? { category: selectedCategory } : {}),
    })
      .then((r) => setRailPopular(r.items.slice(0, 3)))
      .catch(() => setRailPopular([]));
  }, [selectedCategory, refreshKey, apiSort, debouncedQuery, listAuthorId]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setSelectedCategory(null);
    setPreset("all");
    setSortMode("closed");
    setPage(1);
  }, []);

  const handlePresetChange = (p: ArchiveFilterPreset) => {
    setPreset(p);
    if (p === "trending") setSortMode("activity");
    if (p === "fresh") setSortMode("closed");
  };

  return (
      <div className="hub-archive-page">
        <div className="hub-content-layout hub-archive-layout">
          <div className="hub-content-main hub-archive-main">
            <header className="hub-archive-header">
              <h1 className="hub-archive-title">Архив обсуждений</h1>
              {isLoggedIn ? (
                <div className="hub-archive-header-actions">
                  <Link href="/community/dashboard" className="hub-btn-ghost hub-btn-ghost--sm">
                    Активные
                  </Link>
                  <Link href="/community/dashboard#compose-discussion" className="hub-btn-primary hub-btn-primary--sm">
                    Задать вопрос
                  </Link>
                </div>
              ) : null}
            </header>

            <ArchiveFilters
              query={query}
              onQueryChange={setQuery}
              preset={preset}
              onPresetChange={handlePresetChange}
              sortMode={sortMode}
              onSortChange={setSortMode}
              sortLocked={sortLocked}
              categories={categories}
              selectedCategoryId={selectedCategory}
              onCategoryChange={setSelectedCategory}
              isLoggedIn={isLoggedIn}
            />

            {isAdmin ? <AdminPendingPanel onApprove={() => setRefreshKey((k) => k + 1)} /> : null}

            {error ? (
              <div className="hub-archive-error">
                <InlineAlert tone="error">{error}</InlineAlert>
                <button type="button" className="hub-btn-primary" onClick={() => setRefreshKey((k) => k + 1)}>
                  Повторить
                </button>
              </div>
            ) : null}

            {loading ? (
              <div className="hub-archive-list hub-archive-list--skeleton">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="hub-archive-skel-card">
                    <LoadingSkeleton rows={1} height={12} />
                    <LoadingSkeleton rows={2} height={14} />
                    <LoadingSkeleton rows={1} height={40} />
                  </div>
                ))}
              </div>
            ) : topics.length > 0 ? (
              <div className="hub-archive-list">
                {topics.map((t) => (
                  <ArchiveQuestionCard key={t.id} topic={t} categories={categories} />
                ))}
              </div>
            ) : debouncedQuery ? (
              <ArchiveEmptyState variant="no_results" searchQuery={debouncedQuery} onResetFilters={resetFilters} isLoggedIn={isLoggedIn} />
            ) : (
              <ArchiveEmptyState variant="empty" isLoggedIn={isLoggedIn} />
            )}

            {!loading && totalPages > 1 && topics.length > 0 ? (
              <nav className="hub-archive-pagination" aria-label="Страницы">
                <button type="button" className="hub-btn-ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  ← Назад
                </button>
                <span className="hub-archive-pagination-info">
                  {page} из {totalPages}
                </span>
                <button
                  type="button"
                  className="hub-btn-ghost"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Вперёд →
                </button>
              </nav>
            ) : null}

            {!isLoggedIn ? (
              <div className="hub-archive-login-cta">
                <div>
                  <strong className="hub-archive-login-title">Войдите в аккаунт</strong>
                  <p className="hub-archive-login-text">Чтобы отвечать, сохранять вопросы и задавать свои — как в разделе активных вопросов.</p>
                </div>
                <Link href="/community" className="hub-btn-primary">
                  Войти
                </Link>
              </div>
            ) : null}
          </div>

          <aside className="hub-right-panel">
            <ArchiveRightPanel archiveTotal={total} savedCount={bookmarkCount} popularTopics={railPopular} />
          </aside>
        </div>
      </div>
  );
}
