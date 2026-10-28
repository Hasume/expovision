"use client";

import type { KeyboardEvent as ReactKeyboardEvent, PropsWithChildren, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { persistLang, type LanguageCode } from "@/features/i18n";
import { clearAuthState, communityChatUnread, communityLogout, communityMeApi, getCommunityAuthState, getStudentBootstrap, me } from "@/features/api";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { PulseGrid } from "@/shared/ui/pulse-grid";

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

export const CheckIcon = () => (
  <svg className="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const LockIcon = () => (
  <svg className="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export const ClipboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

const GitBranchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

export const AwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
  </svg>
);

export const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);

export const VideoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

export const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const LogOutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

export const MessageCircleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

export const TargetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);

export const CompassIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

export const CpuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
    <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
  </svg>
);

export const RocketIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

export const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const BookOpenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const LayoutDashboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

type NavSection = { label: string; items: NavItem[] };
type NavItem = { href: string; label: string; icon: ReactNode; disabled?: boolean };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ST";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

const HeaderBellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const HeaderLangChevron = () => (
  <svg className="app-header-lang-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export function PlatformShellHeader({
  lang,
  avatarUrl,
  profileName,
  notificationsHref,
  settingsHref,
  onLangChange,
  onLogout,
  showHamburger,
  onMenuToggle,
}: {
  lang: LanguageCode;
  avatarUrl: string | null;
  profileName: string;
  notificationsHref: string;
  settingsHref: string;
  onLangChange: (next: LanguageCode) => void;
  onLogout?: () => void;
  showHamburger?: boolean;
  onMenuToggle?: () => void;
}) {
  const langLabel = lang === "ru" ? "Ru" : "En";
  const initials = getInitials(profileName);
  const logoutAria = lang === "ru" ? "Выйти" : "Log out";

  return (
    <header className="app-shell-header app-shell-header--nav-only">
      <div className="app-shell-header-actions">
        <Link href={notificationsHref} className="app-shell-header-icon-btn" aria-label={lang === "ru" ? "Уведомления" : "Notifications"}>
          <HeaderBellIcon />
          <span className="app-shell-header-notify-badge" aria-hidden />
        </Link>
        <Link href={settingsHref} aria-label={lang === "ru" ? "Профиль" : "Profile"}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="app-shell-header-avatar" width={40} height={40} />
          ) : (
            <span className="app-shell-header-avatar-fallback">{initials}</span>
          )}
        </Link>
        {onLogout ? (
          <button
            type="button"
            className="app-shell-header-icon-btn"
            onClick={onLogout}
            aria-label={logoutAria}
            title={logoutAria}
          >
            <LogOutIcon />
          </button>
        ) : null}
        <details className="app-header-lang">
          <summary>
            {langLabel}
            <HeaderLangChevron />
          </summary>
          <div className="app-header-lang-panel">
            <button type="button" onClick={() => { onLangChange("ru"); }}>
              Русский
            </button>
            <button type="button" onClick={() => { onLangChange("en"); }}>
              English
            </button>
          </div>
        </details>
        {showHamburger ? (
          <button type="button" className="app-shell-header-hamburger" onClick={onMenuToggle} aria-label="Menu">
            <MenuIcon />
          </button>
        ) : null}
      </div>
    </header>
  );
}

