"use client";

import { useRef, type FormEvent, type ReactNode } from "react";
import { InlineAlert } from "@/shared/ui/components";
import { MarkdownComposer } from "@/features/community/MarkdownComposer";

export function ReplyComposer({
  expanded,
  onExpand,
  collapsedTriggerLabel = "Ответить на вопрос",
  placeholder = "Напишите ответ…",
  body,
  onBodyChange,
  replyParentSummary,
  isAnonymous,
  onAnonymousChange,
  onSubmit,
  submitting,
  error,
  disabled,
  disabledHint,
  idPrefix = "discussion-reply",
}: {
  expanded: boolean;
  onExpand: () => void;
  collapsedTriggerLabel?: string;
  placeholder?: string;
  body: string;
  onBodyChange: (v: string) => void;
  replyParentSummary: ReactNode;
  isAnonymous: boolean;
  onAnonymousChange: (v: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  disabled: boolean;
  disabledHint?: string;
  idPrefix?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const expandAndFocus = () => {
    onExpand();
    queueMicrotask(() => {
      taRef.current?.focus({ preventScroll: true });
    });
  };

  const handleForm = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled && body.trim()) onSubmit();
  };

  if (!expanded) {
    return (
      <div className="hub-reply-composer hub-reply-composer--collapsed">
        <button
          type="button"
          className="hub-reply-composer-trigger"
          onClick={expandAndFocus}
          disabled={disabled}
        >
          {collapsedTriggerLabel}
        </button>
        {disabled && disabledHint ? <p className="hub-reply-composer-hint">{disabledHint}</p> : null}
      </div>
    );
  }

  return (
    <form className="hub-reply-composer hub-reply-composer--open" onSubmit={handleForm} id={`${idPrefix}-form`}>
      {replyParentSummary}
      {disabled ? (
        disabledHint ? <p className="hub-reply-composer-hint">{disabledHint}</p> : null
      ) : (
        <>
          <MarkdownComposer
            textareaRef={taRef}
            id={`${idPrefix}-textarea`}
            className="hub-field-input hub-reply-composer-textarea"
            placeholder={placeholder}
            value={body}
            onChange={onBodyChange}
            rows={5}
            disabled={submitting}
            aria-invalid={!!error}
            plainText
          />
          <div
            className={`hub-anon-toggle${isAnonymous ? " hub-anon-toggle--active" : ""}`}
            onClick={() => !submitting && onAnonymousChange(!isAnonymous)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!submitting) onAnonymousChange(!isAnonymous);
              }
            }}
            role="switch"
            aria-checked={isAnonymous}
            tabIndex={0}
          >
            <div className={`hub-anon-track${isAnonymous ? " hub-anon-track--active" : ""}`}>
              <div className="hub-anon-thumb" />
            </div>
            <span className="hub-anon-label">{isAnonymous ? "Анонимно" : "Открыто"}</span>
          </div>
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
          <div className="hub-reply-composer-actions">
            <button type="submit" className="hub-btn-primary" disabled={submitting || !body.trim()}>
              {submitting ? "Публикация…" : "Опубликовать ответ"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
