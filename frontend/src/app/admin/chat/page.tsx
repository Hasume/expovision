"use client";

import { useEffect, useState } from "react";
import { adminFlows, adminFlowChat, adminDeleteChatMessage, type AdminChatMessage } from "@/features/api";
import { Badge } from "@/shared/ui/components";
import { useToast } from "@/features/admin/toast";
import { ConfirmDialog } from "@/features/admin/confirm-dialog";
import { useAdminLang } from "@/features/admin/i18n";

export default function ChatModerationPage() {
  const { toast } = useToast();
  const { t } = useAdminLang();
  const [flows, setFlows] = useState<Awaited<ReturnType<typeof adminFlows>>>([]);
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const list = await adminFlows();
        setFlows(list);
        if (list.length > 0) setSelectedFlowId(list[0]!.id);
      } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
    })();
  }, []);

  const loadChat = async (flowId: string) => {
    if (!flowId) return;
    setLoading(true);
    try { setMessages(await adminFlowChat(flowId)); } catch (e) { toast(e instanceof Error ? e.message : t("Не удалось загрузить чат", "Failed to load chat"), "error"); }
    setLoading(false);
  };

  useEffect(() => { if (selectedFlowId) void loadChat(selectedFlowId); }, [selectedFlowId]);
  useEffect(() => {
    if (!autoRefresh || !selectedFlowId) return;
    const interval = setInterval(() => void loadChat(selectedFlowId), 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedFlowId]);

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminDeleteChatMessage(deleteTarget);
      setMessages((prev) => prev.filter((m) => m.id !== deleteTarget));
      toast(t("Сообщение удалено", "Message deleted"), "success");
    } catch (e) { toast(e instanceof Error ? e.message : t("Ошибка", "Failed"), "error"); }
    setDeleteTarget(null);
  };

  const selectedFlow = flows.find((f) => f.id === selectedFlowId);

  return (
    <div className="stack">
      <header className="page-header">
        <h1 className="page-title">{t("Модерация чата", "Chat Moderation")}</h1>
        <p className="page-subtitle">{t("Мониторинг и модерация сообщений потока", "Monitor and moderate flow chat messages")}</p>
      </header>

      <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
        {flows.map((f) => (
          <button key={f.id} type="button" className={`button small ${selectedFlowId === f.id ? "primary" : "secondary"}`} onClick={() => setSelectedFlowId(f.id)}>
            {f.code} <Badge tone="neutral">{f.language.toUpperCase()}</Badge>
          </button>
        ))}
      </div>

      <div className="row between">
        <p className="muted text-body-sm">{selectedFlow ? `${selectedFlow.code} — ${messages.length} ${t("сообщений", "messages")}` : t("Выберите поток", "Select a flow")}</p>
        <div className="row" style={{ gap: "8px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", cursor: "pointer" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            {t("Автообновление", "Auto-refresh")}
          </label>
          <button type="button" className="button secondary small" onClick={() => void loadChat(selectedFlowId)}>{t("Обновить", "Refresh")}</button>
        </div>
      </div>

      {loading ? (
        <p className="muted">{t("Загрузка...", "Loading...")}</p>
      ) : messages.length === 0 ? (
        <div className="admin-section">
          <div className="admin-empty-state">
            <p className="text-h3">{t("Нет сообщений", "No messages")}</p>
            <p className="muted text-body-sm">{t("В этом потоке пока нет сообщений.", "This flow has no chat messages yet.")}</p>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: "4px" }}>
          {[...messages].reverse().map((msg) => (
            <div key={msg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", padding: "10px 14px", borderRadius: "8px", background: msg.kind !== "message" ? "var(--surface-muted)" : "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: "6px" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>{msg.senderName || msg.senderEmail || t("Система", "System")}</span>
                  <span className="muted" style={{ fontSize: "0.72rem" }}>{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}</span>
                  {msg.kind !== "message" && <Badge tone="neutral">{msg.kind}{msg.eventType ? `: ${msg.eventType}` : ""}</Badge>}
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "0.88rem", lineHeight: "1.5" }}>{msg.body}</p>
              </div>
              <button type="button" className="admin-icon-btn danger" onClick={() => setDeleteTarget(msg.id)} title={t("Удалить сообщение", "Delete message")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} title={t("Удалить сообщение", "Delete message")} description={t("Это сообщение будет удалено навсегда.", "This message will be permanently removed from the chat.")} confirmLabel={t("Удалить", "Delete")} onConfirm={() => void onDelete()} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
