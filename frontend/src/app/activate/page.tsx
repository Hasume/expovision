"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { activateLicense, type LanguageCode } from "@/features/api";
import { Button, ButtonLink, InlineAlert, Input, StandaloneShell } from "@/shared/ui/components";
import { getLang, persistLang } from "@/features/i18n";

export default function ActivatePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lang, setLang] = useState<LanguageCode>("ru");
  const [step, setStep] = useState<"token" | "credentials">("token");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const resolved = getLang(new URLSearchParams(window.location.search).get("lang") ?? undefined);
    setLang(resolved);
    persistLang(resolved);
  }, []);

  const onActivate = async (): Promise<void> => {
    if (!firstName.trim() || !lastName.trim() || !email.includes("@") || password.length < 8) return;
    setLoading(true);
    setStatus("");
    try {
      await activateLicense({ firstName: firstName.trim(), lastName: lastName.trim(), email, token, password, language: lang });
      router.push(`/onboarding?lang=${lang}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <StandaloneShell>
      <header className="flow-header text-center section-top">
        <h1 className="text-h1">
          {lang === "ru" ? "Добро пожаловать" : "Welcome"}
        </h1>
        <p className="muted text-body-sm">
          {lang === "ru" ? "Введите лицензионный ключ для доступа к интенсиву" : "Enter your license key to access the intensive"}
        </p>
      </header>

      <div className="lang-selector">
        <button type="button" onClick={() => { setLang("ru"); persistLang("ru"); }} className={`lang-btn ${lang === "ru" ? "active" : ""}`}>RU</button>
        <button type="button" onClick={() => { setLang("en"); persistLang("en"); }} className={`lang-btn ${lang === "en" ? "active" : ""}`}>EN</button>
      </div>

      {step === "token" ? (
        <div className="stack">
          <div className="form-field">
            <label className="form-label" htmlFor="activate-token">
              {lang === "ru" ? "Лицензионный ключ" : "License key"}
            </label>
            <Input id="activate-token" name="token" value={token} onChange={setToken} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" />
          </div>
          <Button onClick={() => { if (token.trim()) setStep("credentials"); }} disabled={!token.trim()} className="full-width">
            {lang === "ru" ? "Перейти к данным аккаунта" : "Continue to account details"}
          </Button>
        </div>
      ) : (
        <div className="stack">
          <div className="form-field">
            <label className="form-label" htmlFor="activate-first-name">
              {lang === "ru" ? "Имя" : "First name"}
            </label>
            <Input id="activate-first-name" name="firstName" value={firstName} onChange={setFirstName} placeholder={lang === "ru" ? "Иван" : "John"} autoComplete="given-name" />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="activate-last-name">
              {lang === "ru" ? "Фамилия" : "Last name"}
            </label>
            <Input id="activate-last-name" name="lastName" value={lastName} onChange={setLastName} placeholder={lang === "ru" ? "Иванов" : "Doe"} autoComplete="family-name" />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="activate-email">Email</label>
            <Input id="activate-email" name="email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" autoComplete="email" />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="activate-password">
              {lang === "ru" ? "Пароль" : "Password"}
            </label>
            <Input id="activate-password" name="password" value={password} onChange={setPassword} placeholder={lang === "ru" ? "Минимум 8 символов" : "At least 8 characters"} type="password" autoComplete="new-password" />
          </div>
          <Button onClick={() => void onActivate()} disabled={loading || !firstName.trim() || !lastName.trim() || !email.includes("@") || password.length < 8}>
            {loading ? "..." : (lang === "ru" ? "Активировать и создать аккаунт" : "Activate and create account")}
          </Button>
          <Button onClick={() => setStep("token")} tone="ghost">
            {lang === "ru" ? "Назад" : "Back"}
          </Button>
        </div>
      )}

      {status ? <InlineAlert tone="error">{status}</InlineAlert> : null}

      <div className="promo-card section-top">
        <p className="promo-title">
          {lang === "ru" ? "Нет лицензионного ключа?" : "Don't have a license key?"}
        </p>
        <p className="promo-text">
          {lang === "ru"
            ? "Ключ для активации платформы выдаёт куратор интенсива в панели администратора (раздел «Токены»)."
            : "Activation keys are issued by the intensive's curator in the admin console (Tokens section)."}
        </p>
      </div>

      <div className="text-center section-top-sm">
        <ButtonLink href={`/login?lang=${lang}`} tone="ghost" className="small">
          {lang === "ru" ? "Уже есть аккаунт? Войти" : "Already have an account? Sign in"}
        </ButtonLink>
      </div>
    </StandaloneShell>
  );
}
