"use client";

import { getPreferredLang } from "@/features/i18n";
import { normalizeApiErrorMessage as _normalizeMsg, isTechnicalErrorDetail } from "@/features/api-errors";

export type LanguageCode = "ru" | "en";
export type TrackCode = "A" | "B" | "C";
export type UserRole = "student" | "admin";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type AuthState = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
};

function getAuthState(): AuthState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("authState");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthState;
  } catch {
    return null;
  }
}

function setAuthState(value: AuthState | null): void {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem("authState");
    return;
  }
  window.localStorage.setItem("authState", JSON.stringify(value));
}

export function clearAuthState(): void {
  setAuthState(null);
}

export function readAuthState(): AuthState | null {
  return getAuthState();
}

class ApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(body || `HTTP ${status}`);
    this.status = status;
  }
}

function getUiLang(): "ru" | "en" {
  return getPreferredLang();
}

function networkErrorMessage(lang: "ru" | "en"): string {
  return lang === "ru"
    ? "Не удалось подключиться к серверу. Проверьте интернет и попробуйте еще раз."
    : "Couldn't connect to the server. Check your internet connection and try again.";
}

function normalizeApiErrorMessage(status: number, body: string, retryAfter?: string | null): string {
  return _normalizeMsg(status, body, getUiLang(), retryAfter ?? undefined);
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const uiLang = getUiLang();
  const method = (init.method ?? "GET").toUpperCase();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Locale": uiLang,
        ...(init.headers ?? {})
      }
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error(networkErrorMessage(uiLang));
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug(`[api] ${method} ${path} → ${response.status}`);
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    const text = await response.text();
    throw new ApiError(response.status, normalizeApiErrorMessage(response.status, text, retryAfter));
  }
  return response.json() as Promise<T>;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getAuthState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (auth?.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }

  try {
    return await rawRequest<T>(path, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    const is401 = error instanceof ApiError && error.status === 401;
    if (!is401 || !auth?.refreshToken) {
      if (is401) {
        clearAuthState();
      }
      throw error;
    }
    try {
      const refreshed = await refreshSessionDeduped(auth.refreshToken);
      const latest = getAuthState();
      setAuthState({
        ...(latest ?? auth),
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken
      });
      return rawRequest<T>(path, {
        ...init,
        headers: {
          ...headers,
          Authorization: `Bearer ${refreshed.accessToken}`,
          ...(init.headers ?? {})
        }
      });
    } catch (refreshError) {
      clearAuthState();
      throw refreshError;
    }
  }
}

// Multipart upload — does NOT set Content-Type so browser adds the boundary automatically
async function uploadRequest<T>(path: string, body: FormData): Promise<T> {
  const auth = getAuthState();
  const uiLang = getUiLang();
  const baseHeaders: Record<string, string> = { "X-Locale": uiLang };

  const fetchOnce = (accessToken: string | undefined) =>
    fetch(`${API_BASE}${path}`, {
      method: "POST",
      body,
      headers: {
        ...baseHeaders,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    });

  let response: Response;
  try {
    response = await fetchOnce(auth?.accessToken);
  } catch {
    throw new Error(networkErrorMessage(uiLang));
  }

  if (response.status === 401 && auth?.refreshToken) {
    try {
      const refreshed = await refreshSessionDeduped(auth.refreshToken);
      const latest = getAuthState();
      setAuthState({
        ...(latest ?? auth),
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken
      });
      response = await fetchOnce(refreshed.accessToken);
    } catch (refreshError) {
      clearAuthState();
      throw refreshError;
    }
  }


  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, normalizeApiErrorMessage(response.status, text));
  }
  return response.json() as Promise<T>;
}

export async function signup(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  language: LanguageCode;
}): Promise<void> {
  const data = await rawRequest<{
    userId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
  }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input)
  });
  setAuthState(data);
}

