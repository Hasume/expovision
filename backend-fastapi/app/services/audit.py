from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session


def write_audit(
    db: Session,
    *,
    admin_user_id: str,
    action: str,
    endpoint: str,
    method: str,
    payload: dict[str, Any],
) -> None:
    db.execute(
        text(
            """
            INSERT INTO "AdminAuditLog" ("id", "adminUserId", "action", "endpoint", "method", "payloadJson", "createdAt")
            VALUES (:id, :admin_user_id, :action, :endpoint, :method, :payload, :created_at)
            """
        ),
        {
            "id": str(uuid4()),
            "admin_user_id": admin_user_id,
            "action": action,
            "endpoint": endpoint,
            "method": method,
            "payload": json.dumps(payload, ensure_ascii=True),
            "created_at": datetime.now(timezone.utc),
        },
    )
