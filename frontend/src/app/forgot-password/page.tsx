"use client";

import { useState } from "react";
import { requestReset, resetPassword } from "@/features/api";
import { Button, ButtonLink, InlineAlert, Input, StandaloneShell } from "@/shared/ui/components";
import { getLang } from "@/features/i18n";

export default function ForgotPasswordPage() {
  const lang = typeof window !== "undefined" ? getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined) : "ru";
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const isErrorStatus = /fail|error|ошиб|не удалось|invalid|denied|forbidden|unauthorized/i.test(status);

  const onRequest = async (): Promise<void> => {
    setLoading(true);
    setStatus("");
    try {
      const r = await requestReset(email);
      if (r.resetToken) setResetToken(r.resetToken);
      setStep("reset");
      setStatus(lang === "ru" ? "Токен сброса отправлен" : "Reset token sent");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const onReset = async (): Promise<void> => {
    if (!resetToken || newPassword.length < 8) return;
    setLoading(true);
    setStatus("");
    try {
      await resetPassword(resetToken, newPassword);
      setStatus(lang === "ru" ? "Пароль обновлён. Теперь войдите." : "Password updated. Please sign in.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StandaloneShell>
      <header className="flow-header text-center section-top">
        <h1 className="text-h1">
          {lang === "ru" ? "Сброс пароля" : "Reset password"}
        </h1>
        <p className="muted text-body-sm">
          {step === "request"
            ? (lang === "ru" ? "Введите email для получения токена сброса" : "Enter your email to get a reset token")
            : (lang === "ru" ? "Введите токен и новый пароль" : "Enter token and new password")}
        </p>
      </header>

      {step === "request" ? (
        <div className="stack">
          <div className="form-field">
            <label className="form-label" htmlFor="forgot-email">Email</label>
            <Input id="forgot-email" name="email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" autoComplete="email" />
          </div>
          <Button onClick={() => void onRequest()} disabled={loading || !email.includes("@")}>
            {loading ? "..." : (lang === "ru" ? "Получить токен" : "Get reset token")}
          </Button>
        </div>
      ) : (
        <div className="stack">
          <div className="form-field">
            <label className="form-label" htmlFor="reset-token">
              {lang === "ru" ? "Токен сброса" : "Reset token"}
            </label>
            <Input id="reset-token" name="resetToken" value={resetToken} onChange={setResetToken} placeholder="token..." autoComplete="one-time-code" />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="reset-password">
              {lang === "ru" ? "Новый пароль" : "New password"}
            </label>
            <Input id="reset-password" name="newPassword" value={newPassword} onChange={setNewPassword} placeholder={lang === "ru" ? "Минимум 8 символов" : "At least 8 characters"} type="password" autoComplete="new-password" />
          </div>
          <Button onClick={() => void onReset()} disabled={loading || !resetToken || newPassword.length < 8}>
            {loading ? "..." : (lang === "ru" ? "Установить новый пароль" : "Set new password")}
          </Button>
        </div>
      )}

      {status ? <InlineAlert tone={isErrorStatus ? "error" : "success"}>{status}</InlineAlert> : null}

      <div className="section-divider-top">
        <ButtonLink href={`/login?lang=${lang}`} tone="ghost">{lang === "ru" ? "← Вернуться к входу" : "← Back to sign in"}</ButtonLink>
      </div>
    </StandaloneShell>
  );
}
