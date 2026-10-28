"use client";

import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAuthState, me } from "@/features/api";
import { PlatformShellHeader } from "@/shared/ui/components";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { ToastProvider } from "./toast";
import { AdminI18nProvider, useAdminLang } from "./i18n";

const icons: Record<string, () => ReactNode> = {
  dashboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  content: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  courses: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  flows: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  ),
  students: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  homework: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  certificates: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-6" />
      <path d="M9 15h6" />
    </svg>
  ),
  community: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  chat: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  tokens: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  audit: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  settings: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

type NavItem = { href: string; labelRu: string; labelEn: string; icon: string; badge?: number };
type NavGroup = { labelRu: string; labelEn: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    labelRu: "ОСНОВНОЕ",
    labelEn: "MAIN",
    items: [
      { href: "/admin", labelRu: "Дашборд", labelEn: "Dashboard", icon: "dashboard" },
      { href: "/admin/courses", labelRu: "Курсы", labelEn: "Courses", icon: "courses" },
      { href: "/admin/content", labelRu: "Программа", labelEn: "Programme", icon: "content" },
      { href: "/admin/flows", labelRu: "Потоки", labelEn: "Flows", icon: "flows" },
    ],
  },
  {
    labelRu: "УПРАВЛЕНИЕ",
    labelEn: "MANAGEMENT",
    items: [
      { href: "/admin/students", labelRu: "Пользователи", labelEn: "Users", icon: "students" },
      { href: "/admin/homework", labelRu: "Домашние задания", labelEn: "Homework", icon: "homework" },
      { href: "/admin/certificates", labelRu: "Заявки на сертификат", labelEn: "Certificate requests", icon: "certificates" },
    ],
  },
  {
    labelRu: "КОМЬЮНИТИ",
    labelEn: "COMMUNITY",
    items: [
      { href: "/admin/community", labelRu: "Модерация", labelEn: "Moderation", icon: "community" },
    ],
  },
  {
    labelRu: "СИСТЕМА",
    labelEn: "SYSTEM",
    items: [
      { href: "/admin/chat", labelRu: "Чат", labelEn: "Chat", icon: "chat" },
      { href: "/admin/tokens", labelRu: "Токены", labelEn: "Tokens", icon: "tokens" },
      { href: "/admin/audit", labelRu: "Журнал", labelEn: "Audit Log", icon: "audit" },
      { href: "/admin/settings", labelRu: "Настройки", labelEn: "Settings", icon: "settings" },
    ],
  },
];

function NavLink({ item, pathname, lang, onClick }: { item: NavItem; pathname: string; lang: "ru" | "en"; onClick?: () => void }) {
  const isActive = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
  const Icon = icons[item.icon];
  return (
    <li>
      <Link href={item.href} className={`sidebar-link${isActive ? " active" : ""}`} {...(onClick !== undefined ? { onClick } : {})}>
        {Icon ? <Icon /> : null}
        <span className="sidebar-link-label">{lang === "ru" ? item.labelRu : item.labelEn}</span>
        {item.badge !== undefined && item.badge > 0 ? <span className="admin-nav-badge">{item.badge}</span> : null}
        <span className="sidebar-link-active-dot" aria-hidden />
      </Link>
    </li>
  );
}

function AdminShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useAdminLang();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await me();
        if (cancelled) return;
        if (user.role !== "admin") {
          window.location.replace("/dashboard");
          return;
        }
        setProfileName([user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email);
        setProfileEmail(user.email);
        setAvatarUrl(user.avatarUrl ? `${apiBase}${user.avatarUrl}` : null);
        setReady(true);
      } catch {
        if (cancelled) return;
        clearAuthState();
        window.location.replace("/admin/login");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
    return (
      <div className="standalone-shell">
        <div className="standalone-card">
          <div className="stack auth-check">
            <p className="text-h3 no-margin">{t("Проверка доступа...", "Checking access...")}</p>
            <p className="muted text-caption no-margin">{t("Подтверждаем сессию и права.", "Verifying session and role.")}</p>
          </div>
        </div>
      </div>
    );
  }

  const onLogout = () => {
    clearAuthState();
    router.push("/admin/login");
  };

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay${mobileOpen ? " open" : ""}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar${mobileOpen ? " open" : ""}`}>
        <div className="sidebar-brand sidebar-brand--admin">
          <Link href="/admin" className="sidebar-platform-logo-link" onClick={() => setMobileOpen(false)} aria-label={lang === "ru" ? "Expovision — админ" : "Expovision — admin"}>
            <BrandLogo size="md" nameVariant="platform" />
          </Link>
          <p className="sidebar-user-name">{profileName}</p>
          <p className="sidebar-user-meta">{profileEmail}</p>
        </div>

        {navGroups.map((group) => (
          <nav key={group.labelEn} className="sidebar-section">
            <p className="sidebar-label">{lang === "ru" ? group.labelRu : group.labelEn}</p>
            <ul className="sidebar-nav">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} lang={lang} onClick={() => setMobileOpen(false)} />
              ))}
            </ul>
          </nav>
        ))}

        <div className="sidebar-spacer" />
      </aside>

      <div className="app-main">
        <PlatformShellHeader
          lang={lang}
          avatarUrl={avatarUrl}
          profileName={profileName}
          notificationsHref="/admin/chat"
          settingsHref="/admin/settings"
          onLangChange={setLang}
          onLogout={onLogout}
          showHamburger
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
        />
        <div className="main-content" style={{ maxWidth: 1320 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function AdminLayout({ children }: PropsWithChildren) {
  return (
    <AdminI18nProvider>
      <ToastProvider>
        <AdminShell>{children}</AdminShell>
      </ToastProvider>
    </AdminI18nProvider>
  );
}
