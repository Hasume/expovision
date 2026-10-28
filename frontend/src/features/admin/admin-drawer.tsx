"use client";

import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Approximate width in px — panel is responsive */
  width?: number;
};

export function AdminDrawer({ open, title, subtitle, onClose, children, footer, width = 480 }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="admin-drawer-root" aria-modal="true" role="dialog">
      <button type="button" className="admin-drawer-scrim" onClick={onClose} aria-label="Close" />
      <aside
        className="admin-drawer-panel"
        style={{ width: `min(${width}px, calc(100vw - 12px))`, maxWidth: "100%" }}
      >
        <header className="admin-drawer-header">
          <div className="admin-drawer-header-text">
            <h2 className="admin-drawer-title">{title}</h2>
            {subtitle ? <p className="admin-drawer-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="admin-drawer-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="admin-drawer-body">{children}</div>
        {footer ? <footer className="admin-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
