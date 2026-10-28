"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import {
  type ChatParticipant,
  communityAddParticipant,
  communityGetChat,
  communityListParticipants,
  communityRemoveParticipant,
  communityTransferOwnership,
  communityUpdateChat,
  communityUpdateParticipantRole,
} from "@/features/api";

function roleRu(r: string): string {
  if (r === "owner") return "Владелец";
  if (r === "admin") return "Админ";
  return "Участник";
}

type Props = {
  open: boolean;
  onClose: () => void;
  chatId: string;
  currentUserId: string | null;
  onChatUpdated: () => void;
};

export function GroupChatSettingsModal({
  open,
  onClose,
  chatId,
  currentUserId,
  onChatUpdated,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nameEdit, setNameEdit] = useState("");
  const [descEdit, setDescEdit] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadParticipants = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await communityListParticipants(chatId);
      setParticipants(list);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить участников");
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    if (!open || !chatId) return;
    setErr(null);
    setAddUserId("");
    void (async () => {
      try {
        const c = await communityGetChat(chatId);
        setNameEdit((c.name ?? "").trim() ? (c.name ?? "") : "");
        setDescEdit(c.description ?? "");
      } catch {
        setNameEdit("");
        setDescEdit("");
      }
      await loadParticipants();
    })();
  }, [open, chatId, loadParticipants]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const myRole = currentUserId
    ? (participants.find((p) => p.id === currentUserId)?.role ?? null)
    : null;

  const canEditChatMeta = myRole === "owner" || myRole === "admin";
  const canAddPeople = myRole === "owner" || myRole === "admin";
  const canChangeRoles = myRole === "owner";
  const myRoleIsAdmin = myRole === "admin";

  const canRemoveRow = (p: ChatParticipant): boolean => {
    if (p.id === currentUserId) return true;
    if (!myRole || myRole === "member") return false;
    if (p.role === "owner") return false;
    if (myRoleIsAdmin && p.role === "admin") return false;
    return myRole === "owner" || myRole === "admin";
  };

  const handleSaveMeta = async () => {
    if (!canEditChatMeta || busy) return;
    const n = nameEdit.trim();
    if (!n) {
      setErr("Укажите название группы");
      return;
    }
    setBusy("meta");
    setErr(null);
    try {
      const d = descEdit.trim();
      await communityUpdateChat(chatId, {
        name: n,
        ...(d ? { description: d } : {}),
      });
      onChatUpdated();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  };

  const handleAdd = async () => {
    if (!canAddPeople || busy) return;
    const uid = addUserId.trim();
    if (!uid) return;
    setBusy("add");
    setErr(null);
    try {
      await communityAddParticipant(chatId, uid);
      setAddUserId("");
      await loadParticipants();
      onChatUpdated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось добавить");
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (busy) return;
    const self = userId === currentUserId;
    if (!self && !confirm("Убрать этого участника из группы?")) return;
    if (self && !confirm("Выйти из группы? Чат пропадёт из списка.")) return;
    setBusy(`rm:${userId}`);
    setErr(null);
    try {
      await communityRemoveParticipant(chatId, userId);
      await loadParticipants();
      onChatUpdated();
      if (self) onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось выполнить действие");
    } finally {
      setBusy(null);
    }
  };

  const handleToggleAdmin = async (userId: string, current: "admin" | "member") => {
    if (!canChangeRoles || busy) return;
    const next = current === "admin" ? "member" : "admin";
    setBusy(`role:${userId}`);
    setErr(null);
    try {
      await communityUpdateParticipantRole(chatId, userId, next);
      await loadParticipants();
      onChatUpdated();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось изменить роль");
    } finally {
      setBusy(null);
    }
  };

  const handleTransfer = async (newOwnerId: string) => {
    if (myRole !== "owner" || busy) return;
    if (!confirm("Передать владение? Вы станете участником без прав владельца.")) return;
    setBusy("xfer");
    setErr(null);
    try {
      await communityTransferOwnership(chatId, newOwnerId);
      await loadParticipants();
      onChatUpdated();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Не удалось передать владение");
    } finally {
      setBusy(null);
    }
  };

  if (!open || !mounted || typeof document === "undefined") return null;

  const titleId = "hub-chat-settings-title";

  return createPortal(
    <div className="hub-dash-modal-root hub-chat-settings-root" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="hub-dash-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="hub-dash-modal-panel hub-chat-settings-panel">
        <div className="hub-dash-modal-head">
          <h2 id={titleId} className="hub-chat-settings-title">
            Группа
          </h2>
          <button type="button" className="hub-dash-modal-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>

        {err ? <p className="hub-chat-settings-err">{err}</p> : null}

        {canEditChatMeta ? (
          <div className="hub-chat-settings-block">
            <label className="hub-chat-settings-label">
              Название
              <input
                className="hub-chat-settings-input"
                value={nameEdit}
                onChange={(e) => setNameEdit(e.target.value)}
                maxLength={100}
                disabled={!!busy}
              />
            </label>
            <label className="hub-chat-settings-label">
              Описание (необязательно)
              <textarea
                className="hub-chat-settings-textarea"
                value={descEdit}
                onChange={(e) => setDescEdit(e.target.value)}
                maxLength={500}
                rows={2}
                disabled={!!busy}
              />
            </label>
            <button
              type="button"
              className="hub-btn-primary hub-chat-settings-save"
              disabled={!!busy}
              onClick={() => void handleSaveMeta()}
            >
              {busy === "meta" ? "…" : "Сохранить название и описание"}
            </button>
          </div>
        ) : null}

        {canAddPeople ? (
          <div className="hub-chat-settings-block">
            <div className="hub-chat-settings-label">
              Пригласить по ID
              <p className="hub-chat-settings-hint">
                Скопируйте ID из адреса профиля: <code>/community/profile/…</code>
              </p>
            </div>
            <div className="hub-chat-settings-invite-row">
              <input
                className="hub-chat-settings-input"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                placeholder="id пользователя"
                disabled={!!busy}
              />
              <button type="button" className="hub-btn-ghost" disabled={!!busy || !addUserId.trim()} onClick={() => void handleAdd()}>
                {busy === "add" ? "…" : "Добавить"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="hub-chat-settings-block">
          <h3 className="hub-chat-settings-subtitle">Участники</h3>
          {loading ? (
            <p className="hub-chat-settings-muted">Загрузка…</p>
          ) : (
            <ul className="hub-chat-settings-members">
              {participants.map((p) => (
                <li key={p.id} className="hub-chat-settings-member">
                  <div className="hub-chat-settings-member__main">
                    <Link href={`/community/profile/${p.id}`} className="hub-chat-settings-member__name" onClick={onClose}>
                      {[p.firstName, p.lastName].filter(Boolean).join(" ").trim() || p.firstName || p.id}
                    </Link>
                    <span className="hub-chat-settings-role">{roleRu(p.role)}</span>
                  </div>
                  <div className="hub-chat-settings-member__actions">
                    {canChangeRoles && p.role !== "owner" && p.id !== currentUserId ? (
                      <button
                        type="button"
                        className="hub-btn-ghost hub-chat-settings-action"
                        disabled={!!busy}
                        onClick={() =>
                          void handleToggleAdmin(p.id, p.role === "admin" ? "admin" : "member")
                        }
                      >
                        {p.role === "admin" ? "Снять админа" : "Сделать админом"}
                      </button>
                    ) : null}
                    {myRole === "owner" && p.role !== "owner" && p.id !== currentUserId ? (
                      <button
                        type="button"
                        className="hub-btn-ghost hub-chat-settings-action"
                        disabled={!!busy}
                        onClick={() => void handleTransfer(p.id)}
                      >
                        Передать владение
                      </button>
                    ) : null}
                    {canRemoveRow(p) ? (
                      <button
                        type="button"
                        className="hub-btn-ghost hub-chat-settings-action hub-chat-settings-action--danger"
                        disabled={!!busy}
                        onClick={() => void handleRemove(p.id)}
                      >
                        {p.id === currentUserId ? "Выйти" : "Убрать"}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
