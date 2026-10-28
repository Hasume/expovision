"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminFlows,
  adminUpsertFlow,
  adminDuplicateFlow,
  adminFlowMembers,
  adminAssignUserToFlow,
  adminRemoveFlowMember,
  adminFlowDays,
  adminSetFlowDays,
  adminFlowWebinars,
  adminSetFlowWebinarOrders,
  adminCreateFlowWebinar,
  adminDeleteFlowWebinar,
  adminStartWebinar,
  adminFinishWebinar,
  adminWebinarStreamInfo,
  adminCreateWebinarEvent,
  adminSetWebinarEventId,
  adminListAllWebinars,
  adminLinkFlowWebinar,
  adminVideoStatus,
  adminUploadWebinarThumbnail,
  adminContentDays,
  adminFlowLeaderboard,
  adminGenerateTokens,
  adminListTokens,
  adminFlowChat,
  adminDeleteChatMessage,
  adminUsers,
  adminCourses,
  adminCourseLessons,
  type AdminToken,
  type AdminChatMessage,
  type AdminCourse,
  type AdminCourseLesson,
  type AdminFlowWebinarRow,
  type AdminGlobalWebinar,
  type AdminStreamInfo,
  type LeaderboardEntry,
} from "@/features/api";
import { TabRow, Badge } from "@/shared/ui/components";
import { useToast } from "@/features/admin/toast";
import { ConfirmDialog } from "@/features/admin/confirm-dialog";
import { useAdminLang } from "@/features/admin/i18n";
import { AdminDrawer } from "@/features/admin/admin-drawer";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
function absMediaUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) return `${API_ORIGIN}${pathOrUrl}`;
  return pathOrUrl;
}

type Flow = Awaited<ReturnType<typeof adminFlows>>[number];
type FlowMember = Awaited<ReturnType<typeof adminFlowMembers>>[number];
type FlowDay = Awaited<ReturnType<typeof adminFlowDays>>[number];
type ContentDay = Awaited<ReturnType<typeof adminContentDays>>[number];
type User = Awaited<ReturnType<typeof adminUsers>>[number];

type DetailTab = "overview" | "members" | "program" | "webinar" | "tokens" | "chat";

const emptyFlowForm = () => ({
  flowId: "", code: "", title: "", description: "", language: "ru" as "ru" | "en",
  startsAtIso: "", endsAtIso: "", timezone: "UTC", isActive: true, tokenCount: 0,
});

const emptyDupForm = () => ({
  code: "", title: "", startsAtIso: "", endsAtIso: "", tokenCount: 0,
});

