"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  type UserProfile,
  communityGetProfile,
  communityUpdateMyProfile,
  communityTopics,
  communityStartDM,
  communityFollowProfile,
  communityUnfollowProfile,
  type CommunityTopic,
  getCommunityAuthState,
} from "@/features/api";
import { InlineAlert } from "@/shared/ui/components";
import { CommunityMarkdown } from "@/features/community/components";
import { MarkdownComposer } from "@/features/community/MarkdownComposer";
import { ProfilePostsGrid } from "@/features/community/ProfilePostsGrid";
import { ProfileFollowPanel } from "@/features/community/ProfileFollowManager";

// ── XP level system ──────────────────────────────────────────────

const LEVELS = [
  { min: 0,    max: 49,   label: "Новичок",   tier: 1 },
  { min: 50,   max: 199,  label: "Участник",  tier: 2 },
  { min: 200,  max: 499,  label: "Активист",  tier: 3 },
  { min: 500,  max: 999,  label: "Эксперт",   tier: 4 },
  { min: 1000, max: Infinity, label: "Легенда", tier: 5 },
];

function getLevel(xp: number): (typeof LEVELS)[number] {
  return LEVELS.find((l) => xp >= l.min && xp <= l.max) ?? LEVELS[0]!;
}

function XpBlock({ xp }: { xp: number }) {
  const lvl = getLevel(xp);
  const isMax = lvl.tier === 5;
  const progress = isMax ? 100 : Math.round(((xp - lvl.min) / (lvl.max - lvl.min + 1)) * 100);
  const toNext = isMax ? null : lvl.max + 1 - xp;
  return (
    <div className="hub-xp-block">
      <div className="hub-xp-level-row">
        <span className={`hub-xp-badge hub-xp-badge--${lvl.tier}`}>
          Ур.{lvl.tier} · {lvl.label}
        </span>
        <span className="hub-xp-points">{xp.toLocaleString()} XP</span>
      </div>
      <div className="hub-xp-bar-track">
        <div
          className={`hub-xp-bar-fill hub-xp-bar-fill--${lvl.tier}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="hub-xp-next">
        {isMax ? "Максимальный уровень" : `до следующего уровня: ${toNext} XP`}
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────

const GlobeIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const MessageIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const UserIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

const TagIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const TopicsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Avatar helpers ───────────────────────────────────────────────

const AVATAR_COLORS = [
  "linear-gradient(135deg,#158aeb,#0a5ca8)",
  "linear-gradient(135deg,#10b981,#059669)",
  "linear-gradient(135deg,#8b5cf6,#6d28d9)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#ef4444,#dc2626)",
  "linear-gradient(135deg,#06b6d4,#0891b2)",
];

function avatarGradient(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

async function fetchAllTopicsForProfileAuthor(authorId: string): Promise<CommunityTopic[]> {
  const acc: CommunityTopic[] = [];
  for (let page = 1; page <= 80; page++) {
    try {
      const res = await communityTopics({ page, authorId, sort: "recent" });
      acc.push(...res.items);
      if (res.items.length === 0 || acc.length >= res.total) break;
    } catch {
      break;
    }
  }
  return acc;
}

// ── Main page ────────────────────────────────────────────────────

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [gridTopics, setGridTopics] = useState<CommunityTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState("");
  const [dmLoading, setDmLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const saveInFlightRef = useRef(false);
  const dmInFlightRef = useRef(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followPanel, setFollowPanel] = useState<null | "following" | "followers">(null);

  const [form, setForm] = useState({
    bio: "", position: "", company: "", location: "",
    website: "", linkedinUrl: "", githubUrl: "", skills: [] as string[],
  });

  useEffect(() => {
    const auth = getCommunityAuthState();
    setCurrentUserId(auth?.userId ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const p = await communityGetProfile(userId);
      setProfile(p);
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    communityGetProfile(userId)
      .then((p) => {
        if (!cancelled) {
          setProfile(p);
          setForm({
            bio: p.bio ?? "", position: p.position ?? "", company: p.company ?? "",
            location: p.location ?? "", website: p.website ?? "",
            linkedinUrl: p.linkedinUrl ?? "", githubUrl: p.githubUrl ?? "",
            skills: p.skills,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAllTopicsForProfileAuthor(userId).then((topics) => {
      if (!cancelled) setGridTopics(topics);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, currentUserId]);

  useEffect(() => {
    if (!userId || currentUserId !== userId) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void fetchAllTopicsForProfileAuthor(userId).then(setGridTopics);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [userId, currentUserId]);

  const handleCancelEdit = () => {
    if (profile) {
      setForm({
        bio: profile.bio ?? "", position: profile.position ?? "", company: profile.company ?? "",
        location: profile.location ?? "", website: profile.website ?? "",
        linkedinUrl: profile.linkedinUrl ?? "", githubUrl: profile.githubUrl ?? "",
        skills: profile.skills,
      });
    }
    setEditing(false);
    setEditError(null);
  };

  const handleSave = async () => {
    if (saving || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    setEditError(null);
    try {
      const updated = await communityUpdateMyProfile(form);
      setProfile(updated);
      setEditing(false);
    } catch (e: unknown) {
      setEditError((e as Error).message);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleDM = async () => {
    if (dmLoading || dmInFlightRef.current) return;
    dmInFlightRef.current = true;
    setDmLoading(true);
    try {
      const chat = await communityStartDM(userId);
      router.push(`/community/messages?chat=${chat.id}`);
    } catch { /* ignore */ } finally {
      dmInFlightRef.current = false;
      setDmLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!profile || !currentUserId || isOwn || followBusy) return;
    setFollowBusy(true);
    setFollowError(null);
    try {
      const updated = profile.isFollowedByViewer
        ? await communityUnfollowProfile(userId)
        : await communityFollowProfile(userId);
      setProfile(updated);
    } catch (e: unknown) {
      setFollowError(e instanceof Error ? e.message : "Не удалось изменить подписку");
    } finally {
      setFollowBusy(false);
    }
  };

  const addSkill = () => {
    const s = newSkill.trim();
    if (!s || form.skills.includes(s) || form.skills.length >= 20) return;
    setForm((f) => ({ ...f, skills: [...f.skills, s] }));
    setNewSkill("");
  };

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const isOwn = currentUserId === userId;

  useEffect(() => {
    if (!isOwn) setFollowPanel(null);
  }, [isOwn]);

  if (loading) {
    return (
        <div className="hub-profile-page hub-profile-page--loading">
          <div className="hub-profile-skel-stack">
            {[260, 180, 220].map((h, i) => (
              <div key={i} className="hub-profile-skel-line" style={{ height: h }} />
            ))}
          </div>
        </div>
    );
  }

  if (error || !profile) {
    return (
        <div style={{ maxWidth: 500, margin: "60px auto", padding: "0 24px" }}>
          <InlineAlert tone="error">{error ?? "Профиль не найден"}</InlineAlert>
          <Link href="/community/topics" className="hub-btn-ghost" style={{ marginTop: 16 }}>← Вопросы</Link>
        </div>
    );
  }

  const avatarSrc = profile.avatarUrl ? `${apiBase}${profile.avatarUrl}` : null;
  const initials = `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase();
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const joinDate = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
    : null;

  return (
      <div className="hub-profile-page">

        {/* Breadcrumb */}
        <nav className="hub-breadcrumb" aria-label="Навигация">
          <Link href="/community/dashboard">Лента</Link>
          <span className="hub-breadcrumb-sep">/</span>
          <span className="hub-breadcrumb-current">{isOwn ? "Мой профиль" : fullName}</span>
        </nav>

        {editing ? (
          <section className="hub-profile-edit hub-profile-edit-card">
            <h2 className="hub-profile-edit-title">
              <EditIcon />
              Редактировать профиль
            </h2>
            <div className="hub-profile-form">
                <div className="hub-profile-form-grid">
                  {([
                    ["position", "Должность / Роль", "Дизайнер, разработчик, методист…", 100],
                    ["company", "Компания / Учёба", "Название компании или вуза", 100],
                    ["location", "Город / Страна", "Москва, Россия", 100],
                    ["website", "Сайт / Портфолио", "https://example.com", 200],
                    ["linkedinUrl", "LinkedIn", "https://linkedin.com/in/…", 200],
                    ["githubUrl", "GitHub", "https://github.com/…", 200],
                  ] as [keyof typeof form, string, string, number][]).map(([key, label, ph, max]) => (
                    <div key={key} className="hub-field">
                      <label className="hub-field-label">{label}</label>
                      <input
                        className="hub-disc-search-field"
                        value={form[key] as string}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={ph}
                        maxLength={max}
                        style={{ width: "100%" }}
                      />
                    </div>
                  ))}
                </div>

                <div className="hub-field">
                  <label className="hub-field-label">О себе</label>
                  <MarkdownComposer
                    className="hub-disc-search-field"
                    value={form.bio}
                    onChange={(v) => setForm((f) => ({ ...f, bio: v }))}
                    maxLength={300}
                    rows={4}
                    placeholder="О себе… Правый клик — короткий Markdown (**выделить**, списки)."
                    textareaStyle={{ width: "100%", resize: "vertical" }}
                  />
                  <div className="hub-field-counter">{form.bio.length}/300</div>
                </div>

                <div className="hub-field">
                  <label className="hub-field-label">Навыки <span style={{ color: "#9ca3af", fontWeight: 400 }}>(до 20)</span></label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="hub-disc-search-field"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                      placeholder="UX Design, AI, EdTech… Enter чтобы добавить"
                      maxLength={40}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="hub-btn-primary" onClick={addSkill} style={{ flexShrink: 0 }}>
                      <PlusIcon />
                    </button>
                  </div>
                  {form.skills.length > 0 && (
                    <div className="hub-skills" style={{ marginTop: 10 }}>
                      {form.skills.map((skill) => (
                        <span key={skill} className="hub-skill-tag" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {skill}
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, skills: f.skills.filter((s) => s !== skill) }))}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", color: "#9ca3af", lineHeight: 1 }}
                          >
                            <XIcon />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {editError && <InlineAlert tone="error">{editError}</InlineAlert>}

                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  <button className="hub-btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Сохранение…" : "Сохранить изменения"}
                  </button>
                  <button className="hub-btn-ghost" onClick={handleCancelEdit}>Отмена</button>
                </div>
              </div>
          </section>
        ) : (
          <>
            {followError ? (
              <div style={{ marginBottom: 16 }}>
                <InlineAlert tone="error">{followError}</InlineAlert>
              </div>
            ) : null}

            <div className="hub-profile-shell">
              <header className="hub-profile-hero">
                <div className="hub-profile-hero__glow" aria-hidden />
                <div className="hub-profile-hero__inner">
                  <div className="hub-profile-hero__avatar-col">
                    <div className="hub-profile-ig-avatar-wrap hub-profile-hero__avatar-ring">
                      {avatarSrc ? (
                        <img className="hub-profile-ig-avatar" src={avatarSrc} alt={fullName} />
                      ) : (
                        <div className="hub-profile-ig-avatar" style={{ background: avatarGradient(profile.firstName) }}>
                          {initials}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="hub-profile-hero__content">
                    <div className="hub-profile-ig-title-row hub-profile-hero__title-row">
                      <h1 className="hub-profile-ig-username">{fullName}</h1>
                      <div className="hub-profile-ig-actions hub-profile-hero__actions">
                        {isOwn ? (
                          <button
                            type="button"
                            className="hub-btn-ghost hub-profile-hero__btn"
                            onClick={() => setEditing(true)}
                          >
                            <EditIcon />
                            Редактировать
                          </button>
                        ) : currentUserId ? (
                          <>
                            <button
                              type="button"
                              className={
                                profile.isFollowedByViewer
                                  ? "hub-btn-ghost hub-profile-hero__btn"
                                  : "hub-btn-primary hub-profile-hero__btn"
                              }
                              disabled={followBusy}
                              onClick={() => void handleToggleFollow()}
                            >
                              {followBusy ? "…" : profile.isFollowedByViewer ? "Подписаны" : "Подписаться"}
                            </button>
                            <button
                              type="button"
                              className="hub-btn-ghost hub-profile-hero__btn"
                              onClick={() => void handleDM()}
                              disabled={dmLoading}
                            >
                              <MessageIcon />
                              {dmLoading ? "…" : "Написать"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <ul className="hub-profile-metric-grid" aria-label="Статистика профиля">
                      <li className="hub-profile-metric">
                        <span className="hub-profile-metric__value">{profile.stats.topicsCount}</span>
                        <span className="hub-profile-metric__label">публикаций</span>
                      </li>
                      {isOwn ? (
                        <li
                          className={`hub-profile-metric hub-profile-metric--btn-wrap${followPanel === "followers" ? " hub-profile-metric--active" : ""}`}
                        >
                          <button
                            type="button"
                            className="hub-profile-metric__btn"
                            aria-expanded={followPanel === "followers"}
                            onClick={() => setFollowPanel((p) => (p === "followers" ? null : "followers"))}
                          >
                            <span className="hub-profile-metric__value">{profile.stats.followersCount ?? 0}</span>
                            <span className="hub-profile-metric__label">подписчиков</span>
                          </button>
                        </li>
                      ) : (
                        <li className="hub-profile-metric">
                          <span className="hub-profile-metric__value">{profile.stats.followersCount ?? 0}</span>
                          <span className="hub-profile-metric__label">подписчиков</span>
                        </li>
                      )}
                      {isOwn ? (
                        <li
                          className={`hub-profile-metric hub-profile-metric--btn-wrap${followPanel === "following" ? " hub-profile-metric--active" : ""}`}
                        >
                          <button
                            type="button"
                            className="hub-profile-metric__btn"
                            aria-expanded={followPanel === "following"}
                            onClick={() => setFollowPanel((p) => (p === "following" ? null : "following"))}
                          >
                            <span className="hub-profile-metric__value">{profile.stats.followingCount ?? 0}</span>
                            <span className="hub-profile-metric__label">подписок</span>
                          </button>
                        </li>
                      ) : (
                        <li className="hub-profile-metric">
                          <span className="hub-profile-metric__value">{profile.stats.followingCount ?? 0}</span>
                          <span className="hub-profile-metric__label">подписок</span>
                        </li>
                      )}
                      <li className="hub-profile-metric">
                        <span className="hub-profile-metric__value">{profile.stats.repliesCount}</span>
                        <span className="hub-profile-metric__label">ответов</span>
                      </li>
                      <li className="hub-profile-metric">
                        <span className="hub-profile-metric__value">{profile.stats.likesReceived}</span>
                        <span className="hub-profile-metric__label">лайков</span>
                      </li>
                    </ul>

                    {isOwn ? (
                      <ProfileFollowPanel
                        apiBase={apiBase}
                        panel={followPanel}
                        onClose={() => setFollowPanel(null)}
                        onRelationsChange={() => void refreshProfile()}
                      />
                    ) : null}

                    <div className="hub-profile-hero__lines">
                      {profile.position ? (
                        <div className="hub-profile-ig-line hub-profile-hero__line">
                          <strong>{profile.position}</strong>
                        </div>
                      ) : null}
                      {profile.company ? <div className="hub-profile-ig-line hub-profile-hero__line">{profile.company}</div> : null}
                      {profile.location ? <div className="hub-profile-ig-line hub-profile-hero__line">{profile.location}</div> : null}
                      {joinDate ? (
                        <div className="hub-profile-ig-line hub-profile-hero__line hub-profile-hero__line--muted">
                          Участник с {joinDate}
                        </div>
                      ) : null}
                    </div>

                    {profile.website || profile.linkedinUrl || profile.githubUrl ? (
                      <div className="hub-profile-ig-socials hub-profile-hero__socials">
                        {profile.website ? (
                          <a href={profile.website} target="_blank" rel="noopener noreferrer" className="hub-social-link hub-social-link--chip">
                            <GlobeIcon />
                            {profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                          </a>
                        ) : null}
                        {profile.linkedinUrl ? (
                          <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="hub-social-link hub-social-link--chip">
                            <LinkedInIcon />
                            LinkedIn
                          </a>
                        ) : null}
                        {profile.githubUrl ? (
                          <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer" className="hub-social-link hub-social-link--chip">
                            <GitHubIcon />
                            GitHub
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </header>

              <div className="hub-profile-layout-grid">
                <div className="hub-profile-layout-main">
                  <div className="hub-profile-posts-block">
                    <h2 className="hub-profile-block-heading">
                      <span className="hub-profile-block-heading__icon" aria-hidden>
                        <TopicsIcon />
                      </span>
                      Публикации
                      <span className="hub-profile-block-heading__count">{gridTopics.length}</span>
                    </h2>
                    <ProfilePostsGrid topics={gridTopics} apiBase={apiBase} />
                  </div>
                </div>

                <aside className="hub-profile-layout-aside">
                  <div className="hub-profile-side-card hub-profile-side-card--xp">
                    <XpBlock xp={profile.communityXp} />
                  </div>

                  {profile.bio ? (
                    <div className="hub-profile-side-card">
                      <div className="hub-profile-side-card__head">
                        <UserIcon />
                        О себе
                      </div>
                      <div className="hub-profile-side-card__body hub-profile-bio--md">
                        <CommunityMarkdown body={profile.bio} />
                      </div>
                    </div>
                  ) : null}

                  {profile.skills.length > 0 ? (
                    <div className="hub-profile-side-card">
                      <div className="hub-profile-side-card__head">
                        <TagIcon />
                        Навыки
                      </div>
                      <div className="hub-profile-side-card__body">
                        <div className="hub-skills hub-skills--profile">
                          {profile.skills.map((skill) => (
                            <span key={skill} className="hub-skill-tag">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {isOwn && (!profile.bio || profile.skills.length === 0) ? (
                    <div className="hub-profile-side-card hub-profile-side-card--hint">
                      <div className="hub-profile-hint">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hub-profile-hint__ico" aria-hidden>
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <p className="hub-profile-hint__text">
                          <strong>Дополните профиль:</strong>
                          {!profile.bio ? " рассказ о себе" : ""}
                          {!profile.bio && profile.skills.length === 0 ? ", " : ""}
                          {profile.skills.length === 0 ? "навыки" : ""}
                          {" — так вас легче найти в сообществе."}
                          <button type="button" className="hub-profile-hint__cta" onClick={() => setEditing(true)}>
                            Заполнить
                          </button>
                        </p>
                      </div>
                    </div>
                  ) : null}
                </aside>
              </div>
            </div>
          </>
        )}
      </div>
  );
}
