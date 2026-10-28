"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import type { ChangeEvent } from "react";
import { communityPublicAssetUrl, communityUploadComposerImage, getCommunityAuthState } from "@/features/api";
import {
  communityMarkdownToRichHtml,
  richHtmlToCommunityMarkdown,
  sanitizeCommunityRichHtml,
} from "@/features/community/rich-text/html-markdown-bridge";

function sanitizeHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^javascript:/i.test(t) || /^data:/i.test(t)) return "";
  if (/^mailto:/i.test(t)) return t.split(/\s/)[0] ?? t;
  if (t.startsWith("/")) return t.replace(/\s/g, "");
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/\//, "")}`;
}

const BoldIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
  </svg>
);
const ItalicIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </svg>
);
const StrikeIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M16 4H9a3 3 0 0 0-2.83 4" />
    <path d="M14 12a4 4 0 0 1 0 8H6" />
    <line x1="4" y1="12" x2="20" y2="12" />
  </svg>
);
const ListIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const ListNumIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
    <path d="M4 6h1v4" />
    <path d="M4 10h2" />
    <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
);
const QuoteIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
  </svg>
);
const LinkIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const ClipIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

export type CommunityRichComposerProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
};

export function CommunityRichComposer({
  value,
  onChange,
  placeholder = "Напишите мысль, кейс, вопрос или короткое обновление…",
  disabled,
  className,
  "aria-invalid": ariaInvalid,
}: CommunityRichComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");

  const canUploadImage =
    !disabled && typeof window !== "undefined" && !!getCommunityAuthState()?.accessToken;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      TiptapLink.configure({
        autolink: true,
        openOnClick: false,
        HTMLAttributes: {
          class: "hub-rich-link",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      TiptapImage.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: "hub-rich-inline-img",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: communityMarkdownToRichHtml(value) || "<p></p>",
    editorProps: {
      attributes: {
        class: "hub-rich-prosemirror",
        spellcheck: "true",
        ...(ariaInvalid ? { "aria-invalid": "true" as const } : {}),
      },
      transformPastedHTML(html) {
        return sanitizeCommunityRichHtml(html);
      },
    },
    onUpdate: ({ editor: ed }) => {
      setUploadErr(null);
      onChange(richHtmlToCommunityMarkdown(ed.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const tb =
    useEditorState({
      editor,
      selector: ({ editor: ed }) => ({
        bold: ed?.isActive("bold") ?? false,
        italic: ed?.isActive("italic") ?? false,
        strike: ed?.isActive("strike") ?? false,
        bullet: ed?.isActive("bulletList") ?? false,
        ordered: ed?.isActive("orderedList") ?? false,
        link: ed?.isActive("link") ?? false,
        quote: ed?.isActive("blockquote") ?? false,
      }),
    }) ??
    ({
      bold: false,
      italic: false,
      strike: false,
      bullet: false,
      ordered: false,
      link: false,
      quote: false,
    } as const);

  const openLinkUi = useCallback(() => {
    if (!editor || disabled) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    setLinkDraft(prev ?? "");
    setLinkOpen(true);
  }, [editor, disabled]);

  const applyLink = useCallback(() => {
    if (!editor || disabled) return;
    const href = sanitizeHref(linkDraft);
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  }, [editor, disabled, linkDraft]);

  const handlePickImage = useCallback(() => {
    setUploadErr(null);
    if (!canUploadImage || uploadBusy || disabled) return;
    fileRef.current?.click();
  }, [canUploadImage, uploadBusy, disabled]);

  const handleImageFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !editor || !canUploadImage || disabled) return;
      setUploadErr(null);
      setUploadBusy(true);
      try {
        const { url } = await communityUploadComposerImage(file);
        const abs = communityPublicAssetUrl(url);
        editor.chain().focus().setImage({ src: abs, alt: "" }).run();
      } catch (err: unknown) {
        setUploadErr(err instanceof Error ? err.message : "Не удалось загрузить изображение");
      } finally {
        setUploadBusy(false);
      }
    },
    [editor, canUploadImage, disabled],
  );

  if (!editor) {
    return (
      <div
        className={`hub-rich-composer hub-rich-composer--boot${className ? ` ${className}` : ""}`}
        aria-hidden
      />
    );
  }

  return (
    <div className={`hub-rich-composer${className ? ` ${className}` : ""}`}>
      <input
        ref={fileRef}
        type="file"
        className="hub-md-file-input"
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-hidden
        tabIndex={-1}
        onChange={handleImageFile}
      />

      <div className="hub-rich-toolbar" role="toolbar" aria-label="Форматирование">
        <button
          type="button"
          className="hub-rich-toolbar-btn hub-rich-toolbar-btn--clip"
          onClick={handlePickImage}
          disabled={uploadBusy || disabled || !canUploadImage}
          title={
            !canUploadImage ? "Войдите в сообщество, чтобы прикрепить изображение" : "Изображение"
          }
          aria-label="Вставить изображение"
        >
          <ClipIco />
        </button>
        <span className="hub-rich-toolbar-sep" aria-hidden />
        <button
          type="button"
          className={`hub-rich-toolbar-btn${tb.bold ? " hub-rich-toolbar-btn--on" : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
          aria-label="Жирный"
          aria-pressed={tb.bold}
        >
          <BoldIco />
        </button>
        <button
          type="button"
          className={`hub-rich-toolbar-btn${tb.italic ? " hub-rich-toolbar-btn--on" : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
          aria-label="Курсив"
          aria-pressed={tb.italic}
        >
          <ItalicIco />
        </button>
        <button
          type="button"
          className={`hub-rich-toolbar-btn${tb.strike ? " hub-rich-toolbar-btn--on" : ""}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={disabled}
          aria-label="Зачёркнутый"
          aria-pressed={tb.strike}
        >
          <StrikeIco />
        </button>
        <span className="hub-rich-toolbar-sep" aria-hidden />
        <button
          type="button"
          className={`hub-rich-toolbar-btn${tb.bullet ? " hub-rich-toolbar-btn--on" : ""}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          aria-label="Маркированный список"
          aria-pressed={tb.bullet}
        >
          <ListIco />
        </button>
        <button
          type="button"
          className={`hub-rich-toolbar-btn${tb.ordered ? " hub-rich-toolbar-btn--on" : ""}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          aria-label="Нумерованный список"
          aria-pressed={tb.ordered}
        >
          <ListNumIco />
        </button>
        <button
          type="button"
          className={`hub-rich-toolbar-btn${tb.quote ? " hub-rich-toolbar-btn--on" : ""}`}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={disabled}
          aria-label="Цитата"
          aria-pressed={tb.quote}
        >
          <QuoteIco />
        </button>
        <span className="hub-rich-toolbar-sep" aria-hidden />
        <button
          type="button"
          className={`hub-rich-toolbar-btn${tb.link ? " hub-rich-toolbar-btn--on" : ""}`}
          onClick={openLinkUi}
          disabled={disabled}
          aria-label="Ссылка"
          aria-pressed={tb.link}
        >
          <LinkIco />
        </button>
        {uploadErr ? <span className="hub-rich-toolbar-err">{uploadErr}</span> : null}
      </div>

      {linkOpen ? (
        <div className="hub-rich-link-bar">
          <input
            type="url"
            className="hub-rich-link-input"
            placeholder="https://…"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
            aria-label="Адрес ссылки"
            autoFocus
          />
          <button type="button" className="hub-rich-link-apply" onClick={applyLink}>
            Готово
          </button>
          <button
            type="button"
            className="hub-rich-link-remove"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              setLinkOpen(false);
            }}
          >
            Убрать
          </button>
        </div>
      ) : null}

      <EditorContent editor={editor} className="hub-rich-editor-area" />

      <BubbleMenu
        editor={editor}
        pluginKey="shortPostImageBubble"
        shouldShow={({ editor: ed }) => ed.isActive("image")}
      >
        <div className="hub-rich-img-bubble">
          <button
            type="button"
            className="hub-rich-img-bubble-del"
            onClick={() => editor.chain().focus().deleteSelection().run()}
          >
            Удалить изображение
          </button>
        </div>
      </BubbleMenu>
    </div>
  );
}
