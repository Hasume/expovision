from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.rate_limit import limit
from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user
from app.services.chat_events import _resolve_flow_id, emit_system_message
from app.services.common_queries import get_effective_intensive
from app.services.intensive import ensure_platform_accessible


router = APIRouter(prefix="/chat", tags=["chat"])

MAX_MESSAGE_LENGTH = 2000
DEFAULT_PAGE_SIZE = 50


class SendMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)


class CelebrateRequest(BaseModel):
    targetUserId: str = Field(min_length=1)
    message: str = Field(default="", max_length=500)


def _get_user_flow_id(db: Session, user_id: str) -> str:
    flow_id = _resolve_flow_id(db, user_id)
    if not flow_id:
        raise HTTPException(status_code=400, detail="No active flow found")
    return flow_id


def _format_message(row: dict) -> dict:
    return {
        "id": row["id"],
        "flowId": row["flowId"],
        "userId": row["userId"],
        "kind": row["kind"],
        "eventType": row["eventType"],
        "body": row["body"],
        "meta": row["meta"],
        "senderName": row.get("senderName"),
        "createdAt": row["createdAt"].isoformat() if row["createdAt"] else None,
    }


@router.get("/messages")
def get_messages(
    before: str | None = Query(default=None),
    limit_count: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=100, alias="limit"),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    intensive = get_effective_intensive(db, user.user_id)
    ensure_platform_accessible(intensive)
    flow_id = _get_user_flow_id(db, user.user_id)

    params: dict = {"flow_id": flow_id, "limit": limit_count}
    time_filter = ""
    if before:
        time_filter = 'AND cm."createdAt" < :before'
        params["before"] = before

    rows = db.execute(
        text(
            f"""
            SELECT cm."id", cm."flowId", cm."userId", cm."kind", cm."eventType",
                   cm."body", cm."meta", cm."createdAt",
                   COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), SPLIT_PART(u."email", '@', 1)) AS "senderName"
            FROM "ChatMessage" cm
            LEFT JOIN "User" u ON u."id" = cm."userId"
            WHERE cm."flowId" = :flow_id {time_filter}
            ORDER BY cm."createdAt" DESC
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()

    messages = [_format_message(dict(r)) for r in rows]
    messages.reverse()
    return {
        "messages": messages,
        "hasMore": len(rows) == limit_count,
    }


@router.get("/messages/poll")
def poll_messages(
    after: str = Query(...),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    intensive = get_effective_intensive(db, user.user_id)
    ensure_platform_accessible(intensive)
    flow_id = _get_user_flow_id(db, user.user_id)

    rows = db.execute(
        text(
            """
            SELECT cm."id", cm."flowId", cm."userId", cm."kind", cm."eventType",
                   cm."body", cm."meta", cm."createdAt",
                   COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), SPLIT_PART(u."email", '@', 1)) AS "senderName"
            FROM "ChatMessage" cm
            LEFT JOIN "User" u ON u."id" = cm."userId"
            WHERE cm."flowId" = :flow_id AND cm."createdAt" > :after
            ORDER BY cm."createdAt" ASC
            LIMIT 100
            """
        ),
        {"flow_id": flow_id, "after": after},
    ).mappings().all()

    return {
        "messages": [_format_message(dict(r)) for r in rows],
    }


@router.post("/send", dependencies=[Depends(limit(30, 60))])
def send_message(
    payload: SendMessageRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    intensive = get_effective_intensive(db, user.user_id)
    ensure_platform_accessible(intensive)
    flow_id = _get_user_flow_id(db, user.user_id)
    now = datetime.now(timezone.utc)
    msg_id = str(uuid4())

    db.execute(
        text(
            """
            INSERT INTO "ChatMessage" ("id", "flowId", "userId", "kind", "body", "createdAt")
            VALUES (:id, :flow_id, :user_id, 'user', :body, :created_at)
            """
        ),
        {
            "id": msg_id,
            "flow_id": flow_id,
            "user_id": user.user_id,
            "body": payload.body.strip(),
            "created_at": now,
        },
    )
    db.commit()

    row = db.execute(
        text(
            """
            SELECT cm."id", cm."flowId", cm."userId", cm."kind", cm."eventType",
                   cm."body", cm."meta", cm."createdAt",
                   COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), SPLIT_PART(u."email", '@', 1)) AS "senderName"
            FROM "ChatMessage" cm
            LEFT JOIN "User" u ON u."id" = cm."userId"
            WHERE cm."id" = :id
            """
        ),
        {"id": msg_id},
    ).mappings().first()

    return _format_message(dict(row)) if row else {"id": msg_id, "success": True}


@router.post("/celebrate", dependencies=[Depends(limit(20, 60))])
def celebrate(
    payload: CelebrateRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    intensive = get_effective_intensive(db, user.user_id)
    ensure_platform_accessible(intensive)
    flow_id = _get_user_flow_id(db, user.user_id)

    target = db.execute(
        text('SELECT "id" FROM "User" WHERE "id" = :id'),
        {"id": payload.targetUserId},
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    sender_row = db.execute(
        text('SELECT "firstName", "lastName", "email" FROM "User" WHERE "id" = :id'),
        {"id": user.user_id},
    ).mappings().first()
    sender_name = "Someone"
    if sender_row:
        full = " ".join(filter(None, [sender_row.get("firstName"), sender_row.get("lastName")])).strip()
        sender_name = full or (sender_row.get("email") or "Someone").split("@")[0]

    emit_system_message(
        db,
        user_id=payload.targetUserId,
        event_type="celebration",
        meta={"senderName": sender_name, "senderUserId": user.user_id, "message": payload.message},
        flow_id=flow_id,
    )
    db.commit()
    return {"success": True}
