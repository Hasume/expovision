"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

// ── Icons ─────────────────────────────────────────────────────────

const ClipIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const SendIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// ── Types ─────────────────────────────────────────────────────────

export type ChatInputBarProps = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  pendingAttachment: { previewObjectUrl: string } | null;
  onAttachFile: (file: File) => void;
  onRemoveAttachment: () => void;
};

// ── Component ─────────────────────────────────────────────────────

const MAX_HEIGHT = 140;

export function ChatInputBar({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Сообщение",
  pendingAttachment,
  onAttachFile,
  onRemoveAttachment,
}: ChatInputBarProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Auto-resize ────────────────────────────────────────────────

  const resize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  // Reset height when value is cleared
  useEffect(() => {
    if (value === "") {
      const ta = taRef.current;
      if (ta) ta.style.height = "";
    }
  }, [value]);

  // ── Handlers ──────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && (value.trim() || pendingAttachment)) onSend();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onAttachFile(file);
  };

  const canSend = !disabled && (value.trim().length > 0 || pendingAttachment !== null);

  return (
    <footer className="hub-chat-footer">
      <div className="cib">
        {pendingAttachment ? (
          <div className="cib__preview">
            <img
              src={pendingAttachment.previewObjectUrl}
              alt="Вложение"
              className="cib__preview-img"
            />
            <button
              type="button"
              className="cib__preview-remove"
              onClick={onRemoveAttachment}
              aria-label="Убрать вложение"
            >
              Убрать
            </button>
          </div>
        ) : null}

        <div className="cib__row">
          <input
            ref={fileRef}
            type="file"
            className="cib__file-input"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-hidden
            tabIndex={-1}
            onChange={handleFileChange}
          />

          <button
            type="button"
            className="cib__clip"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            aria-label="Прикрепить изображение"
            title="Прикрепить изображение"
          >
            <ClipIcon />
          </button>

          <textarea
            ref={taRef}
            className="cib__textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            aria-label="Поле сообщения"
          />

          <button
            type="button"
            className="cib__send"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Отправить"
            title="Отправить"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </footer>
  );
}
