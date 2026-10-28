"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CommunityFollowListItem,
  communityListMyFollowers,
  communityListMyFollowing,
  communityRemoveFollower,
  communityUnfollowProfile,
} from "@/features/api";

const PAGE_SIZE = 10;

function avatarSrc(apiBase: string, url: string | null): string | null {
  if (!url?.trim()) return null;
  const p = url.trim();
  if (/^https?:\/\//i.test(p)) return p;
  const base = apiBase.replace(/\/$/, "");
  return `${base}${p.startsWith("/") ? "" : "/"}${p.replace(/^\//, "")}`;
}

/** Modal: following / followers, loading 10 more on scroll. */
export function ProfileFollowPanel({
  apiBase,
  panel,
  onClose,
  onRelationsChange,
}: {
  apiBase: string;
  panel: "following" | "followers" | null;
  onClose: () => void;
  onRelationsChange: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<CommunityFollowListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [lastLoadedPage, setLastLoadedPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const loadMoreBusyRef = useRef(false);
  const panelRef = useRef(panel);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

  const loadPage = useCallback(
    async (page: number, mode: "replace" | "append") => {
      const kind = panelRef.current;
      if (!kind) return;
      const isFirst = mode === "replace";
      if (isFirst) {
        setLoading(true);
      } else {
        if (loadMoreBusyRef.current) return;
        loadMoreBusyRef.current = true;
        setLoadingMore(true);
      }
      setErr(null);
      try {
        const res =
          kind === "following"
            ? await communityListMyFollowing({ page, pageSize: PAGE_SIZE })
            : await communityListMyFollowers({ page, pageSize: PAGE_SIZE });
        if (panelRef.current !== kind) return;
        setTotal(res.total);
        setItems((prev) => (mode === "replace" ? res.items : [...prev, ...res.items]));
        setLastLoadedPage(page);
      } catch (e: unknown) {
        if (panelRef.current !== kind) return;
        setErr(e instanceof Error ? e.message : "Не удалось загрузить");
      } finally {
        if (isFirst) {
          setLoading(false);
        } else {
          loadMoreBusyRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!panel) return;
    loadMoreBusyRef.current = false;
    setItems([]);
    setTotal(0);
    setLastLoadedPage(0);
    setErr(null);
    void loadPage(1, "replace");
  }, [panel, loadPage]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [panel, onClose]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!panel || loading || loadingMore || lastLoadedPage === 0) return;
      if (total > 0 && items.length >= total) return;
      if (loadMoreBusyRef.current) return;
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
      void loadPage(lastLoadedPage + 1, "append");
    },
    [panel, loading, loadingMore, lastLoadedPage, total, items.length, loadPage],
  );

  /** If the list does not fill the viewport, fetch the next page (otherwise there is nothing to scroll). */
  useEffect(() => {
    if (!panel || loading || loadingMore || lastLoadedPage === 0) return;
    if (total > 0 && items.length >= total) return;
    if (loadMoreBusyRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 8) return;
    void loadPage(lastLoadedPage + 1, "append");
  }, [panel, loading, loadingMore, items.length, total, lastLoadedPage, loadPage]);

  const handleUnfollow = async (userId: string) => {
    if (busyId) return;
    setBusyId(userId);
    try {
      await communityUnfollowProfile(userId);
      setItems((prev) => prev.filter((u) => u.id !== userId));
      setTotal((t) => Math.max(0, t - 1));
      onRelationsChange();
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveFollower = async (userId: string) => {
    if (busyId) return;
    if (!confirm("Убрать этого человека из подписчиков?")) return;
    setBusyId(userId);
    try {
      await communityRemoveFollower(userId);
      setItems((prev) => prev.filter((u) => u.id !== userId));
      setTotal((t) => Math.max(0, t - 1));
      onRelationsChange();
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  if (!panel || !mounted || typeof document === "undefined") return null;

  const sinceLabel = (s: string | null) =>
    s
      ? new Date(s).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
      : null;

  const panelTitle = panel === "following" ? "Ваши подписки" : "Ваши подписчики";
  const headingId = "hub-follow-list-heading";

  const modal = (
    <div className="hub-dash-modal-root hub-follow-modal-root" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <button type="button" className="hub-dash-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="hub-dash-modal-panel hub-follow-modal-panel">
        <div className="hub-dash-modal-head">
          <h2 id={headingId} className="hub-follow-modal-title">
            {panelTitle}
          </h2>
          <button type="button" className="hub-dash-modal-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>

        {err ? <p className="hub-follow-panel__err">{err}</p> : null}

        {loading ? (
          <p className="hub-follow-panel__muted">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="hub-follow-panel__empty">
            {panel === "following" ? "Вы ни на кого не подписаны." : "У вас пока нет подписчиков."}
          </p>
        ) : (
          <div ref={scrollRef} className="hub-follow-modal-scroll" onScroll={handleScroll}>
            <ul className="hub-follow-list">
              {items.map((u) => {
                const src = avatarSrc(apiBase, u.avatarUrl);
                const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.firstName || "Участник";
                const since = sinceLabel(u.since);
                return (
                  <li key={u.id} className="hub-follow-row">
                    <Link href={`/community/profile/${u.id}`} className="hub-follow-row__main" onClick={onClose}>
                      <span className="hub-follow-avatar" aria-hidden>
                        {src ? (
                          <img src={src} alt="" width={40} height={40} />
                        ) : (
                          <span>{(u.firstName?.[0] ?? "?").toUpperCase()}</span>
                        )}
                      </span>
                      <span className="hub-follow-row__text">
                        <span className="hub-follow-row__name">{name}</span>
                        {since ? <span className="hub-follow-row__since">с {since}</span> : null}
                      </span>
                    </Link>
                    {panel === "following" ? (
                      <button
                        type="button"
                        className="hub-btn-ghost hub-follow-row__action"
                        disabled={busyId === u.id}
                        onClick={() => void handleUnfollow(u.id)}
                      >
                        {busyId === u.id ? "…" : "Отписаться"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="hub-btn-ghost hub-follow-row__action hub-follow-row__action--danger"
                        disabled={busyId === u.id}
                        onClick={() => void handleRemoveFollower(u.id)}
                      >
                        {busyId === u.id ? "…" : "Убрать"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {loadingMore ? (
              <p className="hub-follow-panel__muted hub-follow-modal-more">Загрузка…</p>
            ) : items.length < total ? (
              <p className="hub-follow-modal-more hub-follow-modal-more--hint">Прокрутите вниз — подгрузим ещё по {PAGE_SIZE}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
