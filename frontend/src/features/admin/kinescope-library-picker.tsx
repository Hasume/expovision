"use client";

import { useEffect, useMemo, useState } from "react";
import {
  adminVideoFolders,
  adminVideoLibrary,
  type KinescopeFolder,
  type KinescopeVideo,
} from "@/features/api";
import { useAdminLang } from "@/features/admin/i18n";

export type FolderScope =
  | ""
  | "without"
  | "project"
  | `folder:${string}`;

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type Props = {
  onSelect: (video: KinescopeVideo) => void;
  disabled?: boolean;
};

export function KinescopeLibraryPicker({ onSelect, disabled }: Props) {
  const { t } = useAdminLang();
  const [folders, setFolders] = useState<KinescopeFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersError, setFoldersError] = useState<string | null>(null);

  const [scope, setScope] = useState<FolderScope>("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [videos, setVideos] = useState<KinescopeVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(searchInput), 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setFoldersLoading(true);
      setFoldersError(null);
      try {
        const data = await adminVideoFolders();
        if (!cancelled) setFolders(data.folders);
      } catch (e) {
        if (!cancelled) setFoldersError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const libraryParams = useMemo(() => {
    if (scope === "" || scope === "project") {
      return {
        folderId: undefined as string | undefined,
        withoutFolder: false,
        q: debouncedQ.trim() || undefined,
      };
    }
    if (scope === "without") {
      return { folderId: undefined, withoutFolder: true, q: debouncedQ.trim() || undefined };
    }
    if (scope.startsWith("folder:")) {
      return { folderId: scope.slice("folder:".length), withoutFolder: false, q: debouncedQ.trim() || undefined };
    }
    return { folderId: undefined, withoutFolder: false, q: debouncedQ.trim() || undefined };
  }, [scope, debouncedQ]);

  useEffect(() => {
    if (scope === "") {
      setVideos([]);
      setTotal(0);
      setPage(1);
      return;
    }
    let cancelled = false;
    setVideosLoading(true);
    setVideosError(null);
    setPage(1);
    void (async () => {
      try {
        const req: Parameters<typeof adminVideoLibrary>[0] = { page: 1, perPage: 48 };
        if (libraryParams.folderId) req.folderId = libraryParams.folderId;
        if (libraryParams.withoutFolder) req.withoutFolder = true;
        if (libraryParams.q) req.q = libraryParams.q;
        const data = await adminVideoLibrary(req);
        if (cancelled) return;
        setTotal(data.total);
        setVideos(data.videos);
      } catch (e) {
        if (cancelled) return;
        setVideosError(e instanceof Error ? e.message : "Failed");
        setVideos([]);
        setTotal(0);
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, debouncedQ, libraryParams]);

  const hasMore = scope !== "" && videos.length < total;

  const loadMore = () => {
    if (scope === "" || videosLoading || !hasMore) return;
    void (async () => {
      setVideosLoading(true);
      setVideosError(null);
      try {
        const req: Parameters<typeof adminVideoLibrary>[0] = { page: page + 1, perPage: 48 };
        if (libraryParams.folderId) req.folderId = libraryParams.folderId;
        if (libraryParams.withoutFolder) req.withoutFolder = true;
        if (libraryParams.q) req.q = libraryParams.q;
        const data = await adminVideoLibrary(req);
        setTotal(data.total);
        setVideos((prev) => [...prev, ...data.videos]);
        setPage((p) => p + 1);
      } catch (e) {
        setVideosError(e instanceof Error ? e.message : "Failed");
      } finally {
        setVideosLoading(false);
      }
    })();
  };

  const scopeHint = useMemo(() => {
    if (scope === "") return t("Сначала выберите папку или область поиска.", "Choose a folder or search scope first.");
    if (scope.startsWith("folder:")) {
      const name = folders.find((f) => f.id === scope.slice(7))?.name;
      return name ? `${t("Папка", "Folder")}: ${name}` : t("Видео в выбранной папке", "Videos in folder");
    }
    if (scope === "without") return t("Видео без папки (корень проекта)", "Videos without a folder");
    return t("Весь проект Kinescope", "Entire Kinescope project");
  }, [scope, folders, t]);

  return (
    <div className="kinescope-picker">
      <div className="admin-section-block">
        <p className="admin-section-heading">{t("Шаг 1 — область", "Step 1 — scope")}</p>
        <label className="form-label" htmlFor="kinescope-scope">
          {t("Папка Kinescope", "Kinescope folder")}
        </label>
        <select
          id="kinescope-scope"
          className="input"
          value={scope}
          disabled={disabled || foldersLoading}
          onChange={(e) => {
            setScope(e.target.value as FolderScope);
            setSearchInput("");
          }}
        >
          <option value="">{t("— Выберите —", "— Choose —")}</option>
          <option value="project">{t("Весь проект (поиск)", "Whole project (search)")}</option>
          <option value="without">{t("Без папки", "Without folder")}</option>
          {folders.map((f) => (
            <option key={f.id} value={`folder:${f.id}`}>
              {f.name || t("(без названия)", "(untitled)")}
            </option>
          ))}
        </select>
        {foldersLoading ? (
          <p className="muted text-body-sm">{t("Загрузка папок…", "Loading folders…")}</p>
        ) : null}
        {foldersError ? <p className="text-body-sm" style={{ color: "var(--danger)" }}>{foldersError}</p> : null}
      </div>

      <div className="admin-section-block">
        <p className="admin-section-heading">{t("Шаг 2 — поиск и выбор", "Step 2 — search & pick")}</p>
        <p className="muted text-body-sm" style={{ margin: 0 }}>
          {scopeHint}
        </p>
        <input
          className="input"
          type="search"
          placeholder={t("Поиск по названию…", "Search by title…")}
          value={searchInput}
          disabled={disabled || scope === ""}
          onChange={(e) => setSearchInput(e.target.value)}
          autoComplete="off"
        />
      </div>

      {scope !== "" && (
        <div className="kinescope-picker-grid-wrap">
          {videosLoading && videos.length === 0 ? (
            <p className="muted text-body-sm">{t("Загрузка видео…", "Loading videos…")}</p>
          ) : null}
          {videosError ? <p className="text-body-sm" style={{ color: "var(--danger)" }}>{videosError}</p> : null}
          {!videosLoading && videos.length === 0 && !videosError ? (
            <p className="muted text-body-sm">{t("Нет видео в этой области.", "No videos in this scope.")}</p>
          ) : null}
          <div className="kinescope-picker-grid">
            {videos.map((v) => (
              <button
                key={v.id}
                type="button"
                className="kinescope-picker-card"
                disabled={disabled}
                onClick={() => onSelect(v)}
              >
                <div className="kinescope-picker-thumb">
                  {v.poster ? (
                    <img src={v.poster} alt="" className="kinescope-picker-thumb-img" />
                  ) : (
                    <div className="kinescope-picker-thumb-fallback" aria-hidden />
                  )}
                  <span className="kinescope-picker-duration">{formatDuration(v.duration)}</span>
                </div>
                <span className="kinescope-picker-title">{v.title?.trim() || t("Без названия", "Untitled")}</span>
              </button>
            ))}
          </div>
          {hasMore && !videosLoading ? (
            <button type="button" className="button secondary small" style={{ marginTop: 12, width: "100%" }} onClick={loadMore}>
              {t("Загрузить ещё", "Load more")}
            </button>
          ) : null}
          {videosLoading && videos.length > 0 ? (
            <p className="muted text-body-sm" style={{ marginTop: 8 }}>
              {t("Загрузка…", "Loading…")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
