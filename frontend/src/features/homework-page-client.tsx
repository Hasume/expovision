"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const Markdown = dynamic(() => import("react-markdown"), { ssr: false });
import {
  getHomeworkDraft,
  getHomeworkAiCoach,
  getHomeworkTemplate,
  homeworkEvidenceCheck,
  invalidateDashboardCache,
  myHomeworkSubmissions,
  saveHomeworkDraft,
  submitHomeworkWithEvidence,
  uploadHomeworkAttachments,
} from "@/features/api";
import { AppShell, BackToCourseLink, Badge, Button, Card, InlineAlert, Textarea } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionInstance) | null;
}

function useSpeechToText(
  lang: "ru" | "en",
  onTranscript: (text: string) => void,
) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const supported = typeof window !== "undefined" && getSpeechRecognitionConstructor() !== null;

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang === "ru" ? "ru-RU" : "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) {
          transcript += result[0]?.transcript ?? "";
        }
      }
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
    setListening(true);
  }, [listening, lang, onTranscript]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { listening, toggle, supported };
}

function MicButton({
  listening,
  onClick,
  supported,
  lang,
}: {
  listening: boolean;
  onClick: () => void;
  supported: boolean;
  lang: "ru" | "en";
}) {
  if (!supported) return null;
  return (
    <button
      type="button"
      className={`mic-btn ${listening ? "active" : ""}`}
      onClick={onClick}
      title={listening
        ? (lang === "ru" ? "Остановить запись" : "Stop recording")
        : (lang === "ru" ? "Голосовой ввод" : "Voice input")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    </button>
  );
}

export function HomeworkPageClient({ day }: { day: number }) {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const qs = `?lang=${lang}`;
  const [answer, setAnswer] = useState("");
  const [reflection, setReflection] = useState("");
  const [aiDisclosure, setAiDisclosure] = useState("");
  const [status, setStatus] = useState("");
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [curatorReview, setCuratorReview] = useState<{ comment: string | null; reviewedAt: string | null } | null>(null);
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof getHomeworkTemplate>> | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState("");
  const [coach, setCoach] = useState<Awaited<ReturnType<typeof getHomeworkAiCoach>> | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidence, setEvidence] = useState<Awaited<ReturnType<typeof homeworkEvidenceCheck>> | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState("");
  const isErrorStatus = /fail|error|ошиб|не удалось|invalid|denied|forbidden|unauthorized/i.test(status);

  useEffect(() => {
    setDraftLoaded(false);
    void (async () => {
      try {
        const [tpl, mine, draft] = await Promise.all([getHomeworkTemplate(day), myHomeworkSubmissions(), getHomeworkDraft(day)]);
        setTemplate(tpl);
        const found = mine.find((i) => i.dayNumber === day);
        setCurrentStatus(found?.status ?? null);
        setCuratorReview(
          found
            ? { comment: found.reviewComment ?? null, reviewedAt: found.reviewedAt ?? null }
            : null,
        );
        if (draft.exists) {
          setAnswer(draft.answerText ?? "");
          setReflection(draft.reflectionText ?? "");
          setAiDisclosure(draft.aiUsageDisclosure ?? "");
          setCoach(draft.coach ?? null);
          setEvidence(draft.evidence ?? null);
          setDraftSavedAt(draft.updatedAt ?? null);
        }
        setDraftLoaded(true);
      } catch (e) { setStatus(e instanceof Error ? e.message : "Failed to load"); }
    })();
  }, [day]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      setDraftState("saving");
      void saveHomeworkDraft({
        dayNumber: day,
        answerText: answer,
        reflectionText: reflection,
        aiUsageDisclosure: aiDisclosure,
        coach,
        evidence
      })
        .then((result) => {
          setDraftState("saved");
          setDraftSavedAt(result.updatedAt);
        })
        .catch(() => {
          setDraftState("error");
        });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [day, answer, reflection, aiDisclosure, coach, evidence, draftLoaded]);

  const onSubmit = async (): Promise<void> => {
    setUploadError("");
    try {
      let attachmentUrls: string[] = [];
      if (attachedFiles.length > 0) {
        const uploaded = await uploadHomeworkAttachments(attachedFiles);
        attachmentUrls = uploaded.map((f) => f.url);
      }
      const r = await submitHomeworkWithEvidence({
        dayNumber: day,
        answerText: answer,
        reflectionText: reflection,
        aiUsageDisclosure: aiDisclosure,
        attachmentUrls,
      });
      invalidateDashboardCache();
      const mine = await myHomeworkSubmissions();
      const found = mine.find((i) => i.dayNumber === day);
      setCurrentStatus(found?.status ?? r.status);
      setCuratorReview(
        found
          ? { comment: found.reviewComment ?? null, reviewedAt: found.reviewedAt ?? null }
          : null,
      );
      setAttachedFiles([]);
      setStatus(r.status === "overdue" ? (lang === "ru" ? "Отправлено после дедлайна — работа в очереди на проверку" : "Submitted past deadline — queued for review") : (lang === "ru" ? "Отправлено на проверку" : "Submitted for review"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg.toLowerCase().includes("file") || msg.toLowerCase().includes("upload")) {
        setUploadError(msg);
      } else {
        setStatus(msg);
      }
    }
  };

  const onCoach = async (): Promise<void> => {
    setCoachLoading(true);
    setCoachError("");
    try {
      const result = await getHomeworkAiCoach(day, answer);
      setCoach(result);
      await saveHomeworkDraft({
        dayNumber: day,
        answerText: answer,
        reflectionText: reflection,
        aiUsageDisclosure: aiDisclosure,
        coach: result,
        evidence
      });
      setDraftState("saved");
    } catch (e) {
      setCoachError(e instanceof Error ? e.message : "Failed to get AI feedback");
    } finally {
      setCoachLoading(false);
    }
  };

  const onEvidence = async (): Promise<void> => {
    setEvidenceLoading(true);
    setEvidenceError("");
    try {
      const result = await homeworkEvidenceCheck({
        dayNumber: day,
        answerText: answer,
        reflectionText: reflection,
        aiUsageDisclosure: aiDisclosure
      });
      setEvidence(result);
      await saveHomeworkDraft({
        dayNumber: day,
        answerText: answer,
        reflectionText: reflection,
        aiUsageDisclosure: aiDisclosure,
        coach,
        evidence: result
      });
      setDraftState("saved");
    } catch (e) {
      setEvidenceError(e instanceof Error ? e.message : "Failed to check evidence");
    } finally {
      setEvidenceLoading(false);
    }
  };

  const answerMic = useSpeechToText(lang, useCallback((t: string) => setAnswer((prev) => prev ? `${prev} ${t}` : t), []));
  const reflectionMic = useSpeechToText(lang, useCallback((t: string) => setReflection((prev) => prev ? `${prev} ${t}` : t), []));
  const aiDisclosureMic = useSpeechToText(lang, useCallback((t: string) => setAiDisclosure((prev) => prev ? `${prev} ${t}` : t), []));

  const badgeTone =
    currentStatus === "approved"
      ? "success"
      : currentStatus === "pending_review"
        ? "warning"
        : currentStatus === "overdue"
          ? "warning"
          : currentStatus === "rejected"
            ? "danger"
            : "neutral";
  const statusLabel = (() => {
    if (!currentStatus) return "";
    if (currentStatus === "approved") return lang === "ru" ? "Одобрено" : "Approved";
    if (currentStatus === "pending_review") return lang === "ru" ? "На проверке" : "In review";
    if (currentStatus === "rejected") return lang === "ru" ? "Нужно доработать" : "Needs revision";
    if (currentStatus === "overdue") return lang === "ru" ? "Сдано с опозданием" : "Submitted late";
    return currentStatus;
  })();

  return (
    <AppShell role="student" lang={lang} currentDay={day}>
      <div className="stack">
        <div className="row between">
          <BackToCourseLink href={`/dashboard${qs}`} lang={lang} />
          {currentStatus ? <Badge tone={badgeTone}>{statusLabel}</Badge> : null}
        </div>

        <header className="page-header">
          <h1 className="page-title">{lang === "ru" ? `Домашнее задание — День ${day}` : `Homework — Day ${day}`}</h1>
          <p className="page-subtitle">
            {template?.dueAtIso
              ? (lang === "ru"
                  ? `Сдать до: ${new Date(template.dueAtIso).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })} · день программы = 24 ч от старта потока`
                  : `Due by: ${new Date(template.dueAtIso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · program day = 24h from intensive start`)
              : (lang === "ru" ? "Дедлайн: конец текущего дня программы (24 ч от старта потока)" : "Deadline: end of current program day (24h from intensive start)")}
          </p>
          {draftLoaded ? (
            <p className="text-caption">
              {draftState === "saving"
                ? (lang === "ru" ? "Черновик сохраняется..." : "Draft is saving...")
                : draftState === "saved"
                ? (lang === "ru"
                    ? `Черновик сохранен${draftSavedAt ? ` · ${new Date(draftSavedAt).toLocaleTimeString()}` : ""}`
                    : `Draft saved${draftSavedAt ? ` · ${new Date(draftSavedAt).toLocaleTimeString()}` : ""}`)
                : draftState === "error"
                ? (lang === "ru" ? "Ошибка сохранения черновика" : "Draft save failed")
                : (lang === "ru" ? "Черновик готов" : "Draft ready")}
            </p>
          ) : null}
        </header>

        {curatorReview && (curatorReview.reviewedAt || currentStatus === "approved" || currentStatus === "rejected") ? (
          <Card>
            <h3 className="card-title">{lang === "ru" ? "Проверка куратора" : "Curator review"}</h3>
            <p className="no-margin">
              <strong>{lang === "ru" ? "Решение:" : "Decision:"}</strong>{" "}
              {currentStatus === "approved"
                ? (lang === "ru" ? "принято" : "approved")
                : currentStatus === "rejected"
                  ? (lang === "ru" ? "нужна доработка" : "needs revision")
                  : (lang === "ru" ? "см. комментарий" : "see feedback")}
            </p>
            {curatorReview.comment ? (
              <div className="content-muted-panel" style={{ marginTop: "12px" }}>
                <p className="text-caption-strong no-margin">{lang === "ru" ? "Комментарий" : "Feedback"}</p>
                <p className="text-body-sm no-margin" style={{ whiteSpace: "pre-wrap" }}>{curatorReview.comment}</p>
              </div>
            ) : null}
            {curatorReview.reviewedAt ? (
              <p className="muted text-caption" style={{ marginTop: "8px", marginBottom: 0 }}>
                {lang === "ru" ? "Проверено:" : "Reviewed:"}{" "}
                {new Date(curatorReview.reviewedAt).toLocaleString(lang === "ru" ? "ru-RU" : "en-US")}
              </p>
            ) : null}
            <p className="muted text-caption" style={{ marginTop: "8px", marginBottom: 0 }}>
              {lang === "ru"
                ? "Официальный результат — решение куратора (принято / доработка). Балл AI-коуча — подсказка до отправки, не итоговая оценка."
                : "Your official result is the curator decision (approved / needs revision). The AI coach score is pre-submit guidance, not the final grade."}
            </p>
          </Card>
        ) : null}

        <Card>
          <h3 className="card-title">{lang === "ru" ? "Задание" : "Assignment"}</h3>
          <div className="prose">
            <Markdown>{template?.instructionMd ?? "..."}</Markdown>
          </div>
          {template?.sampleMd ? (
            <div className="content-muted-panel">
              <div className="prose muted">
                <Markdown>{template.sampleMd}</Markdown>
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <h3 className="card-title">{lang === "ru" ? "Твой ответ" : "Your answer"}</h3>
          <div className="textarea-with-mic">
            <Textarea value={answer} onChange={setAnswer} rows={8} placeholder={lang === "ru" ? "Напиши ответ или нажми на микрофон..." : "Write your answer or tap the mic..."} />
            <MicButton listening={answerMic.listening} onClick={answerMic.toggle} supported={answerMic.supported} lang={lang} />
          </div>
          <div className="textarea-with-mic">
            <Textarea
              value={reflection}
              onChange={setReflection}
              rows={4}
              placeholder={lang === "ru" ? "Reflection: как ты выполнял задание и какие решения принял?" : "Reflection: how did you solve the task and make decisions?"}
            />
            <MicButton listening={reflectionMic.listening} onClick={reflectionMic.toggle} supported={reflectionMic.supported} lang={lang} />
          </div>
          <div className="textarea-with-mic">
            <Textarea
              value={aiDisclosure}
              onChange={setAiDisclosure}
              rows={3}
              placeholder={lang === "ru" ? "AI disclosure: какие AI-инструменты использовал и для чего?" : "AI disclosure: which AI tools did you use and for what?"}
            />
            <MicButton listening={aiDisclosureMic.listening} onClick={aiDisclosureMic.toggle} supported={aiDisclosureMic.supported} lang={lang} />
          </div>
          <div className="hw-attachments-picker">
            <p className="text-caption-strong" style={{ margin: "0 0 6px" }}>
              {lang === "ru" ? "Прикрепить файлы (до 10, макс. 20 МБ каждый)" : "Attach files (up to 10, max 20 MB each)"}
            </p>
            <label className="hw-attach-label">
              <input
                type="file"
                multiple
                accept="*/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setAttachedFiles((prev) => {
                    const merged = [...prev, ...picked];
                    return merged.slice(0, 10);
                  });
                  e.target.value = "";
                }}
              />
              <span className="button secondary small" style={{ cursor: "pointer" }}>
                {lang === "ru" ? "Выбрать файлы" : "Choose files"}
              </span>
            </label>
            {attachedFiles.length > 0 && (
              <ul className="hw-attach-list">
                {attachedFiles.map((f, idx) => (
                  <li key={`${f.name}-${idx}`} className="hw-attach-item">
                    <span className="hw-attach-name">{f.name}</span>
                    <span className="hw-attach-size muted">({(f.size / 1024).toFixed(0)} KB)</span>
                    <button
                      type="button"
                      className="hw-attach-remove"
                      onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                      title={lang === "ru" ? "Удалить" : "Remove"}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {uploadError ? <p className="text-caption" style={{ color: "var(--danger)", margin: "4px 0 0" }}>{uploadError}</p> : null}
          </div>

          <div className="section-actions section-top-sm">
            <Button onClick={() => void onSubmit()} disabled={!answer.trim()}>
              {lang === "ru" ? "Отправить домашнее задание" : "Submit homework"}
            </Button>
            <Button onClick={() => void onEvidence()} disabled={!answer.trim() || evidenceLoading} tone="secondary">
              {evidenceLoading ? "..." : (lang === "ru" ? "Проверить доказательства" : "Check evidence")}
            </Button>
            <Button onClick={() => void onCoach()} disabled={!answer.trim() || coachLoading} tone="secondary">
              {coachLoading ? "..." : (lang === "ru" ? "Получить AI-фидбек" : "Get AI feedback")}
            </Button>
          </div>
        </Card>

        {coach ? (
          <Card>
            <h3 className="card-title">{lang === "ru" ? "AI-коуч: разбор" : "AI coach feedback"}</h3>
            <p className="no-margin">
              <strong>{lang === "ru" ? "Оценка:" : "Score:"}</strong> {coach.score}/100
            </p>
            <div className="prose muted"><Markdown>{coach.summary}</Markdown></div>
            {coach.strengths.length ? (
              <div>
                <strong>{lang === "ru" ? "Сильные стороны:" : "Strengths:"}</strong>
                <ul>
                  {coach.strengths.map((item) => <li key={`s-${item}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            {coach.improvements.length ? (
              <div>
                <strong>{lang === "ru" ? "Что улучшить:" : "Improvements:"}</strong>
                <ul>
                  {coach.improvements.map((item) => <li key={`i-${item}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            {coach.nextSteps.length ? (
              <div>
                <strong>{lang === "ru" ? "Следующие шаги:" : "Next steps:"}</strong>
                <ul>
                  {coach.nextSteps.map((item) => <li key={`n-${item}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            {coach.reflectionQuestions.length ? (
              <div>
                <strong>{lang === "ru" ? "Вопросы для самопроверки:" : "Reflection questions:"}</strong>
                <ul>
                  {coach.reflectionQuestions.map((item) => <li key={`r-${item}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}

        {evidence ? (
          <Card>
            <h3 className="card-title">{lang === "ru" ? "Проверка доказательности" : "Evidence check"}</h3>
            <p className="no-margin">
              <strong>{lang === "ru" ? "Риск:" : "Risk:"}</strong> {evidence.riskScore}/100
            </p>
            <div className="prose muted"><Markdown>{evidence.assessment}</Markdown></div>
            {evidence.flags.length ? (
              <div>
                <strong>{lang === "ru" ? "Флаги:" : "Flags:"}</strong>
                <ul>
                  {evidence.flags.map((item) => <li key={`f-${item}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
            {evidence.followUpQuestions.length ? (
              <div>
                <strong>{lang === "ru" ? "Вопросы от куратора:" : "Follow-up questions:"}</strong>
                <ul>
                  {evidence.followUpQuestions.map((item) => <li key={`q-${item}`}>{item}</li>)}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}

        {evidenceError ? <InlineAlert tone="error">{evidenceError}</InlineAlert> : null}
        {coachError ? <InlineAlert tone="error">{coachError}</InlineAlert> : null}
        {status ? <InlineAlert tone={isErrorStatus ? "error" : "success"}>{status}</InlineAlert> : null}
      </div>
    </AppShell>
  );
}
