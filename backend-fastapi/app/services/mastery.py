from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session


def _ensure_fallback_competency(db: Session, lesson_id: str) -> str:
    row = db.execute(
        text(
            """
            SELECT d."dayNumber"
            FROM "Lesson" l
            JOIN "LessonDay" ld ON ld."lessonId" = l."id"
            JOIN "CurriculumDay" d ON d."id" = ld."curriculumDayId"
            WHERE l."id" = :lesson_id
            ORDER BY d."dayNumber" ASC
            LIMIT 1
            """
        ),
        {"lesson_id": lesson_id},
    ).mappings().first()
    if not row:
        raise ValueError("Lesson not found for mastery update")
    day_number = int(row["dayNumber"])
    code = f"day-{day_number}-core"
    existing = db.execute(
        text('SELECT "id" FROM "Competency" WHERE "code" = :code LIMIT 1'),
        {"code": code},
    ).mappings().first()
    if existing:
        return existing["id"]

    comp_id = str(uuid4())
    now = datetime.now(timezone.utc)
    db.execute(
        text(
            """
            INSERT INTO "Competency" ("id", "code", "titleRu", "titleEn", "isActive", "createdAt", "updatedAt")
            VALUES (:id, :code, :title_ru, :title_en, true, :now, :now)
            """
        ),
        {
            "id": comp_id,
            "code": code,
            "title_ru": f"База дня {day_number}",
            "title_en": f"Day {day_number} core",
            "now": now,
        },
    )
    db.execute(
        text(
            """
            INSERT INTO "LessonCompetency" ("id", "lessonId", "competencyId", "weight", "createdAt")
            VALUES (:id, :lesson_id, :competency_id, 1.0, :now)
            ON CONFLICT ("lessonId", "competencyId") DO NOTHING
            """
        ),
        {"id": str(uuid4()), "lesson_id": lesson_id, "competency_id": comp_id, "now": now},
    )
    return comp_id


def update_mastery_for_lesson_completion(db: Session, user_id: str, lesson_id: str) -> None:
    rows = db.execute(
        text(
            """
            SELECT lc."competencyId", lc."weight"
            FROM "LessonCompetency" lc
            JOIN "Competency" c ON c."id" = lc."competencyId"
            WHERE lc."lessonId" = :lesson_id AND c."isActive" = true
            """
        ),
        {"lesson_id": lesson_id},
    ).mappings().all()

    if not rows:
        fallback_competency_id = _ensure_fallback_competency(db, lesson_id)
        rows = [{"competencyId": fallback_competency_id, "weight": 1.0}]

    now = datetime.now(timezone.utc)
    upsert_params = [
        {
            "id": str(uuid4()),
            "user_id": user_id,
            "competency_id": row["competencyId"],
            "score_delta": max(1.0, min(15.0, 8.0 * float(row["weight"] or 1.0))),
            "confidence_delta": max(0.01, min(0.08, 0.03 * float(row["weight"] or 1.0))),
            "now": now,
        }
        for row in rows
    ]
    db.execute(
        text(
            """
            INSERT INTO "UserMastery" (
                "id", "userId", "competencyId", "score", "confidence",
                "evidenceCount", "updatedAt", "createdAt"
            )
            VALUES (
                :id, :user_id, :competency_id, :score_delta, :confidence_delta,
                1, :now, :now
            )
            ON CONFLICT ("userId", "competencyId")
            DO UPDATE SET
                "score" = LEAST(100, "UserMastery"."score" + :score_delta),
                "confidence" = LEAST(1, "UserMastery"."confidence" + :confidence_delta),
                "evidenceCount" = "UserMastery"."evidenceCount" + 1,
                "updatedAt" = :now
            """
        ),
        upsert_params,
    )


def get_mastery_summary(db: Session, user_id: str) -> dict[str, object]:
    avg_row = db.execute(
        text('SELECT COALESCE(AVG("score"), 0) AS avg_score FROM "UserMastery" WHERE "userId" = :user_id'),
        {"user_id": user_id},
    ).mappings().first()
    weak = db.execute(
        text(
            """
            SELECT c."code", c."titleRu", c."titleEn", um."score"
            FROM "UserMastery" um
            JOIN "Competency" c ON c."id" = um."competencyId"
            WHERE um."userId" = :user_id
            ORDER BY um."score" ASC
            LIMIT 3
            """
        ),
        {"user_id": user_id},
    ).mappings().all()
    return {
        "avgScore": round(float(avg_row["avg_score"] or 0), 2),
        "weakest": [dict(row) for row in weak],
    }
