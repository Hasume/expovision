"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { me, updateProfile, changePassword, uploadAvatar, deleteAvatar, invalidateMeCache } from "@/features/api";
import { getLang } from "@/features/i18n";
import { AppShell, Badge, Button, Card, CheckIcon, InlineAlert } from "@/shared/ui/components";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const TIMEZONES = [
  "UTC", "Europe/Moscow", "Europe/Kiev", "Europe/London", "Europe/Berlin",
  "Europe/Paris", "Europe/Istanbul", "Asia/Dubai", "Asia/Almaty", "Asia/Tashkent",
  "Asia/Tbilisi", "Asia/Baku", "Asia/Novosibirsk", "Asia/Krasnoyarsk",
  "Asia/Vladivostok", "America/New_York", "America/Chicago", "America/Los_Angeles",
];

type UserData = Awaited<ReturnType<typeof me>>;

export default function SettingsPage() {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;
  const qs = `?lang=${lang}`;

  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [language, setLanguage] = useState("ru");
  const [timezone, setTimezone] = useState("UTC");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadUser = useCallback(async () => {
    try {
      const data = await me();
      setUser(data);
      setFirstName(data.firstName || "");
      setLastName(data.lastName || "");
      setLanguage(data.language || "ru");
      setTimezone(data.timezone || "UTC");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadUser(); }, [loadUser]);

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), language, timezone });
      setProfileMsg({ text: t("Профиль обновлён", "Profile updated"), tone: "success" });
      invalidateMeCache();
      await loadUser();
    } catch (e) {
      setProfileMsg({ text: e instanceof Error ? e.message : t("Ошибка", "Failed"), tone: "error" });
    }
    setProfileSaving(false);
  };

  const savePw = async () => {
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ text: t("Пароли не совпадают", "Passwords don't match"), tone: "error" });
      return;
    }
    if (newPassword.length < 6) {
      setPwMsg({ text: t("Минимум 6 символов", "Minimum 6 characters"), tone: "error" });
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwMsg({ text: t("Пароль изменён", "Password changed"), tone: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setPwMsg({ text: e instanceof Error ? e.message : t("Ошибка", "Failed"), tone: "error" });
    }
    setPwSaving(false);
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarMsg(null);
    try {
      await uploadAvatar(file);
      setAvatarMsg({ text: t("Аватар обновлён", "Avatar updated"), tone: "success" });
      invalidateMeCache();
      await loadUser();
    } catch (err) {
      setAvatarMsg({ text: err instanceof Error ? err.message : t("Ошибка загрузки", "Upload failed"), tone: "error" });
    }
    setAvatarUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleAvatarDelete = async () => {
    setAvatarUploading(true);
    setAvatarMsg(null);
    try {
      await deleteAvatar();
      setAvatarMsg({ text: t("Аватар удалён", "Avatar removed"), tone: "success" });
      invalidateMeCache();
      await loadUser();
    } catch (err) {
      setAvatarMsg({ text: err instanceof Error ? err.message : t("Ошибка", "Failed"), tone: "error" });
    }
    setAvatarUploading(false);
  };

  const avatarSrc = user?.avatarUrl ? `${API_BASE}${user.avatarUrl}` : null;
  const initials = user ? [user.firstName, user.lastName].filter(Boolean).map(n => n[0]).join("").toUpperCase() || "ST" : "ST";
  const memberSince = user?.createdAt ? new Date(user.createdAt).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { year: "numeric", month: "long", day: "numeric" }) : "—";

  return (
    <AppShell role="student" lang={lang}>
      <div className="stack" style={{ maxWidth: 680, margin: "0 auto" }}>
        <header className="page-header">
          <h1 className="page-title">{t("Настройки", "Settings")}</h1>
          <p className="page-subtitle">{t("Управление профилем и безопасностью", "Manage your profile and security")}</p>
        </header>

        {error && <InlineAlert tone="error">{error}</InlineAlert>}

        {loading ? (
          <Card><p className="muted">{t("Загрузка...", "Loading...")}</p></Card>
        ) : user ? (
          <>
            {/* Avatar */}
            <Card>
              <h3 className="card-title">{t("Фото профиля", "Profile photo")}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 8 }}>
                <div className="settings-avatar-wrapper">
                  {avatarSrc ? (
                    <img src={avatarSrc} alt="" className="settings-avatar-img" loading="lazy" />
                  ) : (
                    <div className="settings-avatar-placeholder">{initials}</div>
                  )}
                </div>
                <div className="stack stack-tight">
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => void handleAvatarSelect(e)} />
                  <div className="row" style={{ gap: 8 }}>
                    <Button tone="secondary" className="small" onClick={() => fileRef.current?.click()} disabled={avatarUploading}>
                      {avatarUploading ? "..." : t("Загрузить фото", "Upload photo")}
                    </Button>
                    {user.avatarUrl && (
                      <Button tone="ghost" className="small" onClick={() => void handleAvatarDelete()} disabled={avatarUploading}>
                        {t("Удалить", "Remove")}
                      </Button>
                    )}
                  </div>
                  <p className="muted text-caption">{t("JPG, PNG или WebP. Макс. 2 МБ.", "JPG, PNG or WebP. Max 2 MB.")}</p>
                  {avatarMsg && <p className={`text-caption ${avatarMsg.tone === "error" ? "text-error" : "text-success"}`}>{avatarMsg.text}</p>}
                </div>
              </div>
            </Card>

            {/* Profile */}
            <Card>
              <h3 className="card-title">{t("Личные данные", "Personal info")}</h3>
              <div className="settings-form">
                <div className="settings-row">
                  <label className="form-label">{t("Имя", "First name")}</label>
                  <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="settings-row">
                  <label className="form-label">{t("Фамилия", "Last name")}</label>
                  <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
                <div className="settings-row">
                  <label className="form-label">Email</label>
                  <input className="input" value={user.email} disabled />
                  <p className="muted text-caption">{t("Email нельзя изменить", "Email cannot be changed")}</p>
                </div>
                <div className="settings-row">
                  <label className="form-label">{t("Язык интерфейса", "Interface language")}</label>
                  <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="ru">Русский</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label className="form-label">{t("Часовой пояс", "Timezone")}</label>
                  <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <Button onClick={() => void saveProfile()} disabled={profileSaving}>
                    {profileSaving ? "..." : t("Сохранить", "Save")}
                  </Button>
                </div>
                {profileMsg && <p className={`text-caption ${profileMsg.tone === "error" ? "text-error" : "text-success"}`}>{profileMsg.text}</p>}
              </div>
            </Card>

            {/* Password */}
            <Card>
              <h3 className="card-title">{t("Смена пароля", "Change password")}</h3>
              <div className="settings-form">
                <div className="settings-row">
                  <label className="form-label">{t("Текущий пароль", "Current password")}</label>
                  <input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <div className="settings-row">
                  <label className="form-label">{t("Новый пароль", "New password")}</label>
                  <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder={t("Минимум 6 символов", "At least 6 characters")} />
                </div>
                <div className="settings-row">
                  <label className="form-label">{t("Подтвердите пароль", "Confirm password")}</label>
                  <input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <Button onClick={() => void savePw()} disabled={pwSaving || !currentPassword || !newPassword}>
                    {pwSaving ? "..." : t("Изменить пароль", "Change password")}
                  </Button>
                </div>
                {pwMsg && <p className={`text-caption ${pwMsg.tone === "error" ? "text-error" : "text-success"}`}>{pwMsg.text}</p>}
              </div>
            </Card>

            {/* Account info */}
            <Card>
              <h3 className="card-title">{t("Аккаунт", "Account")}</h3>
              <div className="settings-info-grid">
                <div className="settings-info-item">
                  <span className="muted text-caption">{t("Роль", "Role")}</span>
                  <Badge tone="primary">{user.role === "student" ? t("Студент", "Student") : user.role}</Badge>
                </div>
                <div className="settings-info-item">
                  <span className="muted text-caption">{t("Регистрация", "Member since")}</span>
                  <span className="text-body-sm">{memberSince}</span>
                </div>
                {user.selectedTrack && (
                  <div className="settings-info-item">
                    <span className="muted text-caption">{t("Трек", "Track")}</span>
                    <Badge tone="success">{t("Трек", "Track")} {user.selectedTrack}</Badge>
                  </div>
                )}
                <div className="settings-info-item">
                  <span className="muted text-caption">{t("Онбординг", "Onboarding")}</span>
                  <Badge tone={user.onboardingDone ? "success" : "neutral"}>
                    {user.onboardingDone ? <><CheckIcon /> {t("Пройден", "Done")}</> : t("Не пройден", "Not done")}
                  </Badge>
                </div>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
