"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/features/api";
import { Button, ButtonLink, InlineAlert, Input, StandaloneShell } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

export default function AdminLoginPage() {
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
      router.push("/admin");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StandaloneShell>
      <header className="flow-header text-center section-top">
        <span className="badge primary">ADMIN</span>
        <h1 className="text-h1">{lang === "ru" ? "Панель администратора" : "Admin Panel"}</h1>
        <p className="muted text-body-sm">{lang === "ru" ? "Войдите с учетной записью администратора" : "Sign in with your admin credentials"}</p>
      </header>

      <div className="stack">
        <div className="form-field">
          <label className="form-label" htmlFor="admin-login-email">Email</label>
          <Input id="admin-login-email" name="email" value={email} onChange={setEmail} placeholder="admin@example.com" type="email" autoComplete="email" />
        </div>
        <div className="form-field">
          <label className="form-label" htmlFor="admin-login-password">{lang === "ru" ? "Пароль" : "Password"}</label>
          <Input id="admin-login-password" name="password" value={password} onChange={setPassword} placeholder="••••••••" type="password" autoComplete="current-password" onKeyDown={(e) => {
            if (e.key === "Enter") void onLogin();
          }} />
        </div>
        <Button onClick={() => void onLogin()} disabled={loading || !email.includes("@") || password.length < 8}>
          {loading ? "..." : (lang === "ru" ? "Войти" : "Sign in")}
        </Button>
      </div>

      {status ? <InlineAlert tone="error">{status}</InlineAlert> : null}

      <div className="section-divider-top">
        <ButtonLink href={`/activate?lang=${lang}`} tone="ghost">{lang === "ru" ? "← Портал студента" : "← Student portal"}</ButtonLink>
      </div>
    </StandaloneShell>
  );
}
