"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string | undefined;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Compact destructive confirmation — anchored bottom, not a full-screen centered modal.
 */
export function ConfirmSheet({ open, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger", onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="admin-confirm-root">
      <button type="button" className="admin-confirm-scrim" onClick={onCancel} aria-label="Dismiss" />
      <div ref={ref} className="admin-confirm-sheet" role="alertdialog" aria-modal="true">
        <p className="admin-confirm-title">{title}</p>
        {description ? <p className="admin-confirm-desc">{description}</p> : null}
        <div className="admin-confirm-actions">
          <button type="button" className="button secondary small" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button small ${tone === "danger" ? "primary" : tone}`}
            style={tone === "danger" ? { background: "var(--danger)" } : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