export default function AdminFlowsPage() {
  const { toast } = useToast();
  const { t } = useAdminLang();

  const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
    { key: "overview", label: t("Обзор", "Overview") },
    { key: "members", label: t("Участники", "Members") },
    { key: "program", label: t("Программа", "Program") },
    { key: "webinar", label: t("Вебинар", "Webinar") },
    { key: "tokens", label: t("Токены", "Tokens") },
    { key: "chat", label: t("Чат", "Chat") },
  ];

  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  const [editing, setEditing] = useState(false);
  const [flowForm, setFlowForm] = useState(emptyFlowForm());

  const [duplicating, setDuplicating] = useState(false);
  const [dupForm, setDupForm] = useState(emptyDupForm());

  const [members, setMembers] = useState<FlowMember[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [assignEmail, setAssignEmail] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);

  const [flowDays, setFlowDays] = useState<FlowDay[]>([]);
  const [allDays, setAllDays] = useState<ContentDay[]>([]);
  const [selectedDayIds, setSelectedDayIds] = useState<string[]>([]);
  const [programDirty, setProgramDirty] = useState(false);
  const [flowWebinars, setFlowWebinars] = useState<AdminFlowWebinarRow[]>([]);
  const [webinarOrderDraft, setWebinarOrderDraft] = useState<Record<string, string>>({});

  const emptyWebinarForm = () => ({
    kinescopeInput: "", titleRu: "", titleEn: "", summaryRu: "", summaryEn: "",
    startsAtIso: "", durationMinutes: 90, joinUrl: "", thumbnailUrl: "",
  });
  const [showWebinarForm, setShowWebinarForm] = useState(false);
  const [webinarForm, setWebinarForm] = useState(emptyWebinarForm());
  const [kinescopePreview, setKinescopePreview] = useState<{ title: string; thumbnailUrl: string | null; ksStatus?: string } | null>(null);
  const [kinescopeLoading, setKinescopeLoading] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [webinarSaving, setWebinarSaving] = useState(false);
  const thumbFileRef = useRef<HTMLInputElement | null>(null);

  // RTMP stream info shown after save or via button
  const [streamInfo, setStreamInfo] = useState<(AdminStreamInfo & { webinarId: string; loading: boolean }) | null>(null);
  const [eventIdInput, setEventIdInput] = useState<string>("");
  const [webinarActionLoading, setWebinarActionLoading] = useState<string | null>(null); // webinarId being started/finished

  // "Link existing webinar" picker state
  const [showLinkExisting, setShowLinkExisting] = useState(false);
  const [allWebinars, setAllWebinars] = useState<AdminGlobalWebinar[]>([]);
  const [allWebinarsLoading, setAllWebinarsLoading] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

  const [coursesList, setCoursesList] = useState<AdminCourse[]>([]);
  const [courseLessonsMap, setCourseLessonsMap] = useState<Record<string, AdminCourseLesson[]>>({});

  const [allTokens, setAllTokens] = useState<AdminToken[]>([]);
  const [genCount, setGenCount] = useState(10);

  const [chatMessages, setChatMessages] = useState<AdminChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const loadedTabsRef = useRef<Set<string>>(new Set());

  const reloadFlows = async () => { const list = await adminFlows(); setFlows(list); return list; };
  const reloadTokens = async () => { setAllTokens(await adminListTokens()); };
  const reloadUsers = async () => { try { setAllUsers(await adminUsers()); } catch { /* */ } };

  const applyFlowWebinars = (wv: AdminFlowWebinarRow[]) => {
    setFlowWebinars(wv);
    const draft: Record<string, string> = {};
    for (const w of wv) draft[w.id] = w.programOrder != null ? String(w.programOrder) : "";
    setWebinarOrderDraft(draft);
  };

  const loadTabData = async (flowId: string, tab: DetailTab, signal: AbortSignal) => {
    if (tab === "members") {
      const [m, lb] = await Promise.all([
        adminFlowMembers(flowId, signal),
        adminFlowLeaderboard(flowId, signal).catch(() => [] as LeaderboardEntry[]),
      ]);
      if (signal.aborted) return;
      setMembers(m);
      setLeaderboard(lb);
    } else if (tab === "program") {
      const d = await adminFlowDays(flowId, signal);
      if (signal.aborted) return;
      setFlowDays(d);
      setSelectedDayIds(d.map((x) => x.curriculumDayId));
      setProgramDirty(false);
    } else if (tab === "webinar") {
      const wv = await adminFlowWebinars(flowId, signal).catch(() => [] as AdminFlowWebinarRow[]);
      if (signal.aborted) return;
      applyFlowWebinars(wv);
    }
  };

  const loadChat = async (flowId: string) => {
    setChatLoading(true);
    try { setChatMessages(await adminFlowChat(flowId)); } catch { /* */ }
    setChatLoading(false);
  };

  useEffect(() => {
    void (async () => {
      try {
        const [list] = await Promise.all([reloadFlows(), reloadTokens(), reloadUsers()]);
        const [days, cList] = await Promise.all([adminContentDays(), adminCourses()]);
        setAllDays(days);
        setCoursesList(cList);
        const clMap: Record<string, AdminCourseLesson[]> = {};
        await Promise.all(cList.map(async (c) => { try { clMap[c.id] = await adminCourseLessons(c.id); } catch { /* */ } }));
        setCourseLessonsMap(clMap);
        if (list.length > 0 && !selectedFlowId) setSelectedFlowId(list[0]!.id);
      } catch (e) {
        toast(e instanceof Error ? e.message : t("Не удалось загрузить данные", "Failed to load data"), "error");
      }
    })();
  }, []);

  // Reset per-flow state when selected flow changes, cancel any pending requests
  useEffect(() => {
    if (!selectedFlowId) return;
    abortRef.current?.abort();
    loadedTabsRef.current = new Set();
    setMembers([]);
    setLeaderboard([]);
    setFlowDays([]);
    setFlowWebinars([]);
    setWebinarOrderDraft({});
    setSelectedDayIds([]);
    setProgramDirty(false);
    setShowWebinarForm(false);
    setWebinarForm(emptyWebinarForm());
    setKinescopePreview(null);
    setChatMessages([]);
  }, [selectedFlowId]);

  // Lazy-load data only for the active tab, cancel stale requests on re-run
  useEffect(() => {
    if (!selectedFlowId) return;
    if (activeTab === "overview" || activeTab === "tokens") return;

    if (activeTab === "chat") {
      void loadChat(selectedFlowId);
      return;
    }

    const key = `${selectedFlowId}:${activeTab}`;
    if (loadedTabsRef.current.has(key)) return;
    loadedTabsRef.current.add(key);

    const controller = new AbortController();
    abortRef.current = controller;

    void loadTabData(selectedFlowId, activeTab, controller.signal).catch((e) => {
      if (controller.signal.aborted) return;
      loadedTabsRef.current.delete(key);
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    });

    return () => { controller.abort(); };
  }, [selectedFlowId, activeTab]);

  const selectedFlow = flows.find((f) => f.id === selectedFlowId) ?? null;
  const flowTokens = selectedFlowId ? allTokens.filter((tk) => tk.flowId === selectedFlowId) : [];
  const flowTokensUsed = flowTokens.filter((tk) => tk.usedByUserId).length;
  const flowTokensFree = flowTokens.length - flowTokensUsed;
  const memberIds = new Set(members.map((m) => m.userId));
  const unassignedUsers = allUsers.filter((u) => !memberIds.has(u.id) && u.role === "student");
  const flowTitle = (f: Flow) => f.language === "ru" ? f.titleRu : f.titleEn;

  const filteredMembers = members.filter((m) => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    const u = allUsers.find((x) => x.id === m.userId);
    const name = u ? `${u.firstName} ${u.lastName}`.toLowerCase() : "";
    return m.email.toLowerCase().includes(q) || name.includes(q);
  });

  const filteredUnassigned = unassignedUsers.filter((u) => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return u.email.toLowerCase().includes(q) || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q);
  });

  const selectFlow = (f: Flow) => { setSelectedFlowId(f.id); setEditing(false); setDuplicating(false); setActiveTab("overview"); };

  const startCreate = () => { setSelectedFlowId(""); setFlowForm(emptyFlowForm()); setEditing(true); setDuplicating(false); };

  const startEdit = () => {
    if (!selectedFlow) return;
    setFlowForm({ flowId: selectedFlow.id, code: selectedFlow.code, title: flowTitle(selectedFlow),
      description: (selectedFlow.language === "ru" ? selectedFlow.descriptionRu : selectedFlow.descriptionEn) ?? "",
      language: selectedFlow.language, startsAtIso: selectedFlow.startsAt.slice(0, 16), endsAtIso: selectedFlow.endsAt.slice(0, 16),
      timezone: selectedFlow.timezone, isActive: selectedFlow.isActive, tokenCount: 0 });
    setEditing(true); setDuplicating(false);
  };

  const startDuplicate = () => {
    if (!selectedFlow) return;
    setDupForm({ code: `${selectedFlow.code}-copy`, title: flowTitle(selectedFlow), startsAtIso: "", endsAtIso: "", tokenCount: 0 });
    setDuplicating(true); setEditing(false);
  };

  const onSaveFlow = async () => {
    try {
      const res = await adminUpsertFlow({
        ...(flowForm.flowId ? { flowId: flowForm.flowId } : {}),
        code: flowForm.code, title: flowForm.title, description: flowForm.description, language: flowForm.language,
        startsAtIso: new Date(flowForm.startsAtIso).toISOString(), endsAtIso: new Date(flowForm.endsAtIso).toISOString(),
        timezone: flowForm.timezone, isActive: flowForm.isActive, tokenCount: flowForm.tokenCount,
      });
      const msg = res.tokensGenerated > 0
        ? t(`Поток сохранён, ${res.tokensGenerated} токенов создано`, `Flow saved, ${res.tokensGenerated} tokens generated`)
        : t("Поток сохранён", "Flow saved");
      toast(msg);
      setEditing(false);
      await Promise.all([reloadFlows(), reloadTokens()]);
      setSelectedFlowId(res.flowId);
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const onDuplicate = async () => {
    if (!selectedFlowId || !dupForm.code || !dupForm.startsAtIso || !dupForm.endsAtIso) return;
    try {
      const res = await adminDuplicateFlow(selectedFlowId, {
        code: dupForm.code, title: dupForm.title, startsAtIso: new Date(dupForm.startsAtIso).toISOString(),
        endsAtIso: new Date(dupForm.endsAtIso).toISOString(), tokenCount: dupForm.tokenCount,
      });
      toast(t(`Поток дублирован! Дней: ${res.daysCount}${res.tokensGenerated > 0 ? `, токенов: ${res.tokensGenerated}` : ""}`,
        `Flow duplicated! Days: ${res.daysCount}${res.tokensGenerated > 0 ? `, tokens: ${res.tokensGenerated}` : ""}`));
      setDuplicating(false); setDupForm(emptyDupForm());
      await Promise.all([reloadFlows(), reloadTokens()]);
      setSelectedFlowId(res.flowId);
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const onAssign = async (email?: string) => {
    const e = email ?? assignEmail.trim();
    if (!selectedFlowId || !e) return;
    try {
      const res = await adminAssignUserToFlow(selectedFlowId, { email: e });
      toast(t(`${res.email} добавлен в поток`, `${res.email} assigned to flow`));
      setAssignEmail("");
      setMembers(await adminFlowMembers(selectedFlowId));
      setLeaderboard(await adminFlowLeaderboard(selectedFlowId));
      await reloadUsers(); await reloadFlows();
    } catch (err) { toast(err instanceof Error ? err.message : t("Ошибка", "Failed"), "error"); }
  };

  const onRemoveMember = async (userId: string) => {
    if (!selectedFlowId) return;
    try {
      await adminRemoveFlowMember(selectedFlowId, userId);
      toast(t("Участник удалён", "Member removed"));
      setConfirmRemove(null);
      setMembers(await adminFlowMembers(selectedFlowId));
      setLeaderboard(await adminFlowLeaderboard(selectedFlowId));
      await reloadFlows();
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const onSaveProgram = async () => {
    if (!selectedFlowId) return;
    try {
      const res = await adminSetFlowDays(selectedFlowId, selectedDayIds);
      toast(t(`Дни потока обновлены: ${res.daysAssigned}`, `Flow days updated: ${res.daysAssigned}`));
      setFlowDays(await adminFlowDays(selectedFlowId));
      setProgramDirty(false);
      await reloadFlows();
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const webinarOrdersDirty = flowWebinars.some((w) => {
    const draft = webinarOrderDraft[w.id]?.trim() ?? "";
    const saved = w.programOrder != null ? String(w.programOrder) : "";
    return draft !== saved;
  });

  function webinarStatus(w: AdminFlowWebinarRow): "upcoming" | "live" | "ended" | "no_time" {
    if (!w.startsAtIso) return "no_time";
    const start = new Date(w.startsAtIso).getTime();
    const end = start + (w.durationMinutes || 90) * 60_000;
    const now = Date.now();
    if (now < start) return "upcoming";
    if (now <= end) return "live";
    return "ended";
  }

  const onSaveWebinarOrders = async () => {
    if (!selectedFlowId) return;
    const orders: Array<{ webinarId: string; programOrder: number }> = [];
    for (const w of flowWebinars) {
      const raw = webinarOrderDraft[w.id]?.trim() ?? "";
      if (!raw) continue;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 99) orders.push({ webinarId: w.id, programOrder: n });
    }
    try {
      await adminSetFlowWebinarOrders(selectedFlowId, orders);
      toast(t("Порядок вебинаров сохранён", "Webinar order saved"));
      applyFlowWebinars(await adminFlowWebinars(selectedFlowId));
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const onGenTokens = async () => {
    if (!selectedFlow || !selectedFlowId || genCount < 1) return;
    try {
      const startIso = selectedFlow.startsAt.includes("T") ? selectedFlow.startsAt : `${selectedFlow.startsAt}T00:00:00.000Z`;
      const res = await adminGenerateTokens(genCount, startIso, selectedFlowId);
      toast(t(`${res.tokens.length} токенов создано`, `${res.tokens.length} tokens generated`));
      await reloadTokens();
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const onDeleteChat = async (msgId: string) => {
    try {
      await adminDeleteChatMessage(msgId);
      setChatMessages((prev) => prev.filter((m) => m.id !== msgId));
      setConfirmDeleteMsg(null);
      toast(t("Сообщение удалено", "Message deleted"));
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
  };

  const toggleDay = (dayId: string) => {
    setSelectedDayIds((prev) => prev.includes(dayId) ? prev.filter((x) => x !== dayId) : [...prev, dayId]);
    setProgramDirty(true);
  };

  const renderFlowForm = () => (
    <div className="admin-section-block" style={{ display: "grid", gap: 12 }}>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={`button small ${flowForm.language === "ru" ? "primary" : "secondary"}`} onClick={() => setFlowForm((p) => ({ ...p, language: "ru" }))}>RU</button>
          <button type="button" className={`button small ${flowForm.language === "en" ? "primary" : "secondary"}`} onClick={() => setFlowForm((p) => ({ ...p, language: "en" }))}>EN</button>
        </div>
        <input className="input" value={flowForm.code} onChange={(e) => setFlowForm((p) => ({ ...p, code: e.target.value }))} placeholder={t("Код потока (напр. FLOW-1)", "Flow code (e.g. FLOW-1)")} />
        <input className="input" value={flowForm.title} onChange={(e) => setFlowForm((p) => ({ ...p, title: e.target.value }))} placeholder={t("Название", "Title")} />
        <input className="input" value={flowForm.description} onChange={(e) => setFlowForm((p) => ({ ...p, description: e.target.value }))} placeholder={t("Описание (необязательно)", "Description (optional)")} />
        <div className="row" style={{ gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">{t("Старт", "Start")}</label>
            <input className="input" type="datetime-local" value={flowForm.startsAtIso} onChange={(e) => {
              const end = new Date(new Date(e.target.value).getTime() + 14 * 86400000);
              const endStr = isNaN(end.getTime()) ? "" : end.toISOString().slice(0, 16);
              setFlowForm((p) => ({ ...p, startsAtIso: e.target.value, endsAtIso: endStr }));
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">{t("Конец", "End")}</label>
            <input className="input" type="datetime-local" value={flowForm.endsAtIso} onChange={(e) => setFlowForm((p) => ({ ...p, endsAtIso: e.target.value }))} />
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={`button small ${flowForm.isActive ? "primary" : "secondary"}`} onClick={() => setFlowForm((p) => ({ ...p, isActive: true }))}>{t("Активен", "Active")}</button>
          <button type="button" className={`button small ${!flowForm.isActive ? "primary" : "secondary"}`} onClick={() => setFlowForm((p) => ({ ...p, isActive: false }))}>{t("Неактивен", "Inactive")}</button>
        </div>
        {!flowForm.flowId && (
          <div>
            <label className="form-label">{t("Лицензионные токены (0 = нет)", "License tokens (0 = none)")}</label>
            <input className="input" type="number" value={flowForm.tokenCount} onChange={(e) => setFlowForm((p) => ({ ...p, tokenCount: Number(e.target.value) || 0 }))} />
          </div>
        )}
    </div>
  );

  const renderDuplicateForm = () => (
    <div className="admin-section-block" style={{ display: "grid", gap: 12 }}>
      <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Копирует дни программы. Участники НЕ копируются.", "Copies program days. Members are NOT copied.")}</p>
        <input className="input" value={dupForm.code} onChange={(e) => setDupForm((p) => ({ ...p, code: e.target.value }))} placeholder={t("Код нового потока", "New flow code")} />
        <input className="input" value={dupForm.title} onChange={(e) => setDupForm((p) => ({ ...p, title: e.target.value }))} placeholder={t("Название", "Title")} />
        <div className="row" style={{ gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">{t("Старт", "Start")}</label>
            <input className="input" type="datetime-local" value={dupForm.startsAtIso} onChange={(e) => {
              const end = new Date(new Date(e.target.value).getTime() + 14 * 86400000);
              const endStr = isNaN(end.getTime()) ? "" : end.toISOString().slice(0, 16);
              setDupForm((p) => ({ ...p, startsAtIso: e.target.value, endsAtIso: endStr }));
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="form-label">{t("Конец", "End")}</label>
            <input className="input" type="datetime-local" value={dupForm.endsAtIso} onChange={(e) => setDupForm((p) => ({ ...p, endsAtIso: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="form-label">{t("Токены для нового потока", "Tokens for new flow")}</label>
          <input className="input" type="number" value={dupForm.tokenCount} onChange={(e) => setDupForm((p) => ({ ...p, tokenCount: Number(e.target.value) || 0 }))} />
        </div>
    </div>
  );

  const renderOverview = () => {
    if (!selectedFlow) return null;
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div className="admin-section">
          <div className="admin-section-header">
            <div>
              <h2 className="admin-section-title" style={{ margin: 0 }}>{selectedFlow.code}</h2>
              <p className="muted text-body-sm" style={{ margin: 0 }}>{flowTitle(selectedFlow)}</p>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="button secondary small" onClick={startEdit}>{t("Редактировать", "Edit")}</button>
              <button type="button" className="button secondary small" onClick={startDuplicate}>{t("Дублировать", "Duplicate")}</button>
            </div>
          </div>
          {selectedFlow.language === "ru" && selectedFlow.descriptionRu && <p className="text-body-sm" style={{ margin: 0 }}>{selectedFlow.descriptionRu}</p>}
          {selectedFlow.language === "en" && selectedFlow.descriptionEn && <p className="text-body-sm" style={{ margin: 0 }}>{selectedFlow.descriptionEn}</p>}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Badge tone={selectedFlow.isActive ? "success" : "neutral"}>{selectedFlow.isActive ? t("Активен", "Active") : t("Неактивен", "Inactive")}</Badge>
            <Badge tone="neutral">{selectedFlow.language.toUpperCase()}</Badge>
            <Badge tone="neutral">{new Date(selectedFlow.startsAt).toLocaleDateString()} — {new Date(selectedFlow.endsAt).toLocaleDateString()}</Badge>
            <Badge tone="neutral">TZ: {selectedFlow.timezone}</Badge>
          </div>
          <div className="kpi-grid">
            <article className="kpi"><p className="kpi-label">{t("УЧАСТНИКИ", "MEMBERS")}</p><p className="kpi-value">{selectedFlow.membersCount}</p></article>
            <article className="kpi"><p className="kpi-label">{t("ДНИ", "DAYS")}</p><p className="kpi-value">{selectedFlow.daysCount}</p></article>
            <article className="kpi"><p className="kpi-label">{t("ТОКЕНЫ", "TOKENS")}</p><p className="kpi-value">{flowTokensUsed}/{flowTokens.length}</p></article>
          </div>
        </div>
      </div>
    );
  };

  const renderMembers = () => {
    if (!selectedFlow) return null;
    return (
      <div style={{ display: "grid", gap: 16 }}>
        {leaderboard.length > 0 && (
          <div className="admin-section">
            <h3 className="admin-section-title">{t("Таблица лидеров", "Leaderboard")}</h3>
            <div className="entity-list" style={{ maxHeight: 260, overflowY: "auto" }}>
              {leaderboard.map((entry, idx) => (
                <div key={entry.userId} className="entity-item compact" style={{ padding: "8px 12px" }}>
                  <div className="row between">
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, minWidth: 28, color: idx < 3 ? "var(--accent)" : "var(--text-muted)" }}>#{idx + 1}</span>
                      <span style={{ fontWeight: 600 }}>{`${entry.firstName} ${entry.lastName}`.trim() || entry.email}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <Badge tone={entry.progressPercent >= 80 ? "success" : entry.progressPercent >= 40 ? "warning" : "neutral"}>{entry.progressPercent}%</Badge>
                      <Badge tone="neutral">L: {entry.completedLessons}/{entry.totalLessons}</Badge>
                      <Badge tone="neutral">{t("ДЗ", "HW")}: {entry.approvedHomework}/{entry.totalHomework}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="admin-section">
          <div className="admin-section-header">
            <h3 className="admin-section-title">{t("Участники", "Members")} ({members.length})</h3>
            <button type="button" className="button small secondary" onClick={() => setShowUnassigned(!showUnassigned)}>
              {showUnassigned ? t("Скрыть неназначенных", "Hide unassigned") : `${t("Показать неназначенных", "Show unassigned")} (${unassignedUsers.length})`}
            </button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} placeholder={t("Добавить по email...", "Add by email...")} type="email" style={{ flex: 1 }} />
            <button type="button" className="button small primary" onClick={() => void onAssign()} disabled={!assignEmail.includes("@")}>{t("Добавить", "Add")}</button>
          </div>
          <input className="input" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder={t("Поиск участников...", "Search members...")} />
          {filteredMembers.length === 0 ? (
            <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Участники не найдены.", "No members found.")}</p>
          ) : (
            <div className="entity-list" style={{ maxHeight: 400, overflowY: "auto" }}>
              {filteredMembers.map((m) => {
                const u = allUsers.find((x) => x.id === m.userId);
                const name = u ? `${u.firstName} ${u.lastName}`.trim() : "";
                const lb = leaderboard.find((e) => e.userId === m.userId);
                return (
                  <div key={m.id} className="entity-item" style={{ padding: "10px 12px" }}>
                    <div className="row between">
                      <div>
                        <p className="entity-title" style={{ fontWeight: 600, margin: 0 }}>{name || m.email}</p>
                        {name && <p className="muted entity-subtitle" style={{ margin: 0 }}>{m.email}</p>}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <Badge tone={lb && lb.progressPercent >= 80 ? "success" : lb && lb.progressPercent >= 40 ? "warning" : "neutral"}>
                          {lb ? `${lb.progressPercent}%` : "0%"}
                        </Badge>
                        <Badge tone={m.isActive ? "success" : "neutral"}>{m.isActive ? t("активен", "active") : t("выкл.", "off")}</Badge>
                        <button type="button" className="icon-action danger" title={t("Удалить", "Remove")} aria-label="Remove member" onClick={() => setConfirmRemove({ userId: m.userId, name: name || m.email })}>&times;</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {showUnassigned && (
          <div className="admin-section">
            <h3 className="admin-section-title">{t("Не в этом потоке", "Not in this flow")} ({unassignedUsers.length})</h3>
            {filteredUnassigned.length === 0 ? (
              <p className="muted text-body-sm" style={{ margin: 0 }}>
                {unassignedUsers.length === 0 ? t("Все студенты уже в этом потоке.", "All students are already in this flow.") : t("Нет совпадений.", "No matches.")}
              </p>
            ) : (
              <div className="entity-list" style={{ maxHeight: 350, overflowY: "auto" }}>
                {filteredUnassigned.map((u) => (
                  <div key={u.id} className="entity-item" style={{ padding: "8px 12px" }}>
                    <div className="row between">
                      <div>
                        <p className="entity-title" style={{ fontWeight: 600, margin: 0 }}>{`${u.firstName} ${u.lastName}`.trim() || u.email}</p>
                        <p className="muted entity-subtitle" style={{ margin: 0 }}>{u.email}</p>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        {u.selectedTrack && <Badge tone="primary">{u.selectedTrack}</Badge>}
                        <button type="button" className="button small primary" onClick={() => void onAssign(u.email)}>{t("Добавить", "Add")}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <ConfirmDialog
          open={!!confirmRemove}
          title={t("Удалить участника", "Remove member")}
          description={t(`Удалить ${confirmRemove?.name ?? ""} из этого потока?`, `Remove ${confirmRemove?.name ?? ""} from this flow?`)}
          confirmLabel={t("Удалить", "Remove")}
          cancelLabel={t("Отмена", "Cancel")}
          tone="danger"
          onConfirm={() => confirmRemove && void onRemoveMember(confirmRemove.userId)}
          onCancel={() => setConfirmRemove(null)}
        />
      </div>
    );
  };

  const KINESCOPE_PATH_SKIP = new Set(["embed", "live", "detail", "chat", "watch", "player", "app"]);
  const extractKinescopeId = (input: string): string => {
    const trimmed = input.trim();
    // Handle full Kinescope URLs: extract path after domain, skip known non-ID segments
    const urlMatch = trimmed.match(/kinescope\.[a-z]+\/(.+?)(?:[?#]|$)/i);
    if (urlMatch) {
      const segments = urlMatch[1]!.split("/").filter(Boolean);
      const id = segments.find((s) => !KINESCOPE_PATH_SKIP.has(s.toLowerCase()));
      if (id) return id;
    }
    return trimmed;
  };

  const onLoadKinescopePreview = async () => {
    const videoId = extractKinescopeId(webinarForm.kinescopeInput);
    if (!videoId) return;
    setKinescopeLoading(true);
    setKinescopePreview(null);
    try {
      const meta = await adminVideoStatus(videoId);
      if (meta.kinescopeApiUnavailable) {
        toast(
          t(
            "API Kinescope не вернул данные (часто у прямого эфира). Заполните название и обложку вручную — ID для плеера сохранится.",
            "Kinescope API has no metadata yet (common for live streams). Fill title and thumbnail manually — the ID will still work in the player.",
          ),
          "info",
        );
        setKinescopePreview({ title: videoId, thumbnailUrl: null });
      } else {
        setKinescopePreview({ title: meta.title, thumbnailUrl: meta.thumbnail_url, ksStatus: meta.status });
        setWebinarForm((prev) => ({
          ...prev,
          titleRu: prev.titleRu || meta.title,
          titleEn: prev.titleEn || meta.title,
          thumbnailUrl: prev.thumbnailUrl || meta.thumbnail_url || "",
        }));
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Не удалось загрузить данные Kinescope", "Failed to load Kinescope data"), "error");
    } finally {
      setKinescopeLoading(false);
    }
  };

  const onWebinarThumbFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setThumbUploading(true);
    try {
      const { thumbnailUrl } = await adminUploadWebinarThumbnail(file);
      setWebinarForm((p) => ({ ...p, thumbnailUrl }));
      toast(t("Обложка загружена", "Thumbnail uploaded"));
    } catch (err) {
      toast(err instanceof Error ? err.message : t("Ошибка загрузки", "Upload failed"), "error");
    } finally {
      setThumbUploading(false);
    }
  };

  const onSaveWebinar = async () => {
    if (!selectedFlowId) return;
    setWebinarSaving(true);
    try {
      const kid = webinarForm.kinescopeInput.trim() ? extractKinescopeId(webinarForm.kinescopeInput) : undefined;
      // Pass the raw datetime-local string as-is (it's already in the admin's local time).
      // Converting via new Date().toISOString() would shift it to UTC, saving the wrong time.
      const rawAt = webinarForm.startsAtIso;
      const startsAt = rawAt
        ? rawAt.length === 16 ? `${rawAt}:00` : rawAt
        : undefined;
      const res = await adminCreateFlowWebinar(selectedFlowId, {
        ...(kid ? { kinescopeVideoId: kid } : {}),
        titleRu: webinarForm.titleRu,
        titleEn: webinarForm.titleEn,
        summaryRu: webinarForm.summaryRu,
        summaryEn: webinarForm.summaryEn,
        ...(startsAt ? { startsAtIso: startsAt } : {}),
        durationMinutes: webinarForm.durationMinutes,
        joinUrl: webinarForm.joinUrl,
        thumbnailUrl: webinarForm.thumbnailUrl,
      });
      // If backend auto-created a Kinescope live event, show RTMP credentials immediately
      if (res.rtmpUrl && res.webinarId) {
        setStreamInfo({
          webinarId: res.webinarId,
          rtmpUrl: res.rtmpUrl,
          streamKey: res.streamKey ?? null,
          eventStatus: null,
          noEventId: !res.kinescopeEventId,
          loading: false,
          ...(res.kinescopeEventId ? { kinescopeEventId: res.kinescopeEventId } : {}),
        });
      }
      toast(t("Вебинар добавлен", "Webinar added"));
      setShowWebinarForm(false);
      setWebinarForm(emptyWebinarForm());
      setKinescopePreview(null);
      applyFlowWebinars(await adminFlowWebinars(selectedFlowId).catch(() => []));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    } finally {
      setWebinarSaving(false);
    }
  };

  const onDeleteFlowWebinar = async (webinarId: string) => {
    if (!selectedFlowId) return;
    try {
      await adminDeleteFlowWebinar(selectedFlowId, webinarId);
      toast(t("Вебинар удалён из потока", "Webinar removed from flow"));
      applyFlowWebinars(await adminFlowWebinars(selectedFlowId).catch(() => []));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    }
  };

  const onStartWebinar = async (webinarId: string) => {
    setWebinarActionLoading(webinarId);
    try {
      await adminStartWebinar(webinarId);
      toast(t("Эфир запущен в Kinescope", "Stream started in Kinescope"));
      applyFlowWebinars(await adminFlowWebinars(selectedFlowId!).catch(() => []));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Не удалось запустить эфир", "Failed to start stream"), "error");
    } finally {
      setWebinarActionLoading(null);
    }
  };

  const onFinishWebinar = async (webinarId: string) => {
    setWebinarActionLoading(webinarId);
    try {
      await adminFinishWebinar(webinarId);
      toast(t("Эфир завершён", "Stream finished"));
      applyFlowWebinars(await adminFlowWebinars(selectedFlowId!).catch(() => []));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Не удалось завершить эфир", "Failed to finish stream"), "error");
    } finally {
      setWebinarActionLoading(null);
    }
  };

  const onShowStreamInfo = async (webinarId: string) => {
    if (streamInfo?.webinarId === webinarId) {
      setStreamInfo(null);
      return;
    }
    setStreamInfo({ webinarId, rtmpUrl: "", streamKey: null, eventStatus: null, noEventId: false, loading: true });
    setEventIdInput("");
    try {
      const info = await adminWebinarStreamInfo(webinarId);
      setStreamInfo({ ...info, webinarId, loading: false });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Не удалось загрузить RTMP", "Failed to load RTMP info"), "error");
      setStreamInfo(null);
    }
  };

  const onCreateWebinarEvent = async (webinarId: string) => {
    setWebinarActionLoading(webinarId + "-create");
    try {
      const info = await adminCreateWebinarEvent(webinarId);
      setStreamInfo({ ...info, webinarId, noEventId: false, loading: false });
      toast(
        t(
          "Эфир создан. Скопируйте ключ в RTMP, затем нажмите «▶ Запустить» — так участники увидят эфир на дашборде.",
          "Event created. Copy the RTMP key, then click «▶ Start» so learners see the stream on the dashboard.",
        ),
      );
      applyFlowWebinars(await adminFlowWebinars(selectedFlowId!).catch(() => []));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Не удалось создать эфир", "Failed to create live event"), "error");
    } finally {
      setWebinarActionLoading(null);
    }
  };

  const onSetEventId = async (webinarId: string) => {
    const eid = eventIdInput.trim();
    if (!eid) return;
    setWebinarActionLoading(webinarId + "-seteid");
    try {
      const info = await adminSetWebinarEventId(webinarId, eid);
      setStreamInfo({ ...info, webinarId, noEventId: false, loading: false });
      toast(t("Event ID привязан. Ключ загружен.", "Event ID linked. Stream key loaded."));
      setEventIdInput("");
      applyFlowWebinars(await adminFlowWebinars(selectedFlowId!).catch(() => []));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка привязки Event ID", "Failed to link Event ID"), "error");
    } finally {
      setWebinarActionLoading(null);
    }
  };

  const onOpenLinkExisting = async () => {
    setShowLinkExisting((v) => !v);
    if (!showLinkExisting && allWebinars.length === 0) {
      setAllWebinarsLoading(true);
      try {
        setAllWebinars(await adminListAllWebinars());
      } catch { /* */ } finally {
        setAllWebinarsLoading(false);
      }
    }
  };

  const onLinkExistingWebinar = async (webinarId: string) => {
    if (!selectedFlowId) return;
    setLinkSaving(true);
    try {
      await adminLinkFlowWebinar(selectedFlowId, webinarId);
      toast(t("Вебинар добавлен в поток", "Webinar linked to flow"));
      setShowLinkExisting(false);
      setLinkSearch("");
      applyFlowWebinars(await adminFlowWebinars(selectedFlowId).catch(() => []));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error");
    } finally {
      setLinkSaving(false);
    }
  };

  const renderProgram = () => {
    if (!selectedFlow) return null;
    const assignedSet = new Set(selectedDayIds);
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div className="admin-section">
          <div className="admin-section-header">
            <h3 className="admin-section-title">{t("Состав программы", "Program composition")}</h3>
            <button type="button" className="button small primary" onClick={() => void onSaveProgram()} disabled={!programDirty}>
              {programDirty ? t("Сохранить состав", "Save composition") : t("Сохранено", "Saved")}
            </button>
          </div>
          <p className="muted text-body-sm" style={{ margin: 0 }}>
            {t(`Включите/выключите дни для этого потока. Выбрано: ${selectedDayIds.length} дн.`,
              `Toggle curriculum days for this flow. Currently ${selectedDayIds.length} day${selectedDayIds.length !== 1 ? "s" : ""} selected.`)}
          </p>
          <div className="chip-grid">
            {allDays.map((d) => {
              const label = `D${d.dayNumber}${d.track ? `-${d.track}` : ""}`;
              const selected = assignedSet.has(d.id);
              return (
                <button key={d.id} type="button" className={`button small ${selected ? "primary" : "secondary"}`} onClick={() => toggleDay(d.id)}>{label}</button>
              );
            })}
          </div>
        </div>
        <div className="admin-section">
          <h3 className="admin-section-title">{t("Назначенные дни", "Assigned days")} ({flowDays.length})</h3>
          {flowDays.length === 0 ? (
            <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Дни ещё не назначены.", "No days assigned yet.")}</p>
          ) : (
            <div className="entity-list">
              {flowDays.map((d) => (
                <div key={d.curriculumDayId} className="entity-item compact" style={{ padding: "8px 12px" }}>
                  <div className="row between">
                    <span style={{ fontWeight: 600 }}>{t("День", "Day")} {d.dayNumber}{d.track ? ` (${d.track})` : ""}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <Badge tone="neutral">{d.phase}</Badge>
                      <span className="muted" style={{ fontSize: 12 }}>{t("смещение", "offset")} {d.unlockOffsetMinutes}{t("м", "m")}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderWebinar = () => {
    if (!selectedFlow) return null;
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div className="admin-section">
          <div className="admin-section-header">
            <h3 className="admin-section-title">{t("Вебинары потока", "Flow webinars")} ({flowWebinars.filter((w) => w.webinarStatus !== "completed").length})</h3>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="button small primary" onClick={() => void onSaveWebinarOrders()} disabled={!webinarOrdersDirty}>
                {webinarOrdersDirty ? t("Сохранить порядок", "Save order") : t("Сохранено", "Saved")}
              </button>
              <button type="button" className="button small secondary" onClick={() => void onOpenLinkExisting()}>
                {showLinkExisting ? t("Отмена", "Cancel") : t("Добавить из библиотеки", "Link existing")}
              </button>
              <button type="button" className="button small secondary" onClick={() => { setShowWebinarForm((v) => !v); if (showWebinarForm) { setWebinarForm(emptyWebinarForm()); setKinescopePreview(null); } }}>
                {showWebinarForm ? t("Отмена", "Cancel") : t("+ Новый вебинар", "+ New webinar")}
              </button>
            </div>
          </div>

          {/* Link existing webinar picker */}
          {showLinkExisting && (
            <div style={{ background: "var(--surface-muted)", borderRadius: 8, padding: 14, margin: "8px 0", display: "grid", gap: 10 }}>
              <p className="text-body-sm" style={{ fontWeight: 600, margin: 0 }}>{t("Добавить вебинар из библиотеки", "Link existing webinar")}</p>
              <p className="muted text-body-sm" style={{ margin: 0 }}>
                {t(
                  "Выберите существующий вебинар, чтобы добавить его в этот поток. Один вебинар может быть одновременно в нескольких потоках.",
                  "Select an existing webinar to add it to this flow. A webinar can belong to multiple flows.",
                )}
              </p>
              <input
                className="input"
                placeholder={t("Поиск по названию...", "Search by title...")}
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
              />
              {allWebinarsLoading ? (
                <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Загрузка...", "Loading...")}</p>
              ) : (
                <div style={{ display: "grid", gap: 4, maxHeight: 280, overflowY: "auto" }}>
                  {allWebinars
                    .filter((w) => {
                      const q = linkSearch.toLowerCase();
                      if (!q) return true;
                      return (w.titleRu || w.titleEn || w.id).toLowerCase().includes(q);
                    })
                    .map((w) => {
                      const alreadyInFlow = flowWebinars.some((fw) => fw.id === w.id);
                      return (
                        <div key={w.id} className="entity-item compact" style={{ padding: "8px 10px", opacity: alreadyInFlow ? 0.5 : 1 }}>
                          <div className="row between" style={{ alignItems: "center", gap: 10 }}>
                            <div className="row" style={{ gap: 8, flex: 1, minWidth: 0, alignItems: "center" }}>
                              {w.thumbnailUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={absMediaUrl(w.thumbnailUrl)} alt="" style={{ width: 40, height: 23, objectFit: "cover", borderRadius: 2, flexShrink: 0 }} />
                              )}
                              <div style={{ minWidth: 0 }}>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{w.titleRu || w.titleEn || w.id}</p>
                                <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                                  {w.startsAtIso ? new Date(w.startsAtIso).toLocaleString() : t("Нет времени", "No date")}
                                  {` · ${t(`в ${w.flowCount} потоке(ах)`, `in ${w.flowCount} flow(s)`)}`}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="button small primary"
                              disabled={alreadyInFlow || linkSaving}
                              onClick={() => void onLinkExistingWebinar(w.id)}
                            >
                              {alreadyInFlow ? t("Уже в потоке", "In flow") : t("Добавить", "Add")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  {allWebinars.length === 0 && !allWebinarsLoading && (
                    <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Вебинаров в библиотеке нет — создайте новый.", "No webinars in library yet — create one first.")}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {showWebinarForm && (
            <div style={{ background: "var(--surface-muted)", borderRadius: 8, padding: 16, margin: "8px 0", display: "grid", gap: 12 }}>
              <p className="text-body-sm" style={{ fontWeight: 600, margin: 0 }}>{t("Новый вебинар", "New webinar")}</p>

              {/* Kinescope ID / URL — for embedded player on the platform */}
              <div className="form-field">
                <label className="form-label">{t("Плеер Kinescope (ID или ссылка на видео/эфир)", "Kinescope player (video/live ID or share URL)")}</label>
                <p className="muted text-body-sm" style={{ margin: "0 0 8px" }}>
                  {t(
                    "Нужен для встроенного плеера на сайте у ученика. Это не ссылка «куда зайти в Zoom» — только ID/URL страницы Kinescope (запись или эфир). Для прямого эфира кнопка «Загрузить» может ничего не подтянуть — это нормально.",
                    "Used for the embedded Kinescope player for students. Not your Zoom link — only the Kinescope video/live page ID or URL. For live events, “Fetch” may return nothing until the API has metadata — that is OK.",
                  )}
                </p>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="https://kinescope.io/... или ID"
                    value={webinarForm.kinescopeInput}
                    onChange={(e) => { setWebinarForm((p) => ({ ...p, kinescopeInput: e.target.value })); setKinescopePreview(null); }}
                  />
                  <button type="button" className="button small secondary" onClick={() => void onLoadKinescopePreview()} disabled={kinescopeLoading || !webinarForm.kinescopeInput.trim()}>
                    {kinescopeLoading ? t("Загрузка...", "Loading...") : t("Загрузить из API", "Fetch from API")}
                  </button>
                </div>
                {kinescopePreview && (
                  <div className="row" style={{ gap: 10, marginTop: 8, alignItems: "center" }}>
                    {kinescopePreview.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={absMediaUrl(kinescopePreview.thumbnailUrl)} alt="" style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                    )}
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{kinescopePreview.title}</p>
                      <p className="muted" style={{ margin: 0, fontSize: 11 }}>{extractKinescopeId(webinarForm.kinescopeInput)}</p>
                      {kinescopePreview.ksStatus && (
                        <span style={{ marginTop: 4, display: "block" }}>
                          <Badge tone={kinescopePreview.ksStatus === "live" ? "success" : kinescopePreview.ksStatus === "waiting" ? "warning" : "neutral"}>
                            {kinescopePreview.ksStatus}
                          </Badge>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Thumbnail: file or URL */}
              <div className="form-field">
                <label className="form-label">{t("Обложка для карточки", "Card thumbnail")}</label>
                <p className="muted text-body-sm" style={{ margin: "0 0 8px" }}>
                  {t("Загрузите файл (JPG/PNG/WebP до 5 МБ) или вставьте URL картинки.", "Upload an image (JPG/PNG/WebP, max 5 MB) or paste an image URL.")}
                </p>
                <input ref={thumbFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={(e) => void onWebinarThumbFile(e)} />
                <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" className="button small secondary" disabled={thumbUploading} onClick={() => thumbFileRef.current?.click()}>
                    {thumbUploading ? t("Загрузка...", "Uploading...") : t("Выбрать файл", "Choose file")}
                  </button>
                  <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="https://... (опционально)" value={webinarForm.thumbnailUrl} onChange={(e) => setWebinarForm((p) => ({ ...p, thumbnailUrl: e.target.value }))} />
                </div>
                {webinarForm.thumbnailUrl ? (
                  <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={absMediaUrl(webinarForm.thumbnailUrl)} alt="" style={{ maxWidth: 120, maxHeight: 68, objectFit: "cover", borderRadius: 4 }} />
                  </div>
                ) : null}
              </div>

              {/* Title bilingual */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="form-field">
                  <label className="form-label">Title RU</label>
                  <input className="input" placeholder={t("Название (RU)", "Title (RU)")} value={webinarForm.titleRu} onChange={(e) => setWebinarForm((p) => ({ ...p, titleRu: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label className="form-label">Title EN</label>
                  <input className="input" placeholder="Title (EN)" value={webinarForm.titleEn} onChange={(e) => setWebinarForm((p) => ({ ...p, titleEn: e.target.value }))} />
                </div>
              </div>

              {/* Summary bilingual */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="form-field">
                  <label className="form-label">{t("О чём эфир (RU)", "Summary (RU)")}</label>
                  <textarea className="input" rows={3} style={{ resize: "vertical" }} placeholder={t("Кратко для студентов (RU)", "Short description (RU)")} value={webinarForm.summaryRu} onChange={(e) => setWebinarForm((p) => ({ ...p, summaryRu: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label className="form-label">{t("О чём эфир (EN)", "Summary (EN)")}</label>
                  <textarea className="input" rows={3} style={{ resize: "vertical" }} placeholder="Short description (EN)" value={webinarForm.summaryEn} onChange={(e) => setWebinarForm((p) => ({ ...p, summaryEn: e.target.value }))} />
                </div>
              </div>

              {/* Date, duration */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
                <div className="form-field">
                  <label className="form-label">{t("Дата и время начала", "Start date & time")}</label>
                  <input className="input" type="datetime-local" value={webinarForm.startsAtIso} onChange={(e) => setWebinarForm((p) => ({ ...p, startsAtIso: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label className="form-label">{t("Длит. (мин)", "Duration (min)")}</label>
                  <input className="input" type="number" min={15} max={600} value={webinarForm.durationMinutes} onChange={(e) => setWebinarForm((p) => ({ ...p, durationMinutes: Number(e.target.value) || 90 }))} />
                </div>
              </div>

              <div className="form-field">
                <label className="form-label">{t("Внешняя ссылка на эфир (Zoom, студия и т.п.)", "External live link (Zoom, studio, etc.)")}</label>
                <p className="muted text-body-sm" style={{ margin: "0 0 8px" }}>
                  {t(
                    "Опционально. Если плеер Kinescope ещё не готов или ведёте эфир в другом сервисе — студент увидит кнопку «Войти в эфир» по этой ссылке. Поле «Плеер Kinescope» и это — разные вещи.",
                    "Optional. If the Kinescope embed is not ready or you broadcast elsewhere, students get a “Join live” button to this URL. This is separate from the Kinescope player field above.",
                  )}
                </p>
                <input className="input" placeholder="https://zoom.us/... или https://..." value={webinarForm.joinUrl} onChange={(e) => setWebinarForm((p) => ({ ...p, joinUrl: e.target.value }))} />
              </div>

              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="button primary small" onClick={() => void onSaveWebinar()} disabled={webinarSaving || (!webinarForm.kinescopeInput.trim() && !webinarForm.titleRu && !webinarForm.titleEn)}>
                  {webinarSaving ? t("Сохранение...", "Saving...") : t("Добавить в поток", "Add to flow")}
                </button>
                <button type="button" className="button ghost small" onClick={() => { setShowWebinarForm(false); setWebinarForm(emptyWebinarForm()); setKinescopePreview(null); }}>
                  {t("Отмена", "Cancel")}
                </button>
              </div>
            </div>
          )}

          <p className="muted text-body-sm" style={{ margin: "8px 0 0" }}>
            {t(
              "Номер 1 — первый эфир для акцента на дашборде (модалка при открытии дашборда до конца эфира). Оставьте поле пустым, если вебинар не в фиксированной очереди.",
              "Order 1 is the first live spotlight on the dashboard (shown as soon as students open it, any time before the webinar ends). Leave empty if the webinar is not in a fixed sequence.",
            )}
          </p>

          {/* Active / upcoming webinars list */}
          {(() => {
            const active = flowWebinars.filter((w) => w.webinarStatus !== "completed");
            const completed = flowWebinars.filter((w) => w.webinarStatus === "completed");

            const rtmpPanel = (w: AdminFlowWebinarRow) => {
              if (!streamInfo || streamInfo.webinarId !== w.id) return null;
              const si = streamInfo;
              const rtmpFull = (si.rtmpUrl || "rtmp://rtmp.kinescope.io/live") + (si.streamKey ? `/${si.streamKey}` : "");
              return (
                <div style={{ background: "#1a1f2e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "14px 14px", marginTop: 8, color: "#fff" }}>
                  {/* Header */}
                  <div className="row between" style={{ alignItems: "center", marginBottom: 10 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
                      {t("Данные для стриминга", "Streaming credentials")}
                      {si.eventStatus && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: si.eventStatus === "live" ? "#4ade80" : "rgba(255,255,255,0.45)" }}>
                          ({si.eventStatus})
                        </span>
                      )}
                    </p>
                    <button type="button" className="icon-action" style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, lineHeight: 1 }} onClick={() => setStreamInfo(null)}>×</button>
                  </div>

                  {si.loading ? (
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{t("Загрузка...", "Loading...")}</p>
                  ) : si.noEventId ? (
                    /* ── No Kinescope event ID ── show create + manual options */
                    <div style={{ display: "grid", gap: 12 }}>
                      <div style={{ background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.2)", borderRadius: 6, padding: "10px 12px" }}>
                        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>
                          {t("Эфир в Kinescope не создан", "No Kinescope live event yet")}
                        </p>
                        <p style={{ margin: "0 0 10px", fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
                          {t(
                            "Нажмите «Создать эфир» — система автоматически создаст трансляцию в Kinescope и вернёт ключ потока.",
                            "Click «Create live event» — the system will provision a broadcast in Kinescope and return the stream key."
                          )}
                        </p>
                        <button
                          type="button"
                          className="button small primary"
                          disabled={webinarActionLoading === w.id + "-create"}
                          onClick={() => void onCreateWebinarEvent(w.id)}
                          style={{ width: "100%", justifyContent: "center" }}
                        >
                          {webinarActionLoading === w.id + "-create"
                            ? t("Создаём в Kinescope...", "Creating in Kinescope...")
                            : t("✦ Создать эфир в Kinescope", "✦ Create live event in Kinescope")}
                        </button>
                      </div>

                      {/* Divider */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{t("или привязать существующий", "or link existing event")}</span>
                        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
                      </div>

                      {/* Manual event UUID input */}
                      <div>
                        <p style={{ margin: "0 0 4px", fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Kinescope Event UUID
                        </p>
                        <p style={{ margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
                          {t(
                            "Из URL дашборда Kinescope: app.kinescope.io/live/detail/«UUID»/settings",
                            "From Kinescope dashboard URL: app.kinescope.io/live/detail/«UUID»/settings"
                          )}
                        </p>
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                          <input
                            type="text"
                            className="input small"
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            value={eventIdInput}
                            onChange={(e) => setEventIdInput(e.target.value)}
                            style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
                          />
                          <button
                            type="button"
                            className="button small secondary"
                            disabled={!eventIdInput.trim() || webinarActionLoading === w.id + "-seteid"}
                            onClick={() => void onSetEventId(w.id)}
                            style={{ flexShrink: 0 }}
                          >
                            {webinarActionLoading === w.id + "-seteid" ? "..." : t("Привязать", "Link")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Has Kinescope event — show credentials ── */
                    <div style={{ display: "grid", gap: 10 }}>
                      {/* RTMP URL */}
                      <div>
                        <p style={{ margin: "0 0 3px", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>RTMP URL</p>
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                          <code style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 4, flex: 1, wordBreak: "break-all" }}>
                            {si.rtmpUrl || "rtmp://rtmp.kinescope.io/live"}
                          </code>
                          <button type="button" className="button ghost small" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.2)", flexShrink: 0, fontSize: 11 }}
                            onClick={() => { void navigator.clipboard.writeText(si.rtmpUrl || "rtmp://rtmp.kinescope.io/live"); toast(t("Скопировано", "Copied")); }}>
                            {t("Копировать", "Copy")}
                          </button>
                        </div>
                      </div>

                      {/* Stream Key */}
                      {si.streamKey ? (
                        <div>
                          <p style={{ margin: "0 0 3px", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {t("Ключ потока (Stream Key)", "Stream Key")}
                          </p>
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <code style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 4, flex: 1, wordBreak: "break-all" }}>
                              {si.streamKey}
                            </code>
                            <button type="button" className="button ghost small" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.2)", flexShrink: 0, fontSize: 11 }}
                              onClick={() => { void navigator.clipboard.writeText(si.streamKey ?? ""); toast(t("Скопировано", "Copied")); }}>
                              {t("Копировать", "Copy")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,180,0,0.8)" }}>
                          {t(
                            "Ключ потока не пришёл в ответе API. Обновите блок (закройте/откройте), проверьте логи бэкенда или страницу трансляции в кабинете Kinescope. Токен при этом может быть рабочим.",
                            "No stream key in API response. Toggle this panel, check backend logs or the broadcast page in Kinescope. The API token may still be valid.",
                          )}
                        </p>
                      )}

                      {/* Combined RTMP link for apps like OBS / Larix */}
                      {si.streamKey && (
                        <div>
                          <p style={{ margin: "0 0 3px", fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {t("Полная ссылка (OBS / Larix)", "Full URL (OBS / Larix)")}
                          </p>
                          <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <code style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 4, flex: 1, wordBreak: "break-all" }}>
                              {rtmpFull}
                            </code>
                            <button type="button" className="button ghost small" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.2)", flexShrink: 0, fontSize: 11 }}
                              onClick={() => { void navigator.clipboard.writeText(rtmpFull); toast(t("Скопировано", "Copied")); }}>
                              {t("Копировать", "Copy")}
                            </button>
                          </div>
                        </div>
                      )}

                      {!w.webinarStatus ? (
                        <p style={{ margin: 0, fontSize: 11, color: "rgba(255,200,120,0.85)", lineHeight: 1.45 }}>
                          {t(
                            "После настройки OBS нажмите «▶ Запустить» в строке вебинара — иначе на дашборде учеников не будет статуса «эфир идёт».",
                            "After OBS is sending, click «▶ Start» on the webinar row — otherwise learners will not see «live» on the dashboard.",
                          )}
                        </p>
                      ) : null}

                      <button type="button" className="button ghost small" style={{ color: "rgba(255,255,255,0.45)", borderColor: "rgba(255,255,255,0.1)", fontSize: 11, alignSelf: "flex-start" }}
                        onClick={() => void onShowStreamInfo(w.id)}>
                        {t("Обновить", "Refresh")}
                      </button>
                    </div>
                  )}
                </div>
              );
            };

            const renderRow = (w: AdminFlowWebinarRow, isHistory: boolean) => {
              const statusBadge = (() => {
                if (w.webinarStatus === "completed") return <Badge tone="neutral">{t("Завершён", "Ended")}</Badge>;
                if (w.webinarStatus === "active") return <Badge tone="success">{t("🔴 Идёт", "🔴 Live")}</Badge>;
                const st = webinarStatus(w);
                if (st === "live") return <Badge tone="success">{t("Идёт", "Live")}</Badge>;
                if (st === "upcoming") return <Badge tone="primary">{t("Предстоит", "Upcoming")}</Badge>;
                if (st === "ended") return <Badge tone="neutral">{t("Завершён", "Ended")}</Badge>;
                return null;
              })();

              return (
                <div key={w.id} className="entity-item compact" style={{ padding: "10px 12px", opacity: isHistory ? 0.7 : 1 }}>
                  {/* Row 1: thumbnail + title + date + status */}
                  <div className="row" style={{ gap: 10, alignItems: "flex-start", width: "100%" }}>
                    {w.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={absMediaUrl(w.thumbnailUrl)} alt="" style={{ width: 64, height: 36, objectFit: "cover", borderRadius: 3, flexShrink: 0, marginTop: 2 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{w.titleRu || w.titleEn || w.id}</p>
                        {statusBadge}
                      </div>
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                        {w.isFlowLevel ? t("Поток", "Flow-level") : `${t("День", "Day")} ${w.dayNumber}${w.track ? ` · ${w.track}` : ""}`}
                        {w.startsAtIso ? ` · ${new Date(w.startsAtIso).toLocaleString()}` : ""}
                        {w.durationMinutes ? ` · ${w.durationMinutes} ${t("мин", "min")}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Row 2: action buttons */}
                  <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <a href={`/webinar/${w.id}`} target="_blank" rel="noopener noreferrer" className="button small secondary" style={{ textDecoration: "none" }}>
                      {t("Открыть →", "Open →")}
                    </a>

                    {!isHistory && (
                      <button type="button" className="button small secondary" onClick={() => void onShowStreamInfo(w.id)}
                        style={streamInfo?.webinarId === w.id ? { background: "var(--primary-dark)", color: "#fff", borderColor: "var(--primary-dark)" } : {}}>
                        RTMP
                      </button>
                    )}

                    {!isHistory && !w.webinarStatus && (
                      <button type="button" className="button small primary" disabled={webinarActionLoading === w.id} onClick={() => void onStartWebinar(w.id)}>
                        {webinarActionLoading === w.id ? t("...", "...") : t("▶ Запустить", "▶ Start")}
                      </button>
                    )}

                    {!isHistory && w.webinarStatus === "active" && (
                      <button type="button" className="button small danger" disabled={webinarActionLoading === w.id} onClick={() => void onFinishWebinar(w.id)}>
                        {webinarActionLoading === w.id ? t("...", "...") : t("■ Завершить", "■ Finish")}
                      </button>
                    )}

                    {!isHistory && (
                      <>
                        <span className="muted text-body-sm" style={{ marginLeft: 4 }}>{t("№", "#")}</span>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={99}
                          placeholder="—"
                          style={{ width: 60 }}
                          value={webinarOrderDraft[w.id] ?? ""}
                          onChange={(e) => setWebinarOrderDraft((prev) => ({ ...prev, [w.id]: e.target.value }))}
                        />
                      </>
                    )}

                    {w.isFlowLevel && (
                      <button type="button" className="icon-action danger" title={t("Удалить из потока", "Remove from flow")} onClick={() => void onDeleteFlowWebinar(w.id)}>
                        &times;
                      </button>
                    )}
                  </div>

                  {/* RTMP inline panel (shown when RTMP button is active for this row) */}
                  {!isHistory && rtmpPanel(w)}
                </div>
              );
            };

            return (
              <>
                {active.length === 0 && completed.length === 0 ? (
                  <p className="muted text-body-sm" style={{ margin: "12px 0 0" }}>
                    {t("Вебинаров пока нет. Нажмите «+ Добавить вебинар».", "No webinars yet. Click \"+ Add webinar\".")}
                  </p>
                ) : (
                  <>
                    {active.length > 0 && (
                      <div className="entity-list" style={{ marginTop: 12 }}>
                        {active.map((w) => renderRow(w, false))}
                      </div>
                    )}

                    {completed.length > 0 && (
                      <details style={{ marginTop: 16 }}>
                        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", userSelect: "none", listStyle: "none", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10 }}>▶</span>
                          {t(`История вебинаров (${completed.length})`, `Webinar history (${completed.length})`)}
                        </summary>
                        <div className="entity-list" style={{ marginTop: 8 }}>
                          {completed.map((w) => renderRow(w, true))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </>
            );
          })()}
        </div>
      </div>
    );
  };

  const renderTokens = () => {
    if (!selectedFlow) return null;
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div className="kpi-grid">
          <article className="kpi"><p className="kpi-label">{t("ВСЕГО", "TOTAL")}</p><p className="kpi-value">{flowTokens.length}</p></article>
          <article className="kpi"><p className="kpi-label">{t("ИСПОЛЬЗОВАНО", "USED")}</p><p className="kpi-value" style={{ color: "var(--success)" }}>{flowTokensUsed}</p></article>
          <article className="kpi"><p className="kpi-label">{t("ДОСТУПНО", "AVAILABLE")}</p><p className="kpi-value">{flowTokensFree}</p></article>
        </div>
        <div className="admin-section">
          <h3 className="admin-section-title">{t("Сгенерировать токены", "Generate tokens")}</h3>
          <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Токены будут автоматически привязаны к этому потоку.", "Tokens will be auto-bound to this flow.")}</p>
          <div className="row" style={{ gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">{t("Количество", "Count")}</label>
              <input className="input" type="number" value={genCount} onChange={(e) => setGenCount(Number(e.target.value) || 1)} min={1} />
            </div>
            <button type="button" className="button primary" style={{ alignSelf: "flex-end" }} onClick={() => void onGenTokens()}>{t("Сгенерировать", "Generate")}</button>
          </div>
        </div>
        <div className="admin-section">
          <h3 className="admin-section-title">{t("Токены потока", "Flow tokens")} ({flowTokens.length})</h3>
          {flowTokens.length === 0 ? (
            <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Нет токенов. Сгенерируйте выше.", "No tokens. Generate some above.")}</p>
          ) : (
            <div className="entity-list" style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {flowTokens.map((tk) => (
                <div key={tk.token} className="entity-item padded" style={{ padding: "10px 12px" }}>
                  <div className="row between">
                    <code style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>{tk.token}</code>
                    {tk.usedByUserId ? <Badge tone="success">{t("Использован", "Used")}</Badge> : <Badge tone="warning">{t("Доступен", "Available")}</Badge>}
                  </div>
                  {tk.usedByUserId && (
                    <p className="muted text-body-sm" style={{ margin: "4px 0 0" }}>
                      {tk.usedByName || tk.usedByEmail}
                      {tk.usedAt ? ` · ${new Date(tk.usedAt).toLocaleString()}` : ""}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderChat = () => {
    if (!selectedFlow) return null;
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div className="admin-section">
          <div className="admin-section-header">
            <h3 className="admin-section-title">{t("Чат", "Chat")} ({chatMessages.length})</h3>
            <button type="button" className="button small secondary" onClick={() => void loadChat(selectedFlowId)}>{t("Обновить", "Refresh")}</button>
          </div>
          {chatLoading ? (
            <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Загрузка...", "Loading...")}</p>
          ) : chatMessages.length === 0 ? (
            <p className="muted text-body-sm" style={{ margin: 0 }}>{t("Нет сообщений.", "No chat messages.")}</p>
          ) : (
            <div className="entity-list" style={{ maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column-reverse" }}>
              {chatMessages.map((msg) => (
                <div key={msg.id} className="entity-item padded" style={{ padding: "10px 12px" }}>
                  <div className="row between">
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{msg.senderName || msg.senderEmail || t("Система", "System")}</span>
                      <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {msg.kind !== "message" && <Badge tone="neutral">{msg.kind}{msg.eventType ? `: ${msg.eventType}` : ""}</Badge>}
                      <button type="button" className="icon-action danger" title={t("Удалить", "Delete")} aria-label="Delete message" onClick={() => setConfirmDeleteMsg(msg.id)}>&times;</button>
                    </div>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.5 }}>{msg.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <ConfirmDialog
          open={!!confirmDeleteMsg}
          title={t("Удалить сообщение", "Delete message")}
          description={t("Это действие нельзя отменить.", "This action cannot be undone.")}
          confirmLabel={t("Удалить", "Delete")}
          cancelLabel={t("Отмена", "Cancel")}
          tone="danger"
          onConfirm={() => confirmDeleteMsg && void onDeleteChat(confirmDeleteMsg)}
          onCancel={() => setConfirmDeleteMsg(null)}
        />
      </div>
    );
  };

  return (
    <div className="stack">
      <header className="page-header">
        <h1 className="page-title">{t("Потоки", "Flows")}</h1>
        <p className="page-subtitle">{t("Управление интенсивными потоками, участниками и программами", "Manage intensive flows, members, and programs")}</p>
      </header>

      <div className="admin-master-detail">
        <div>
          <div className="admin-master-list">
            {flows.map((f) => (
              <div key={f.id} className={`admin-master-item${f.id === selectedFlowId ? " active" : ""}`} onClick={() => selectFlow(f)}>
                <div className="row between">
                  <span style={{ fontWeight: 700 }}>{f.code}</span>
                  <div className="row" style={{ gap: 4 }}>
                    <Badge tone="neutral">{f.language.toUpperCase()}</Badge>
                    <Badge tone={f.isActive ? "success" : "neutral"}>{f.isActive ? t("Акт.", "Active") : t("Выкл.", "Off")}</Badge>
                  </div>
                </div>
                <p className="muted text-body-sm" style={{ margin: "2px 0 0" }}>{flowTitle(f)}</p>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <Badge tone="neutral">{t("Участники", "Members")}: {f.membersCount}</Badge>
                  <Badge tone="neutral">{t("Дни", "Days")}: {f.daysCount}</Badge>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
                  {new Date(f.startsAt).toLocaleDateString()} — {new Date(f.endsAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="button primary small" onClick={startCreate}>+ {t("Новый поток", "New flow")}</button>
          </div>
        </div>

        <div>
          {selectedFlow ? (
            <div className="stack">
              <TabRow tabs={DETAIL_TABS} activeTab={activeTab} onChange={(k) => setActiveTab(k as DetailTab)} />
              {activeTab === "overview" && renderOverview()}
              {activeTab === "members" && renderMembers()}
              {activeTab === "program" && renderProgram()}
              {activeTab === "webinar" && renderWebinar()}
              {activeTab === "tokens" && renderTokens()}
              {activeTab === "chat" && renderChat()}
            </div>
          ) : (
            <div className="admin-section">
              <div className="admin-empty-state">
                <p className="text-h3">{t("Выберите поток", "Select a flow")}</p>
                <p className="muted text-body-sm">{t("Нажмите на поток слева или создайте новый", "Click a flow on the left or create a new one")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AdminDrawer
        open={editing}
        title={flowForm.flowId ? t("Редактировать поток", "Edit flow") : t("Новый поток", "New flow")}
        subtitle={t("Код, даты, язык", "Code, dates, language")}
        width={520}
        onClose={() => setEditing(false)}
        footer={(
          <div className="row" style={{ gap: 10, width: "100%", justifyContent: "flex-end" }}>
            <button type="button" className="button secondary small" onClick={() => setEditing(false)}>{t("Отмена", "Cancel")}</button>
            <button type="button" className="button primary small" onClick={() => void onSaveFlow()}>{flowForm.flowId ? t("Сохранить", "Save") : t("Создать поток", "Create flow")}</button>
          </div>
        )}
      >
        {renderFlowForm()}
      </AdminDrawer>

      <AdminDrawer
        open={duplicating}
        title={t("Дублировать поток", "Duplicate flow")}
        subtitle={t("Новый код и период", "New code and period")}
        width={520}
        onClose={() => setDuplicating(false)}
        footer={(
          <div className="row" style={{ gap: 10, width: "100%", justifyContent: "flex-end" }}>
            <button type="button" className="button secondary small" onClick={() => setDuplicating(false)}>{t("Отмена", "Cancel")}</button>
            <button type="button" className="button primary small" onClick={() => void onDuplicate()} disabled={!dupForm.code || !dupForm.startsAtIso || !dupForm.endsAtIso}>{t("Создать копию", "Create copy")}</button>
          </div>
        )}
      >
        {renderDuplicateForm()}
      </AdminDrawer>
    </div>
  );
}
