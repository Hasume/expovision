"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, me } from "@/features/api";
import { Button, ButtonLink, InlineAlert, Input, StandaloneShell } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

export default function LoginPage() {
  const router = useRouter();
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async (): Promise<void> => {
    if (!email.includes("@") || password.length < 8) return;
    setLoading(true);
    setStatus("");
    try {
      await login({ email, password });
      const user = await me();
      if (user.role === "admin") {
        router.push(`/admin?lang=${lang}`);
      } else {
        router.push(`/dashboard?lang=${lang}`);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StandaloneShell>
      <header className="flow-header text-center section-top">
        <h1 className="text-h1">
          {lang === "ru" ? "С возвращением" : "Welcome back"}
        </h1>
        <p className="muted text-body-sm">
          {lang === "ru" ? "Войдите в свой аккаунт" : "Sign in to your account"}
        </p>
      </header>

      <div className="stack">
        <div className="form-field">
          <label className="form-label" htmlFor="login-email">Email</label>
          <Input id="login-email" name="email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" autoComplete="email" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="login-password">
            {lang === "ru" ? "Пароль" : "Password"}
          </label>
          <Input id="login-password" name="password" value={password} onChange={setPassword} placeholder="••••••••" type="password" autoComplete="current-password" onKeyDown={(e) => {
            if (e.key === "Enter") void onLogin();
          }} />
        </div>

        <div className="row row-end">
          <ButtonLink href={`/forgot-password?lang=${lang}`} tone="ghost" className="small">{lang === "ru" ? "Забыли пароль?" : "Forgot password?"}</ButtonLink>
        </div>

        <Button onClick={() => void onLogin()} disabled={loading || !email.includes("@") || password.length < 8}>
          {loading ? "..." : (lang === "ru" ? "Войти" : "Sign in")}
        </Button>
      </div>

      {status ? <InlineAlert tone="error">{status}</InlineAlert> : null}

      <div className="promo-card section-top">
        <p className="promo-title">
          {lang === "ru" ? "Нет аккаунта?" : "No account yet?"}
        </p>
        <p className="promo-text">
          {lang === "ru"
            ? "Для доступа к платформе нужен лицензионный ключ. Ключи выдаёт куратор интенсива в панели администратора."
            : "Access requires a license key. Keys are issued by the intensive's curator in the admin console."}
        </p>
        <div className="section-top-sm">
          <ButtonLink href={`/activate?lang=${lang}`} tone="ghost" className="small">
            {lang === "ru" ? "Активировать ключ" : "Activate key"}
          </ButtonLink>
        </div>
      </div>
    </StandaloneShell>
  );
}
