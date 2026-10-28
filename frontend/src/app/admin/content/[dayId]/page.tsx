"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  adminContentDay,
  adminUpsertArtifact,
  adminUpsertHomeworkTemplate,
  adminDeleteArtifact,
  adminDeleteHomeworkTemplate,
  adminReorderLessons,
  adminCourses,
  adminCourseLessons,
  adminAssignLessonToDay,
  adminUnassignLessonFromDay,
  adminUpdateLesson,
  type AdminCourse,
  type AdminCourseLesson,
} from "@/features/api";
import { Badge, Button, Card } from "@/shared/ui/components";
import { BilingualField } from "@/features/admin/bilingual-field";
import { ConfirmDialog } from "@/features/admin/confirm-dialog";
import { VideoUpload } from "@/features/admin/video-upload";
import { AdminDrawer } from "@/features/admin/admin-drawer";
import { useToast } from "@/features/admin/toast";
import { useAdminLang } from "@/features/admin/i18n";

type DayData = Awaited<ReturnType<typeof adminContentDay>>;
type Artifact = DayData["artifacts"][number];
type HwTemplate = DayData["homeworkTemplates"][number];

type EditingType = "artifact" | "homework" | null;

const TRACK_TONES: Record<string, "primary" | "success" | "warning"> = { A: "primary", B: "success", C: "warning" };

