"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  type CommunityCategory,
  type CommunityTopic,
  communityCategories,
  communityCreateTopic,
  getCommunityAuthState,
} from "@/features/api";
import { InlineAlert } from "@/shared/ui/components";
import { CommunityMarkdown } from "@/features/community/components";
import { MarkdownComposer } from "@/features/community/MarkdownComposer";

// ── Icons ───────────────────────────────────────────────────────

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
  </svg>
);

const InfoIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const LightbulbIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="18" x2="15" y2="18" /><line x1="10" y1="22" x2="14" y2="22" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const CheckSuccessIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 34, height: 34 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── Category hints ───────────────────────────────────────────────

const CATEGORY_TIPS: Record<string, string> = {
  "cat-learning": "Укажите модуль/урок и конкретный момент в программе",
  "cat-practice": "Опишите задание и где возникли затруднения",
  "cat-ai": "Укажите инструмент, задачу и ожидаемый результат",
  "cat-project": "Поделитесь этапом проекта или требованиями к портфолио",
  "cat-community": "Опишите контекст — без привязки к конкретному уроку",
  "cat-micro": "Один тезис или находка; полные темы — через «Вопросы»",
  "cat-platform": "Будьте конкретны: экран, шаги, ожидание vs факт",
};

const TIPS = [
  { icon: <LightbulbIcon />, text: "До одобрения тему видите только вы и администраторы — в общих списках её нет" },
  { icon: <ClockIcon />, text: "После одобрения тема открыта 24 часа для обсуждения" },
  { icon: <SparkleIcon />, text: "Gemini составит AI-резюме после закрытия темы" },
];

// ── Success state ────────────────────────────────────────────────

