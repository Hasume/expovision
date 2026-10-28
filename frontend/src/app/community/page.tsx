"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/shared/ui/brand-logo";
import { communityLogin, communitySignup, getCommunityAuthState } from "@/features/api";

/* ─── Login form ─────────────────────────────────────────────── */

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "info" } | null>(null);
  const inFlightRef = useRef(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || loading) return;
    if (!email || !password) {
      setMessage({ text: "Заполните все поля", type: "error" });
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      await communityLogin({ email, password });
      router.push("/community/dashboard");
    } catch (e: unknown) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <form className="comm-form" onSubmit={handleSubmit} noValidate>
      <div className="comm-form-header">
        <h1 className="comm-form-title">Войти в сообщество</h1>
        <p className="comm-form-sub">Рады видеть вас снова</p>
      </div>

      {message && (
        <div className={`comm-alert comm-alert--${message.type}`}>{message.text}</div>
      )}

      <div className="comm-fields">
        <div className="comm-field">
          <label className="comm-label" htmlFor="c-email">Email</label>
          <input
            id="c-email"
            className="comm-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="comm-field">
          <label className="comm-label" htmlFor="c-password">Пароль</label>
          <input
            id="c-password"
            className="comm-input"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
      </div>

      <div className="comm-forgot">
        <Link href="/forgot-password" className="comm-link-btn">Забыли пароль?</Link>
      </div>

      <button type="submit" className="comm-btn" disabled={loading}>
        {loading ? "Входим…" : "Войти"}
      </button>

      <p className="comm-switch">
        Нет аккаунта?{" "}
        <button type="button" className="comm-link-btn" onClick={onSwitch}>
          Зарегистрироваться
        </button>
      </p>
    </form>
  );
}

/* ─── Register form ──────────────────────────────────────────── */

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "error" | "info" } | null>(null);
  const inFlightRef = useRef(false);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || loading) return;
    if (!firstName || !email || !password || !confirm) {
      setMessage({ text: "Заполните все поля", type: "error" });
      return;
    }
    if (password !== confirm) {
      setMessage({ text: "Пароли не совпадают", type: "error" });
      return;
    }
    if (!agreed) {
      setMessage({ text: "Примите условия использования", type: "error" });
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    setMessage(null);
    try {
      await communitySignup({ firstName, ...(lastName ? { lastName } : {}), email, password });
      router.push("/community/dashboard");
    } catch (e: unknown) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <form className="comm-form" onSubmit={handleSubmit} noValidate>
      <div className="comm-form-header">
        <h1 className="comm-form-title">Присоединиться</h1>
      </div>

      {message && (
        <div className={`comm-alert comm-alert--${message.type}`}>{message.text}</div>
      )}

      <div className="comm-fields">
        <div className="comm-row-2">
          <div className="comm-field">
            <label className="comm-label" htmlFor="c-first">Имя</label>
            <input
              id="c-first"
              className="comm-input"
              type="text"
              placeholder="Адам"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              required
            />
          </div>
          <div className="comm-field">
            <label className="comm-label" htmlFor="c-last">Фамилия</label>
            <input
              id="c-last"
              className="comm-input"
              type="text"
              placeholder="Смит"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>
        <div className="comm-field">
          <label className="comm-label" htmlFor="c-reg-email">Email</label>
          <input
            id="c-reg-email"
            className="comm-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="comm-row-2">
          <div className="comm-field">
            <label className="comm-label" htmlFor="c-reg-pw">Пароль</label>
            <input
              id="c-reg-pw"
              className="comm-input"
              type="password"
              placeholder="Минимум 8 символов"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="comm-field">
            <label className="comm-label" htmlFor="c-reg-pw2">Подтвердите пароль</label>
            <input
              id="c-reg-pw2"
              className="comm-input"
              type="password"
              placeholder="Повторите пароль"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
        </div>
      </div>

      <label className="comm-check">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>Я принимаю условия и политику конфиденциальности</span>
      </label>

      <button type="submit" className="comm-btn" disabled={loading || !agreed}>
        {loading ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </button>

      <p className="comm-switch">
        Уже есть аккаунт?{" "}
        <button type="button" className="comm-link-btn" onClick={onSwitch}>
          Войти
        </button>
      </p>
    </form>
  );
}

/* ─── Page ────────────────────────────────────────────────────── */

type Mode = "login" | "register";

export default function CommunityPage() {
  const [mode, setMode] = useState<Mode>("login");
  const router = useRouter();

  useEffect(() => {
    const auth = getCommunityAuthState();
    if (auth?.accessToken) {
      router.replace("/community/dashboard");
    }
  }, [router]);

  return (
    <div className="comm-root">
      {/* ── Left: branding panel ── */}
      <div className="comm-left">
        <div className="comm-left-inner">
          <Link href="/" className="comm-back">← Главный экран</Link>

          <div className="comm-brand">
            <BrandLogo size="md" showName={false} />
            <div>
              <div className="comm-brand-name">Expovision AI Academy</div>
              <div className="comm-brand-sub">Community</div>
            </div>
          </div>

          <div className="comm-pitch">
            <h2 className="comm-pitch-title">
              Сообщество тех,<br />кто переосмысляет<br />образование
            </h2>
            <p className="comm-pitch-desc">
              Закрытое пространство для единомышленников — людей, которые думают о том, каким должно быть образование нового поколения.
            </p>
          </div>

          <ul className="comm-benefits">
            <li className="comm-benefit">
              <span className="comm-benefit-icon">→</span>
              <span>Диалог с людьми, которые меняют образование</span>
            </li>
            <li className="comm-benefit">
              <span className="comm-benefit-icon">→</span>
              <span>Идеи, эксперименты и живые дискуссии</span>
            </li>
            <li className="comm-benefit">
              <span className="comm-benefit-icon">→</span>
              <span>Среда, где думают о будущем — вместе</span>
            </li>
          </ul>
        </div>
      </div>

      {/* ── Right: auth panel ── */}
      <div className="comm-right">
        <div className="comm-right-inner">
          <div className="comm-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`comm-tab${mode === "login" ? " comm-tab--active" : ""}`}
              onClick={() => setMode("login")}
            >
              Вход
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`comm-tab${mode === "register" ? " comm-tab--active" : ""}`}
              onClick={() => setMode("register")}
            >
              Регистрация
            </button>
          </div>

          <div key={mode} className="comm-form-anim">
            {mode === "login"
              ? <LoginForm onSwitch={() => setMode("register")} />
              : <RegisterForm onSwitch={() => setMode("login")} />
            }
          </div>
        </div>
      </div>
    </div>
  );
}
