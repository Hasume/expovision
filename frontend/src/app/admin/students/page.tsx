"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminUsers, type LanguageCode, type TrackCode, type UserRole } from "@/features/api";
import { Badge } from "@/shared/ui/components";
import { DataTable, type Column } from "@/features/admin/data-table";
import { useAdminLang } from "@/features/admin/i18n";

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  language: LanguageCode;
  selectedTrack: TrackCode | null;
  reportCompleted: boolean;
  onboardingDone: boolean;
  startedAt: string | null;
  createdAt: string;
  completedLessons: number;
  totalLessons: number;
  completedHomework: number;
  overdueHomework: number;
  pendingHomework: number;
  stage: "registered" | "onboarding" | "track_pending" | "learning";
  onboardingProfile: string | null;
  recommendedTrack: TrackCode | null;
};

const ROLE_TONE: Record<UserRole, "neutral" | "primary" | "warning" | "danger"> = {
  student: "neutral", admin: "danger",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default function UsersPage() {
  const router = useRouter();
  const { t } = useAdminLang();
  const [users, setUsers] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");

  const STAGE_CONFIG: Record<string, { tone: "neutral" | "warning" | "primary" | "success"; label: string }> = {
    registered: { tone: "neutral", label: t("Зарегистрирован", "Registered") },
    onboarding: { tone: "warning", label: t("Онбординг", "Onboarding") },
    track_pending: { tone: "primary", label: t("Ожидает трек", "Track pending") },
    learning: { tone: "success", label: t("Обучение", "Learning") },
  };

  useEffect(() => {
    void (async () => {
      try { setUsers(await adminUsers()); } catch (e) { setError(e instanceof Error ? e.message : t("Ошибка загрузки", "Failed to load users")); }
      setLoading(false);
    })();
  }, []);

  const filteredUsers = roleFilter === "all" ? users : users.filter((u) => u.role === roleFilter);

  const columns: Column<StudentRow>[] = [
    {
      key: "name", label: t("Имя", "Name"), sortable: true,
      sortValue: (r) => `${r.firstName} ${r.lastName}`.toLowerCase(),
      render: (r) => <span style={{ fontWeight: 600 }}>{`${r.firstName} ${r.lastName}`.trim() || r.email}</span>,
    },
    { key: "email", label: "Email", sortable: true, sortValue: (r) => r.email, render: (r) => <span className="muted">{r.email}</span> },
    {
      key: "role", label: t("Роль", "Role"), sortable: true, sortValue: (r) => r.role,
      render: (r) => <Badge tone={ROLE_TONE[r.role] ?? "neutral"}>{r.role}</Badge>,
    },
    {
      key: "track", label: t("Трек", "Track"), sortable: true, sortValue: (r) => r.selectedTrack ?? "",
      render: (r) => r.selectedTrack ? <Badge tone="primary">{r.selectedTrack}</Badge> : <span className="muted">—</span>,
    },
    {
      key: "progress", label: t("Прогресс", "Progress"), sortable: true,
      sortValue: (r) => (r.totalLessons > 0 ? r.completedLessons / r.totalLessons : 0),
      render: (r) => <span>{r.completedLessons}/{r.totalLessons}</span>,
    },
    {
      key: "hw", label: t("ДЗ", "HW"), sortable: true, sortValue: (r) => r.completedHomework,
      render: (r) => (
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          {r.completedHomework}
          {r.pendingHomework > 0 && <Badge tone="warning">{r.pendingHomework} {t("ожид.", "pending")}</Badge>}
          {r.overdueHomework > 0 && <Badge tone="danger">{r.overdueHomework} {t("просроч.", "overdue")}</Badge>}
        </span>
      ),
    },
    {
      key: "stage", label: t("Этап", "Stage"), sortable: true, sortValue: (r) => r.stage,
      render: (r) => { const cfg = STAGE_CONFIG[r.stage]; return <Badge tone={cfg?.tone ?? "neutral"}>{cfg?.label ?? r.stage}</Badge>; },
    },
    {
      key: "started", label: t("Старт", "Started"), sortable: true, sortValue: (r) => r.startedAt ?? "",
      render: (r) => <span className="muted">{fmtDate(r.startedAt)}</span>,
    },
  ];

  if (loading) return <div className="stack" style={{ padding: "40px 0" }}><p className="muted">{t("Загрузка...", "Loading...")}</p></div>;
  if (error) return <div className="stack" style={{ padding: "40px 0" }}><p className="alert error">{error}</p></div>;

  const studentCount = users.filter((u) => u.role === "student").length;
  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <div className="stack">
      <header className="page-header">
        <h1 className="page-title">{t("Пользователи", "Users")}</h1>
        <p className="page-subtitle">{users.length} {t("всего", "total")}</p>
      </header>

      <div className="row" style={{ gap: 6 }}>
        {([
          { key: "all" as const, labelRu: "Все", labelEn: "All", count: users.length },
          { key: "student" as const, labelRu: "Студенты", labelEn: "Students", count: studentCount },
          { key: "admin" as const, labelRu: "Администраторы", labelEn: "Admins", count: adminCount },
        ]).map(({ key, labelRu, labelEn, count }) => (
          <button
            key={key}
            type="button"
            className={`button small ${roleFilter === key ? "primary" : "secondary"}`}
            onClick={() => setRoleFilter(key)}
          >
            {t(labelRu, labelEn)} <span style={{ opacity: 0.65 }}>({count})</span>
          </button>
        ))}
      </div>

      <DataTable<StudentRow>
        columns={columns}
        data={filteredUsers}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/students/${r.id}`)}
        searchPlaceholder={t("Поиск по имени или email...", "Search by name or email...")}
        searchFilter={(r, q) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)}
        emptyText={
          roleFilter !== "all"
            ? t(`Нет пользователей с ролью "${roleFilter}"`, `No users with role "${roleFilter}"`)
            : t("Пользователи не найдены", "No users found")
        }
        pageSize={30}
      />
    </div>
  );
}