function SidebarContent({ sections, profileName, profileSecondary, onNav, studentLayout, lang }: {
  sections: NavSection[];
  profileName?: string;
  profileSecondary?: string;
  onNav?: (() => void) | undefined;
  studentLayout?: boolean;
  lang?: string;
}) {
  const pathname = usePathname();
  const qs = `?lang=${lang ?? "ru"}`;

  const navActive = (href: string): boolean => {
    const pathOnly = href.split("?")[0] ?? href;
    if (pathOnly === "/" || pathOnly === "") return false;
    if (pathname === pathOnly) return true;
    if (pathOnly === "/admin" || pathOnly === "/dashboard") return false;
    return pathname.startsWith(`${pathOnly}/`);
  };

  const sectionHeading = (label: string): string => {
    if (label) return label;
    if (studentLayout) return lang === "ru" ? "НАВИГАЦИЯ" : "NAVIGATION";
    return "";
  };

  return (
    <>
      {studentLayout ? (
        <div className="sidebar-brand sidebar-brand--platform">
          <Link
            href={`/dashboard${qs}`}
            className="sidebar-platform-logo-link"
            {...(onNav ? { onClick: () => onNav() } : {})}
            aria-label={lang === "en" ? "Expovision — home" : "Expovision — главная"}
          >
            <BrandLogo size="md" nameVariant="platform" />
          </Link>
        </div>
      ) : (
        <div className="sidebar-brand">
          <BrandLogo size="md" nameVariant="academy" />
          {profileName ? <p className="sidebar-user-name">{profileName}</p> : null}
          {profileSecondary ? <p className="sidebar-user-meta">{profileSecondary}</p> : null}
        </div>
      )}
      {sections.map((section) => (
        <nav key={section.label || "nav"} className="sidebar-section">
          <p className="sidebar-label">{sectionHeading(section.label)}</p>
          <ul className="sidebar-nav">
            {section.items.map((item) => (
              <li key={item.href}>
                {item.disabled ? (
                  <span className="sidebar-link disabled">
                    {item.icon}
                    <span className="sidebar-link-label">{item.label}</span>
                    <span className="sidebar-link-active-dot" aria-hidden />
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className={`sidebar-link ${navActive(item.href) ? "active" : ""}`}
                    {...(onNav ? { onClick: () => onNav() } : {})}
                  >
                    {item.icon}
                    <span className="sidebar-link-label">{item.label}</span>
                    <span className="sidebar-link-active-dot" aria-hidden />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ))}
      <div className="sidebar-spacer" />
    </>
  );
}

export function AppShell({ children, role = "student", lang = "ru", currentDay }: PropsWithChildren<{
  role?: "student" | "admin";
  lang?: string;
  currentDay?: number;
}>) {
  const [open, setOpen] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [studentCurrentDay, setStudentCurrentDay] = useState(currentDay ?? 1);
  const [finalNav, setFinalNav] = useState<{
    intensiveEnded: boolean;
    unlocked: boolean;
    certificatePdfUrl: string | null;
  }>({ intensiveEnded: false, unlocked: false, certificatePdfUrl: null });
  const [profileName, setProfileName] = useState("");
  const [profileSecondary, setProfileSecondary] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [flowTitle, setFlowTitle] = useState<string | null>(null);
  const [studentFlowSource, setStudentFlowSource] = useState<string | null>(null);
  const qs = `?lang=${lang}`;
  const day = studentCurrentDay;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
  const router = useRouter();
  const langCode: LanguageCode = lang === "en" ? "en" : "ru";

  const setAppLang = (next: LanguageCode): void => {
    persistLang(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    const search = url.searchParams.toString();
    router.push(search ? `${url.pathname}?${search}` : url.pathname);
  };

  useEffect(() => {
    if (currentDay && currentDay > 0) setStudentCurrentDay(currentDay);
  }, [currentDay]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let studentSession: Awaited<ReturnType<typeof getStudentBootstrap>> | null = null;
        const user =
          role === "student"
            ? (studentSession = await getStudentBootstrap()).user
            : await me();
        if (cancelled) return;
        if (user.role !== role) {
          const target = user.role === "admin" ? "/admin" : `/dashboard${qs}`;
          window.location.replace(target);
          return;
        }
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
        setProfileName(fullName || user.email);
        setProfileSecondary(user.email);
        setAvatarUrl(user.avatarUrl ? `${apiBase}${user.avatarUrl}` : null);
        if (role === "student" && studentSession) {
          if (studentSession.dashboard) {
            setStudentCurrentDay(studentSession.dashboard.currentDay);
            setFlowTitle(studentSession.dashboard.flowTitle ?? null);
            setStudentFlowSource(studentSession.dashboard.flowSource ?? null);
          } else {
            setStudentCurrentDay(currentDay ?? 1);
            setStudentFlowSource(null);
          }
          setFinalNav({
            intensiveEnded: studentSession.finalStatus?.intensiveEnded ?? false,
            unlocked: studentSession.finalStatus?.unlocked ?? false,
            certificatePdfUrl: studentSession.finalStatus?.certificatePdfUrl ?? null,
          });
        }
        setIsAuthChecked(true);
      } catch {
        if (cancelled) return;
        clearAuthState();
        const loginPath = role === "admin" ? `/admin/login${qs}` : `/login${qs}`;
        window.location.replace(loginPath);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, qs]);

  if (!isAuthChecked) {
    return (
      <div className="standalone-shell">
        <div className="standalone-card">
          <div className="stack auth-check">
            <p className="text-h3 no-margin">{lang === "ru" ? "Проверка доступа..." : "Checking access..."}</p>
            <p className="muted text-caption no-margin">
              {lang === "ru" ? "Подтверждаем сессию и права роли." : "Verifying session and role permissions."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const finalSidebarIcon =
    !finalNav.intensiveEnded
      ? <LockIcon />
      : finalNav.unlocked && finalNav.certificatePdfUrl
        ? <AwardIcon />
        : <ClockIcon />;

  const studentSections: NavSection[] = [
    {
      label: "",
      items: [
        { href: `/dashboard${qs}`, label: lang === "ru" ? "Главная" : "Home", icon: <HomeIcon /> },
        { href: `/lessons${qs}&day=${day}`, label: lang === "ru" ? "Программа" : "Programme", icon: <PlayIcon /> },
        ...(studentFlowSource === "flow"
          ? [{ href: `/webinars${qs}`, label: lang === "ru" ? "Вебинары" : "Webinars", icon: <VideoIcon /> }]
          : []),
        { href: `/library${qs}`, label: lang === "ru" ? "Курсы" : "Courses", icon: <BookOpenIcon /> },
        { href: `/chat${qs}`, label: lang === "ru" ? "Сообщество" : "Community", icon: <MessageCircleIcon /> },
        ...(day >= 7 || finalNav.intensiveEnded
          ? [{ href: `/split${qs}`, label: lang === "ru" ? "Трек" : "Track", icon: <GitBranchIcon /> }]
          : []),
        {
          href: `/final${qs}`,
          label: lang === "ru" ? "Финал" : "Final",
          icon: finalSidebarIcon,
          disabled: !finalNav.intensiveEnded,
        },
      ],
    },
  ];

  const adminSections: NavSection[] = [
    {
      label: "ADMIN",
      items: [
        { href: "/admin", label: "Dashboard", icon: <LayoutDashboardIcon /> },
        { href: "/admin/content", label: "Content", icon: <ClipboardIcon /> },
        { href: "/admin/courses", label: "Courses", icon: <BookOpenIcon /> },
        { href: "/admin/flows", label: "Flows", icon: <GitBranchIcon /> },
        { href: "/admin/students", label: "Students", icon: <UsersIcon /> },
        { href: "/admin/homework", label: "Review Queue", icon: <EditIcon /> },
      ]
    }
  ];

  const sectionMap = { student: studentSections, admin: adminSections };

  const onLogout = (): void => {
    clearAuthState();
    router.push(`/login${qs}`);
  };

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <SidebarContent
          sections={sectionMap[role]}
          profileName={profileName}
          profileSecondary={profileSecondary}
          studentLayout={role === "student"}
          lang={lang}
          onNav={() => setOpen(false)}
        />
      </aside>
      <div className="app-main">
        <PlatformShellHeader
          lang={langCode}
          avatarUrl={avatarUrl}
          profileName={profileName}
          notificationsHref={role === "student" ? `/chat${qs}` : `/admin/chat`}
          settingsHref={role === "student" ? `/settings${qs}` : `/admin/settings`}
          onLangChange={setAppLang}
          onLogout={onLogout}
          showHamburger
          onMenuToggle={() => setOpen(!open)}
        />
        <div className="main-content">{children}</div>
      </div>
    </div>
  );
}

export function StandaloneShell({ children }: PropsWithChildren) {
  return (
    <div className="standalone-shell">
      <PulseGrid
        className="standalone-pulse-grid"
        dotSize={2}
        gap={22}
        radius={220}
        maxScale={1.8}
        baseColor="rgba(17, 28, 50, 0.09)"
        hoverColor="#158aeb"
        disableOnMobile={true}
        disableOnTablet={false}
      />
      <Link href="/" className="standalone-home-btn" aria-label="Главный экран">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>Главный экран</span>
      </Link>
      <div className="standalone-card">
        <BrandLogo className="logo" size="md" />
        {children}
      </div>
    </div>
  );
}

export function PageShell({ children }: PropsWithChildren) {
  return <main className="container page-shell">{children}</main>;
}

export function SectionHeader({ title, subtitle, level = 1 }: { title: string; subtitle?: string; level?: 1 | 2 }) {
  const HeadingTag = level === 1 ? "h1" : "h2";
  return (
    <header className="page-header">
      <HeadingTag className="page-title">{title}</HeadingTag>
      {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
    </header>
  );
}

export function CourseHero({ title, stats }: { title: string; stats?: string }) {
  return (
    <div className="course-hero">
      <h1>{title}</h1>
      {stats ? <div className="course-meta">{stats}</div> : null}
    </div>
  );
}

export function ModuleSection({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <div className="module-section">
      <div className="module-header">
        <h2 className="module-title">{title}</h2>
        {subtitle ? <p className="module-subtitle">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function LessonRow({ href, title, duration, done, locked }: { href: string; title: string; duration?: string; done?: boolean; locked?: boolean }) {
  const iconClass = done ? "done" : locked ? "locked" : "";
  const Icon = done ? CheckIcon : PlayIcon;
  return (
    <Link href={href} className="lesson-row">
      <div className={`lesson-icon ${iconClass}`}><Icon /></div>
      <div className="lesson-info">
        <div className="lesson-name">{title}</div>
        {duration ? <div className="lesson-duration">{duration}</div> : null}
      </div>
      <div className="lesson-status">
        {done ? <CheckIcon /> : null}
        {locked ? <LockIcon /> : null}
        {!done && !locked ? <span className="badge primary badge-xs">OPEN</span> : null}
      </div>
    </Link>
  );
}

export function Card(props: PropsWithChildren<{ title?: string; soft?: boolean }>) {
  return (
    <section className={`card ${props.soft ? "soft" : ""}`.trim()}>
      {props.title ? <h3 className="card-title">{props.title}</h3> : null}
      {props.children}
    </section>
  );
}

export function ButtonLink({ href, children, tone = "primary", className }: PropsWithChildren<{ href: string; tone?: "primary" | "secondary" | "ghost" | "light"; className?: string }>) {
  return <Link href={href} className={`link-button ${tone} ${className ?? ""}`.trim()}>{children}</Link>;
}

export function BackToCourseLink({ href, lang }: { href: string; lang: "ru" | "en" }) {
  return <ButtonLink href={href} tone="ghost">{lang === "ru" ? "Назад к курсу" : "Back to course"}</ButtonLink>;
}

export function Button(props: PropsWithChildren<{ onClick?: () => void; disabled?: boolean; tone?: "primary" | "secondary" | "ghost" | "light"; type?: "button" | "submit"; className?: string }>) {
  return (
    <button type={props.type ?? "button"} onClick={props.onClick} disabled={props.disabled} className={`button ${props.tone ?? "primary"} ${props.className ?? ""}`.trim()}>
      {props.children}
    </button>
  );
}

export function Input(props: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      id={props.id}
      name={props.name}
      className="input"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder={props.placeholder}
      type={props.type ?? "text"}
      disabled={props.disabled}
      required={props.required}
      autoComplete={props.autoComplete}
      aria-invalid={props.ariaInvalid}
      aria-describedby={props.ariaDescribedBy}
      onKeyDown={props.onKeyDown}
    />
  );
}

export function Textarea(props: {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
}) {
  return (
    <textarea
      id={props.id}
      name={props.name}
      className="textarea"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      rows={props.rows ?? 6}
      placeholder={props.placeholder}
      disabled={props.disabled}
      required={props.required}
      aria-invalid={props.ariaInvalid}
      aria-describedby={props.ariaDescribedBy}
    />
  );
}

export function Badge({ tone, children }: PropsWithChildren<{ tone: "neutral" | "success" | "warning" | "danger" | "primary" }>) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function InlineAlert({ tone, children }: PropsWithChildren<{ tone: "error" | "success" | "warning" }>) {
  return <p className={`alert ${tone}`} role="status" aria-live={tone === "error" ? "assertive" : "polite"}>{children}</p>;
}

export function Modal({ open, onClose, title, children, width }: PropsWithChildren<{ open: boolean; onClose: () => void; title: string; width?: string }>) {
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const container = modalRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const focusable = modalRef.current?.querySelector<HTMLElement>(
      '.modal-body input:not([disabled]), .modal-body textarea:not([disabled]), .modal-body select:not([disabled]), .modal-body button:not([disabled]), .modal-body [href], .modal-body [tabindex]:not([tabindex="-1"])'
    ) ?? modalRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? modalRef.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previousActive?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-content"
        style={width ? { maxWidth: width } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h3 className="modal-title" id={titleId}>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog"><XIcon /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Card soft>
      <h3 className="card-title">{title}</h3>
      {subtitle ? <p className="muted no-margin">{subtitle}</p> : null}
    </Card>
  );
}

export function TabRow({ tabs, activeTab, onChange }: {
  tabs: Array<{ key: string; label: string }>;
  activeTab: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs-bar" role="tablist">
      {tabs.map((tb) => (
        <button
          key={tb.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tb.key}
          onClick={() => onChange(tb.key)}
          className={`tab-button ${activeTab === tb.key ? "active" : ""}`}
        >
          {tb.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue} aria-label="Progress">
      <div className="progress-fill" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

type JourneyStep = {
  step: number;
  title: string;
  description: string;
  state: "completed" | "current" | "locked";
  href?: string;
  actionLabel?: string;
};

export function JourneyMap({ steps, lang }: { steps: JourneyStep[]; lang: string }) {
  return (
    <div className="journey-map">
      {steps.map((s) => (
        <div key={s.step} className={`journey-step ${s.state}`}>
          <div className="journey-spine">
            <div className="journey-node">
              {s.state === "completed" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : s.state === "locked" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              ) : (
                <span>{s.step}</span>
              )}
            </div>
            <div className="journey-connector" />
          </div>
          <div className="journey-card">
            <div className="row row-tight row-margin-xs">
              <span className="muted label-xs">
                {lang === "ru" ? `Этап ${s.step}` : `Step ${s.step}`}
              </span>
              {s.state === "completed" ? <Badge tone="success">{lang === "ru" ? "Пройден" : "Done"}</Badge> : null}
              {s.state === "current" ? <Badge tone="primary">{lang === "ru" ? "Текущий" : "Current"}</Badge> : null}
            </div>
            <p className="journey-card-title">{s.title}</p>
            <p className="journey-card-desc">{s.description}</p>
            {s.href && s.state !== "locked" ? (
              <div className="journey-card-action">
                <ButtonLink href={s.href} tone={s.state === "current" ? "primary" : "ghost"} className="small">
                  {s.actionLabel ?? (lang === "ru" ? "Перейти" : "Go")}
                </ButtonLink>
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

type TreeLesson = {
  id: string;
  title: string;
  kind: "mandatory" | "optional";
  status: "locked" | "available" | "completed";
};

type FuturisticTreeDay = {
  dayNumber: number;
  state: "completed" | "current" | "locked";
  lessons: TreeLesson[];
  progress: number;
};

export type { FuturisticTreeDay, TreeLesson };

export function FuturisticUnlockTree({ days, lang, currentDay }: { days: FuturisticTreeDay[]; lang: string; currentDay: number }) {
  const t = (ru: string, en: string) => (lang === "ru" ? ru : en);
  const fallbackTitleByDay: Record<number, string> = {
    1: t("IT1. Карта IT без мифов", "IT1. IT map without myths"),
    2: t("IT2. Компьютер и софт на пальцах", "IT2. Computer and software basics"),
    3: t("IT3. Инструменты IT-специалиста", "IT3. IT specialist toolkit"),
  };
  const allDays = Array.from({ length: 14 }, (_, idx) => idx + 1).map((dayNumber) => {
    const day = days.find((d) => d.dayNumber === dayNumber);
    const mandatory = day?.lessons.find((lesson) => lesson.kind === "mandatory");
    const title = mandatory?.title?.trim() || fallbackTitleByDay[dayNumber] || t(`День ${dayNumber}`, `Day ${dayNumber}`);
    const lessonsTotal = day?.lessons.length ?? 1;
    const lessonsCompleted = day?.lessons.filter((lesson) => lesson.status === "completed").length ?? 0;
    const progress = lessonsTotal > 0 ? Math.round((lessonsCompleted / lessonsTotal) * 100) : 0;
    const state: "completed" | "current" | "locked" = dayNumber < currentDay
      ? "completed"
      : dayNumber === currentDay
        ? "current"
        : "locked";
    return { dayNumber, title, lessonsTotal, lessonsCompleted, progress, state };
  });

  const completedDays = allDays.filter((day) => day.state === "completed").length;
  const currentProgress = Math.round((completedDays / allDays.length) * 100);
  const currentModule = currentDay <= 7 ? 1 : 2;
  const moduleProgress = currentModule === 1
    ? Math.round((Math.min(currentDay, 7) / 7) * 100)
    : Math.round((Math.max(0, currentDay - 7) / 7) * 100);
  const lessonRows = allDays.slice(Math.max(0, currentDay - 1), Math.min(allDays.length, currentDay + 2));

  return (
    <section className="learning-map-shell" aria-label={t("Карта обучения", "Learning map")}>
      <article className="learning-map-hero">
        <div className="learning-map-hero-head">
          <h3 className="student-course-title">{allDays[currentDay - 1]?.title ?? t("Текущий день", "Current day")}</h3>
          <p className="student-course-subtitle">{t("Изучи структуру курса на карте.", "Explore your course structure in this map.")}</p>
        </div>
        <div className="student-course-progress">
          <div className="row between">
            <p className="flow-section-title">{t("Общий прогресс", "Overall progress")}</p>
            <span className="student-progress-value">{currentProgress}%</span>
          </div>
          <ProgressBar value={currentProgress} />
        </div>
        <div className="section-top-sm">
          <ButtonLink href={`/lessons?lang=${lang}&day=${currentDay}`} className="small">
            {t("Продолжить обучение", "Continue learning")}
          </ButtonLink>
        </div>
      </article>

      <div className="learning-map-stats-grid">
        <article className="student-progress-card">
          <p className="entity-title">{allDays[currentDay - 1]?.title ?? t("Урок дня", "Today's lesson")}</p>
          <p className="student-progress-label">{t("Сегодняшний урок", "Today's lesson")}</p>
        </article>
        <article className="student-progress-card">
          <p className="entity-title">{t(`Модуль ${currentModule}`, `Module ${currentModule}`)}</p>
          <p className="student-progress-label">{t("Текущий модуль", "Current module")}</p>
        </article>
        <article className="student-progress-card">
          <p className="student-progress-number">{moduleProgress}%</p>
          <p className="student-progress-label">{t("Прогресс модуля", "Module progress")}</p>
        </article>
        <article className="student-progress-card">
          <p className="student-progress-number">{completedDays}</p>
          <p className="student-progress-label">{t("Пройдено дней", "Completed days")}</p>
        </article>
      </div>

      <article className="learning-map-module-card">
        <div className="student-module-head">
          <div>
            <p className="entity-title">{t(`Модуль ${currentModule}`, `Module ${currentModule}`)}</p>
            <p className="entity-subtitle">
              {currentModule === 1
                ? t("Изучи базовые AI-концепции и рабочий интеллект.", "Learn core AI concepts and practical intelligence.")
                : t("Собери прикладной продукт и выйди к результату.", "Build a practical product and move to outcome.")}
            </p>
          </div>
          <Badge tone="primary">{moduleProgress}%</Badge>
        </div>
        <div className="section-top-sm">
          <ProgressBar value={moduleProgress} />
        </div>
      </article>

      <article className="learning-map-lessons-card">
        <h4 className="student-section-title">{t("Уроки", "Lessons")}</h4>
        <div className="student-lessons-list section-top-sm">
          {lessonRows.map((day) => (
            <div key={day.dayNumber} className="student-lesson-row">
              <div>
                <p className="entity-title">{`${t("День", "Day")} ${day.dayNumber}`}</p>
                <p className="entity-subtitle">{day.title}</p>
              </div>
              <Badge tone={day.state === "completed" ? "success" : day.state === "current" ? "primary" : "neutral"}>
                {day.lessonsCompleted}/{day.lessonsTotal}
              </Badge>
            </div>
          ))}
        </div>
        <div className="section-top-sm">
          <ButtonLink href={`/lessons?lang=${lang}&day=${currentDay}`} tone="secondary" className="small">
            {t("Открыть уроки", "Open lessons")}
          </ButtonLink>
        </div>
      </article>
    </section>
  );
}

export function TutorialTip({ tipKey, title, message }: { tipKey: string; title: string; message: string }) {
  const storageKey = "tips_dismissed";
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const list = JSON.parse(raw) as string[];
      return list.includes(tipKey);
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const onDismiss = (): void => {
    setDismissed(true);
    try {
      const raw = localStorage.getItem(storageKey);
      const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      list.push(tipKey);
      localStorage.setItem(storageKey, JSON.stringify(list));
    } catch { /* */ }
  };

  return (
    <div className="tutorial-tip">
      <InfoIcon />
      <div className="tutorial-tip-content">
        <p className="tutorial-tip-title">{title}</p>
        <p className="tutorial-tip-message">{message}</p>
      </div>
      <button className="tutorial-tip-close" onClick={onDismiss} aria-label="Dismiss">
        <XIcon />
      </button>
    </div>
  );
}

// ─── CommunityShell ───────────────────────────────────────────────────────────

const HubHomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const HubDiscIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const HubMsgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M8 10h.01M12 10h.01M16 10h.01" />
  </svg>
);
const HubSavedIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const HubUserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const HubPlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const HubMenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const HUB_NAV = [
  { href: "/community/dashboard",  label: "Лента",           icon: HubHomeIcon,   exact: true },
  { href: "/community/topics",     label: "Архив",          icon: HubDiscIcon,   exact: false },
  { href: "/community/saved",      label: "Сохранённое",  icon: HubSavedIcon,  exact: false },
  { href: "/community/messages",   label: "Сообщения",    icon: HubMsgIcon,    exact: false },
];

export function CommunityShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [initials, setInitials] = useState("?");
  const [xp, setXp] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    const auth = getCommunityAuthState();
    if (!auth) return;
    setUserId(auth.userId);
    communityMeApi().then((u) => {
      setFirstName(u.firstName);
      setInitials(`${u.firstName?.[0] ?? ""}${u.lastName?.[0] ?? ""}`.toUpperCase() || "?");
      setAvatarUrl(u.avatarUrl ? `${apiBase}${u.avatarUrl}` : null);
      setXp(u.communityXp ?? 0);
    }).catch(() => {});
  }, [apiBase]);

  // Poll unread message count every 30s
  useEffect(() => {
    const auth = getCommunityAuthState();
    if (!auth) return;
    const fetchUnread = () => {
      communityChatUnread().then((r) => setUnreadMessages(r.unread)).catch(() => {});
    };
    fetchUnread();
    const id = setInterval(fetchUnread, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  const handleLogout = async () => {
    await communityLogout();
    router.push("/community");
  };

  const navItemActive = (href: string, exact: boolean) => {
    if (href === "/community/topics") {
      return pathname.startsWith("/community/topics") || pathname.startsWith("/community/post/");
    }
    return exact ? pathname === href : pathname.startsWith(href);
  };

  const xpLevel = xp < 50 ? 1 : xp < 200 ? 2 : xp < 500 ? 3 : xp < 1000 ? 4 : 5;

  return (
    <div className="hub-root">
      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div className="hub-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`hub-sidebar${sidebarOpen ? " hub-sidebar--open" : ""}`}>
        {/* Brand */}
        <div className="hub-brand">
          <Link href="/community/dashboard" className="hub-brand-link">
            <BrandLogo size="sm" showName={false} />
            <div className="hub-brand-text">
              <span className="hub-brand-name">Expovision</span>
              <span className="hub-brand-sub">Community</span>
            </div>
          </Link>
        </div>

        {/* Main nav */}
        <nav className="hub-nav">
          <div className="hub-nav-label">Платформа</div>
          {HUB_NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = navItemActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                className={`hub-nav-item${active ? " hub-nav-item--active" : ""}`}
                aria-current={active ? "page" : undefined}
                title={label}
              >
                <span className="hub-nav-icon" style={{ position: "relative" }}>
                  <Icon />
                  {href === "/community/messages" && unreadMessages > 0 && (
                    <span className="hub-nav-badge">
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                    </span>
                  )}
                </span>
                <span className="hub-nav-label-text">{label}</span>
              </Link>
            );
          })}

          {userId && (
            <>
              <div className="hub-nav-divider" />
              <div className="hub-nav-label">Профиль</div>
              <Link
                href={`/community/profile/${userId}`}
                className={`hub-nav-item${pathname.startsWith("/community/profile") ? " hub-nav-item--active" : ""}`}
              >
                <span className="hub-nav-icon"><HubUserIcon /></span>
                <span className="hub-nav-label-text">Мой профиль</span>
              </Link>
              <Link href="/community/dashboard#compose-discussion" className="hub-nav-item hub-nav-item--cta">
                <span className="hub-nav-icon"><HubPlusIcon /></span>
                <span className="hub-nav-label-text">Задать вопрос</span>
              </Link>
            </>
          )}
        </nav>

        {/* User section */}
        <div className="hub-user-section" ref={menuRef}>
          {userId ? (
            <>
              <button
                className="hub-user-btn"
                onClick={() => setUserMenuOpen((o) => !o)}
              >
                <div className="hub-user-avatar">
                  {avatarUrl
                    ? <img src={avatarUrl} alt={firstName} />
                    : <span>{initials}</span>}
                </div>
                <div className="hub-user-info">
                  <span className="hub-user-name">{firstName}</span>
                  <span className="hub-user-xp">Lv{xpLevel} · {xp} XP</span>
                </div>
              </button>
              {userMenuOpen && (
                <div className="hub-user-menu">
                  <Link href={`/community/profile/${userId}`} className="hub-user-menu-item" onClick={() => setUserMenuOpen(false)}>
                    Мой профиль
                  </Link>
                  <Link href="/dashboard" className="hub-user-menu-item" onClick={() => setUserMenuOpen(false)}>
                    Студенческая платформа
                  </Link>
                  <div className="hub-user-menu-divider" />
                  <button className="hub-user-menu-item hub-user-menu-item--danger" onClick={handleLogout}>
                    Выйти
                  </button>
                </div>
              )}
            </>
          ) : (
            <Link href="/community" className="hub-login-btn">
              Войти в аккаунт
            </Link>
          )}
        </div>
      </aside>

      {/* ── Mobile topbar ── */}
      <header className="hub-topbar">
        <button className="hub-topbar-menu" onClick={() => setSidebarOpen(true)} aria-label="Меню">
          <HubMenuIcon />
        </button>
        <Link href="/community/dashboard" className="hub-topbar-brand">
          <BrandLogo size="sm" showName={false} />
          <span>Community</span>
        </Link>
        {userId ? (
          <Link href={`/community/profile/${userId}`} className="hub-topbar-avatar">
            {avatarUrl
              ? <img src={avatarUrl} alt={firstName} />
              : <span>{initials}</span>}
          </Link>
        ) : (
          <Link href="/community" className="hub-topbar-login">Войти</Link>
        )}
      </header>

      {/* ── Main content ── */}
      <main className="hub-main">
        {children}
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="hub-bottom-nav">
        {HUB_NAV.map(({ href, label, icon: Icon, exact }) => (
          <Link
            key={href}
            href={href}
            className={`hub-bottom-item${navItemActive(href, exact) ? " hub-bottom-item--active" : ""}`}
          >
            <span style={{ position: "relative", display: "inline-flex" }}>
              <Icon />
              {href === "/community/messages" && unreadMessages > 0 && (
                <span style={{
                  position: "absolute",
                  top: -4,
                  right: -6,
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 14,
                  height: 14,
                  fontSize: 8,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              )}
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
