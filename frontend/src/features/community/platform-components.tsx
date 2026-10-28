"use client";

// ═══════════════════════════════════════════════════════════
// Student Hub — Reusable UI components
// ═══════════════════════════════════════════════════════════

import Link from "next/link";
import React from "react";

// ── Types ───────────────────────────────────────────────────

export type LessonStatus = "available" | "completed" | "locked" | "new";
export type AssignmentStatus = "active" | "submitted" | "reviewed" | "overdue";

export interface Lesson {
  id: string;
  number: number;
  title: string;
  type: "video" | "practice" | "webinar" | "material";
  durationMinutes?: number;
  status: LessonStatus;
  track?: string;
  dayNumber?: number;
}

export interface Assignment {
  id: string;
  title: string;
  lessonTitle?: string;
  dayNumber?: number;
  deadline?: string;
  status: AssignmentStatus;
  curatorFeedback?: string | null;
}

export interface StudentCase {
  id: string;
  title: string;
  description: string;
  author: string;
  result?: string;
  images: string[];
  tags: string[];
  pinned?: boolean;
  published?: boolean;
}

// ── StatusBadge ─────────────────────────────────────────────

interface StatusBadgeProps {
  status: LessonStatus | AssignmentStatus | string;
  className?: string;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  available:  { label: "Доступен",   cls: "hub-badge--blue"   },
  new:        { label: "Новый",      cls: "hub-badge--green"  },
  completed:  { label: "Пройден",    cls: "hub-badge--green"  },
  locked:     { label: "Заблокирован", cls: "hub-badge--gray" },
  active:     { label: "Активное",   cls: "hub-badge--blue"   },
  submitted:  { label: "Сдано",      cls: "hub-badge--yellow" },
  reviewed:   { label: "Проверено",  cls: "hub-badge--green"  },
  overdue:    { label: "Просрочено", cls: "hub-badge--red"    },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status] ?? { label: status, cls: "hub-badge--gray" };
  return (
    <span className={`hub-badge ${cfg.cls}${className ? ` ${className}` : ""}`}>
      {cfg.label}
    </span>
  );
}

// ── ProgressBar ─────────────────────────────────────────────

