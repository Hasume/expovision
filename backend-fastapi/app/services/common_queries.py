from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

INTENSIVE_DURATION_DAYS = 14


def get_user(db: Session, user_id: str):
    return db.execute(
        text(
            """
            SELECT "id", "email", "role", "language", "selectedTrack", "reportCompleted",
                   "onboardingDone", "firstName", "lastName", "avatarUrl", "currentSessionId",
                   "createdAt", "startedAt", "timezone", "onboardingProfile", "recommendedTrack"
            FROM "User" WHERE "id" = :id
            """
        ),
        {"id": user_id},
    ).mappings().first()


def get_intensive(db: Session):
    return db.execute(
        text('SELECT "id", "startAt", "isStarted" FROM "IntensiveConfig" WHERE "id" = 1')
    ).mappings().first()


def get_effective_intensive(db: Session, user_id: str):
    # Single query: flow + day count in one round-trip
    row = db.execute(
        text(
            """
            SELECT f."id", f."code", f."titleRu", f."titleEn", f."startsAt", f."endsAt",
                   f."timezone", f."isActive", f."language",
                   COUNT(fd."id") AS "flowDaysCount"
            FROM "IntensiveFlowMember" m
            JOIN "IntensiveFlow" f ON f."id" = m."flowId"
            LEFT JOIN "IntensiveFlowDay" fd ON fd."flowId" = f."id"
            WHERE m."userId" = :user_id
              AND m."isActive" = true
              AND f."isActive" = true
            GROUP BY f."id", m."assignedAt"
            ORDER BY m."assignedAt" DESC
            LIMIT 1
            """
        ),
        {"user_id": user_id},
    ).mappings().first()
    if row:
        return {
            "id": row["id"],
            "code": row["code"],
            "titleRu": row["titleRu"],
            "titleEn": row["titleEn"],
            "startAt": row["startsAt"],
            "endAt": row["endsAt"],
            "isStarted": True,
            "source": "flow",
            "hasCustomDays": int(row["flowDaysCount"] or 0) > 0,
        }
    config = get_intensive(db)
    if not config:
        return None
    start_at = config.get("startAt")
    end_at = (start_at + timedelta(days=INTENSIVE_DURATION_DAYS)) if isinstance(start_at, datetime) else None
    return {
        **dict(config),
        "source": "legacy",
        "code": "legacy-default",
        "titleRu": "Поток по умолчанию",
        "titleEn": "Default flow",
        "endAt": end_at,
        "hasCustomDays": False,
    }