export default function ContentDayPage({ params }: { params: Promise<{ dayId: string }> }) {
  const { dayId } = use(params);
  const { toast } = useToast();
  const { t } = useAdminLang();

  const [day, setDay] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingType, setEditingType] = useState<EditingType>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [artifactForm, setArtifactForm] = useState({ titleRu: "", titleEn: "", resourceUrl: "" });
  const [hwForm, setHwForm] = useState({ instructionRu: "", instructionEn: "", sampleRu: "", sampleEn: "", minLength: 20, lessonId: "" });
  const [deleteTarget, setDeleteTarget] = useState<{ type: EditingType | "lesson"; id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Course picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [allCourses, setAllCourses] = useState<AdminCourse[]>([]);
  const [pickerCourseId, setPickerCourseId] = useState<string | null>(null);
  const [pickerLessons, setPickerLessons] = useState<AdminCourseLesson[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Inline lesson editor state
  const [editLessonId, setEditLessonId] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState({
    titleRu: "",
    titleEn: "",
    contentRu: "",
    contentEn: "",
    videoUrl: "",
    kinescopeVideoId: null as string | null,
    kind: "mandatory" as "mandatory" | "optional",
  });
  const [lessonSaving, setLessonSaving] = useState(false);

  const reload = useCallback(async () => {
    try { setDay(await adminContentDay(dayId)); } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  }, [dayId, toast, t]);

  useEffect(() => { setLoading(true); reload().finally(() => setLoading(false)); }, [reload]);

  const closeEditor = () => { setEditingType(null); setEditingId(null); };

  // Course picker logic
  const openPicker = async () => {
    setPickerOpen(true);
    setPickerCourseId(null);
    setPickerLessons([]);
    try { setAllCourses(await adminCourses()); } catch { /* */ }
  };

  const selectPickerCourse = async (courseId: string) => {
    setPickerCourseId(courseId);
    setPickerLoading(true);
    try { setPickerLessons(await adminCourseLessons(courseId)); } catch { /* */ }
    setPickerLoading(false);
  };

  const assignLesson = async (lessonId: string, kind: "mandatory" | "optional") => {
    try {
      await adminAssignLessonToDay(dayId, lessonId, kind);
      toast(t("Урок назначен на день", "Lesson assigned to day"), "success");
      await reload();
      if (pickerCourseId) await selectPickerCourse(pickerCourseId);
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const unassignLesson = async (lessonId: string) => {
    try {
      await adminUnassignLessonFromDay(dayId, lessonId);
      toast(t("Урок убран из дня", "Lesson removed from day"), "success");
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const openLessonEditor = (lesson: DayData["lessons"][number]) => {
    setEditLessonId(lesson.id);
    setLessonForm({
      titleRu: lesson.titleRu, titleEn: lesson.titleEn,
      contentRu: lesson.contentRu || "", contentEn: lesson.contentEn || "",
      videoUrl: lesson.videoUrl || "", kinescopeVideoId: lesson.kinescopeVideoId || null,
      kind: lesson.kind,
    });
  };

  const closeLessonDrawer = () => {
    setEditLessonId(null);
  };

  const handleVideoSelected = (videoId: string, videoTitle: string) => {
    setLessonForm((prev) => ({
      ...prev,
      kinescopeVideoId: videoId,
      titleRu: prev.titleRu || videoTitle,
      titleEn: prev.titleEn || videoTitle,
    }));
  };

  const saveLessonEdit = async () => {
    if (!editLessonId) return;
    setLessonSaving(true);
    try {
      await adminUpdateLesson(editLessonId, {
        titleRu: lessonForm.titleRu,
        titleEn: lessonForm.titleEn,
        contentRu: lessonForm.contentRu,
        contentEn: lessonForm.contentEn,
        videoUrl: lessonForm.videoUrl,
        kinescopeVideoId: lessonForm.kinescopeVideoId,
        kind: lessonForm.kind,
      });
      toast(t("Урок обновлён", "Lesson updated"), "success");
      closeLessonDrawer();
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
    setLessonSaving(false);
  };

  // Webinar/Artifact/HW editors (unchanged)
  const openArtifactEditor = (a?: Artifact) => {
    if (a) { setArtifactForm({ titleRu: a.titleRu, titleEn: a.titleEn, resourceUrl: a.resourceUrl }); setEditingId(a.id); }
    else { setArtifactForm({ titleRu: "", titleEn: "", resourceUrl: "" }); setEditingId(null); }
    setEditingType("artifact");
  };
  const openHwEditor = (hw?: HwTemplate) => {
    if (hw) { setHwForm({ instructionRu: hw.instructionRu, instructionEn: hw.instructionEn, sampleRu: hw.sampleRu, sampleEn: hw.sampleEn, minLength: hw.minLength, lessonId: hw.lessonId ?? "" }); setEditingId(hw.id); }
    else { setHwForm({ instructionRu: "", instructionEn: "", sampleRu: "", sampleEn: "", minLength: 20, lessonId: "" }); setEditingId(null); }
    setEditingType("homework");
  };

  const saveArtifact = async () => {
    setSaving(true);
    try {
      await adminUpsertArtifact({ curriculumDayId: dayId, titleRu: artifactForm.titleRu, titleEn: artifactForm.titleEn, resourceUrl: artifactForm.resourceUrl, ...(editingId ? { artifactId: editingId } : {}) });
      toast(editingId ? t("Артефакт обновлён", "Artifact updated") : t("Артефакт создан", "Artifact created"), "success");
      closeEditor(); await reload();
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
    setSaving(false);
  };
  const saveHwTemplate = async () => {
    setSaving(true);
    try {
      await adminUpsertHomeworkTemplate({ curriculumDayId: dayId, instructionRu: hwForm.instructionRu, instructionEn: hwForm.instructionEn, sampleRu: hwForm.sampleRu, sampleEn: hwForm.sampleEn, minLength: hwForm.minLength, lessonId: hwForm.lessonId || null, ...(editingId ? { templateId: editingId } : {}) });
      toast(editingId ? t("Шаблон ДЗ обновлён", "HW template updated") : t("Шаблон ДЗ создан", "HW template created"), "success");
      closeEditor(); await reload();
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "lesson") {
        await unassignLesson(deleteTarget.id);
      } else {
        switch (deleteTarget.type) {
          case "artifact": await adminDeleteArtifact(deleteTarget.id); break;
          case "homework": await adminDeleteHomeworkTemplate(deleteTarget.id); break;
        }
        toast(t("Удалено", "Deleted"), "success");
        if (editingId === deleteTarget.id) closeEditor();
        await reload();
      }
      setDeleteTarget(null);
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка удаления", "Delete failed"), "error"); }
  };

  const moveLessonUp = async (idx: number) => {
    if (!day || idx <= 0) return;
    const ids = day.lessons.map((l) => l.id);
    [ids[idx - 1], ids[idx]] = [ids[idx]!, ids[idx - 1]!];
    try { await adminReorderLessons(dayId, ids); await reload(); } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };
  const moveLessonDown = async (idx: number) => {
    if (!day || idx >= day.lessons.length - 1) return;
    const ids = day.lessons.map((l) => l.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1]!, ids[idx]!];
    try { await adminReorderLessons(dayId, ids); await reload(); } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  if (loading) return <div className="stack" style={{ padding: 32 }}><p className="muted">{t("Загрузка...", "Loading...")}</p></div>;
  if (!day) return <div className="stack" style={{ padding: 32 }}><Link href="/admin/content" className="link-button ghost small">← {t("К контенту", "Back to content")}</Link><p className="muted">{t("День не найден.", "Day not found.")}</p></div>;

  const dayLessonIds = new Set(day.lessons.map((l) => l.id));
  const pickerAvailable = pickerLessons.filter((l) => !dayLessonIds.has(l.id));

  const typeLabels: Record<string, string> = { lesson: t("урок", "lesson"), artifact: t("артефакт", "artifact"), homework: t("шаблон ДЗ", "HW template") };

  const editingLessonRow = editLessonId ? day.lessons.find((l) => l.id === editLessonId) : undefined;

  return (
    <div className="stack" style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <Link href="/admin/content" className="link-button ghost small">← {t("К контенту", "Back to content")}</Link>

      <header style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <h1 className="page-title" style={{ margin: 0 }}>{t("День", "Day")} {day.dayNumber} — {day.phase}</h1>
          {day.track && <Badge tone={TRACK_TONES[day.track] ?? "neutral"}>{t("Трек", "Track")} {day.track}</Badge>}
        </div>
        <p className="muted text-body-sm" style={{ marginTop: 4 }}>{day.focusRu} / {day.focusEn}</p>
      </header>

      {/* LESSONS — now a picker from courses */}
      <Card>
        <div className="row between">
          <h3 className="text-h3" style={{ margin: 0 }}>{t("Уроки", "Lessons")} ({day.lessons.length})</h3>
          <Button className="small" tone="primary" onClick={() => pickerOpen ? setPickerOpen(false) : void openPicker()}>
            {pickerOpen ? t("Закрыть", "Close") : `+ ${t("Из курса", "From course")}`}
          </Button>
        </div>

        {day.lessons.length === 0 && !pickerOpen && <p className="muted text-body-sm section-top-sm">{t("Уроков пока нет. Добавьте из курса.", "No lessons yet. Add from a course.")}</p>}

        <div className="entity-list section-top-sm">
          {day.lessons.map((lesson, idx) => (
            <div key={lesson.id}>
              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: editLessonId === lesson.id ? "var(--surface-muted)" : undefined }}
                onClick={() => (editLessonId === lesson.id ? closeLessonDrawer() : openLessonEditor(lesson))}
              >
                <div className="row" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-muted)", minWidth: 24 }}>#{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{lesson.titleRu || lesson.titleEn || t("(без названия)", "(untitled)")}</span>
                    <div className="row" style={{ gap: 6, marginTop: 2 }}>
                      <Badge tone={lesson.kind === "mandatory" ? "primary" : "neutral"}>
                        {lesson.kind === "mandatory" ? t("Обязательный", "Mandatory") : t("Дополнительный", "Optional")}
                      </Badge>
                      {lesson.kinescopeVideoId && <Badge tone="success">{t("Видео", "Video")}</Badge>}
                      {lesson.videoUrl && !lesson.kinescopeVideoId && <Badge tone="neutral">{t("Внешнее видео", "Ext. video")}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  <button type="button" className="button secondary small" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); void moveLessonUp(idx); }}>↑</button>
                  <button type="button" className="button secondary small" disabled={idx === day.lessons.length - 1} onClick={(e) => { e.stopPropagation(); void moveLessonDown(idx); }}>↓</button>
                  <button type="button" className="icon-action danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "lesson", id: lesson.id, label: lesson.titleRu || lesson.titleEn }); }} title={t("Убрать из дня", "Remove from day")}>×</button>
                </div>
              </div>

            </div>
          ))}
        </div>

        {/* Course → Lesson picker */}
        {pickerOpen && (
          <div className="section-top-sm" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <p className="text-body-sm" style={{ fontWeight: 600, marginBottom: 8 }}>{t("Выберите курс:", "Select a course:")}</p>
            <div className="chip-grid">
              {allCourses.map((c) => (
                <button key={c.id} type="button" className={`button small ${pickerCourseId === c.id ? "primary" : "secondary"}`} onClick={() => void selectPickerCourse(c.id)}>
                  {c.titleRu || c.titleEn} ({c.lessonCount})
                </button>
              ))}
              {allCourses.length === 0 && <p className="muted text-body-sm">{t("Нет курсов. Создайте курс в разделе Курсы.", "No courses. Create one in the Courses section.")}</p>}
            </div>

            {pickerCourseId && (
              <div style={{ marginTop: 12 }}>
                {pickerLoading ? <p className="muted text-body-sm">{t("Загрузка...", "Loading...")}</p> : (
                  <div className="entity-list" style={{ maxHeight: 300, overflow: "auto" }}>
                    {pickerAvailable.length === 0 && (
                      <p className="muted text-body-sm" style={{ padding: "8px 0" }}>
                        {pickerLessons.length === 0
                          ? t("В курсе нет уроков.", "No lessons in this course.")
                          : t("Все уроки курса уже в этом дне.", "All course lessons are already in this day.")}
                      </p>
                    )}
                    {pickerAvailable.map((l) => (
                      <div key={l.id} style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600 }}>{l.titleRu || l.titleEn || l.id}</span>
                          <div className="row" style={{ gap: 6, marginTop: 2 }}>
                            {l.kinescopeVideoId && <Badge tone="success">{t("Видео", "Video")}</Badge>}
                            {l.assignedDays.length > 0 && (
                              <Badge tone="warning">
                                {l.assignedDays.map((d) => `${t("День", "Day")} ${d.dayNumber}${d.track ? ` (${t("Трек", "Track")} ${d.track})` : ""}`).join(", ")}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                          <Button className="small" tone="primary" onClick={() => void assignLesson(l.id, "mandatory")}>
                            + {t("Обязательный", "Mandatory")}
                          </Button>
                          <Button className="small" tone="secondary" onClick={() => void assignLesson(l.id, "optional")}>
                            + {t("Дополнительный", "Optional")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ARTIFACTS */}
      <Card>
        <div className="row between">
          <h3 className="text-h3" style={{ margin: 0 }}>{t("Артефакты", "Artifacts")} ({day.artifacts.length})</h3>
          <Button className="small" tone="primary" onClick={() => openArtifactEditor()}>+ {t("Добавить", "Add")}</Button>
        </div>
        {day.artifacts.length === 0 && <p className="muted text-body-sm section-top-sm">{t("Артефактов пока нет.", "No artifacts yet.")}</p>}
        <div className="entity-list section-top-sm">
          {day.artifacts.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: editingType === "artifact" && editingId === a.id ? "var(--surface-muted)" : undefined }} onClick={() => openArtifactEditor(a)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{a.titleRu || a.titleEn || t("(без названия)", "(untitled)")}</span>
                {a.resourceUrl && <p className="muted text-body-sm" style={{ marginTop: 2, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.resourceUrl}</p>}
              </div>
              <button type="button" className="icon-action danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "artifact", id: a.id, label: a.titleRu || a.titleEn }); }}>×</button>
            </div>
          ))}
        </div>
        {editingType === "artifact" && (
          <div className="form-grid section-top-sm" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <BilingualField labelRu="Title RU" labelEn="Title EN" valueRu={artifactForm.titleRu} valueEn={artifactForm.titleEn} onChangeRu={(v) => setArtifactForm((p) => ({ ...p, titleRu: v }))} onChangeEn={(v) => setArtifactForm((p) => ({ ...p, titleEn: v }))} placeholder={t("Название", "Title")} />
            <div className="form-field"><label className="form-label">{t("URL ресурса", "Resource URL")}</label><input className="input" value={artifactForm.resourceUrl} onChange={(e) => setArtifactForm((p) => ({ ...p, resourceUrl: e.target.value }))} placeholder="https://..." /></div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <Button onClick={() => void saveArtifact()} disabled={saving}>{editingId ? t("Сохранить", "Save") : t("Создать", "Create")}</Button>
              <Button tone="ghost" onClick={closeEditor}>{t("Отмена", "Cancel")}</Button>
            </div>
          </div>
        )}
      </Card>

      {/* HW TEMPLATES */}
      <Card>
        <div className="row between">
          <h3 className="text-h3" style={{ margin: 0 }}>{t("Шаблоны ДЗ", "HW Templates")} ({day.homeworkTemplates.length})</h3>
          <Button className="small" tone="primary" onClick={() => openHwEditor()}>+ {t("Добавить", "Add")}</Button>
        </div>
        {day.homeworkTemplates.length === 0 && <p className="muted text-body-sm section-top-sm">{t("Шаблонов ДЗ пока нет.", "No HW templates yet.")}</p>}
        <div className="entity-list section-top-sm">
          {day.homeworkTemplates.map((hw) => {
            const linked = hw.lessonId ? day.lessons.find((l) => l.id === hw.lessonId) : null;
            return (
              <div key={hw.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: editingType === "homework" && editingId === hw.id ? "var(--surface-muted)" : undefined }} onClick={() => openHwEditor(hw)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{(hw.instructionRu || hw.instructionEn || t("(пусто)", "(empty)")).slice(0, 80)}</span>
                  <div className="row" style={{ gap: 6, marginTop: 2 }}>
                    <Badge tone="neutral">Min {hw.minLength}</Badge>
                    {linked && <span className="muted" style={{ fontSize: 12 }}>→ {linked.titleRu || linked.titleEn}</span>}
                  </div>
                </div>
                <button type="button" className="icon-action danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "homework", id: hw.id, label: (hw.instructionRu || hw.instructionEn).slice(0, 40) }); }}>×</button>
              </div>
            );
          })}
        </div>
        {editingType === "homework" && (
          <div className="form-grid section-top-sm" style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <BilingualField labelRu="Instruction RU" labelEn="Instruction EN" valueRu={hwForm.instructionRu} valueEn={hwForm.instructionEn} onChangeRu={(v) => setHwForm((p) => ({ ...p, instructionRu: v }))} onChangeEn={(v) => setHwForm((p) => ({ ...p, instructionEn: v }))} placeholder={t("Инструкция к ДЗ", "HW instructions")} multiline rows={5} />
            <BilingualField labelRu="Sample RU" labelEn="Sample EN" valueRu={hwForm.sampleRu} valueEn={hwForm.sampleEn} onChangeRu={(v) => setHwForm((p) => ({ ...p, sampleRu: v }))} onChangeEn={(v) => setHwForm((p) => ({ ...p, sampleEn: v }))} placeholder={t("Пример ответа", "Sample")} multiline rows={4} />
            <div className="form-field"><label className="form-label">{t("Мин. длина", "Min length")}</label><input className="input" type="number" value={hwForm.minLength} onChange={(e) => setHwForm((p) => ({ ...p, minLength: Number(e.target.value) || 1 }))} /></div>
            <div className="form-field">
              <label className="form-label">{t("Привязанный урок", "Linked lesson")}</label>
              <select className="input" value={hwForm.lessonId} onChange={(e) => setHwForm((p) => ({ ...p, lessonId: e.target.value }))}>
                <option value="">— {t("Нет", "None")} —</option>
                {day.lessons.map((l) => <option key={l.id} value={l.id}>{l.titleRu || l.titleEn || l.id}</option>)}
              </select>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <Button onClick={() => void saveHwTemplate()} disabled={saving}>{editingId ? t("Сохранить", "Save") : t("Создать", "Create")}</Button>
              <Button tone="ghost" onClick={closeEditor}>{t("Отмена", "Cancel")}</Button>
            </div>
          </div>
        )}
      </Card>

      <AdminDrawer
        open={editLessonId !== null}
        title={t("Редактировать урок", "Edit lesson")}
        subtitle={editingLessonRow?.titleRu || editingLessonRow?.titleEn || ""}
        onClose={closeLessonDrawer}
        width={640}
        footer={(
          <div className="row" style={{ gap: 10, width: "100%", justifyContent: "flex-end" }}>
            <Button tone="ghost" onClick={closeLessonDrawer} disabled={lessonSaving}>{t("Отмена", "Cancel")}</Button>
            <Button tone="primary" onClick={() => void saveLessonEdit()} disabled={lessonSaving}>{lessonSaving ? "…" : t("Сохранить", "Save")}</Button>
          </div>
        )}
      >
        <div className="admin-section-block">
          <p className="admin-section-heading">{t("Тип в программе", "Program type")}</p>
          <div className="form-field">
            <label className="form-label">{t("Обязательный / дополнительный", "Mandatory / optional")}</label>
            <select
              className="input"
              value={lessonForm.kind}
              onChange={(e) => setLessonForm((p) => ({ ...p, kind: e.target.value as "mandatory" | "optional" }))}
            >
              <option value="mandatory">{t("Обязательный", "Mandatory")}</option>
              <option value="optional">{t("Дополнительный", "Optional")}</option>
            </select>
          </div>
        </div>
        <div className="admin-section-block">
          <p className="admin-section-heading">{t("Названия", "Titles")}</p>
          <BilingualField
            labelRu="Title RU"
            labelEn="Title EN"
            valueRu={lessonForm.titleRu}
            valueEn={lessonForm.titleEn}
            onChangeRu={(v) => setLessonForm((p) => ({ ...p, titleRu: v }))}
            onChangeEn={(v) => setLessonForm((p) => ({ ...p, titleEn: v }))}
            placeholder={t("Название урока", "Lesson title")}
          />
        </div>
        <div className="admin-section-block">
          <p className="admin-section-heading">{t("Конспект", "Content")}</p>
          <BilingualField
            labelRu="Content RU"
            labelEn="Content EN"
            valueRu={lessonForm.contentRu}
            valueEn={lessonForm.contentEn}
            onChangeRu={(v) => setLessonForm((p) => ({ ...p, contentRu: v }))}
            onChangeEn={(v) => setLessonForm((p) => ({ ...p, contentEn: v }))}
            placeholder={t("Markdown конспект", "Markdown content")}
            multiline
            rows={6}
          />
        </div>
        <div className="admin-section-block">
          <p className="admin-section-heading">{t("Видео", "Video")}</p>
          <VideoUpload
            kinescopeVideoId={lessonForm.kinescopeVideoId}
            onVideoChange={(vid) => setLessonForm((p) => ({ ...p, kinescopeVideoId: vid }))}
            onVideoSelected={handleVideoSelected}
            lessonTitle={lessonForm.titleRu || lessonForm.titleEn}
          />
        </div>
        <div className="admin-section-block">
          <p className="admin-section-heading">{t("Альтернатива", "Alternative")}</p>
          <div className="form-field">
            <label className="form-label">{t("Внешнее видео URL", "External video URL")}</label>
            <input
              className="input"
              value={lessonForm.videoUrl}
              onChange={(e) => setLessonForm((p) => ({ ...p, videoUrl: e.target.value }))}
              placeholder="https://..."
            />
          </div>
        </div>
      </AdminDrawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.type === "lesson" ? `${t("Убрать урок из дня", "Remove lesson from day")}?` : `${t("Удалить", "Delete")} ${deleteTarget?.type ? typeLabels[deleteTarget.type] ?? deleteTarget.type : ""}?`}
        description={deleteTarget?.label ? `"${deleteTarget.label}" ${deleteTarget?.type === "lesson" ? t("будет убран из этого дня. Урок останется в курсе.", "will be removed from this day. Lesson stays in the course.") : t("будет удалён навсегда.", "will be permanently deleted.")}` : undefined}
        confirmLabel={deleteTarget?.type === "lesson" ? t("Убрать", "Remove") : t("Удалить", "Delete")}
        cancelLabel={t("Отмена", "Cancel")}
        tone="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
