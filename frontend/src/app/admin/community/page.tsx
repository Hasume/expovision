"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/features/admin/toast";
import {
  adminCommunityPending,
  adminCommunityTopics,
  adminCommunityApproveTopic,
  adminCommunityRejectTopic,
  adminCommunityPinTopic,
  adminCommunityDeleteTopic,
  adminCommunityBanUser,
  adminCommunityUnbanUser,
  communityAdminUsers,
  type CommunityAdminTopic,
  type CommunityAdminUser,
  type CommunityBanMode,
} from "@/features/api";
import { ConfirmDialog } from "@/features/admin/confirm-dialog";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function initials(u: { firstName: string; lastName: string }): string {
  return ((u.firstName?.[0] ?? "") + (u.lastName?.[0] ?? "")).toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  pending: "На модерации",
  active: "Активна",
  closed: "Закрыта",
};
const STATUS_CLASS: Record<string, string> = {
  pending: "badge-warning",
  active: "badge-success",
  closed: "badge-neutral",
};

type Tab = "moderation" | "topics" | "users";

// ── Avatar ────────────────────────────────────────────────────────────────────

function MiniAvatar({ u }: { u: { firstName: string; lastName: string; avatarUrl?: string | null } }) {
  const text = initials(u);
  if (u.avatarUrl) {
    return (
      <img
        src={u.avatarUrl}
        alt={text}
        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  const hue = (text.charCodeAt(0) ?? 65) * 7 % 360;
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
      background: `hsl(${hue}, 60%, 52%)`, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
    }}>
      {text}
    </div>
  );
}

// ── Moderation tab ────────────────────────────────────────────────────────────

function ModerationTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<CommunityAdminTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminCommunityPending();
      setItems(res.items);
    } catch {
      toast("Ошибка загрузки", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const approve = async (id: string) => {
    setWorking(w => ({ ...w, [id]: true }));
    try {
      await adminCommunityApproveTopic(id);
      toast("Тема одобрена — обсуждение запущено на 24ч", "success");
      setItems(prev => prev.filter(t => t.id !== id));
    } catch {
      toast("Не удалось одобрить", "error");
    } finally {
      setWorking(w => ({ ...w, [id]: false }));
    }
  };

  const reject = async (id: string) => {
    setWorking(w => ({ ...w, [id]: true }));
    try {
      await adminCommunityRejectTopic(id);
      toast("Тема отклонена", "success");
      setItems(prev => prev.filter(t => t.id !== id));
    } catch {
      toast("Не удалось отклонить", "error");
    } finally {
      setWorking(w => ({ ...w, [id]: false }));
    }
  };

  if (loading) return <div className="admin-page-loading">Загрузка…</div>;

  if (items.length === 0) {
    return (
      <div className="admin-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        <p>Нет тем на модерации</p>
      </div>
    );
  }

  return (
    <div className="community-admin-list">
      {items.map(topic => (
        <div key={topic.id} className="community-admin-card">
          <div className="community-admin-card-header">
            <div className="community-admin-card-meta">
              <MiniAvatar u={topic.author} />
              <div>
                <div className="community-admin-card-title">{topic.title}</div>
                <div className="community-admin-card-sub">
                  {topic.author.firstName} {topic.author.lastName} · {fmtDateTime(topic.createdAt)}
                  {topic.categoryId ? <span className="community-admin-tag">{topic.categoryId}</span> : null}
                  {topic.isAnonymous ? <span className="community-admin-tag community-admin-tag--anon">Аноним</span> : null}
                </div>
              </div>
            </div>
            <div className="community-admin-card-actions">
              <button
                className="button secondary small"
                onClick={() => setExpanded(expanded === topic.id ? null : topic.id)}
              >
                {expanded === topic.id ? "Скрыть" : "Просмотр"}
              </button>
              <button
                className="button primary small"
                disabled={working[topic.id]}
                onClick={() => approve(topic.id)}
              >
                Одобрить
              </button>
              <button
                className="button danger small"
                disabled={working[topic.id]}
                onClick={() => reject(topic.id)}
              >
                Отклонить
              </button>
            </div>
          </div>
          {expanded === topic.id && (
            <div className="community-admin-card-body">
              {topic.body ?? "—"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Topics tab ────────────────────────────────────────────────────────────────

function TopicsTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<CommunityAdminTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [q, setQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (status: string, query: string) => {
    setLoading(true);
    try {
      const res = await adminCommunityTopics({
        ...(status ? { status } : {}),
        ...(query ? { q: query } : {}),
      });
      setItems(res.items);
    } catch {
      toast("Ошибка загрузки", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void load(statusFilter, q); }, q ? 400 : 0);
  }, [statusFilter, q, load]);

  const pin = async (id: string) => {
    setWorking(w => ({ ...w, [id]: true }));
    try {
      const res = await adminCommunityPinTopic(id);
      setItems(prev => prev.map(t => t.id === id ? { ...t, isPinned: res.isPinned } : t));
      toast(res.isPinned ? "Тема закреплена" : "Тема откреплена", "success");
    } catch {
      toast("Ошибка", "error");
    } finally {
      setWorking(w => ({ ...w, [id]: false }));
    }
  };

  const del = async (id: string) => {
    if (!confirm("Удалить тему безвозвратно?")) return;
    setWorking(w => ({ ...w, [id]: true }));
    try {
      await adminCommunityDeleteTopic(id);
      setItems(prev => prev.filter(t => t.id !== id));
      toast("Тема удалена", "success");
    } catch {
      toast("Ошибка удаления", "error");
    } finally {
      setWorking(w => ({ ...w, [id]: false }));
    }
  };

  return (
    <div className="community-admin-topics-wrap">
      <div className="community-admin-toolbar">
        <div className="community-admin-tabs-row">
          {(["active", "pending", "closed", ""] as const).map(s => (
            <button
              key={s}
              className={`community-admin-filter-tab${statusFilter === s ? " active" : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === "" ? "Все" : STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Поиск по названию…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="admin-page-loading">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="admin-empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <p>Темы не найдены</p>
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Тема</th>
              <th>Автор</th>
              <th>Статус</th>
              <th>Ответов</th>
              <th>Создана</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map(topic => (
              <tr key={topic.id}>
                <td>
                  <a
                    href={`/community/topics/${topic.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="community-admin-topic-link"
                  >
                    {topic.isPinned && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#f59e0b", marginRight: 4 }}>
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    )}
                    {topic.title}
                  </a>
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MiniAvatar u={topic.author} />
                    <span>{topic.author.firstName} {topic.author.lastName}</span>
                  </div>
                </td>
                <td>
                  <span className={`badge ${STATUS_CLASS[topic.status] ?? "badge-neutral"}`}>
                    {STATUS_LABEL[topic.status] ?? topic.status}
                  </span>
                </td>
                <td>{topic.replyCount}</td>
                <td>{fmtDate(topic.createdAt)}</td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="button secondary small"
                      disabled={working[topic.id]}
                      onClick={() => pin(topic.id)}
                      title={topic.isPinned ? "Открепить" : "Закрепить"}
                    >
                      {topic.isPinned ? "Открепить" : "Закрепить"}
                    </button>
                    <button
                      className="button danger small"
                      disabled={working[topic.id]}
                      onClick={() => del(topic.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const BAN_MODE_OPTIONS: { id: CommunityBanMode; label: string; hint: string }[] = [
  {
    id: "preserve",
    label: "Забанить, контент оставить",
    hint: "Темы, ответы и сообщения в чатах остаются; пользователь не может войти и пользоваться сообществом.",
  },
  {
    id: "purge_messages",
    label: "Забанить и удалить все сообщения в чатах",
    hint: "Личные и групповые сообщения пользователя удаляются; темы и ответы на форуме сохраняются.",
  },
  {
    id: "purge_all",
    label: "Забанить и удалить всё с платформы сообщества",
    hint: "Темы, ответы, голоса, сообщения в чатах и участие в чатах удаляются. Действие необратимо.",
  },
];

// ── Users tab ─────────────────────────────────────────────────────────────────

function BanUserModal({
  user,
  open,
  onClose,
  onBanned,
}: {
  user: CommunityAdminUser | null;
  open: boolean;
  onClose: () => void;
  onBanned: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<CommunityBanMode>("preserve");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("preserve");
      setReason("");
    }
  }, [open, user?.id]);

  if (!open || !user) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await adminCommunityBanUser(user.id, {
        mode,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast("Пользователь заблокирован", "success");
      onBanned();
      onClose();
    } catch {
      toast("Не удалось заблокировать", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="community-ban-overlay"
      role="presentation"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="community-ban-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-ban-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="community-ban-title" className="text-h4" style={{ margin: "0 0 8px" }}>
          Блокировка: {user.firstName} {user.lastName}
        </h2>
        <p className="muted text-body-sm" style={{ margin: "0 0 16px" }}>
          {user.email}
        </p>

        <fieldset style={{ border: "none", padding: 0, margin: "0 0 16px" }}>
          <legend className="text-body-sm" style={{ marginBottom: 10, fontWeight: 600 }}>
            Что сделать с контентом
          </legend>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BAN_MODE_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: mode === opt.id ? "2px solid var(--admin-accent, #158aeb)" : "1px solid rgba(0,0,0,0.12)",
                  cursor: busy ? "default" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                <input
                  type="radio"
                  name="ban-mode"
                  checked={mode === opt.id}
                  disabled={busy}
                  onChange={() => setMode(opt.id)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <span style={{ fontWeight: 600, display: "block" }}>{opt.label}</span>
                  <span className="muted text-body-sm" style={{ lineHeight: 1.45 }}>{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-body-sm" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
          Причина (необязательно)
        </label>
        <textarea
          className="input"
          rows={2}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Внутренняя заметка для аудита"
          style={{ width: "100%", marginBottom: 16, resize: "vertical", minHeight: 56 }}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" className="button secondary small" disabled={busy} onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="button danger small" disabled={busy} onClick={() => void submit()}>
            {busy ? "Блокировка…" : "Заблокировать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<CommunityAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [banTarget, setBanTarget] = useState<CommunityAdminUser | null>(null);
  const [banOpen, setBanOpen] = useState(false);
  const [unbanTarget, setUnbanTarget] = useState<CommunityAdminUser | null>(null);
  const [unbanBusy, setUnbanBusy] = useState(false);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await communityAdminUsers(query || undefined);
      setItems(res.items);
    } catch {
      toast("Ошибка загрузки участников", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void load(q); }, q ? 400 : 0);
  }, [q, load]);

  const openBan = (u: CommunityAdminUser) => {
    setBanTarget(u);
    setBanOpen(true);
  };

  const closeBan = () => {
    if (!banOpen) return;
    setBanOpen(false);
    setBanTarget(null);
  };

  const doUnban = () => {
    if (!unbanTarget || unbanBusy) return;
    setUnbanBusy(true);
    void adminCommunityUnbanUser(unbanTarget.id)
      .then(() => {
        toast("Блокировка снята — пользователь может войти снова", "success");
        setUnbanTarget(null);
        void load(q);
      })
      .catch(() => {
        toast("Не удалось снять блокировку", "error");
      })
      .finally(() => setUnbanBusy(false));
  };

  const bannedCount = items.filter((u) => u.isBanned).length;

  return (
    <div>
      <BanUserModal
        user={banTarget}
        open={banOpen}
        onClose={closeBan}
        onBanned={() => void load(q)}
      />

      <ConfirmDialog
        open={!!unbanTarget}
        title="Снять блокировку?"
        description={
          unbanTarget
            ? `${unbanTarget.firstName} ${unbanTarget.lastName} снова сможет войти в сообщество. Удалённый контент не восстанавливается.`
            : undefined
        }
        confirmLabel={unbanBusy ? "Подождите…" : "Снять блокировку"}
        cancelLabel="Отмена"
        tone="primary"
        onConfirm={doUnban}
        onCancel={() => { if (!unbanBusy) setUnbanTarget(null); }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <span className="text-h4" style={{ margin: 0 }}>Участники ({items.length})</span>
          <p className="muted text-body-sm" style={{ margin: "6px 0 0" }}>
            До 1000 последних регистраций. Заблокировано: {bannedCount}.
          </p>
        </div>
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Поиск по имени или email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="admin-page-loading">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="admin-empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          </svg>
          <p>Участники не найдены</p>
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Участник</th>
              <th>Email</th>
              <th>Должность / компания</th>
              <th>Темы</th>
              <th>Ответы</th>
              <th>XP</th>
              <th>Вступил</th>
              <th>Профиль</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className={u.isBanned ? "community-admin-users-row--banned" : undefined}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <MiniAvatar u={u} />
                    <span style={{ fontWeight: 500 }}>
                      {u.firstName} {u.lastName}
                      {u.isBanned ? <span className="community-admin-badge-banned">Заблокирован</span> : null}
                    </span>
                  </div>
                </td>
                <td className="muted" style={{ fontSize: 13 }}>{u.email}</td>
                <td className="muted" style={{ fontSize: 13 }}>
                  {[u.position, u.company].filter(Boolean).join(" · ") || "—"}
                </td>
                <td>{u.topics}</td>
                <td>{u.replies}</td>
                <td>
                  <span style={{ fontWeight: 600, color: "#158aeb" }}>{u.xp} XP</span>
                </td>
                <td className="muted" style={{ fontSize: 13 }}>{fmtDate(u.joinedAt)}</td>
                <td>
                  <a
                    href={`/community/profile/${u.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="community-admin-topic-link"
                    style={{ fontSize: 13 }}
                  >
                    Открыть
                  </a>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {u.isBanned ? (
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setUnbanTarget(u)}
                      >
                        Разблокировать
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button danger small"
                        onClick={() => openBan(u)}
                      >
                        Заблокировать
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="community-admin-stat">
      <div className="community-admin-stat-val">{value}</div>
      <div className="community-admin-stat-label">{label}</div>
      {sub && <div className="community-admin-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminCommunityPage() {
  const [tab, setTab] = useState<Tab>("moderation");
  const [stats, setStats] = useState({ pending: 0, active: 0, closed: 0, users: 0 });
  const { toast } = useToast();

  useEffect(() => {
    void (async () => {
      try {
        const [pending, active, closed, users] = await Promise.all([
          adminCommunityPending(),
          adminCommunityTopics({ status: "active" }),
          adminCommunityTopics({ status: "closed" }),
          communityAdminUsers(),
        ]);
        setStats({
          pending: pending.total,
          active: active.total,
          closed: closed.total,
          users: users.total,
        });
      } catch {
        toast("Ошибка загрузки статистики", "error");
      }
    })();
  }, [toast]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "moderation", label: stats.pending > 0 ? `Модерация (${stats.pending})` : "Модерация" },
    { id: "topics", label: "Темы" },
    { id: "users", label: "Участники" },
  ];

  return (
    <div className="community-admin-page">
      <div className="community-admin-header">
        <h1 className="text-h2" style={{ margin: 0 }}>Комьюнити</h1>
        <p className="muted text-body-sm" style={{ margin: "4px 0 0" }}>
          Управление темами и участниками
        </p>
      </div>

      <div className="community-admin-stats-row">
        <StatCard label="На модерации" value={stats.pending} />
        <StatCard label="Активные темы" value={stats.active} />
        <StatCard label="Закрытых тем" value={stats.closed} />
        <StatCard label="Участников" value={stats.users} />
      </div>

      <div className="community-admin-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`community-admin-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="community-admin-content">
        {tab === "moderation" && <ModerationTab />}
        {tab === "topics" && <TopicsTab />}
        {tab === "users" && <UsersTab />}
      </div>
    </div>
  );
}
