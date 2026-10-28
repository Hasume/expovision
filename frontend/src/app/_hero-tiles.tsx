import Link from "next/link";
import Image from "next/image";
import { BrandLogo } from "@/shared/ui/brand-logo";

/* ─── Icons ──────────────────────────────────────────────────── */

const IconBuy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const IconCases = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconCommunity = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

/* ─── Tile ───────────────────────────────────────────────────── */

type TileProps = {
  className: string;
  detail: string;
  children: React.ReactNode;
} & ({ href: string; external?: boolean } | { as: "div" });

function Tile({ className, detail, children, ...rest }: TileProps & { href?: string; external?: boolean; as?: "div" }) {
  const overlay = (
    <span className="metro-overlay">
      <span className="metro-overlay-text">{detail}</span>
    </span>
  );

  if ("as" in rest && rest.as === "div") {
    return (
      <div className={`metro-tile ${className}`}>
        {children}
        {overlay}
      </div>
    );
  }

  if (rest.external) {
    return (
      <a href={rest.href} target="_blank" rel="noreferrer" className={`metro-tile ${className}`}>
        {children}
        {overlay}
      </a>
    );
  }

  return (
    <Link href={rest.href!} className={`metro-tile ${className}`}>
      {children}
      {overlay}
    </Link>
  );
}

/* ─── Metro dashboard ────────────────────────────────────────── */

export function HeroTilesSection() {
  return (
    <div className="metro-root">
      <header className="metro-header">
        <div className="metro-header-brand">
          <BrandLogo size="sm" showName nameVariant="academy" />
        </div>
        <span className="metro-header-sub">AI learning platform</span>
      </header>

      <div className="metro-grid">

        {/* Sign in */}
        <Tile
          href="/login"
          className="metro-tile--login"
          detail="Уроки · Домашние задания · Вебинары · Прогресс обучения"
        >
          <div className="metro-icon">
            <Image
              src="/images/login-icon-2.png"
              alt="Login illustration"
              width={100}
              height={100}
              className="metro-login-image"
              sizes="(max-width: 680px) 160px, 260px"
              priority
            />
          </div>
          <div className="metro-text">
            <span className="metro-title">Войти</span>
            <span className="metro-sub">Личный кабинет студента</span>
          </div>
        </Tile>

        {/* Activate access with a license token */}
        <Tile
          href="/activate"
          className="metro-tile--buy"
          detail="14 дней · 3 трека · Вход по токену доступа"
        >
          <div className="metro-icon">
          <Image
              src="/images/login-icon-3.png"
              alt="Login illustration"
              width={100}
              height={100}
              className="metro-login-image"
              sizes="(max-width: 680px) 160px, 260px"
              priority
            />
          </div>
          <div className="metro-text">
            <span className="metro-title">Активировать доступ</span>
            <span className="metro-sub">Регистрация по токену интенсива</span>
          </div>
        </Tile>

        {/* Curator / admin console */}
        <Tile
          href="/admin/login"
          className="metro-tile--program"
          detail="Потоки · Программа · Проверка домашних заданий · Сертификаты"
        >
          <div className="metro-icon">
          <Image
              src="/images/login-icon-4.png"
              alt="Login illustration"
              width={100}
              height={100}
              className="metro-login-image"
              sizes="(max-width: 680px) 160px, 260px"
              priority
            />
          </div>
          <div className="metro-text">
            <span className="metro-title">Кабинет куратора</span>
            <span className="metro-sub">Управление интенсивом</span>
          </div>
        </Tile>

        {/* Community */}
        <Tile
          href="/community"
          className="metro-tile--community"
          detail="Закрытое пространство для тех, кто переосмысляет образование нового поколения"
        >
          <div className="metro-icon">
          <Image
              src="/images/login-icon-1.png"
              alt="Login illustration"
              width={100}
              height={100}
              className="metro-login-image"
              sizes="(max-width: 680px) 160px, 260px"
              priority
            />
          </div>
          <div className="metro-text">
            <span className="metro-title">Сообщество</span>
            <span className="metro-sub">Закрытое комьюнити единомышленников</span>
          </div>
        </Tile>

      </div>
    </div>
  );
}
