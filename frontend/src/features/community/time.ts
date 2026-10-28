const MS_MIN = 60_000;
const MS_HOUR = 3600000;

/** Instant when the topic became visible in the forum (not pending submission time). */
export function topicPublicSince(topic: {
  status: string;
  approvedAt: string | null;
  createdAt: string;
}): string {
  if (topic.status === "pending") return topic.createdAt;
  const a = topic.approvedAt?.trim();
  return a || topic.createdAt;
}

/** Russian plural form: picks the one / few / many word for n (e.g. 1, 2 or 5 hours). */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  const nAbs = Math.floor(Math.abs(n)) % 100;
  const n10 = nAbs % 10;
  if (nAbs >= 11 && nAbs <= 19) return many;
  if (n10 === 1) return one;
  if (n10 >= 2 && n10 <= 4) return few;
  return many;
}

function fmtHours(n: number): string {
  return `${n} ${ruPlural(n, "час", "часа", "часов")}`;
}

function fmtMinutes(n: number): string {
  return `${n} ${ruPlural(n, "минуту", "минуты", "минут")}`;
}

function fmtDays(n: number): string {
  return `${n} ${ruPlural(n, "день", "дня", "дней")}`;
}

/**
 * How long until a future instant (e.g. closesAt). Updates should be driven by a timer in the UI.
 */
export function formatUntilDeadline(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "время истекло";
  const totalMin = Math.floor(diffMs / MS_MIN);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) {
    if (m < 1) return "меньше минуты";
    return fmtMinutes(m);
  }
  if (m === 0) return fmtHours(h);
  return `${fmtHours(h)} ${fmtMinutes(m)}`;
}

/** Compact form for feed cards, e.g. "19 h 30 min" or "45 min" (rendered in Russian). */
export function formatUntilDeadlineShort(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "скоро";
  const totalMin = Math.floor(diffMs / MS_MIN);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) {
    if (m < 1) return "<1 мин";
    return `${m} мин`;
  }
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export function isDeadlineUrgent(iso: string, withinHours = 3): boolean {
  const diffMs = new Date(iso).getTime() - Date.now();
  return diffMs > 0 && diffMs < withinHours * MS_HOUR;
}

/** "N minutes / hours / days ago" (rendered in Russian) or a short calendar date for older items. */
export function formatAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < MS_MIN) return "только что";
  const totalMin = Math.floor(diffMs / MS_MIN);
  if (totalMin < 60) return `${fmtMinutes(totalMin)} назад`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalMin < 24 * 60) {
    if (m === 0) return `${fmtHours(h)} назад`;
    return `${fmtHours(h)} ${fmtMinutes(m)} назад`;
  }
  const d = Math.floor(totalMin / (60 * 24));
  if (d < 7) return `${fmtDays(d)} назад`;
  const dObj = new Date(iso);
  const now = new Date();
  const sameYear = dObj.getFullYear() === now.getFullYear();
  return dObj.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

/** Local date + time for a single timestamp (deadline explanation). */
export function formatDateTimeShort(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