export function ProgressBar({
  label,
  value,
  max = 100,
  showPercent = true,
}: {
  label?: string;
  value: number;
  max?: number;
  showPercent?: boolean;
}) {
  const pct = Math.round(Math.min(100, (value / max) * 100));
  return (
    <div className="hub-progress-wrap">
      {(label || showPercent) && (
        <div className="hub-progress-header">
          {label && <span className="hub-progress-label">{label}</span>}
          {showPercent && <span className="hub-progress-pct">{pct}%</span>}
        </div>
      )}
      <div className="hub-progress-bar">
        <div className="hub-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="hub-empty">
      {icon && <div className="hub-empty-icon">{icon}</div>}
      <p className="hub-empty-title">{title}</p>
      {description && <p className="hub-empty-desc">{description}</p>}
      {action && (
        action.href ? (
          <Link href={action.href} className="hub-btn-primary" style={{ marginTop: 8 }}>
            {action.label}
          </Link>
        ) : (
          <button className="hub-btn-primary" onClick={action.onClick} style={{ marginTop: 8 }}>
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

// ── LoadingSkeleton ─────────────────────────────────────────

export function LoadingSkeleton({ rows = 3, height = 20 }: { rows?: number; height?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="hub-skeleton"
          style={{ height, width: i === rows - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

// ── StatCard ────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="hub-stat-card">
      <div className="hub-stat-label">{label}</div>
      <div className="hub-stat-value">{value}</div>
      {sub && <div className="hub-stat-sub">{sub}</div>}
    </div>
  );
}

// ── LessonCard ──────────────────────────────────────────────

const LESSON_TYPE_LABELS: Record<string, string> = {
  video: "Видео",
  practice: "Практика",
  webinar: "Вебинар",
  material: "Материал",
};

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export function LessonCard({ lesson, onClick }: { lesson: Lesson; onClick?: () => void }) {
  const locked = lesson.status === "locked";
  const label = LESSON_TYPE_LABELS[lesson.type] ?? lesson.type;

  return (
    <div
      className={`hub-card${locked ? " hub-card--locked" : ""}`}
      style={{ cursor: locked ? "default" : "pointer" }}
      onClick={locked ? undefined : onClick}
    >
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.6px" }}>
              Урок {lesson.number} · {label}
              {lesson.durationMinutes ? ` · ${lesson.durationMinutes} мин` : ""}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: locked ? "#9ca3af" : "#0b1020", lineHeight: 1.4 }}>
              {lesson.title}
            </div>
          </div>
          {locked ? (
            <div style={{ color: "#d1d5db", flexShrink: 0, width: 18 }}><LockIcon /></div>
          ) : (
            <StatusBadge status={lesson.status} />
          )}
        </div>
        {!locked && (
          <div style={{ fontSize: 12, color: "#158aeb", fontWeight: 600 }}>
            {lesson.status === "completed" ? "Смотреть снова →" : "Смотреть урок →"}
          </div>
        )}
      </div>
    </div>
  );
}

// ── AssignmentCard ──────────────────────────────────────────

export function AssignmentCard({ assignment }: { assignment: Assignment }) {
  const isActive = assignment.status === "active";

  const deadlineStr = assignment.deadline
    ? new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" }).format(new Date(assignment.deadline))
    : null;

  return (
    <div className="hub-card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 18px 14px", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0b1020", lineHeight: 1.4, flex: 1 }}>
            {assignment.title}
          </div>
          <StatusBadge status={assignment.status} />
        </div>
        {assignment.lessonTitle && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Урок: {assignment.lessonTitle}
          </div>
        )}
        {deadlineStr && (
          <div style={{ fontSize: 12, color: assignment.status === "overdue" ? "#b91c1c" : "#6b7280" }}>
            Дедлайн: {deadlineStr}
          </div>
        )}
        {assignment.curatorFeedback && (
          <div style={{
            marginTop: 10,
            padding: "8px 12px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            fontSize: 12,
            color: "#166534",
            lineHeight: 1.5,
          }}>
            💬 {assignment.curatorFeedback}
          </div>
        )}
      </div>
      {isActive && (
        <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(0,0,0,0.05)", display: "flex", gap: 8 }}>
          <Link href={`/homework/${assignment.dayNumber ?? ""}`} className="hub-btn-primary" style={{ fontSize: 12, padding: "7px 14px" }}>
            Сдать работу
          </Link>
        </div>
      )}
    </div>
  );
}

// ── StudentCaseCard ─────────────────────────────────────────

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);

export function StudentCaseCard({ item, href }: { item: StudentCase; href?: string }) {
  const cover = item.images[0] ?? null;

  const body = (
    <>
      <div className="hub-case-img">
        {cover
          ? <img src={cover} alt={item.title} />
          : <ImageIcon />}
      </div>
      <div className="hub-case-body">
        <h3 className="hub-case-title">{item.title}</h3>
        <p className="hub-case-desc">{item.description}</p>
        <p className="hub-case-author">Автор: {item.author}</p>
        {item.tags.length > 0 && (
          <div className="hub-case-tags">
            {item.tags.slice(0, 3).map((t) => (
              <span key={t} className="hub-case-tag">{t}</span>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (href) {
    return <Link href={href} className="hub-case-card">{body}</Link>;
  }
  return <div className="hub-case-card">{body}</div>;
}

// ── AdminActionPanel ────────────────────────────────────────

export function AdminActionPanel({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions: Array<{ label: string; href?: string; onClick?: () => void; variant?: "primary" | "secondary" }>;
}) {
  return (
    <div style={{
      background: "#fffbeb",
      border: "1px solid #fde68a",
      borderRadius: 12,
      padding: "16px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e" }}>{title}</div>
        {description && <div style={{ fontSize: 13, color: "#a16207", marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map((a, i) => (
          a.href ? (
            <Link key={i} href={a.href} className={a.variant === "primary" ? "hub-btn-primary" : "hub-btn-secondary"} style={{ fontSize: 13 }}>
              {a.label}
            </Link>
          ) : (
            <button key={i} onClick={a.onClick} className={a.variant === "primary" ? "hub-btn-primary" : "hub-btn-secondary"} style={{ fontSize: 13 }}>
              {a.label}
            </button>
          )
        ))}
      </div>
    </div>
  );
}
