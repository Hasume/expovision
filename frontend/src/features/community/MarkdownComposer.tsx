"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEventHandler,
  type KeyboardEventHandler,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { communityPublicAssetUrl, communityUploadComposerImage, getCommunityAuthState } from "@/features/api";
import { CommunityMarkdown } from "@/features/community/components";

// ── Icons ─────────────────────────────────────────────────────────

const BoldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
  </svg>
);
const ItalicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
  </svg>
);
const CodeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);
const QuoteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
  </svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const ListOrderedIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
    <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
);
const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const Heading1Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="m17 12 3-2v8" />
  </svg>
);
const Heading2Icon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
  </svg>
);
const StrikeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4H9a3 3 0 0 0-2.83 4" /><path d="M14 12a4 4 0 0 1 0 8H6" />
    <line x1="4" y1="12" x2="20" y2="12" />
  </svg>
);
const CodeBlockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);
const HrIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);
const ClipIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

type MdAction = {
  label: string;
  icon: ReactNode;
  kbd?: string;
  apply: (sel: string) => { text: string; selStart: number; selEnd: number };
};

function wrap(before: string, after: string, sel: string, placeholder: string) {
  const t = sel || placeholder;
  return { text: `${before}${t}${after}`, selStart: before.length, selEnd: before.length + t.length };
}

function linePrefix(prefix: string, sel: string, placeholder: string) {
  const lines = (sel || placeholder).split("\n").map((l) => `${prefix}${l}`).join("\n");
  const firstLine = lines.split("\n")[0] ?? lines;
  return { text: lines, selStart: prefix.length, selEnd: prefix.length + firstLine.length };
}

const MD_ACTIONS: { section: string; items: MdAction[] }[] = [
  {
    section: "Форматирование",
    items: [
      { label: "Жирный", icon: <BoldIcon />, kbd: "Ctrl+B", apply: (s) => wrap("**", "**", s, "жирный текст") },
      { label: "Курсив", icon: <ItalicIcon />, kbd: "Ctrl+I", apply: (s) => wrap("*", "*", s, "курсив") },
      { label: "Зачёркнутый", icon: <StrikeIcon />, apply: (s) => wrap("~~", "~~", s, "зачёркнутый") },
      { label: "Инлайн код", icon: <CodeIcon />, kbd: "Ctrl+`", apply: (s) => wrap("`", "`", s, "код") },
    ],
  },
  {
    section: "Структура",
    items: [
      { label: "Заголовок H1", icon: <Heading1Icon />, apply: (s) => wrap("# ", "", s, "Заголовок") },
      { label: "Заголовок H2", icon: <Heading2Icon />, apply: (s) => wrap("## ", "", s, "Заголовок") },
      { label: "Цитата", icon: <QuoteIcon />, apply: (s) => linePrefix("> ", s, "Цитата") },
      { label: "Блок кода", icon: <CodeBlockIcon />, apply: (s) => wrap("```\n", "\n```", s, "код") },
      { label: "Разделитель", icon: <HrIcon />, apply: () => ({ text: "\n---\n", selStart: 5, selEnd: 5 }) },
    ],
  },
  {
    section: "Списки и ссылки",
    items: [
      { label: "Маркированный список", icon: <ListIcon />, apply: (s) => linePrefix("- ", s, "Пункт списка") },
      { label: "Нумерованный список", icon: <ListOrderedIcon />, apply: (s) => linePrefix("1. ", s, "Пункт") },
      { label: "Ссылка", icon: <LinkIcon />, kbd: "Ctrl+K", apply: (s) => wrap("[", "](url)", s, "текст ссылки") },
    ],
  },
];

export type MarkdownComposerProps = {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  id?: string;
  "aria-invalid"?: boolean;
  style?: CSSProperties;
  textareaStyle?: CSSProperties;
  wrapperClassName?: string;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  onInput?: FormEventHandler<HTMLTextAreaElement>;
  /** Image upload via the paperclip button (requires a community sign-in). */
  enableImageUpload?: boolean;
  /** Markdown preview below the field (as readers will see it). */
  markdownPreview?: boolean;
  /** Initial state of the preview panel when markdownPreview is on. */
  markdownPreviewInitiallyOpen?: boolean;
  /** Compact single-row layout (chat): paperclip and field in one row, no preview. */
  variant?: "default" | "chat";
  /** Plain multi-line text only: no attachments, Markdown preview or formatting hints. */
  plainText?: boolean;
  /**
   * Called after an image upload; when set, no markdown is inserted into the field (e.g. the chat sends the file separately).
   */
  onImageUploaded?: (info: { urlPath: string }) => void | Promise<void>;
  /** Local file without uploading it (e.g. the chat keeps a preview until "Send"). Takes precedence over onImageUploaded. */
  onImageFileSelected?: (file: File) => void | Promise<void>;
};

