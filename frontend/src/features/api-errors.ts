/**
 * Pure error-message normalisation utilities used by the API client.
 * Extracted here so they can be unit-tested without mocking all of api.ts.
 */

export function isTechnicalErrorDetail(value: string): boolean {
  const n = value.toLowerCase();
  return (
    n.includes("traceback") ||
    n.includes("sqlalchemy") ||
    n.includes("psycopg") ||
    n.includes("stack") ||
    n.includes("exception") ||
    n.includes("update \"user\"") ||
    n.includes("failed to fetch")
  );
}

export function normalizeApiErrorMessage(
  status: number,
  body: string,
  lang: "ru" | "en" = "ru",
  retryAfter?: string | null,
): string {
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { detail?: string | Array<{ msg?: string; loc?: string[] }> };
    if (typeof parsed.detail === "string") {
      detail = parsed.detail;
    } else if (Array.isArray(parsed.detail)) {
      detail = parsed.detail
        .map((e) => {
          const field = e.loc?.filter((l) => l !== "body").join(".") ?? "";
          return field ? `${field}: ${e.msg}` : (e.msg ?? "");
        })
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    // plain text body
  }

  if (detail.includes("Intensive start is not configured")) {
    return lang === "ru"
      ? "Платформа еще не запущена администратором. Доступен только стартовый отчет."
      : "The platform has not been launched by admin yet. Only the initial report is available.";
  }
  if (detail.includes("Platform is locked until intensive start")) {
    return lang === "ru"
      ? "Платформа еще не открыта. Дождитесь старта интенсива."
      : "The platform is still locked. Please wait for intensive start.";
  }
  if (detail.includes("Complete the initial report")) {
    return lang === "ru"
      ? "Сначала нужно пройти стартовый отчет."
      : "You need to complete the initial report first.";
  }
  if (detail.includes("is not yet available") && detail.includes("day")) {
    return lang === "ru"
      ? "Этот день ещё не открылся. Продолжи с текущего дня."
      : "This day isn't open yet. Continue with your current day.";
  }
  if (detail.includes("Intensive is finished")) {
    return lang === "ru"
      ? "Интенсив завершен. Доступ к материалам закреплен за участником потока."
      : "The intensive has ended. Access to materials is preserved for the flow member.";
  }
  if (detail.includes("Session invalidated by a newer login")) {
    return lang === "ru"
      ? "Сессия завершена: выполнен вход с другого устройства. Доступна только одна активная сессия."
      : "Your session was ended because you logged in from another device. Only one active session is allowed.";
  }
  if (detail.includes("Session is missing in token")) {
    return lang === "ru"
      ? "Сессия устарела. Войдите в аккаунт снова."
      : "Session is outdated. Please sign in again.";
  }
  if (detail.toLowerCase().includes("invalid credentials")) {
    return lang === "ru" ? "Неверный email или пароль." : "Incorrect email or password.";
  }
  if (detail.toLowerCase().includes("not authenticated") || detail.toLowerCase().includes("unauthorized")) {
    return lang === "ru" ? "Сессия истекла. Войдите снова." : "Session expired. Please sign in again.";
  }
  if (detail.toLowerCase().includes("forbidden")) {
    return lang === "ru"
      ? "У вас нет доступа к этому действию."
      : "You don't have access to this action.";
  }
  if (status === 404) {
    return lang === "ru" ? "Запрошенные данные не найдены." : "Requested data was not found.";
  }
  if (status === 422) {
    return lang === "ru"
      ? "Проверьте введенные данные и повторите попытку."
      : "Please check your input and try again.";
  }
  if (status === 429) {
    const retryText = retryAfter
      ? lang === "ru"
        ? ` Повторите через ${retryAfter} с.`
        : ` Retry after ${retryAfter}s.`
      : "";
    return lang === "ru"
      ? `Слишком много запросов. Попробуйте чуть позже.${retryText}`
      : `Too many requests. Please try again shortly.${retryText}`;
  }
  if (status >= 500 || isTechnicalErrorDetail(detail)) {
    return lang === "ru"
      ? "Сервис временно недоступен. Мы уже работаем над этим."
      : "Service is temporarily unavailable. We're already working on it.";
  }

  return detail?.trim()
    ? detail
    : lang === "ru"
      ? "Не удалось выполнить запрос. Попробуйте еще раз."
      : "Couldn't complete the request. Please try again.";
}
