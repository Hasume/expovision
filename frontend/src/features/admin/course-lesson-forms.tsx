"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BilingualField } from "@/features/admin/bilingual-field";
import { VideoUpload } from "@/features/admin/video-upload";
import { adminUploadCourseCover } from "@/features/api";
import { useAdminLang } from "@/features/admin/i18n";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function coverPreviewSrc(coverUrl: string): string {
  const u = coverUrl.trim();
  if (!u) return "";
  return u.startsWith("/") ? `${API_BASE}${u}` : u;
}

export type CourseFormState = {
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
  coverUrl: string;
  sortOrder: number;
};

export const emptyCourseForm = (): CourseFormState => ({
  titleRu: "",
  titleEn: "",
  descriptionRu: "",
  descriptionEn: "",
  coverUrl: "",
  sortOrder: 0,
});

export function CourseFormFields({
  value,
  onChange,
}: {
  value: CourseFormState;
  onChange: (next: CourseFormState) => void;
}) {
  const { t } = useAdminLang();
  const set = (patch: Partial<CourseFormState>) => onChange({ ...value, ...patch });
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef(value);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState("");
  useEffect(() => {
    formRef.current = value;
  }, [value]);

  const onCoverFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setCoverUploadError("");
      if (!file.type.startsWith("image/")) {
        setCoverUploadError(t("Нужен файл изображения (JPEG, PNG, WebP, GIF)", "Image file required (JPEG, PNG, WebP, GIF)"));
        return;
      }
      const previousCoverUrl = formRef.current.coverUrl;
      setCoverUploading(true);
      try {
        const { coverUrl } = await adminUploadCourseCover(file, previousCoverUrl);
        onChange({ ...formRef.current, coverUrl });
      } catch (e) {
        setCoverUploadError(e instanceof Error ? e.message : t("Ошибка загрузки", "Upload failed"));
      }
      setCoverUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    },
    [onChange, t],
  );

  const preview = coverPreviewSrc(value.coverUrl);

  return (
    <div className="admin-section-block">
      <p className="admin-section-heading">{t("Информация", "Info")}</p>
      <BilingualField
        labelRu="Название RU"
        labelEn="Title EN"
        valueRu={value.titleRu}
        valueEn={value.titleEn}
        onChangeRu={(v) => set({ titleRu: v })}
        onChangeEn={(v) => set({ titleEn: v })}
        placeholder={t("Название курса", "Course title")}
      />
      <BilingualField
        labelRu="Описание RU"
        labelEn="Description EN"
        valueRu={value.descriptionRu}
        valueEn={value.descriptionEn}
        onChangeRu={(v) => set({ descriptionRu: v })}
        onChangeEn={(v) => set({ descriptionEn: v })}
        placeholder={t("Описание", "Description")}
        multiline
        rows={3}
      />
      <div className="form-field">
        <label className="form-label">{t("Обложка", "Cover")}</label>
        {preview ? (
          <div style={{ marginBottom: 10 }}>
            <img
              src={preview}
              alt=""
              style={{ maxWidth: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border-subtle)" }}
            />
          </div>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => void onCoverFile(e.target.files?.[0])}
        />
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="button secondary small"
            disabled={coverUploading}
            onClick={() => fileRef.current?.click()}
          >
            {coverUploading ? t("Загрузка…", "Uploading…") : t("Загрузить файл", "Upload file")}
          </button>
        </div>
        {coverUploadError ? <p className="muted" style={{ color: "var(--danger)", marginTop: 6 }}>{coverUploadError}</p> : null}
        <p className="muted text-body-sm" style={{ marginTop: 8, marginBottom: 6 }}>
          {t("Или укажите URL картинки (внешняя ссылка).", "Or paste an image URL (external link).")}
        </p>
        <input
          className="input"
          value={value.coverUrl}
          onChange={(e) => set({ coverUrl: e.target.value })}
          placeholder="https://..."
        />
      </div>
    </div>
  );
}

export type LessonFormState = {
  titleRu: string;
  titleEn: string;
  contentRu: string;
  contentEn: string;
  videoUrl: string;
  kinescopeVideoId: string | null;
  sortOrder: number;
};

export const emptyLessonForm = (): LessonFormState => ({
  titleRu: "",
  titleEn: "",
  contentRu: "",
  contentEn: "",
  videoUrl: "",
  kinescopeVideoId: null,
  sortOrder: 1,
});

export function LessonFormFields({
  value,
  onChange,
}: {
  value: LessonFormState;
  onChange: (next: LessonFormState) => void;
}) {
  const { t } = useAdminLang();
  const set = (patch: Partial<LessonFormState>) => onChange({ ...value, ...patch });

  const onVideoSelected = (videoId: string, videoTitle: string) => {
    set({
      kinescopeVideoId: videoId,
      titleRu: value.titleRu || videoTitle,
      titleEn: value.titleEn || videoTitle,
    });
  };

  return (
    <>
      <div className="admin-section-block">
        <p className="admin-section-heading">{t("Видео", "Video")}</p>
        <p className="muted text-body-sm" style={{ margin: 0 }}>
          {t("Загрузите файл или выберите из библиотеки (папка → видео).", "Upload a file or pick from the library (folder → video).")}
        </p>
        <VideoUpload
          kinescopeVideoId={value.kinescopeVideoId}
          onVideoChange={(id) => set({ kinescopeVideoId: id })}
          onVideoSelected={onVideoSelected}
          lessonTitle={value.titleRu || value.titleEn}
        />
      </div>

      <div className="admin-section-block">
        <p className="admin-section-heading">{t("Названия", "Titles")}</p>
        <BilingualField
          labelRu="Название RU"
          labelEn="Title EN"
          valueRu={value.titleRu}
          valueEn={value.titleEn}
          onChangeRu={(v) => set({ titleRu: v })}
          onChangeEn={(v) => set({ titleEn: v })}
          placeholder={t("Название урока", "Lesson title")}
        />
      </div>

      <div className="admin-section-block">
        <p className="admin-section-heading">{t("Альтернатива", "Alternative")}</p>
        <div className="form-field">
          <label className="form-label">{t("Внешнее видео (URL)", "External video URL")}</label>
          <input
            className="input"
            value={value.videoUrl}
            onChange={(e) => set({ videoUrl: e.target.value })}
            placeholder="https://..."
            disabled={!!value.kinescopeVideoId}
          />
        </div>
      </div>

      <div className="admin-section-block">
        <p className="admin-section-heading">{t("Конспект", "Notes")}</p>
        <BilingualField
          labelRu="Конспект RU"
          labelEn="Content EN"
          valueRu={value.contentRu}
          valueEn={value.contentEn}
          onChangeRu={(v) => set({ contentRu: v })}
          onChangeEn={(v) => set({ contentEn: v })}
          placeholder={t("Конспект урока (markdown)", "Lesson notes (markdown)")}
          multiline
          rows={6}
        />
      </div>
    </>
  );
}