export function MarkdownComposer({
  value,
  onChange,
  rows = 8,
  placeholder,
  maxLength,
  disabled,
  className,
  textareaRef: textareaRefProp,
  id,
  "aria-invalid": ariaInvalid,
  style: wrapperStyle,
  textareaStyle,
  wrapperClassName,
  onKeyDown: onKeyDownProp,
  onInput: onInputProp,
  enableImageUpload = true,
  markdownPreview = true,
  markdownPreviewInitiallyOpen = true,
  variant = "default",
  onImageUploaded,
  onImageFileSelected,
  plainText = false,
}: MarkdownComposerProps) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = textareaRefProp ?? innerRef;
  const fileRef = useRef<HTMLInputElement>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(markdownPreviewInitiallyOpen);
  /** Without this, SSR and the first client render diverge (localStorage exists only in the browser). */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const applyFormat = useCallback(
    (action: MdAction) => {
      const ta = textareaRef.current;
      if (!ta || disabled) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = value.slice(start, end);
      const { text, selStart, selEnd } = action.apply(selected);
      const next = value.slice(0, start) + text + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + selStart, start + selEnd);
      });
    },
    [value, onChange, textareaRef, disabled],
  );

  const insertAtCursor = useCallback(
    (snippet: string) => {
      const ta = textareaRef.current;
      if (!ta || disabled) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = value.slice(0, start) + snippet + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + snippet.length;
        ta.setSelectionRange(pos, pos);
      });
    },
    [value, onChange, textareaRef, disabled],
  );

  const hasCommunityToken = hydrated && !!getCommunityAuthState()?.accessToken;
  const effectiveEnableImageUpload = plainText ? false : enableImageUpload;
  const canUploadImage = effectiveEnableImageUpload && !disabled && hasCommunityToken;

  const clipButtonDisabled = uploadBusy || disabled || !hydrated || !canUploadImage;
  const clipButtonTitle = !hydrated
    ? "Загрузка…"
    : uploadBusy
      ? "Загрузка…"
      : disabled
        ? "Редактор недоступен"
        : !hasCommunityToken
          ? "Войдите в сообщество, чтобы прикрепить изображение"
          : "Вставить изображение";

  const handlePickImage = () => {
    setUploadErr(null);
    if (!canUploadImage || uploadBusy) return;
    fileRef.current?.click();
  };

  const handleImageFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canUploadImage || disabled) return;
    setUploadErr(null);
    if (onImageFileSelected) {
      try {
        await Promise.resolve(onImageFileSelected(file));
      } catch (err: unknown) {
        setUploadErr(err instanceof Error ? err.message : "Не удалось прикрепить изображение");
      }
      return;
    }
    setUploadBusy(true);
    try {
      const { url } = await communityUploadComposerImage(file);
      if (onImageUploaded) {
        await Promise.resolve(onImageUploaded({ urlPath: url }));
      } else {
        const abs = communityPublicAssetUrl(url);
        insertAtCursor(`\n![](${abs})\n`);
      }
    } catch (err: unknown) {
      setUploadErr(err instanceof Error ? err.message : "Не удалось загрузить изображение");
    } finally {
      setUploadBusy(false);
    }
  };

  const handleContextMenu = (e: MouseEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 380);
    setCtx({ x, y });
  };

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (!plainText && !disabled && (e.ctrlKey || e.metaKey)) {
      const fmt = MD_ACTIONS[0]!.items;
      const lists = MD_ACTIONS[2]!.items;
      const map: Record<string, MdAction | undefined> = {
        b: fmt[0],
        i: fmt[1],
        "`": fmt[3],
        k: lists[2],
      };
      const action = map[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        applyFormat(action);
        return;
      }
    }
    onKeyDownProp?.(e);
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || value !== "") return;
    ta.style.height = "";
  }, [value, textareaRef]);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtx(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  const isChat = variant === "chat";
  const effectiveMarkdownPreview = plainText ? false : isChat ? false : markdownPreview;

  const wrapCls =
    `${wrapperClassName ?? "hub-md-composer-wrap"}` +
    `${isChat ? " hub-md-composer-wrap--chat" : ""}` +
    `${!isChat && effectiveEnableImageUpload ? " hub-md-composer-wrap--toolbar" : ""}` +
    `${effectiveMarkdownPreview ? " hub-md-composer-wrap--preview" : ""}` +
    `${effectiveMarkdownPreview && previewOpen ? " hub-md-composer-wrap--preview-open" : ""}`;

  const textareaEl = (
    <textarea
      ref={textareaRef}
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onContextMenu={plainText ? undefined : handleContextMenu}
      onKeyDown={handleKeyDown}
      onInput={onInputProp}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      style={textareaStyle}
    />
  );

  if (isChat) {
    return (
      <div className={wrapCls} style={{ position: "relative", ...wrapperStyle }}>
        {effectiveEnableImageUpload ? (
          <>
            <input
              ref={fileRef}
              type="file"
              className="hub-md-file-input"
              accept="image/jpeg,image/png,image/webp,image/gif"
              aria-hidden
              tabIndex={-1}
              onChange={handleImageFile}
            />
            <div className="hub-md-chat-row" role="group" aria-label="Поле сообщения">
              <button
                type="button"
                className="hub-md-chat-attach-btn"
                onClick={handlePickImage}
                disabled={clipButtonDisabled}
                title={clipButtonTitle}
                aria-label="Вставить изображение"
              >
                <ClipIcon />
              </button>
              {textareaEl}
            </div>
            {uploadErr ? <div className="hub-md-chat-upload-err">{uploadErr}</div> : null}
          </>
        ) : (
          textareaEl
        )}

        {ctx && !disabled && !plainText ? (
          <div
            className="hub-md-ctx"
            style={{ left: ctx.x, top: ctx.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {MD_ACTIONS.map((group, gi) => (
              <div key={group.section}>
                {gi > 0 && <div className="hub-md-ctx-divider" />}
                <div className="hub-md-ctx-section">{group.section}</div>
                {group.items.map((action) => (
                  <button
                    key={action.label}
                    className="hub-md-ctx-item"
                    type="button"
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      applyFormat(action);
                      setCtx(null);
                    }}
                  >
                    {action.icon}
                    {action.label}
                    {action.kbd ? <span className="hub-md-ctx-kbd">{action.kbd}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={wrapCls} style={{ position: "relative", ...wrapperStyle }}>
      {effectiveEnableImageUpload ? (
        <>
          <input
            ref={fileRef}
            type="file"
            className="hub-md-file-input"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-hidden
            tabIndex={-1}
            onChange={handleImageFile}
          />
          <div className="hub-md-toolbar" role="toolbar" aria-label="Вставка изображения и предпросмотр">
            <button
              type="button"
              className="hub-md-toolbar-btn"
              onClick={handlePickImage}
              disabled={clipButtonDisabled}
              title={clipButtonTitle}
              aria-label="Вставить изображение"
            >
              <ClipIcon />
            </button>
            {effectiveMarkdownPreview ? (
              <button
                type="button"
                className={`hub-md-toolbar-preview-toggle${previewOpen ? " hub-md-toolbar-preview-toggle--on" : ""}`}
                onClick={() => setPreviewOpen((v) => !v)}
                disabled={disabled}
                aria-expanded={previewOpen}
                aria-controls={id ? `${id}-md-preview` : undefined}
              >
                Предпросмотр
              </button>
            ) : null}
            {uploadErr ? <span className="hub-md-toolbar-err">{uploadErr}</span> : null}
          </div>
        </>
      ) : effectiveMarkdownPreview ? (
        <div className="hub-md-toolbar hub-md-toolbar--preview-only" role="toolbar" aria-label="Предпросмотр Markdown">
          <button
            type="button"
            className={`hub-md-toolbar-preview-toggle${previewOpen ? " hub-md-toolbar-preview-toggle--on" : ""}`}
            onClick={() => setPreviewOpen((v) => !v)}
            disabled={disabled}
            aria-expanded={previewOpen}
            aria-controls={id ? `${id}-md-preview` : undefined}
          >
            Предпросмотр
          </button>
        </div>
      ) : null}
      {textareaEl}

      {effectiveMarkdownPreview && previewOpen ? (
        <div
          id={id ? `${id}-md-preview` : undefined}
          className="hub-md-preview-panel"
          aria-label="Предпросмотр сообщения"
        >
          {value.trim() ? (
            <CommunityMarkdown body={value} />
          ) : (
            <div className="hub-md-preview-empty cf-markdown">
              <p>
                <em>Пусто — здесь будет текст так, как его увидят читатели (жирный, списки, картинки).</em>
              </p>
            </div>
          )}
        </div>
      ) : null}

      {ctx && !disabled && !plainText ? (
        <div
          className="hub-md-ctx"
          style={{ left: ctx.x, top: ctx.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {MD_ACTIONS.map((group, gi) => (
            <div key={group.section}>
              {gi > 0 && <div className="hub-md-ctx-divider" />}
              <div className="hub-md-ctx-section">{group.section}</div>
              {group.items.map((action) => (
                <button
                  key={action.label}
                  className="hub-md-ctx-item"
                  type="button"
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    applyFormat(action);
                    setCtx(null);
                  }}
                >
                  {action.icon}
                  {action.label}
                  {action.kbd ? <span className="hub-md-ctx-kbd">{action.kbd}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