function SuccessState({ topic }: { topic: CommunityTopic }) {
  return (
    <div style={{ maxWidth: 520, margin: "60px auto 0", textAlign: "center", padding: "0 24px" }}>
      <div style={{
        width: 68, height: 68, borderRadius: "50%",
        background: "linear-gradient(135deg, #10b981, #059669)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 22px", color: "#fff",
      }}>
        <CheckSuccessIcon />
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0b1020", margin: "0 0 10px", letterSpacing: "-0.4px" }}>
        Ушло на модерацию
      </h1>
      <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.65, margin: "0 0 12px", fontWeight: 600 }}>
        Тема сохранена и отправлена администратору на проверку.
      </p>
      <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 12px" }}>
        Пока её не одобрят, другие участники <strong>не увидят</strong> тему в разделе вопросов и в общей ленте.
        Вы можете открыть страницу темы по ссылке ниже — для вас она доступна с пометкой «Модерация».
      </p>
      <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 24px" }}>
        После одобрения участники смогут обсуждать её ровно <strong>24 часа</strong>.
      </p>
      <div className="hub-info-card" style={{ textAlign: "left", marginBottom: 16 }}>
        <div className="hub-info-card-header">Ваша тема</div>
        <div className="hub-info-card-body">
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0b1020" }}>{topic.title}</div>
          <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {topic.body.replace(/[#*`[\]~]/g, "")}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        <Link href={`/community/topics/${topic.id}`} className="hub-btn-primary">
          Открыть тему
        </Link>
        <Link href="/community/topics" className="hub-btn-ghost">К обсуждениям</Link>
        <Link href="/community/dashboard" className="hub-btn-ghost">На главную ленту</Link>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────

export default function NewTopicPage() {
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [preview, setPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<CommunityTopic | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submitInFlightRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const auth = getCommunityAuthState();
    if (!auth) { router.replace("/community"); return; }
    communityCategories({ forKind: "discussion", suggested: true }).then(setCategories).catch(() => {});
  }, [router]);

  const handleSubmit = async () => {
    if (submitting || submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    setError(null);
    if (title.trim().length < 5) {
      setError("Заголовок слишком короткий — минимум 5 символов");
      submitInFlightRef.current = false;
      return;
    }
    if (body.trim().length < 30) {
      setError("Описание слишком короткое — нужно минимум 30 символов");
      submitInFlightRef.current = false;
      return;
    }
    setSubmitting(true);
    try {
      const topic = await communityCreateTopic({
        title: title.trim(),
        body: body.trim(),
        categoryId: categoryId || null,
        isAnonymous,
        topicKind: "discussion",
      });
      setSubmitted(topic);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  if (submitted) {
    return <SuccessState topic={submitted} />;
  }

  const categoryTip = categoryId ? CATEGORY_TIPS[categoryId] : null;
  const charCount = body.length;
  const charMax = 10000;
  const canSubmit = title.trim().length >= 5 && body.trim().length >= 30;

  return (
      <div className="hub-new-topic-page">

        {/* Breadcrumb */}
        <nav className="hub-new-topic-breadcrumb">
          <Link href="/community/dashboard">Лента</Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#d1d5db" }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <Link href="/community/topics">Вопросы</Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#d1d5db" }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Новая тема</span>
        </nav>

        <div className="hub-new-topic-grid">

          {/* ── Main form ── */}
          <div>
            <h1 className="hub-new-topic-heading">Предложить тему для обсуждения</h1>
            <p className="hub-new-topic-sub">
              Сначала тема уходит <strong>на модерацию</strong>: до одобрения администратором её не видят другие участники.
              После проверки тема откроется на&nbsp;24&nbsp;часа для обсуждения.
            </p>

            <div className="hub-feed-composer__moderation-banner hub-new-topic-moderation-banner" role="status" style={{ marginBottom: 20 }}>
              <strong>Не публикуется сразу</strong>
              <span>
                После нажатия «Отправить на рассмотрение» тема попадает в очередь проверки. В списках сообщества она появится только после решения администратора.
              </span>
            </div>
            <div className="hub-info-card" style={{ marginBottom: 20 }}>
              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Category */}
                <div className="hub-field">
                  <label className="hub-field-label">Категория</label>
                  <select
                    className="hub-disc-search-field"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="">Без категории</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.nameRu}</option>
                    ))}
                  </select>
                  {categoryTip && (
                    <p className="hub-field-hint">
                      <InfoIcon />{categoryTip}
                    </p>
                  )}
                </div>

                {/* Title */}
                <div className="hub-field">
                  <label className="hub-field-label">
                    Заголовок <em>*</em>
                  </label>
                  <input
                    className="hub-disc-search-field"
                    type="text"
                    placeholder="Кратко и конкретно: что вы хотите обсудить?"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setError(null); }}
                    maxLength={200}
                    style={{ width: "100%" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "#ef4444", visibility: title.length > 0 && title.length < 5 ? "visible" : "hidden" }}>
                      Минимум 5 символов
                    </span>
                    <span className={`hub-field-counter${title.length > 180 ? " hub-field-counter--warn" : ""}`}>
                      {title.length}/200
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="hub-field">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                    <label className="hub-field-label" style={{ marginBottom: 0 }}>
                      Описание <em>*</em>
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>
                        Правый клик — форматирование
                      </span>
                      <div className="hub-preview-tabs">
                        <button type="button" className={`hub-preview-tab${!preview ? " hub-preview-tab--active" : ""}`} onClick={() => setPreview(false)}>
                          Редактор
                        </button>
                        <button type="button" className={`hub-preview-tab${preview ? " hub-preview-tab--active" : ""}`} onClick={() => setPreview(true)}>
                          Просмотр
                        </button>
                      </div>
                    </div>
                  </div>

                  {!preview ? (
                    <MarkdownComposer
                      value={body}
                      onChange={(v) => { setBody(v); setError(null); }}
                      rows={12}
                      maxLength={10000}
                      placeholder={"Опишите подробно:\n• Что именно хотите обсудить?\n• Какой контекст важен?\n• Что уже пробовали?\n\nПравый клик мыши открывает меню форматирования."}
                      textareaRef={textareaRef}
                      className="hub-disc-search-field"
                      textareaStyle={{
                        width: "100%",
                        resize: "vertical",
                        fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', monospace",
                        fontSize: 13,
                        lineHeight: 1.7,
                        minHeight: 220,
                      }}
                    />
                  ) : (
                    <div style={{
                      minHeight: 220, padding: "14px 16px",
                      background: "#f9fafb", border: "1px solid rgba(0,0,0,0.09)",
                      borderRadius: 9, fontSize: 14, lineHeight: 1.7, color: "#0b1020",
                    }}>
                      {body.trim()
                        ? <CommunityMarkdown body={body} />
                        : <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0 }}>Начните вводить текст…</p>
                      }
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <span className={`hub-field-counter${charCount > charMax * 0.9 ? " hub-field-counter--warn" : ""}`}>
                      {charCount.toLocaleString()}/{charMax.toLocaleString()}
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Anonymous toggle */}
            <div
              className={`hub-anon-toggle${isAnonymous ? " hub-anon-toggle--active" : ""}`}
              onClick={() => setIsAnonymous(a => !a)}
              style={{ marginBottom: 20 }}
            >
              <div style={{ flexShrink: 0, marginTop: 1 }}>
                <div className={`hub-anon-track${isAnonymous ? " hub-anon-track--active" : ""}`}>
                  <div className="hub-anon-thumb" />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1 }}>
                <div style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0, color: isAnonymous ? "#1d4ed8" : "#9ca3af" }}>
                  {isAnonymous ? <EyeOffIcon /> : <UserIcon />}
                </div>
                <div>
                  <div className="hub-anon-label">
                    {isAnonymous ? "Анонимная публикация" : "От своего имени"}
                  </div>
                  <div className="hub-anon-desc">
                    {isAnonymous
                      ? "Ваше имя скрыто. В групповом чате вы сможете раскрыть личность."
                      : "Ваше имя будет видно участникам обсуждения."}
                  </div>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && <InlineAlert tone="error">{error}</InlineAlert>}

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
              <button
                className="hub-btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !canSubmit}
                style={{ opacity: !canSubmit ? 0.5 : 1 }}
              >
                {submitting
                  ? <><LoadingSpinner />Отправка на модерацию…</>
                  : <><SendIcon />Отправить на модерацию</>
                }
              </button>
              <Link href="/community/topics" className="hub-btn-ghost">Отмена</Link>
            </div>

          </div>

          {/* ── Right sidebar ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 32 }}>

            {/* How it works */}
            <div className="hub-info-card-dark">
              <div style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 15, height: 15, color: "#4aadff" }}><ClockIcon /></div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Как это работает</span>
                </div>
                {[
                  "Отправляете тему — она уходит на модерацию",
                  "Другие участники её не видят, пока админ не одобрит",
                  "После одобрения — 24 ч обсуждения",
                  "Закрывается → AI-резюме в архиве",
                ].map((text, i) => (
                  <div key={i} className="hub-step" style={{ marginBottom: i < 3 ? 10 : 0 }}>
                    <div className="hub-step-num">{i + 1}</div>
                    <span className="hub-step-text">{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="hub-info-card">
              <div className="hub-info-card-header">
                <LightbulbIcon />
                Советы
              </div>
              <div className="hub-info-card-body">
                {TIPS.map((tip, i) => (
                  <div key={i} className="hub-tip">
                    <div className="hub-tip-icon">{tip.icon}</div>
                    <span className="hub-tip-text">{tip.text}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
  );
}

function LoadingSpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 0.8s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
