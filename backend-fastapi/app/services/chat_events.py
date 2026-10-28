from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session


TEMPLATES_RU: dict[str, str] = {
    "lesson_completed": "{name} прошёл урок «{lessonTitle}»",
    "homework_submitted": "{name} сдал домашку за День {dayNumber}",
    "homework_approved": "Домашка {name} за День {dayNumber} принята!",
    "homework_rejected": "Домашка {name} за День {dayNumber} отправлена на доработку",
    "day_unlocked": "{name} перешёл на День {dayNumber}",
    "achievement": "{name} получил достижение: {achievement}",
    "celebration": "{senderName} поздравляет {name}!",
}

TEMPLATES_EN: dict[str, str] = {
    "lesson_completed": "{name} completed lesson \"{lessonTitle}\"",
    "homework_submitted": "{name} submitted homework for Day {dayNumber}",
    "homework_approved": "{name}'s Day {dayNumber} homework approved!",
    "homework_rejected": "{name}'s Day {dayNumber} homework sent for revision",
    "day_unlocked": "{name} moved to Day {dayNumber}",
    "achievement": "{name} earned achievement: {achievement}",
    "celebration": "{senderName} celebrates {name}!",
}


def _resolve_display_name(db: Session, user_id: str) -> str:
    row = db.execute(
        text('SELECT "firstName", "lastName", "email" FROM "User" WHERE "id" = :id'),
        {"id": user_id},
    ).mappings().first()
    if not row:
        return "Someone"
    full = " ".join(filter(None, [row.get("firstName"), row.get("lastName")])).strip()
    return full or (row.get("email") or "Someone").split("@")[0]


def _resolve_user_language(db: Session, user_id: str) -> str:
    row = db.execute(text('SELECT "language" FROM "User" WHERE "id" = :id'), {"id": user_id}).mappings().first()
    language = (row or {}).get("language")
    return "ru" if str(language).lower().startswith("ru") else "en"


def _resolve_flow_id(db: Session, user_id: str) -> str | None:
    row = db.execute(
        text(
            """
            SELECT f."id"
            FROM "IntensiveFlowMember" m
            JOIN "IntensiveFlow" f ON f."id" = m."flowId"
            WHERE m."userId" = :user_id AND m."isActive" = true AND f."isActive" = true
            ORDER BY m."assignedAt" DESC
            LIMIT 1
            """
        ),
        {"user_id": user_id},
    ).mappings().first()
    if row:
        return row["id"]
    config = db.execute(text('SELECT "id" FROM "IntensiveConfig" WHERE "id" = 1')).mappings().first()
    if config:
        return "legacy-default"
    return None


def emit_system_message(
    db: Session,
    *,
    user_id: str,
    event_type: str,
    meta: dict[str, Any] | None = None,
    flow_id: str | None = None,
) -> None:
    if not flow_id:
        flow_id = _resolve_flow_id(db, user_id)
    if not flow_id:
        return

    name = _resolve_display_name(db, user_id)
    fmt_data: dict[str, Any] = {"name": name, **(meta or {})}

    is_ru = _resolve_user_language(db, user_id) == "ru"
    body = (TEMPLATES_RU if is_ru else TEMPLATES_EN).get(event_type, "").format_map(SafeDict(fmt_data)) or event_type

    meta_json = json.dumps({**(meta or {}), "actorUserId": user_id}, ensure_ascii=False) if meta else json.dumps({"actorUserId": user_id})

    db.execute(
        text(
            """
            INSERT INTO "ChatMessage" ("id", "flowId", "userId", "kind", "eventType", "body", "meta", "createdAt")
            VALUES (:id, :flow_id, :user_id, 'system', :event_type, :body, :meta, :created_at)
            """
        ),
        {
            "id": str(uuid4()),
            "flow_id": flow_id,
            "user_id": user_id,
            "event_type": event_type,
            "body": body,
            "meta": meta_json,
            "created_at": datetime.now(timezone.utc),
        },
    )


class SafeDict(dict):  # type: ignore[type-arg]
    def __missing__(self, key: str) -> str:
        return f"{{{key}}}"
