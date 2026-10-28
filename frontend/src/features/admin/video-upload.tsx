"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminInitVideoUpload, adminVideoStatus, adminDeleteVideo, type KinescopeVideo } from "@/features/api";
import { KinescopeLibraryPicker } from "@/features/admin/kinescope-library-picker";
import { useAdminLang } from "@/features/admin/i18n";

type VideoState = "idle" | "uploading" | "processing" | "ready" | "error";

interface Props {
  kinescopeVideoId: string | null;
  onVideoChange: (videoId: string | null) => void;
  /** Called when a video is picked from the library — provides id + title for auto-fill */
  onVideoSelected?: (videoId: string, title: string) => void;
  lessonTitle?: string;
}

export function VideoUpload({ kinescopeVideoId, onVideoChange, onVideoSelected, lessonTitle }: Props) {
  const { t } = useAdminLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<VideoState>(kinescopeVideoId ? "ready" : "idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState(kinescopeVideoId);

  const [libraryOpen, setLibraryOpen] = useState(false);

  const pollStatus = useCallback(async (videoId: string) => {
    let attempts = 0;
    while (attempts < 120) {
      attempts++;
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const info = await adminVideoStatus(videoId);
        if (info.status === "ready" || info.status === "done") { setState("ready"); return; }
        if (info.status === "error") { setState("error"); setError("Transcoding failed"); return; }
      } catch { /* transient */ }
    }
    setState("error");
    setError("Transcoding timeout");
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    setError("");
    setState("uploading");
    setProgress(0);
    try {
      const title = lessonTitle || file.name.replace(/\.[^.]+$/, "");
      const { uploadUrl, uploadToken, projectId } = await adminInitVideoUpload(title);

      const videoId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl, true);
        xhr.setRequestHeader("Authorization", `Bearer ${uploadToken}`);
        xhr.setRequestHeader("Tus-Resumable", "1.0.0");
        xhr.setRequestHeader("Upload-Length", String(file.size));
        xhr.setRequestHeader("X-Video-Title", encodeURIComponent(title));
        if (projectId) xhr.setRequestHeader("X-Parent-Id", projectId);
        xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const resp = JSON.parse(xhr.responseText);
              const id = resp?.data?.id || resp?.id || "";
              if (id) { resolve(id); return; }
            } catch { /* */ }
            const loc = xhr.getResponseHeader("Location") || "";
            const match = loc.match(/([a-zA-Z0-9_-]{10,})/);
            resolve(match?.[1] ?? "");
          } else {
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText.slice(0, 200)}`));
          }
        };
        xhr.onerror = () => reject(new Error("Upload network error"));
        xhr.send(file);
      });

      if (!videoId) throw new Error("Could not extract video ID from response");
      setCurrentVideoId(videoId);
      onVideoChange(videoId);
      setState("processing");
      await pollStatus(videoId);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }, [lessonTitle, onVideoChange, pollStatus]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) void uploadFile(file);
    else setError(t("Выберите видеофайл", "Please select a video file"));
  }, [uploadFile, t]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  }, [uploadFile]);

  const handleRemove = useCallback(async () => {
    setCurrentVideoId(null);
    onVideoChange(null);
    setState("idle");
    setProgress(0);
  }, [onVideoChange]);

  const handleRemoveAndDelete = useCallback(async () => {
    if (!currentVideoId) return;
    try { await adminDeleteVideo(currentVideoId); } catch { /* */ }
    handleRemove();
  }, [currentVideoId, handleRemove]);

  const selectVideo = (v: KinescopeVideo) => {
    setCurrentVideoId(v.id);
    onVideoChange(v.id);
    if (onVideoSelected) onVideoSelected(v.id, v.title);
    setState("ready");
    setLibraryOpen(false);
  };

  return (
    <div className="video-upload-wrap">
      {state === "idle" && (
        <>
          <div
            className={`video-dropzone ${dragging ? "video-dropzone--active" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept="video/*" hidden onChange={handleFileChange} />
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="video-dropzone-icon">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="video-dropzone-label">
              {t("Перетащите видео сюда или нажмите для выбора", "Drag video here or click to browse")}
            </span>
            <span className="video-dropzone-hint">MP4, WebM, MOV</span>
          </div>
          <button type="button" className="button secondary small" style={{ marginTop: 8, width: "100%" }} onClick={() => setLibraryOpen((o) => !o)}>
            {libraryOpen ? t("Скрыть библиотеку", "Hide library") : t("Выбрать из Kinescope", "Choose from Kinescope")}
          </button>
          {libraryOpen && (
            <div className="video-library-panel section-top-sm">
              <KinescopeLibraryPicker onSelect={selectVideo} />
            </div>
          )}
        </>
      )}

      {state === "uploading" && (
        <div className="video-progress-wrap">
          <div className="video-progress-bar">
            <div className="video-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="video-progress-label">{t("Загрузка", "Uploading")}… {progress}%</span>
        </div>
      )}

      {state === "processing" && (
        <div className="video-processing">
          <div className="video-spinner" />
          <span>{t("Обработка видео на Kinescope…", "Processing video on Kinescope…")}</span>
        </div>
      )}

      {state === "ready" && currentVideoId && (
        <div className="video-preview-wrap">
          <div className="video-preview-frame">
            <iframe
              src={`https://kinescope.io/embed/${currentVideoId}`}
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              className="frame-full"
            />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="button secondary small" onClick={() => void handleRemove()}>
              {t("Открепить", "Detach")}
            </button>
            <button type="button" className="button secondary small" style={{ color: "var(--danger)" }} onClick={() => void handleRemoveAndDelete()}>
              {t("Удалить из Kinescope", "Delete from Kinescope")}
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="video-error-wrap">
          <span className="video-error-msg">{error}</span>
          <button type="button" className="btn-ghost" onClick={() => { setState("idle"); setError(""); }}>
            {t("Попробовать снова", "Try again")}
          </button>
        </div>
      )}

    </div>
  );
}