export async function login(input: { email: string; password: string }): Promise<void> {
  const data = await rawRequest<{
    userId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
  setAuthState(data);
}

export async function activateLicense(input: {
  firstName: string;
  lastName: string;
  email: string;
  token: string;
  password: string;
  language: LanguageCode;
}): Promise<void> {
  const result = await rawRequest<{ success: true; userId: string }>("/auth/activate-license", {
    method: "POST",
    body: JSON.stringify(input)
  });
  if (!result.success) {
    throw new Error("Activation failed");
  }
  await login({ email: input.email, password: input.password });
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  return rawRequest("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

/** One in-flight refresh for all parallel 401s (avoids duplicate /auth/refresh and token rotation races). */
let refreshInFlight: Promise<{ accessToken: string; refreshToken: string }> | null = null;

async function refreshSessionDeduped(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  const rtFallback = refreshToken;
  refreshInFlight = (async () => {
    try {
      const state = getAuthState();
      const rt = state?.refreshToken ?? rtFallback;
      return await refresh(rt);
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function logout(): Promise<void> {
  const auth = getAuthState();
  if (auth?.refreshToken) {
    await rawRequest("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: auth.refreshToken })
    }).catch(() => undefined);
  }
  clearAuthState();
}

export async function requestReset(email: string): Promise<{ resetToken?: string }> {
  return rawRequest("/auth/password/request-reset", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await rawRequest("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({ token, newPassword })
  });
}

export async function submitOnboarding(payload: Record<string, unknown>): Promise<{
  profileLabel: string;
  recommendedTrack: TrackCode;
}> {
  return apiRequest("/onboarding", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export type DayCurriculumResult = {
  dayNumber: number;
  track: TrackCode | null;
  lessons: Array<{ id: string; title: string; kind: "mandatory" | "optional"; status: "locked" | "available" | "completed" }>;
  artifactTitle: string;
  trackRequired?: boolean;
  webinars?: Array<{
    id: string;
    title: string;
    startsAtIso: string | null;
    durationMinutes: number;
    joinUrl: string;
    summary: string;
    status: "locked" | "available";
  }>;
};

// ---------------------------------------------------------------------------
// Request-level cache + in-flight deduplication for hot read endpoints.
// Eliminates duplicate HTTP calls when AppShell and page components both
// request the same data within the same session tick.
// ---------------------------------------------------------------------------

type CachedEntry<T> = { data: T; expiresAt: number };

function makeCachedCall<T>(ttlMs: number) {
  let cache: CachedEntry<T> | null = null;
  let inflight: Promise<T> | null = null;

  const call = async (fetcher: () => Promise<T>): Promise<T> => {
    if (cache && Date.now() < cache.expiresAt) return cache.data;
    if (inflight) return inflight;
    inflight = fetcher().then((data) => {
      cache = { data, expiresAt: Date.now() + ttlMs };
      inflight = null;
      return data;
    }).catch((err) => {
      inflight = null;
      throw err;
    });
    return inflight;
  };

  const invalidate = () => {
    cache = null;
    inflight = null;
  };

  return { call, invalidate };
}

const _meCache = makeCachedCall<Awaited<ReturnType<typeof _meRaw>>>(60_000);
const _dashboardCache = makeCachedCall<Awaited<ReturnType<typeof _dashboardRaw>>>(30_000);
const _finalStatusCache = makeCachedCall<Awaited<ReturnType<typeof _finalStatusRaw>>>(60_000);

export type StudentBootstrapResponse = {
  user: Awaited<ReturnType<typeof _meRaw>>;
  dashboard: Awaited<ReturnType<typeof _dashboardRaw>> | null;
  finalStatus: Awaited<ReturnType<typeof _finalStatusRaw>> | null;
  // insights removed from bootstrap to avoid blocking on Gemini API call
  roadmap: DayCurriculumResult[] | null;
  homeworkMine: Array<{
    submissionId: string;
    dayNumber: number;
    status: "pending_review" | "approved" | "rejected" | "overdue";
    dueAt: string;
    reviewComment: string | null;
    reviewedAt: string | null;
    aiIntegrityRiskScore?: number | null;
  }> | null;
};

const _studentBootstrapCache = makeCachedCall<StudentBootstrapResponse>(30_000);

async function _studentBootstrapRaw(): Promise<StudentBootstrapResponse> {
  return apiRequest("/dashboard/student-bootstrap");
}

export async function getStudentBootstrap(): Promise<StudentBootstrapResponse> {
  return _studentBootstrapCache.call(_studentBootstrapRaw);
}

export function invalidateMeCache(): void {
  _meCache.invalidate();
  _studentBootstrapCache.invalidate();
}

export function invalidateDashboardCache(): void {
  _dashboardCache.invalidate();
  _studentBootstrapCache.invalidate();
}

async function _meRaw(): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  startedAt: string | null;
  timezone: string;
  selectedTrack: TrackCode | null;
  language: LanguageCode;
  role: UserRole;
  onboardingDone: boolean;
  onboardingProfile: string | null;
  recommendedTrack: TrackCode | null;
  reportCompleted: boolean;
  avatarUrl: string | null;
  createdAt: string | null;
}> {
  return apiRequest("/auth/me");
}

export async function me(): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  startedAt: string | null;
  timezone: string;
  selectedTrack: TrackCode | null;
  language: LanguageCode;
  role: UserRole;
  onboardingDone: boolean;
  onboardingProfile: string | null;
  recommendedTrack: TrackCode | null;
  reportCompleted: boolean;
  avatarUrl: string | null;
  createdAt: string | null;
}> {
  return _meCache.call(_meRaw);
}

export async function updateProfile(data: {
  firstName: string; lastName: string; language: string; timezone: string;
}): Promise<{ success: boolean }> {
  return apiRequest("/auth/profile", { method: "PUT", body: JSON.stringify(data) });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
  return apiRequest("/auth/password/change", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
}

export async function uploadAvatar(file: File): Promise<{ success: boolean; avatarUrl: string }> {
  const auth = getAuthState();
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  const res = await fetch(`${API_BASE}/auth/avatar`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function deleteAvatar(): Promise<{ success: boolean }> {
  return apiRequest("/auth/avatar", { method: "DELETE" });
}

export async function completeInitialReport(): Promise<{ success: true; mapUnlocked: boolean }> {
  return apiRequest("/report/complete-initial", { method: "POST" });
}

async function _dashboardRaw(): Promise<{
  currentDay: number;
  progressPercent: number;
  todayFocus: string;
  message: string;
  splitAvailable: boolean;
  reportCompleted: boolean;
  mapUnlocked: boolean;
  intensiveConfigured: boolean;
  platformOpen: boolean;
  intensiveEnded: boolean;
  intensiveStartAtIso: string | null;
  intensiveEndAtIso: string | null;
  secondsToStart: number | null;
  secondsToEnd: number | null;
  flowId: string | null;
  flowCode: string | null;
  flowTitle: string | null;
  flowSource: "flow" | "legacy" | null;
  weekOneWebinars: Array<{
    id: string;
    title: string;
    summary: string;
    day: number;
    joinUrl: string;
    kinescopeVideoId: string | null;
    thumbnailUrl: string;
    startsAtIso: string | null;
    durationMinutes: number;
    unlocked: boolean;
    programOrder: number | null;
    webinarStatus?: "active" | "completed" | null;
  }>;
  trackSelected: TrackCode | null;
  masteryAvgScore: number;
  weakCompetencies: Array<{ code: string; title: string; score: number }>;
  nextBestAction: string;
  actionStats: {
    lessonsCompleted: number;
    homeworkSubmitted: number;
    fluencyGenerated: number;
    reflectionAdded: number;
    actionCount: number;
    minutesSpent: number;
  };
}> {
  return apiRequest("/dashboard");
}

export async function getDashboard(): Promise<Awaited<ReturnType<typeof _dashboardRaw>>> {
  try {
    const boot = await getStudentBootstrap();
    if (boot.dashboard) {
      return boot.dashboard;
    }
  } catch {
    // fall through to direct /dashboard
  }
  return _dashboardCache.call(_dashboardRaw);
}


export async function askDashboardAssistant(question: string): Promise<{
  answer: string;
  nextActions: string[];
  source: "ai" | "fallback";
}> {
  return apiRequest("/dashboard/assistant", {
    method: "POST",
    body: JSON.stringify({ question })
  });
}

export async function selectTrack(track: TrackCode): Promise<void> {
  await apiRequest("/track/select", {
    method: "POST",
    body: JSON.stringify({ track })
  });
}

export async function getLesson(lessonId: string): Promise<{
  id: string;
  dayNumber: number | null;
  title: string;
  videoUrl: string;
  kinescopeEmbedUrl: string | null;
  kinescopeChatUrl: string | null;
  content: string;
  kind: "mandatory" | "optional";
  /** Kinescope VOD duration in minutes when the lesson uses Kinescope as the primary player (no direct videoUrl). */
  durationMinutes?: number | null;
  lessonCompleted: boolean;
  dayLessons: Array<{
    id: string;
    title: string;
    kind: "mandatory" | "optional";
    completed: boolean;
    isCurrent: boolean;
    locked: boolean;
  }>;
  images: Array<{ url: string; caption: string | null }>;
  homework: { templateId: string; instruction: string; sample: string; minLength: number } | null;
  artifacts: Array<{ title: string; resourceUrl: string }>;
}> {
  return apiRequest(`/curriculum/lesson/${lessonId}`);
}

export async function getLessonAiFluency(lessonId: string): Promise<{
  lessonId: string;
  framework: "4D";
  delegation: string[];
  description: string[];
  discernment: string[];
  diligence: string[];
  practiceTask: string;
}> {
  return apiRequest(`/curriculum/lesson/${lessonId}/ai-fluency`);
}

export async function getLessonAiFluencyState(lessonId: string): Promise<{
  exists: boolean;
  payload?: {
    lessonId: string;
    framework: "4D";
    delegation: string[];
    description: string[];
    discernment: string[];
    diligence: string[];
    practiceTask: string;
  };
}> {
  return apiRequest(`/curriculum/lesson/${lessonId}/ai-fluency/state`);
}

export async function getDayCurriculum(dayNumber: number): Promise<DayCurriculumResult> {
  return apiRequest(`/curriculum/day/${dayNumber}`);
}

export async function getCurriculumRoadmap(): Promise<DayCurriculumResult[]> {
  try {
    const boot = await getStudentBootstrap();
    if (boot.roadmap != null) {
      return boot.roadmap;
    }
  } catch {
    // fall through
  }
  return apiRequest("/curriculum/roadmap");
}

export async function getLibraryLessons(): Promise<{
  canAccess: boolean;
  intensiveEnded: boolean;
  totalLessons: number;
  publicationMessage: string;
  courses: Array<{
    id: string;
    title: string;
    description: string;
    coverUrl: string;
    lessons: Array<{
      id: string;
      dayNumber: number | null;
      track: TrackCode | null;
      kind: "mandatory" | "optional";
      title: string;
      completed: boolean;
      access: "open" | "preview";
      videoProtected: boolean;
      kinescopeEmbedUrl: string | null;
      kinescopeChatUrl: string | null;
    }>;
  }>;
}> {
  return apiRequest("/curriculum/library");
}

export async function completeLesson(lessonId: string): Promise<void> {
  await apiRequest("/curriculum/lesson/complete", {
    method: "POST",
    body: JSON.stringify({ lessonId })
  });
}

export async function getHomeworkTemplate(dayNumber: number): Promise<{
  dayNumber: number;
  instructionMd: string;
  sampleMd: string;
  minLength: number;
  dueAtIso?: string;
}> {
  return apiRequest(`/homework/template/${dayNumber}`);
}

export async function submitHomework(dayNumber: number, answerText: string): Promise<{
  success: true;
  dueAt: string;
  status: "pending_review" | "overdue";
}> {
  return apiRequest("/homework/submit", {
    method: "POST",
    body: JSON.stringify({ dayNumber, answerText })
  });
}

export async function uploadHomeworkAttachments(files: File[]): Promise<
  Array<{ url: string; fileName: string; fileSize: number; mimeType: string }>
> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  return uploadRequest("/homework/attachments/upload", form);
}

export async function submitHomeworkWithEvidence(payload: {
  dayNumber: number;
  answerText: string;
  reflectionText?: string;
  aiUsageDisclosure?: string;
  attachmentUrls?: string[];
}): Promise<{
  success: true;
  dueAt: string;
  status: "pending_review" | "overdue";
}> {
  return apiRequest("/homework/submit", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function homeworkEvidenceCheck(payload: {
  dayNumber: number;
  answerText: string;
  reflectionText?: string;
  aiUsageDisclosure?: string;
}): Promise<{
  riskScore: number;
  flags: string[];
  followUpQuestions: string[];
  assessment: string;
}> {
  return apiRequest("/homework/evidence-check", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getHomeworkDraft(dayNumber: number): Promise<{
  exists: boolean;
  answerText?: string;
  reflectionText?: string;
  aiUsageDisclosure?: string;
  coach?: {
    summary: string;
    score: number;
    strengths: string[];
    improvements: string[];
    nextSteps: string[];
    reflectionQuestions: string[];
  } | null;
  evidence?: {
    riskScore: number;
    flags: string[];
    followUpQuestions: string[];
    assessment: string;
  } | null;
  updatedAt?: string | null;
}> {
  return apiRequest(`/homework/draft/${dayNumber}`);
}

export async function saveHomeworkDraft(payload: {
  dayNumber: number;
  answerText: string;
  reflectionText?: string;
  aiUsageDisclosure?: string;
  coach?: {
    summary: string;
    score: number;
    strengths: string[];
    improvements: string[];
    nextSteps: string[];
    reflectionQuestions: string[];
  } | null;
  evidence?: {
    riskScore: number;
    flags: string[];
    followUpQuestions: string[];
    assessment: string;
  } | null;
}): Promise<{ success: true; updatedAt: string }> {
  return apiRequest("/homework/draft", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getHomeworkAiCoach(dayNumber: number, answerText: string): Promise<{
  summary: string;
  score: number;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
  reflectionQuestions: string[];
}> {
  return apiRequest("/homework/ai-coach", {
    method: "POST",
    body: JSON.stringify({ dayNumber, answerText })
  });
}

export async function myHomeworkSubmissions(): Promise<Array<{
  submissionId: string;
  dayNumber: number;
  status: "pending_review" | "approved" | "rejected" | "overdue";
  dueAt: string;
  reviewComment: string | null;
  reviewedAt: string | null;
  aiIntegrityRiskScore?: number | null;
}>> {
  try {
    const boot = await getStudentBootstrap();
    if (boot.homeworkMine != null) {
      return boot.homeworkMine;
    }
  } catch {
    // fall through
  }
  return apiRequest("/homework/mine");
}

async function _finalStatusRaw(): Promise<{
  unlocked: boolean;
  intensiveEnded: boolean;
  allHomeworkApproved: boolean;
  certificatePdfUrl: string | null;
  cardConfirmed: boolean;
  certificateRequestedAt: string | null;
  workEmail: string | null;
  certificateRejectedAt: string | null;
  certificateRejectionComment: string | null;
}> {
  return apiRequest("/final/status");
}

export async function getFinalStatus(): Promise<Awaited<ReturnType<typeof _finalStatusRaw>>> {
  try {
    const boot = await getStudentBootstrap();
    if (boot.finalStatus) {
      return boot.finalStatus;
    }
  } catch {
    // fall through
  }
  return _finalStatusCache.call(_finalStatusRaw);
}

export function invalidateFinalStatusCache(): void {
  _finalStatusCache.invalidate();
  _studentBootstrapCache.invalidate();
}

export async function requestCertificate(workEmail: string): Promise<Awaited<ReturnType<typeof _finalStatusRaw>>> {
  const r = await apiRequest<Awaited<ReturnType<typeof _finalStatusRaw>>>("/final/request-certificate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workEmail }),
  });
  invalidateFinalStatusCache();
  return r;
}

export async function getFinal(): Promise<{
  achievements: string[];
  outcomeType: "roadmap" | "ai_toolkit" | "mvp_case";
  nextSteps: string[];
  certificatePdfUrl: string | null;
  cardConfirmed: boolean;
  studentName: string;
}> {
  return apiRequest("/final");
}

export async function downloadCertificate(): Promise<Blob> {
  const auth = readAuthState();
  const headers: Record<string, string> = {};
  if (auth?.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  const uiLang = getUiLang();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/final/certificate/download`, {
      headers: { ...headers, "X-Locale": uiLang },
    });
  } catch {
    throw new Error(networkErrorMessage(uiLang));
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(normalizeApiErrorMessage(response.status, text));
  }
  return response.blob();
}

export async function adminUploadCertificate(userId: string, file: File): Promise<{ success: true; certificatePdfUrl: string }> {
  const auth = readAuthState();
  const formData = new FormData();
  formData.append("file", file);
  const headers: Record<string, string> = {};
  if (auth?.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  const uiLang = getUiLang();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/final/admin/upload-certificate/${userId}`, {
      method: "POST",
      headers: { ...headers, "X-Locale": uiLang },
      body: formData,
    });
  } catch {
    throw new Error(networkErrorMessage(uiLang));
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(normalizeApiErrorMessage(response.status, text));
  }
  return response.json();
}

export async function adminConfirmCard(userId: string, confirmed: boolean): Promise<{ success: true; cardConfirmed: boolean }> {
  return apiRequest("/final/admin/confirm-card", {
    method: "POST",
    body: JSON.stringify({ userId, confirmed }),
  });
}

export async function adminRejectCertificateRequest(
  userId: string,
  comment: string,
): Promise<{ success: true }> {
  return apiRequest(`/final/admin/reject-certificate/${encodeURIComponent(userId)}`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}

export async function adminUnlockFinal(userId: string): Promise<{ success: true; finalUnlocked: boolean }> {
  return apiRequest(`/final/admin/unlock/${userId}`, { method: "POST" });
}

export async function adminCertificateStatus(userId: string): Promise<{
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  hasCertificatePdf: boolean;
  cardConfirmed: boolean;
  finalUnlocked: boolean;
  allHomeworkApproved: boolean;
  intensiveEnded: boolean;
  unlockedAt: string | null;
}> {
  return apiRequest(`/final/admin/certificate-status/${userId}`);
}

export async function adminSetStart(startAtIso: string): Promise<{
  success: boolean;
  startAtIso: string;
  endsAtIso: string;
  flowsUpdated: number;
}> {
  return apiRequest("/admin/intensive/start", {
    method: "POST",
    body: JSON.stringify({ startAtIso })
  });
}

export async function adminGenerateTokens(count: number, intensiveStartAt: string, flowId?: string): Promise<{
  success: true;
  tokens: Array<{ token: string; intensiveStartAt: string; issuedAt: string; usedByUserId: string | null; flowId: string | null; flowCode: string | null }>;
}> {
  return apiRequest("/admin/license-tokens/generate", {
    method: "POST",
    body: JSON.stringify({ count, intensiveStartAt, ...(flowId ? { flowId } : {}) })
  });
}

export type AdminToken = {
  token: string;
  intensiveStartAt: string | null;
  issuedAt: string | null;
  usedAt: string | null;
  usedByUserId: string | null;
  usedByEmail: string | null;
  usedByName: string | null;
  flowId: string | null;
  flowCode: string | null;
  status: string;
};

export async function adminListTokens(): Promise<AdminToken[]> {
  return apiRequest("/admin/license-tokens");
}

export async function adminReport(): Promise<{
  totalUsers: number;
  reportCompletedUsers: number;
  trackDistribution: { A: number; B: number; C: number };
  totalTokens: number;
  usedTokens: number;
  pendingHomeworkReviews: number;
  overdueHomework: number;
  intensiveStartAt: string;
}> {
  return apiRequest("/admin/report");
}

export async function adminFlows(): Promise<Array<{
  id: string;
  code: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  isActive: boolean;
  language: LanguageCode;
  membersCount: number;
  daysCount: number;
  createdAt: string;
  updatedAt: string;
}>> {
  return apiRequest("/admin/flows");
}

export async function adminUpsertFlow(payload: {
  flowId?: string;
  code: string;
  title: string;
  description?: string;
  language: LanguageCode;
  startsAtIso: string;
  endsAtIso: string;
  timezone?: string;
  isActive?: boolean;
  tokenCount?: number;
}): Promise<{ success: true; flowId: string; tokensGenerated: number; tokens: string[] }> {
  return apiRequest("/admin/flows/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminDuplicateFlow(flowId: string, payload: {
  code: string;
  title: string;
  startsAtIso: string;
  endsAtIso: string;
  tokenCount?: number;
}): Promise<{ success: true; flowId: string; daysCount: number; tokensGenerated: number; tokens: string[] }> {
  return apiRequest(`/admin/flows/${flowId}/duplicate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminFlowMembers(flowId: string, signal?: AbortSignal): Promise<Array<{
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  roleInFlow: string;
  assignedAt: string;
}>> {
  return apiRequest(`/admin/flows/${flowId}/members`, signal ? { signal } : {});
}

export async function adminAssignUserToFlow(flowId: string, payload: { userId?: string; email?: string }): Promise<{
  success: true;
  flowId: string;
  userId: string;
  email: string;
}> {
  return apiRequest(`/admin/flows/${flowId}/members/assign`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminFlowDays(flowId: string, signal?: AbortSignal): Promise<Array<{
  curriculumDayId: string;
  unlockOffsetMinutes: number;
  dayNumber: number;
  track: TrackCode | null;
  phase: string;
  focusRu: string;
  focusEn: string;
}>> {
  return apiRequest(`/admin/flows/${flowId}/days`, signal ? { signal } : {});
}

export async function adminSetFlowDays(flowId: string, dayIds: string[]): Promise<{ success: true; flowId: string; daysAssigned: number }> {
  return apiRequest(`/admin/flows/${flowId}/days/set`, {
    method: "POST",
    body: JSON.stringify({ dayIds }),
  });
}

export type AdminFlowWebinarRow = {
  id: string;
  titleRu: string;
  titleEn: string;
  summaryRu: string;
  summaryEn: string;
  startsAtIso: string | null;
  durationMinutes: number;
  joinUrl: string;
  dayNumber: number;
  track: TrackCode | null;
  programOrder: number | null;
  kinescopeVideoId: string | null;
  kinescopeEventId: string | null;
  webinarStatus: "active" | "completed" | null;
  thumbnailUrl: string;
  isFlowLevel: boolean;
};

export async function adminFlowWebinars(flowId: string, signal?: AbortSignal): Promise<AdminFlowWebinarRow[]> {
  return apiRequest(`/admin/flows/${flowId}/webinars`, signal ? { signal } : {});
}

export async function adminSetFlowWebinarOrders(
  flowId: string,
  orders: Array<{ webinarId: string; programOrder: number }>,
): Promise<{ success: true; flowId: string; ordersSaved: number }> {
  return apiRequest(`/admin/flows/${flowId}/webinars/orders`, {
    method: "POST",
    body: JSON.stringify({ orders }),
  });
}

export async function adminCreateFlowWebinar(
  flowId: string,
  payload: {
    kinescopeVideoId?: string;
    titleRu?: string;
    titleEn?: string;
    summaryRu?: string;
    summaryEn?: string;
    startsAtIso?: string;
    durationMinutes?: number;
    joinUrl?: string;
    thumbnailUrl?: string;
  },
): Promise<{ success: true; webinarId: string; kinescopeEventId?: string | null; rtmpUrl?: string | null; streamKey?: string | null }> {
  return apiRequest(`/admin/flows/${flowId}/webinars`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminDeleteFlowWebinar(
  flowId: string,
  webinarId: string,
): Promise<{ success: true }> {
  return apiRequest(`/admin/flows/${flowId}/webinars/${webinarId}`, { method: "DELETE" });
}

export type AdminGlobalWebinar = {
  id: string;
  titleRu: string;
  titleEn: string;
  kinescopeVideoId: string | null;
  kinescopeEventId: string | null;
  thumbnailUrl: string;
  startsAtIso: string | null;
  durationMinutes: number;
  webinarStatus: "active" | "completed" | null;
  flowCount: number;
};

export async function adminListAllWebinars(): Promise<AdminGlobalWebinar[]> {
  return apiRequest("/admin/webinars");
}

export async function adminLinkFlowWebinar(flowId: string, webinarId: string): Promise<{ success: true; webinarId: string }> {
  return apiRequest(`/admin/flows/${flowId}/webinars/link`, {
    method: "POST",
    body: JSON.stringify({ webinarId }),
  });
}

export async function adminStartWebinar(webinarId: string): Promise<{ success: true; webinarStatus: string }> {
  return apiRequest(`/admin/webinars/${webinarId}/start`, { method: "POST" });
}

export async function adminFinishWebinar(
  webinarId: string,
): Promise<{ success: true; webinarStatus: string; kinescopeVideoId?: string | null }> {
  return apiRequest(`/admin/webinars/${webinarId}/finish`, { method: "POST" });
}

export type AdminStreamInfo = {
  rtmpUrl: string;
  streamKey: string | null;
  eventStatus: string | null;
  noEventId: boolean;
  kinescopeEventId?: string;
  kinescopeVideoId?: string;
  alreadyExisted?: boolean;
};

export async function adminWebinarStreamInfo(webinarId: string): Promise<AdminStreamInfo> {
  return apiRequest(`/admin/webinars/${webinarId}/stream-info`);
}

export async function adminCreateWebinarEvent(webinarId: string): Promise<AdminStreamInfo> {
  return apiRequest(`/admin/webinars/${webinarId}/create-event`, { method: "POST" });
}

export async function adminSetWebinarEventId(webinarId: string, kinescopeEventId: string): Promise<AdminStreamInfo> {
  return apiRequest(`/admin/webinars/${webinarId}/event-id`, {
    method: "PATCH",
    body: JSON.stringify({ kinescopeEventId }),
  });
}

export type WebinarPageData = {
  id: string;
  titleRu: string;
  titleEn: string;
  title: string;
  summaryRu: string;
  summaryEn: string;
  summary: string;
  kinescopeEmbedUrl: string | null;
  kinescopeChatUrl: string | null;
  kinescopeVideoId: string | null;
  joinUrl: string;
  thumbnailUrl: string;
  startsAtIso: string | null;
  durationMinutes: number;
  flowId: string | null;
  webinarStatus?: "active" | "completed" | null;
  /** True when replay is not ready: only live event id known, not VOD (avoid broken Kinescope embed). */
  recordingPending?: boolean;
};

export async function getWebinar(webinarId: string): Promise<WebinarPageData> {
  return apiRequest(`/webinar/${webinarId}`);
}

export type FlowWebinarArchiveItem = {
  id: string;
  titleRu: string;
  titleEn: string;
  summaryRu: string;
  summaryEn: string;
  joinUrl: string;
  kinescopeVideoId: string | null;
  thumbnailUrl: string;
  startsAtIso: string | null;
  durationMinutes: number;
  webinarStatus: "active" | "completed" | null;
  dayNumber: number;
  programOrder: number | null;
};

export async function getFlowWebinarsArchive(): Promise<{
  flowId: string | null;
  webinars: FlowWebinarArchiveItem[];
}> {
  return apiRequest("/webinar/flow");
}

export async function adminAuditLogs(): Promise<Array<{ id: string; action: string; endpoint: string; method: string; payloadJson: string; createdAt: string }>> {
  return apiRequest("/admin/audit-logs");
}

export async function adminUsers(): Promise<Array<{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  language: LanguageCode;
  selectedTrack: TrackCode | null;
  reportCompleted: boolean;
  onboardingDone: boolean;
  onboardingProfile: string | null;
  recommendedTrack: TrackCode | null;
  startedAt: string | null;
  createdAt: string;
  completedLessons: number;
  totalLessons: number;
  completedHomework: number;
  overdueHomework: number;
  pendingHomework: number;
  stage: "registered" | "onboarding" | "track_pending" | "learning";
}>> {
  return apiRequest("/admin/users");
}

export type AdminStudentProfile = {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    language: LanguageCode;
    selectedTrack: TrackCode | null;
    reportCompleted: boolean;
    onboardingDone: boolean;
    onboardingProfile: string | null;
    recommendedTrack: TrackCode | null;
    startedAt: string | null;
    createdAt: string;
  };
  stats: {
    totalLessons: number;
    completedLessons: number;
    totalHomework: number;
    approvedHomework: number;
    pendingHomework: number;
    rejectedHomework: number;
    overdueHomework: number;
    progressPercent: number;
  };
  days: Array<{
    dayNumber: number;
    track: TrackCode | null;
    lessons: Array<{ lessonId: string; title: string; kind: "mandatory" | "optional"; completed: boolean }>;
    homework: {
      status: "pending_review" | "approved" | "rejected" | "overdue";
      reviewComment: string | null;
      reviewedAt: string | null;
      submittedAt: string | null;
      dueAt: string | null;
      aiIntegrityRiskScore: number | null;
    } | null;
  }>;
  certificate: {
    hasCertificatePdf: boolean;
    cardConfirmed: boolean;
    finalUnlocked: boolean;
    unlockedAt: string | null;
    certificateRequestedAt: string | null;
    certificateRejectedAt: string | null;
    certificateRejectionComment: string | null;
  };
};

export async function adminStudentProfile(userId: string): Promise<AdminStudentProfile> {
  return apiRequest(`/admin/users/${userId}/profile`);
}

export type AdminCertificateRequestRow = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  certificateRequestedAt: string | null;
  hasCertificatePdf: boolean;
  cardConfirmed: boolean;
  finalUnlocked: boolean;
};

export async function adminCertificateRequests(): Promise<AdminCertificateRequestRow[]> {
  return apiRequest("/admin/certificate-requests");
}

export async function adminSetUserRole(userId: string, role: UserRole): Promise<void> {
  await apiRequest("/admin/users/role", {
    method: "POST",
    body: JSON.stringify({ userId, role })
  });
}

export async function adminResetUserPassword(userId: string): Promise<{ success: true; newPassword: string }> {
  return apiRequest(`/admin/users/${encodeURIComponent(userId)}/reset-password`, { method: "POST" });
}

export async function adminContentDays(): Promise<Array<{
  id: string;
  dayNumber: number;
  track: TrackCode | null;
  phase: string;
  focusRu: string;
  focusEn: string;
  lessonsCount: number;
  webinarsCount: number;
  artifactsCount: number;
  homeworkCount: number;
}>> {
  return apiRequest("/admin/content/days");
}

export async function adminContentDay(dayId: string): Promise<{
  id: string;
  dayNumber: number;
  track: TrackCode | null;
  phase: string;
  focusRu: string;
  focusEn: string;
  lessons: Array<{ id: string; kind: "mandatory" | "optional"; titleRu: string; titleEn: string; contentRu: string; contentEn: string; videoUrl: string; kinescopeVideoId: string | null; sortOrder: number }>;
  webinars: Array<{ id: string; titleRu: string; titleEn: string; summaryRu: string; summaryEn: string; startsAtIso: string; durationMinutes: number; joinUrl: string }>;
  artifacts: Array<{ id: string; titleRu: string; titleEn: string; resourceUrl: string }>;
  homeworkTemplates: Array<{ id: string; instructionRu: string; instructionEn: string; sampleRu: string; sampleEn: string; minLength: number; lessonId: string | null }>;
}> {
  return apiRequest(`/admin/content/day/${dayId}`);
}

export async function adminUpsertLesson(payload: {
  lessonId?: string;
  curriculumDayId: string;
  kind: "mandatory" | "optional";
  titleRu: string;
  titleEn: string;
  contentRu: string;
  contentEn: string;
  videoUrl: string;
  kinescopeVideoId?: string | null;
  sortOrder: number;
}): Promise<{ success: true; lessonId: string }> {
  return apiRequest("/admin/content/lesson", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function adminUpsertWebinar(payload: {
  webinarId?: string;
  curriculumDayId: string;
  titleRu: string;
  titleEn: string;
  summaryRu?: string;
  summaryEn?: string;
  startsAtIso: string;
  durationMinutes: number;
  joinUrl: string;
}): Promise<{ success: true; webinarId: string }> {
  return apiRequest("/admin/content/webinar", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function adminUpsertArtifact(payload: {
  artifactId?: string;
  curriculumDayId: string;
  titleRu: string;
  titleEn: string;
  resourceUrl: string;
}): Promise<{ success: true; artifactId: string }> {
  return apiRequest("/admin/content/artifact", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function adminUpsertHomeworkTemplate(payload: {
  templateId?: string;
  curriculumDayId: string;
  instructionRu: string;
  instructionEn: string;
  sampleRu: string;
  sampleEn: string;
  minLength: number;
  lessonId?: string | null;
}): Promise<{ success: true; templateId: string }> {
  return apiRequest("/admin/content/homework-template", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function curatorPending(): Promise<Array<{
  submissionId: string;
  userId: string;
  dayNumber: number;
  answerText: string;
  reflectionText?: string | null;
  aiUsageDisclosure?: string | null;
  aiIntegrityRiskScore?: number | null;
  dueAt: string | null;
  submissionStatus: "pending_review" | "overdue";
  attachments: Array<{ url: string; fileName: string; fileSize: number; mimeType: string }>;
  instructionRu: string;
  instructionEn: string;
  sampleRu: string;
  sampleEn: string;
  minLength: number;
  studentLanguage: "ru" | "en";
}>> {
  return apiRequest("/homework/curator/pending");
}

type CuratorAllSubmissionRow = {
  submissionId: string;
  userId: string;
  dayNumber: number;
  answerText: string;
  reflectionText?: string | null;
  aiUsageDisclosure?: string | null;
  aiIntegrityRiskScore?: number | null;
  dueAt?: string | null;
  createdAt?: string | null;
  submissionStatus: "pending_review" | "overdue" | "approved" | "rejected";
  reviewComment?: string | null;
  reviewedAt?: string | null;
  reviewerName?: string | null;
  attachments: Array<{ url: string; fileName: string; fileSize: number; mimeType: string }>;
  instructionRu: string;
  instructionEn: string;
  sampleRu: string;
  sampleEn: string;
  minLength: number;
  studentLanguage: "ru" | "en";
};

/** Backend returns paginated JSON `{ items, total, page, pageSize }`, not a bare array. */
export async function curatorAllSubmissions(): Promise<CuratorAllSubmissionRow[]> {
  const pageSize = 500;
  const out: CuratorAllSubmissionRow[] = [];
  let page = 1;
  for (;;) {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const res = await apiRequest<{ items: CuratorAllSubmissionRow[]; total: number; page: number; pageSize: number }>(
      `/homework/curator/all?${q.toString()}`
    );
    out.push(...res.items);
    if (out.length >= res.total || res.items.length < pageSize) break;
    page += 1;
  }
  return out;
}

export async function curatorSuggestFeedback(input: {
  submissionId: string;
  /** If omitted, follows the student's profile language */
  outputLanguage?: "ru" | "en";
}): Promise<{ feedback: string; outputLanguage: "ru" | "en" }> {
  return apiRequest("/homework/curator/suggest-feedback", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function curatorReview(input: {
  submissionId: string;
  verdict: "approved" | "rejected";
  comment: string;
}): Promise<{ success: true; status: "approved" | "rejected" | "overdue" }> {
  return apiRequest("/homework/curator/review", {
    method: "POST",
    body: JSON.stringify(input)
  });
}


export type ChatMessage = {
  id: string;
  flowId: string;
  userId: string | null;
  kind: "user" | "system" | "celebration";
  eventType: string | null;
  body: string;
  meta: string | null;
  senderName: string | null;
  createdAt: string;
};

export async function getChatMessages(before?: string, limit?: number): Promise<{
  messages: ChatMessage[];
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiRequest(`/chat/messages${qs ? `?${qs}` : ""}`);
}

export async function pollChatMessages(after: string): Promise<{
  messages: ChatMessage[];
}> {
  return apiRequest(`/chat/messages/poll?after=${encodeURIComponent(after)}`);
}

export async function sendChatMessage(body: string): Promise<ChatMessage> {
  return apiRequest("/chat/send", {
    method: "POST",
    body: JSON.stringify({ body })
  });
}

export async function sendCelebration(targetUserId: string, message?: string): Promise<{ success: true }> {
  return apiRequest("/chat/celebrate", {
    method: "POST",
    body: JSON.stringify({ targetUserId, message: message ?? "" })
  });
}

export type AdminChatMessage = {
  id: string;
  userId: string | null;
  kind: string;
  eventType: string | null;
  body: string;
  meta: string | null;
  senderName: string | null;
  senderEmail: string | null;
  createdAt: string | null;
};

export async function adminFlowChat(flowId: string): Promise<AdminChatMessage[]> {
  return apiRequest(`/admin/flows/${flowId}/chat`);
}

export async function adminDeleteChatMessage(messageId: string): Promise<{ success: true }> {
  return apiRequest(`/admin/chat/messages/${messageId}`, { method: "DELETE" });
}

export async function adminDeleteLesson(lessonId: string): Promise<{ success: true }> {
  return apiRequest(`/admin/content/lesson/${lessonId}`, { method: "DELETE" });
}

export async function adminDeleteWebinar(webinarId: string): Promise<{ success: true }> {
  return apiRequest(`/admin/content/webinar/${webinarId}`, { method: "DELETE" });
}

export async function adminDeleteArtifact(artifactId: string): Promise<{ success: true }> {
  return apiRequest(`/admin/content/artifact/${artifactId}`, { method: "DELETE" });
}

export async function adminDeleteHomeworkTemplate(templateId: string): Promise<{ success: true }> {
  return apiRequest(`/admin/content/homework-template/${templateId}`, { method: "DELETE" });
}

export async function adminReorderLessons(curriculumDayId: string, lessonIds: string[]): Promise<{ success: true }> {
  return apiRequest("/admin/content/lesson/reorder", {
    method: "POST",
    body: JSON.stringify({ curriculumDayId, lessonIds }),
  });
}

export async function adminRemoveFlowMember(flowId: string, userId: string): Promise<{ success: true }> {
  return apiRequest(`/admin/flows/${flowId}/members/${userId}`, { method: "DELETE" });
}

export type LeaderboardEntry = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  selectedTrack: string | null;
  completedLessons: number;
  totalLessons: number;
  approvedHomework: number;
  totalHomework: number;
  progressPercent: number;
};

export async function adminFlowLeaderboard(flowId: string, signal?: AbortSignal): Promise<LeaderboardEntry[]> {
  return apiRequest(`/admin/flows/${flowId}/leaderboard`, signal ? { signal } : {});
}

// ── Course management ────────────────────────────────────────────────

export type AdminCourse = {
  id: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
  coverUrl: string;
  sortOrder: number;
  lessonCount: number;
  createdAt: string;
};

export type AdminCourseLesson = {
  id: string;
  titleRu: string;
  titleEn: string;
  contentRu: string;
  contentEn: string;
  kind: "mandatory" | "optional";
  videoUrl: string;
  kinescopeVideoId: string | null;
  sortOrder: number;
  clSortOrder: number;
  assignedDays: Array<{ dayNumber: number; track: TrackCode | null; phase: string }>;
};

export type AllLessonForPicker = {
  id: string;
  titleRu: string;
  titleEn: string;
  kind: "mandatory" | "optional";
  dayNumber: number;
  track: TrackCode | null;
  phase: string;
};

export async function adminCourses(): Promise<AdminCourse[]> {
  return apiRequest("/admin/courses");
}

export async function adminUpsertCourse(payload: {
  courseId?: string;
  titleRu: string;
  titleEn: string;
  descriptionRu: string;
  descriptionEn: string;
  coverUrl: string;
  sortOrder: number;
}): Promise<{ success: boolean; courseId: string }> {
  return apiRequest("/admin/courses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminUploadCourseCover(
  file: File,
  previousCoverUrl?: string,
): Promise<{ success: boolean; coverUrl: string }> {
  const auth = getAuthState();
  const form = new FormData();
  form.append("file", file);
  if (previousCoverUrl?.trim()) form.append("previousCoverUrl", previousCoverUrl.trim());
  const headers: Record<string, string> = {};
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  const res = await fetch(`${API_BASE}/admin/course-covers/upload`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    const detail = typeof err.detail === "string" ? err.detail : "Upload failed";
    throw new Error(detail);
  }
  return res.json();
}

export async function adminDeleteCourse(courseId: string): Promise<{ success: boolean }> {
  return apiRequest(`/admin/courses/${courseId}`, { method: "DELETE" });
}

export async function adminCourseLessons(courseId: string): Promise<AdminCourseLesson[]> {
  return apiRequest(`/admin/courses/${courseId}/lessons`);
}

export async function adminAddCourseLesson(courseId: string, lessonId: string): Promise<{ success: boolean }> {
  return apiRequest(`/admin/courses/${courseId}/lessons`, {
    method: "POST",
    body: JSON.stringify({ lessonId }),
  });
}

export async function adminRemoveCourseLesson(courseId: string, lessonId: string): Promise<{ success: boolean }> {
  return apiRequest(`/admin/courses/${courseId}/lessons/${lessonId}`, { method: "DELETE" });
}

export async function adminReorderCourseLessons(courseId: string, lessonIds: string[]): Promise<{ success: boolean }> {
  return apiRequest(`/admin/courses/${courseId}/lessons/reorder`, {
    method: "POST",
    body: JSON.stringify({ lessonIds }),
  });
}

export async function adminAllLessonsForPicker(): Promise<AllLessonForPicker[]> {
  return apiRequest("/admin/courses/all-lessons");
}

export async function adminUpsertCourseLesson(payload: {
  courseId: string;
  lessonId?: string;
  titleRu: string;
  titleEn: string;
  contentRu: string;
  contentEn: string;
  videoUrl: string;
  kinescopeVideoId?: string | null;
  sortOrder: number;
}): Promise<{ success: boolean; lessonId: string }> {
  return apiRequest("/admin/courses/lesson", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminAssignLessonToDay(
  dayId: string,
  lessonId: string,
  kind: "mandatory" | "optional" = "mandatory",
): Promise<{ success: boolean }> {
  return apiRequest(`/admin/content/day/${dayId}/assign-lesson`, {
    method: "POST",
    body: JSON.stringify({ lessonId, kind }),
  });
}

export async function adminUnassignLessonFromDay(dayId: string, lessonId: string): Promise<{ success: boolean }> {
  return apiRequest(`/admin/content/day/${dayId}/unassign-lesson/${lessonId}`, { method: "POST" });
}

export async function adminUpdateLesson(lessonId: string, data: {
  titleRu: string; titleEn: string; contentRu: string; contentEn: string;
  videoUrl: string; kinescopeVideoId: string | null;
  kind?: "mandatory" | "optional";
}): Promise<{ success: boolean }> {
  return apiRequest(`/admin/lesson/${lessonId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Kinescope video ──────────────────────────────────────────────────

export type KinescopeVideo = {
  id: string;
  title: string;
  status: string;
  duration: number;
  play_link: string;
  embed_link: string;
  created_at: string;
  poster?: string | null;
  folder_id?: string | null;
};

export type KinescopeFolder = {
  id: string;
  name: string;
  project_id?: string;
  created_at: string;
};

export async function adminVideoFolders(): Promise<{ total: number; folders: KinescopeFolder[] }> {
  return apiRequest("/admin/video/folders");
}

export async function adminVideoLibrary(params?: {
  folderId?: string;
  withoutFolder?: boolean;
  q?: string;
  page?: number;
  perPage?: number;
}): Promise<{ total: number; videos: KinescopeVideo[] }> {
  const sp = new URLSearchParams();
  if (params?.folderId) sp.set("folder_id", params.folderId);
  if (params?.withoutFolder) sp.set("without_folder", "true");
  if (params?.q?.trim()) sp.set("q", params.q.trim());
  if (params?.page != null) sp.set("page", String(params.page));
  if (params?.perPage != null) sp.set("per_page", String(params.perPage));
  const qs = sp.toString();
  return apiRequest(`/admin/video/library${qs ? `?${qs}` : ""}`);
}

export async function adminInitVideoUpload(title: string): Promise<{ uploadUrl: string; uploadToken: string; projectId: string }> {
  return apiRequest("/admin/video/init-upload", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function adminVideoStatus(videoId: string): Promise<{
  id: string;
  title: string;
  status: string;
  duration: number;
  thumbnail_url: string | null;
  play_link: string;
  embed_link?: string;
  kinescopeApiUnavailable?: boolean;
}> {
  return apiRequest(`/admin/video/${videoId}/status`);
}

export async function adminUploadWebinarThumbnail(file: File): Promise<{ success: boolean; thumbnailUrl: string }> {
  const auth = getAuthState();
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  const res = await fetch(`${API_BASE}/admin/webinar-thumbnails/upload`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    const detail = typeof err.detail === "string" ? err.detail : "Upload failed";
    throw new Error(detail);
  }
  return res.json();
}

export async function adminDeleteVideo(videoId: string): Promise<{ success: boolean }> {
  return apiRequest(`/admin/video/${videoId}`, { method: "DELETE" });
}

// ─── Community auth state (separate from student authState) ──────────────────

type CommunityAuthState = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
};

const COMM_AUTH_KEY = "communityAuthState";

export function getCommunityAuthState(): CommunityAuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMM_AUTH_KEY);
    return raw ? (JSON.parse(raw) as CommunityAuthState) : null;
  } catch {
    return null;
  }
}

export function setCommunityAuthState(value: CommunityAuthState | null): void {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem(COMM_AUTH_KEY);
    return;
  }
  window.localStorage.setItem(COMM_AUTH_KEY, JSON.stringify(value));
}

export function clearCommunityAuthState(): void {
  invalidateCommunityMeCache();
  setCommunityAuthState(null);
}

/** True if JWT exp is in the past (or payload unreadable). Used to refresh before the first fetch and avoid a noisy 401 in DevTools. */
function isCommunityAccessTokenExpired(accessToken: string, skewSec = 30): boolean {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return true;
    let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const payload = JSON.parse(atob(base64)) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    return Date.now() / 1000 >= payload.exp - skewSec;
  } catch {
    return true;
  }
}

async function refreshCommunitySessionIfStale(auth: CommunityAuthState): Promise<void> {
  if (!isCommunityAccessTokenExpired(auth.accessToken)) return;
  if (!auth.refreshToken) return;
  try {
    const refreshRes = await fetch(`${API_BASE}/community/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    });
    if (!refreshRes.ok) {
      clearCommunityAuthState();
      return;
    }
    const tokens = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
    setCommunityAuthState({ ...auth, ...tokens });
  } catch {
    clearCommunityAuthState();
  }
}

export function communityPublicAssetUrl(pathFromServer: string): string {
  const p = pathFromServer.trim();
  if (/^https?:\/\//i.test(p)) return p;
  const base = API_BASE.replace(/\/$/, "");
  return p.startsWith("/") ? `${base}${p}` : `${base}/${p}`;
}

async function communityAuthorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const authBefore = getCommunityAuthState();
  if (authBefore?.accessToken && authBefore.refreshToken) {
    await refreshCommunitySessionIfStale(authBefore);
  }
  const auth = getCommunityAuthState();
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;

  const uiLang = getUiLang();

  let response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}), "X-Locale": uiLang },
  });

  if (response.status === 401 && auth?.refreshToken) {
    try {
      const refreshRes = await fetch(`${API_BASE}/community/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      });
      if (refreshRes.ok) {
        const tokens = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
        setCommunityAuthState({ ...auth, ...tokens });
        headers.Authorization = `Bearer ${tokens.accessToken}`;
        response = await fetch(`${API_BASE}${path}`, {
          ...init,
          headers: { ...headers, ...(init.headers ?? {}), "X-Locale": uiLang },
        });
      } else {
        clearCommunityAuthState();
        throw new ApiError(401, uiLang === "ru" ? "Сессия истекла. Войдите снова." : "Session expired.");
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      clearCommunityAuthState();
      throw new ApiError(401, uiLang === "ru" ? "Сессия истекла. Войдите снова." : "Session expired.");
    }
  }

  const method = (init.method ?? "GET").toUpperCase();

  return response;
}

async function communityApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const uiLang = getUiLang();
  const method = (init.method ?? "GET").toUpperCase();
  let response: Response;
  try {
    response = await communityAuthorizedFetch(path, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof ApiError) throw err;
    throw new Error(networkErrorMessage(uiLang));
  }

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.debug(`[community-api] ${method} ${path} → ${response.status}`);
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    const text = await response.text();
    throw new ApiError(response.status, normalizeApiErrorMessage(response.status, text, retryAfter));
  }
  return response.json() as Promise<T>;
}

export async function communityChatMessageAttachmentBlob(messageId: string): Promise<Blob> {
  const uiLang = getUiLang();
  let response: Response;
  try {
    response = await communityAuthorizedFetch(
      `/community/chats/messages/${encodeURIComponent(messageId)}/attachment`,
      { method: "GET" },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (err instanceof ApiError) throw err;
    throw new Error(networkErrorMessage(uiLang));
  }
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, normalizeApiErrorMessage(response.status, text));
  }
  return response.blob();
}

// Community auth endpoints
export async function communitySignup(data: {
  firstName: string;
  lastName?: string;
  email: string;
  password: string;
}): Promise<CommunityAuthState> {
  const res = await rawRequest<CommunityAuthState>("/community/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });
  setCommunityAuthState(res);
  return res;
}

export async function communityLogin(data: {
  email: string;
  password: string;
}): Promise<CommunityAuthState> {
  const res = await rawRequest<CommunityAuthState>("/community/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  setCommunityAuthState(res);
  return res;
}

export async function communityLogout(): Promise<void> {
  const auth = getCommunityAuthState();
  if (auth?.refreshToken) {
    try {
      await rawRequest("/community/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      });
    } catch { /* ignore */ }
  }
  clearCommunityAuthState();
}

export type CommunityMe = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string | null;
  bio: string | null;
  position: string | null;
  company: string | null;
  location: string | null;
  website: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  skills: string[];
  communityXp: number;
  isAdmin: boolean;
};

/** In-flight + short TTL cache: shell + pages often call /community/auth/me in parallel on navigation. */
const COMMUNITY_ME_TTL_MS = 10_000;
let communityMeCache: { userId: string; at: number; data: CommunityMe } | null = null;
let communityMeInflight: Promise<CommunityMe> | null = null;

export function invalidateCommunityMeCache(): void {
  communityMeCache = null;
  communityMeInflight = null;
}

export async function communityMeApi(): Promise<CommunityMe> {
  const auth = getCommunityAuthState();
  const uid = auth?.userId ?? "";
  if (communityMeCache && communityMeCache.userId !== uid) {
    communityMeCache = null;
  }
  const now = Date.now();
  if (communityMeCache && uid && now - communityMeCache.at < COMMUNITY_ME_TTL_MS) {
    return communityMeCache.data;
  }
  if (communityMeInflight) {
    return communityMeInflight;
  }
  communityMeInflight = communityApiRequest<CommunityMe>("/community/auth/me")
    .then((data) => {
      const a = getCommunityAuthState();
      if (a?.userId) {
        communityMeCache = { userId: a.userId, at: Date.now(), data };
      }
      return data;
    })
    .finally(() => {
      communityMeInflight = null;
    });
  return communityMeInflight;
}

// ─── Community ────────────────────────────────────────────────────────────────

export type CategoryKindScope = "both" | "discussion" | "short";

export type CommunityCategory = {
  id: string;
  slug: string;
  nameRu: string;
  nameEn: string;
  description: string;
  color: string;
  sortOrder: number;
  kindScope?: CategoryKindScope;
  /** Present when GET /categories?suggested=true and user is authenticated */
  profileMatchScore?: number;
};

export type AuthorPreview = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  position: string | null;
  communityXp: number;
  isAnonymous?: boolean;
};

export type VoteCounts = { likes: number; dislikes: number };

export type TopicStatus = "pending" | "active" | "closed";

export type CommunityTopic = {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  isClosed: boolean;
  status: TopicStatus;
  approvedAt: string | null;
  closesAt: string | null;
  viewCount: number;
  categoryId: string | null;
  /** discussion = Q&A window + archive; short = feed note without the AI archive */
  topicKind?: "discussion" | "short";
  replyCount: number;
  isAnonymous: boolean;
  author: AuthorPreview;
  votes: VoteCounts;
  myVote: 1 | -1 | null;
  createdAt: string;
  updatedAt: string;
  aiSummary: string | null;
  /** Discussion participants (for the archive with discussion_archive=true) */
  participants?: AuthorPreview[];
};

export type CommunityReply = {
  id: string;
  topicId: string;
  parentId: string | null;
  body: string;
  isAccepted: boolean;
  isAnonymous: boolean;
  author: AuthorPreview;
  votes: VoteCounts;
  myVote: 1 | -1 | null;
  createdAt: string;
  updatedAt: string;
};

export type TopicDetail = CommunityTopic & { replies: CommunityReply[] };

export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
  createdAt: string | null;
  bio: string | null;
  position: string | null;
  company: string | null;
  location: string | null;
  website: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  skills: string[];
  communityXp: number;
  stats: {
    topicsCount: number;
    repliesCount: number;
    likesReceived: number;
    followersCount: number;
    followingCount: number;
  };
  isFollowedByViewer?: boolean;
};

export async function communityCategories(params?: {
  forKind?: "discussion" | "short";
  suggested?: boolean;
}): Promise<CommunityCategory[]> {
  const qs = new URLSearchParams();
  if (params?.forKind) qs.set("forKind", params.forKind);
  if (params?.suggested) qs.set("suggested", "true");
  const suffix = qs.size ? `?${qs}` : "";
  return communityApiRequest(`/community/categories${suffix}`);
}

export async function communityUploadComposerImage(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return communityApiRequest<{ url: string }>("/community/attachments/image", { method: "POST", body: fd });
}

export type CommunityDiscoverContext = {
  stats: { topics: number; replies: number; unanswered: number };
  quote: { text: string | null; author: string | null };
  wiki: { title: string | null; extract: string | null; url: string | null };
  suggestedCategories?: CommunityCategory[];
};

export async function communityDiscoverContext(): Promise<CommunityDiscoverContext> {
  return communityApiRequest("/community/discover/context");
}

export async function communityTopics(params?: {
  category?: string;
  q?: string;
  page?: number;
  authorId?: string;
  sort?: "recent" | "popular";
  unanswered?: boolean;
  pinned_only?: boolean;
  /** Only closed feed topics that already have an AI summary */
  discussionArchive?: boolean;
  /** Only topics by authors the current user follows (requires a JWT) */
  fromFollowed?: boolean;
  /** AbortSignal for cancelling stale requests */
  signal?: AbortSignal;
}): Promise<{ items: CommunityTopic[]; total: number; page: number; pageSize: number }> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.q) qs.set("q", params.q);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.authorId) qs.set("author_id", params.authorId);
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.unanswered) qs.set("unanswered", "true");
  if (params?.pinned_only) qs.set("pinned_only", "true");
  if (params?.discussionArchive) qs.set("discussion_archive", "true");
  if (params?.fromFollowed) qs.set("from_followed", "true");
  return communityApiRequest(`/community/topics${qs.size ? `?${qs}` : ""}`, { signal: params?.signal ?? null });
}

export async function communityCreateTopic(body: {
  title: string;
  body: string;
  categoryId?: string | null;
  isAnonymous?: boolean;
  topicKind?: "discussion" | "short";
}): Promise<CommunityTopic> {
  return communityApiRequest("/community/topics", { method: "POST", body: JSON.stringify(body) });
}

export async function communityGetTopic(id: string): Promise<TopicDetail> {
  return communityApiRequest(`/community/topics/${id}`);
}

export async function communityUpdateTopic(
  id: string,
  body: { title: string; body: string; categoryId?: string | null }
): Promise<{ success: boolean }> {
  return communityApiRequest(`/community/topics/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function communityDeleteTopic(id: string): Promise<{ success: boolean }> {
  return communityApiRequest(`/community/topics/${id}`, { method: "DELETE" });
}

export async function communityApproveTopic(id: string): Promise<CommunityTopic> {
  return communityApiRequest(`/community/topics/${id}/approve`, { method: "POST" });
}

export async function communityRejectTopic(id: string): Promise<{ success: boolean }> {
  return communityApiRequest(`/community/topics/${id}/reject`, { method: "POST" });
}

export async function communityPinTopic(id: string): Promise<{ isPinned: boolean }> {
  return communityApiRequest(`/community/topics/${id}/pin`, { method: "POST" });
}

export async function communityPendingTopics(): Promise<{
  items: CommunityTopic[];
  total: number;
}> {
  return communityApiRequest("/community/admin/pending");
}

export interface CommunityAdminUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  position: string | null;
  company: string | null;
  joinedAt: string;
  topics: number;
  replies: number;
  xp: number;
  isBanned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
}

export async function communityAdminUsers(q?: string): Promise<{
  items: CommunityAdminUser[];
  total: number;
}> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiRequest(`/admin/community/users${qs}`);
}

export async function communityAdminTopics(params?: {
  status?: string;
  q?: string;
}): Promise<{ items: CommunityAdminTopic[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.q) sp.set("q", params.q);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return apiRequest(`/admin/community/topics${qs}`);
}

export async function adminCommunityPending(): Promise<{
  items: CommunityAdminTopic[];
  total: number;
}> {
  return apiRequest("/admin/community/pending");
}

export interface CommunityAdminTopic {
  id: string;
  title: string;
  body?: string;
  status: string;
  isPinned: boolean;
  isClosed: boolean;
  replyCount: number;
  viewCount: number;
  createdAt: string;
  closesAt: string | null;
  categoryId: string | null;
  isAnonymous: boolean;
  author: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}

export async function adminCommunityTopics(params?: {
  status?: string;
  q?: string;
}): Promise<{ items: CommunityAdminTopic[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.q) sp.set("q", params.q);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return apiRequest(`/admin/community/topics${qs}`);
}

export async function adminCommunityApproveTopic(id: string): Promise<{ success: boolean; closesAt: string }> {
  return apiRequest(`/admin/community/topics/${id}/approve`, { method: "POST" });
}

export async function adminCommunityRejectTopic(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/admin/community/topics/${id}/reject`, { method: "POST" });
}

export async function adminCommunityPinTopic(id: string): Promise<{ success: boolean; isPinned: boolean }> {
  return apiRequest(`/admin/community/topics/${id}/pin`, { method: "POST" });
}

export async function adminCommunityDeleteTopic(id: string): Promise<void> {
  await apiRequest(`/admin/community/topics/${id}`, { method: "DELETE" });
}

export type CommunityBanMode = "preserve" | "purge_messages" | "purge_all";

export async function adminCommunityBanUser(
  communityUserId: string,
  body: { mode: CommunityBanMode; reason?: string },
): Promise<{ success: boolean }> {
  return apiRequest(`/admin/community/users/${encodeURIComponent(communityUserId)}/ban`, {
    method: "POST",
    body: JSON.stringify({ mode: body.mode, reason: body.reason ?? "" }),
  });
}

export async function adminCommunityUnbanUser(communityUserId: string): Promise<{ success: boolean }> {
  return apiRequest(`/admin/community/users/${encodeURIComponent(communityUserId)}/unban`, {
    method: "POST",
  });
}

export type FeedReplyPreview = {
  id: string;
  body: string;
  createdAt: string;
  author: { firstName: string; lastName: string; avatarUrl: string | null };
};

export type FeedItem = CommunityTopic & {
  previewReplies: FeedReplyPreview[];
};

export async function communityFeed(params?: {
  category?: string;
  q?: string;
  page?: number;
  fromFollowed?: boolean;
  /** AbortSignal for cancelling stale requests */
  signal?: AbortSignal;
}): Promise<{ items: FeedItem[]; total: number; page: number; pageSize: number }> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.q) qs.set("q", params.q);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.fromFollowed) qs.set("from_followed", "true");
  return communityApiRequest(`/community/feed${qs.size ? `?${qs}` : ""}`, { signal: params?.signal ?? null });
}

export async function communityCreateReply(
  topicId: string,
  body: { body: string; parentId?: string | null; isAnonymous?: boolean }
): Promise<CommunityReply> {
  return communityApiRequest(`/community/topics/${topicId}/replies`, { method: "POST", body: JSON.stringify(body) });
}

export async function communityUpdateReply(
  replyId: string,
  body: { body: string }
): Promise<{ success: boolean }> {
  return communityApiRequest(`/community/replies/${replyId}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function communityDeleteReply(replyId: string): Promise<{ success: boolean }> {
  return communityApiRequest(`/community/replies/${replyId}`, { method: "DELETE" });
}

export async function communityVote(body: {
  targetType: "topic" | "reply";
  targetId: string;
  value: 1 | -1;
}): Promise<{ action: string; value?: number; votes: VoteCounts }> {
  return communityApiRequest("/community/vote", { method: "POST", body: JSON.stringify(body) });
}

export async function communityGetProfile(userId: string): Promise<UserProfile> {
  return communityApiRequest(`/community/profiles/${userId}`);
}

export async function communityFollowProfile(userId: string): Promise<UserProfile> {
  return communityApiRequest(`/community/profiles/${userId}/follow`, { method: "POST", body: "{}" });
}

export async function communityUnfollowProfile(userId: string): Promise<UserProfile> {
  return communityApiRequest(`/community/profiles/${userId}/follow`, { method: "DELETE" });
}

export type CommunityFollowListItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  since: string | null;
};

export type CommunityFollowListPage = {
  items: CommunityFollowListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export async function communityListMyFollowing(params?: {
  page?: number;
  pageSize?: number;
}): Promise<CommunityFollowListPage> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.pageSize != null) qs.set("page_size", String(params.pageSize));
  const suffix = qs.size ? `?${qs}` : "";
  return communityApiRequest(`/community/me/following${suffix}`);
}

export async function communityListMyFollowers(params?: {
  page?: number;
  pageSize?: number;
}): Promise<CommunityFollowListPage> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.pageSize != null) qs.set("page_size", String(params.pageSize));
  const suffix = qs.size ? `?${qs}` : "";
  return communityApiRequest(`/community/me/followers${suffix}`);
}

export async function communityRemoveFollower(userId: string): Promise<void> {
  await communityApiRequest(`/community/me/followers/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function communityGetMyProfile(): Promise<UserProfile> {
  return communityApiRequest("/community/profiles/me");
}

export async function communityUpdateMyProfile(data: {
  bio?: string;
  position?: string;
  company?: string;
  location?: string;
  website?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  skills?: string[];
}): Promise<UserProfile> {
  return communityApiRequest("/community/profiles/me", { method: "PUT", body: JSON.stringify(data) });
}

// ─── Chat types & API ─────────────────────────────────────────────────────────

export type ChatMemberPreview = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export type ChatLastMessage = {
  body: string;
  hasAttachment?: boolean;
  createdAt: string;
  authorName: string;
};

export type CommunityChat = {
  id: string;
  type: "dm" | "group";
  name: string | null;
  topicId: string | null;
  description?: string | null;
  ownerId?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessage: ChatLastMessage | null;
  unreadCount: number;
  members: ChatMemberPreview[];
  myIsAnonymous?: boolean;
};

export type CommChatMessage = {
  id: string;
  chatId: string;
  body: string;
  hasAttachment?: boolean;
  messageType?: string;
  replyToMessageId?: string | null;
  editedAt?: string | null;
  createdAt: string;
  author: ChatMemberPreview & { id: string };
};

export async function communityChats(): Promise<CommunityChat[]> {
  return communityApiRequest("/community/chats");
}

export async function communityGetChat(chatId: string): Promise<CommunityChat> {
  return communityApiRequest(`/community/chats/${chatId}`);
}

export async function communityChatUnread(): Promise<{ unread: number }> {
  return communityApiRequest("/community/chats/unread");
}

export async function communityChatMessages(
  chatId: string,
  before?: string,
  after?: string,
): Promise<{ messages: CommChatMessage[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (before) params.set("before", before);
  if (after) params.set("after", after);
  const qs = params.size > 0 ? `?${params.toString()}` : "";
  return communityApiRequest(`/community/chats/${chatId}/messages${qs}`);
}

export async function communitySendMessage(
  chatId: string,
  payload: string | { body?: string; file?: File },
): Promise<CommChatMessage> {
  if (typeof payload === "object" && payload.file) {
    const fd = new FormData();
    fd.set("body", (payload.body ?? "").trim());
    fd.set("file", payload.file);
    return communityApiRequest(`/community/chats/${chatId}/messages`, {
      method: "POST",
      body: fd,
    });
  }
  const bodyText = typeof payload === "string" ? payload : (payload.body ?? "");
  return communityApiRequest(`/community/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body: bodyText }),
  });
}

export async function communityStartDM(targetUserId: string): Promise<CommunityChat> {
  return communityApiRequest(`/community/dm/${targetUserId}`, { method: "POST" });
}

export async function communityRevealIdentity(chatId: string): Promise<{ success: boolean; isAnonymous: boolean }> {
  return communityApiRequest(`/community/chats/${chatId}/reveal`, { method: "POST" });
}

export async function communityEditMessage(
  chatId: string,
  messageId: string,
  body: string,
): Promise<{ id: string; body: string; editedAt: string }> {
  return communityApiRequest(`/community/chats/${chatId}/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export async function communityDeleteMessage(chatId: string, messageId: string): Promise<void> {
  await communityApiRequest(`/community/chats/${chatId}/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
}

export async function communityCreateGroup(
  name: string,
  memberIds: string[],
  description?: string,
): Promise<CommunityChat> {
  return communityApiRequest("/community/chats/group", {
    method: "POST",
    body: JSON.stringify({ name, member_ids: memberIds, description }),
  });
}

export async function communityUpdateChat(
  chatId: string,
  updates: { name?: string; description?: string },
): Promise<CommunityChat> {
  return communityApiRequest(`/community/chats/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export type ChatParticipant = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role: "owner" | "admin" | "member";
  isAnonymous: boolean;
  joinedAt: string;
};

export async function communityListParticipants(chatId: string): Promise<ChatParticipant[]> {
  return communityApiRequest(`/community/chats/${encodeURIComponent(chatId)}/participants`);
}

export async function communityAddParticipant(chatId: string, userId: string): Promise<void> {
  await communityApiRequest(`/community/chats/${encodeURIComponent(chatId)}/participants`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function communityRemoveParticipant(chatId: string, userId: string): Promise<void> {
  await communityApiRequest(
    `/community/chats/${encodeURIComponent(chatId)}/participants/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export async function communityUpdateParticipantRole(
  chatId: string,
  userId: string,
  role: "admin" | "member",
): Promise<void> {
  await communityApiRequest(
    `/community/chats/${encodeURIComponent(chatId)}/participants/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export async function communityReportMessage(messageId: string, reason: string): Promise<void> {
  await communityApiRequest(`/community/messages/${encodeURIComponent(messageId)}/report`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// ── Block / unblock ───────────────────────────────────────────────────────────

export type BlockedUser = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  blockedAt: string;
};

export async function communityBlockUser(userId: string): Promise<void> {
  await communityApiRequest(`/community/users/${encodeURIComponent(userId)}/block`, {
    method: "POST",
  });
}

export async function communityUnblockUser(userId: string): Promise<void> {
  await communityApiRequest(`/community/users/${encodeURIComponent(userId)}/block`, {
    method: "DELETE",
  });
}

export async function communityListBlockedUsers(): Promise<BlockedUser[]> {
  return communityApiRequest("/community/users/blocked");
}

// ── Mute / unmute ─────────────────────────────────────────────────────────────

export async function communityMuteChat(
  chatId: string,
  muteUntil?: string,
): Promise<{ muted: boolean; chatId: string; mutedUntil?: string }> {
  return communityApiRequest(`/community/chats/${encodeURIComponent(chatId)}/mute`, {
    method: "POST",
    body: JSON.stringify({ mute_until: muteUntil ?? null }),
  });
}

export async function communityUnmuteChat(
  chatId: string,
): Promise<{ muted: boolean; chatId: string }> {
  return communityApiRequest(`/community/chats/${encodeURIComponent(chatId)}/mute`, {
    method: "DELETE",
  });
}

// ── Transfer ownership ────────────────────────────────────────────────────────

export async function communityTransferOwnership(
  chatId: string,
  newOwnerId: string,
): Promise<{ chatId: string; newOwnerId: string }> {
  return communityApiRequest(
    `/community/chats/${encodeURIComponent(chatId)}/transfer-ownership`,
    { method: "POST", body: JSON.stringify({ new_owner_id: newOwnerId }) },
  );
}
