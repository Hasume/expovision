from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.core.rate_limit import limit
from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user
from app.services.common_queries import get_effective_intensive, get_user
from app.services.gemini_client import GeminiServiceError, gemini_client
from app.services.intensive import ensure_platform_accessible, resolve_intensive_state
from app.core.config import settings
from app.services.kinescope import build_chat_url, build_embed_url, video_duration_minutes
from app.services.webinar_duration import webinar_minutes_by_id_after_sync
from app.services.chat_events import emit_system_message
from app.services.mastery import update_mastery_for_lesson_completion
from app.services.unlock import calculate_current_day, effective_current_day_for_access, is_map_unlocked


router = APIRouter(prefix="/curriculum", tags=["curriculum"])


class CompleteLessonRequest(BaseModel):
    lessonId: str


def _safe_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _normalize_lesson_kinescope_id(raw: object) -> str | None:
    """Strip placeholders so stray admin values do not open an empty Kinescope frame."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if s.lower() in ("-", "none", "null", "n/a", "todo", "tbd", "нет"):
        return None
    return s


def _build_library_catalog(db: Session, user: CurrentUser) -> dict[str, Any]:
    """Return published course catalog and progress for GET /library."""
    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row or not intensive:
        raise HTTPException(status_code=400, detail="User or intensive config not found")
    ensure_platform_accessible(intensive)
    intensive_state = resolve_intensive_state(intensive)
    is_ru = user.language == "ru"

    course_rows = db.execute(
        text("""
            SELECT "id", "titleRu", "titleEn", "descriptionRu", "descriptionEn", "coverUrl", "sortOrder"
            FROM "Course"
            ORDER BY "sortOrder" ASC, "createdAt" ASC
        """)
    ).mappings().all()

    lesson_rows = db.execute(
        text("""
            SELECT
              cl."courseId",
              l."id",
              l."kind",
              l."titleRu",
              l."titleEn",
              l."kinescopeVideoId",
              d."dayNumber",
              d."track",
              cl."sortOrder" AS "clSort",
              EXISTS(
                SELECT 1
                FROM "LessonProgress" lp
                WHERE lp."lessonId" = l."id"
                  AND lp."userId" = :user_id
                  AND lp."status" = 'completed'
              ) AS completed
            FROM "CourseLesson" cl
            JOIN "Lesson" l ON l."id" = cl."lessonId"
            LEFT JOIN LATERAL (
                SELECT MIN(d2."dayNumber") AS "dayNumber", MIN(d2."track") AS "track"
                FROM "LessonDay" ld2
                JOIN "CurriculumDay" d2 ON d2."id" = ld2."curriculumDayId"
                WHERE ld2."lessonId" = l."id"
            ) d ON true
            ORDER BY cl."sortOrder" ASC
        """),
        {"user_id": user.user_id},
    ).mappings().all()

    lessons_by_course: dict[str, list] = {}
    for row in lesson_rows:
        cid = row["courseId"]
        ks_id = row["kinescopeVideoId"]
        embed_url = build_embed_url(ks_id, user.email) if ks_id else None
        chat_url = build_chat_url(ks_id) if ks_id else None
        lessons_by_course.setdefault(cid, []).append({
            "id": row["id"],
            "dayNumber": row["dayNumber"],
            "track": row["track"],
            "kind": row["kind"],
            "title": _pick_locale(row["titleRu"], row["titleEn"], is_ru, "Lesson"),
            "completed": bool(row["completed"]),
            "access": "open" if intensive_state.ended else "preview",
            "videoProtected": bool(ks_id),
            "kinescopeEmbedUrl": embed_url if intensive_state.ended else None,
            "kinescopeChatUrl": chat_url if intensive_state.ended else None,
        })

    courses = []
    for cr in course_rows:
        courses.append({
            "id": cr["id"],
            "title": _pick_locale(cr["titleRu"], cr["titleEn"], is_ru, "Course"),
            "description": _pick_locale(cr["descriptionRu"], cr["descriptionEn"], is_ru),
            "coverUrl": cr["coverUrl"],
            "lessons": lessons_by_course.get(cr["id"], []),
        })

    total_lessons = sum(len(c["lessons"]) for c in courses)
    return {
        "canAccess": intensive_state.ended,
        "intensiveEnded": intensive_state.ended,
        "totalLessons": total_lessons,
        "publicationMessage": (
            "Библиотека полных курсов откроется после завершения интенсива. Сейчас доступен просмотр структуры и уроков."
            if is_ru
            else "The full-course library unlocks after the intensive ends. You can preview the structure and lessons now."
        ),
        "courses": courses,
    }


def _pick_locale(ru: str | None, en: str | None, is_ru: bool, fallback: str = "") -> str:
    primary = (ru if is_ru else en) or ""
    if primary.strip():
        return primary
    secondary = (en if is_ru else ru) or ""
    if secondary.strip():
        return secondary
    return fallback


def _fluency_row_to_payload(row: Any) -> dict[str, Any]:
    return {
        "lessonId": row["lessonId"],
        "framework": "4D",
        "delegation": json.loads(row["delegationJson"] or "[]"),
        "description": json.loads(row["descriptionJson"] or "[]"),
        "discernment": json.loads(row["discernmentJson"] or "[]"),
        "diligence": json.loads(row["diligenceJson"] or "[]"),
        "practiceTask": row["practiceTask"] or "",
    }


def build_roadmap_payload(db: Session, user: CurrentUser, *, _intensive: dict | None = None) -> list[dict]:
    """Return all 14 days with lesson completion status in a single query.
    Replaces 14× /curriculum/day/{n} calls on dashboard load."""
    intensive = _intensive if _intensive is not None else get_effective_intensive(db, user.user_id)
    if not intensive:
        raise HTTPException(status_code=400, detail="Intensive config not found")
    ensure_platform_accessible(intensive)
    intensive_state = resolve_intensive_state(intensive)
    if not intensive_state.ended and not is_map_unlocked(user.report_completed):
        raise HTTPException(status_code=403, detail="Complete the initial report to unlock route map")

    start_iso = intensive["startAt"].isoformat() if intensive.get("startAt") else None
    current_day = effective_current_day_for_access(start_iso, intensive_state.open, intensive_state.ended)
    is_ru = user.language == "ru"

    params: dict = {"user_id": user.user_id}
    day_filter_sql = 'd."track" IS NULL'
    flow_filter_sql = "1=1"

    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_filter_sql = (
            'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd'
            ' WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        )
        params["flow_id"] = intensive["id"]
    if user.selected_track:
        day_filter_sql = '(d."track" IS NULL OR d."track" = :selected_track)'
        params["selected_track"] = user.selected_track

    rows = db.execute(
        text(f"""
            SELECT
                d."id"        AS day_id,
                d."dayNumber" AS day_number,
                d."track",
                l."id"        AS lesson_id,
                ld."kind",
                l."titleRu",
                l."titleEn",
                ld."sortOrder",
                EXISTS(
                    SELECT 1 FROM "LessonProgress" lp
                    WHERE lp."lessonId" = l."id" AND lp."userId" = :user_id
                ) AS done,
                (SELECT a."titleRu" FROM "Artifact" a
                 WHERE a."curriculumDayId" = d."id" ORDER BY a."id" LIMIT 1) AS artifact_ru,
                (SELECT a."titleEn" FROM "Artifact" a
                 WHERE a."curriculumDayId" = d."id" ORDER BY a."id" LIMIT 1) AS artifact_en
            FROM "CurriculumDay" d
            LEFT JOIN "LessonDay" ld ON ld."curriculumDayId" = d."id"
            LEFT JOIN "Lesson" l ON l."id" = ld."lessonId"
            WHERE d."dayNumber" BETWEEN 1 AND 14
              AND {day_filter_sql}
              AND {flow_filter_sql}
            ORDER BY d."dayNumber" ASC, d."track" NULLS FIRST, ld."sortOrder" ASC NULLS LAST
        """),
        params,
    ).mappings().all()

    days_map: dict[int, dict] = {}
    for row in rows:
        day_num = row["day_number"]
        if day_num not in days_map:
            days_map[day_num] = {
                "dayNumber": day_num,
                "track": row["track"] if day_num >= 8 else None,
                "lessons": [],
                "artifactTitle": _pick_locale(
                    row["artifact_ru"], row["artifact_en"], is_ru,
                    f"Артефакт дня {day_num}" if is_ru else f"Artifact for day {day_num}",
                ),
            }
        if row["lesson_id"] is not None:
            status = "completed" if row["done"] else ("available" if day_num <= current_day else "locked")
            days_map[day_num]["lessons"].append(
                {
                    "id": row["lesson_id"],
                    "title": _pick_locale(row["titleRu"], row["titleEn"], is_ru, f"Day {day_num} lesson"),
                    "kind": row["kind"],
                    "status": status,
                }
            )

    needs_track = not user.selected_track and current_day >= 7

    result = []
    for day_num in range(1, 15):
        day_data = days_map.get(
            day_num,
            {
                "dayNumber": day_num,
                "track": None,
                "lessons": [],
                "artifactTitle": f"Артефакт дня {day_num}" if is_ru else f"Artifact for day {day_num}",
            },
        )
        # Tag days 8-14 with track gate info when user hasn't selected a track
        if day_num >= 8 and needs_track and not day_data["lessons"]:
            day_data = {**day_data, "trackRequired": True}
        result.append(day_data)

    web_rows = db.execute(
        text(
            f"""
            SELECT d."dayNumber", w."id", w."titleRu", w."titleEn", w."startsAtIso", w."durationMinutes", w."joinUrl", w."summaryRu", w."summaryEn", w."kinescopeVideoId"
            FROM "Webinar" w
            JOIN "CurriculumDay" d ON d."id" = w."curriculumDayId"
            WHERE d."dayNumber" BETWEEN 1 AND 14
              AND {day_filter_sql}
              AND {flow_filter_sql}
            ORDER BY d."dayNumber" ASC, w."startsAtIso" ASC NULLS LAST
            """
        ),
        params,
    ).mappings().all()
    web_duration_map = webinar_minutes_by_id_after_sync(db, list(web_rows))
    web_by_day: dict[int, list] = {}
    for row in web_rows:
        dn = int(row["dayNumber"])
        st = row["startsAtIso"]
        web_by_day.setdefault(dn, []).append(
            {
                "id": row["id"],
                "title": _pick_locale(row["titleRu"], row["titleEn"], is_ru, "Webinar"),
                "startsAtIso": st.isoformat() if st else None,
                "durationMinutes": web_duration_map[str(row["id"])],
                "joinUrl": row["joinUrl"],
                "summary": _pick_locale(row["summaryRu"], row["summaryEn"], is_ru, ""),
            }
        )
    for item in result:
        item["webinars"] = web_by_day.get(item["dayNumber"], [])
    return result


@router.get("/roadmap")
def roadmap(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_roadmap_payload(db, user)


@router.get("/day/{day_number}")
def by_day(day_number: int, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    intensive = get_effective_intensive(db, user.user_id)
    if not intensive:
        raise HTTPException(status_code=400, detail="Intensive config not found")
    ensure_platform_accessible(intensive)
    intensive_state = resolve_intensive_state(intensive)
    if not intensive_state.ended and not is_map_unlocked(user.report_completed):
        raise HTTPException(status_code=403, detail="Complete the initial report to unlock route map")

    start_iso = intensive["startAt"].isoformat() if intensive.get("startAt") else None
    current_day = effective_current_day_for_access(start_iso, intensive_state.open, intensive_state.ended)
    params = {"day_number": day_number, "user_id": user.user_id}
    day_filter_sql = 'd."track" IS NULL'
    flow_filter_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_filter_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        params["flow_id"] = intensive["id"]
    if user.selected_track:
        day_filter_sql = '(d."track" IS NULL OR d."track" = :selected_track)'
        params["selected_track"] = user.selected_track

    day_rows = db.execute(
        text(
            f"""
            SELECT d."id", d."dayNumber", d."track"
            FROM "CurriculumDay" d
            WHERE d."dayNumber" = :day_number
              AND {day_filter_sql}
              AND {flow_filter_sql}
            ORDER BY d."track" NULLS FIRST
            """
        ),
        params,
    ).mappings().all()
    if not day_rows:
        raise HTTPException(status_code=404, detail="Day not found")
    day_ids = [row["id"] for row in day_rows]

    lessons_query = text(
            """
            SELECT l."id", ld."kind", l."titleRu", l."titleEn",
                   EXISTS(
                      SELECT 1 FROM "LessonProgress" lp
                      WHERE lp."lessonId" = l."id" AND lp."userId" = :user_id
                   ) AS done
            FROM "LessonDay" ld
            JOIN "Lesson" l ON l."id" = ld."lessonId"
            WHERE ld."curriculumDayId" IN :day_ids
            ORDER BY ld."sortOrder" ASC
            """
        ).bindparams(bindparam("day_ids", expanding=True))
    lessons = db.execute(lessons_query, {"user_id": user.user_id, "day_ids": day_ids}).mappings().all()

    artifacts_query = text(
        'SELECT "titleRu", "titleEn" FROM "Artifact" WHERE "curriculumDayId" IN :day_ids LIMIT 1'
    ).bindparams(bindparam("day_ids", expanding=True))
    artifacts = db.execute(
        artifacts_query,
        {"day_ids": day_ids},
    ).mappings().first()

    is_ru = user.language == "ru"
    payload_lessons = []
    for lesson in lessons:
        status = "completed" if lesson["done"] else ("available" if day_number <= current_day else "locked")
        payload_lessons.append(
            {
                "id": lesson["id"],
                "title": _pick_locale(lesson["titleRu"], lesson["titleEn"], is_ru, f"Day {day_number} lesson"),
                "kind": lesson["kind"],
                "status": status,
            }
        )

    artifact_title = (
        _pick_locale(artifacts["titleRu"], artifacts["titleEn"], is_ru)
        if artifacts
        else (f"Артефакт дня {day_number}" if is_ru else f"Artifact for day {day_number}")
    )

    webinars_raw = db.execute(
        text(
            """
            SELECT w."id", w."titleRu", w."titleEn", w."startsAtIso", w."durationMinutes", w."joinUrl", w."summaryRu", w."summaryEn", w."kinescopeVideoId"
            FROM "Webinar" w
            WHERE w."curriculumDayId" IN :day_ids
            ORDER BY w."startsAtIso" ASC NULLS LAST
            """
        ).bindparams(bindparam("day_ids", expanding=True)),
        {"day_ids": day_ids},
    ).mappings().all()
    wdur = webinar_minutes_by_id_after_sync(db, list(webinars_raw))
    payload_webinars = []
    for wrow in webinars_raw:
        st = wrow["startsAtIso"]
        wstatus = "available" if day_number <= current_day else "locked"
        payload_webinars.append(
            {
                "id": wrow["id"],
                "title": _pick_locale(wrow["titleRu"], wrow["titleEn"], is_ru, "Webinar"),
                "startsAtIso": st.isoformat() if st else None,
                "durationMinutes": wdur[str(wrow["id"])],
                "joinUrl": wrow["joinUrl"],
                "summary": _pick_locale(wrow["summaryRu"], wrow["summaryEn"], is_ru, ""),
                "status": wstatus,
            }
        )
    return {
        "dayNumber": day_number,
        "track": user.selected_track if day_number >= 8 else None,
        "lessons": payload_lessons,
        "artifactTitle": artifact_title,
        "webinars": payload_webinars,
    }


@router.get("/library")
def library(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return _build_library_catalog(db, user)


@router.get("/lesson/{lesson_id}/ai-fluency", dependencies=[Depends(limit(10, 60))])
def lesson_ai_fluency(lesson_id: str, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    ensure_platform_accessible(intensive)
    _int_st = resolve_intensive_state(intensive)
    if not _int_st.ended and not is_map_unlocked(user_row["reportCompleted"]):
        raise HTTPException(status_code=403, detail="Complete the initial report to unlock lessons")

    lesson_row = db.execute(
        text(
            """
            SELECT l."id", l."titleRu", l."titleEn", l."contentRu", l."contentEn",
                   (
                     SELECT MIN(d2."dayNumber")
                     FROM "LessonDay" ld2
                     JOIN "CurriculumDay" d2 ON d2."id" = ld2."curriculumDayId"
                     WHERE ld2."lessonId" = l."id"
                   ) AS "dayNumber"
            FROM "Lesson" l
            WHERE l."id" = :lesson_id
            LIMIT 1
            """
        ),
        {"lesson_id": lesson_id},
    ).mappings().first()
    if not lesson_row:
        raise HTTPException(status_code=404, detail="Lesson not found")

    is_ru = user.language == "ru"
    lesson_title = _pick_locale(lesson_row["titleRu"], lesson_row["titleEn"], is_ru, "Lesson")
    lesson_content = _pick_locale(lesson_row["contentRu"], lesson_row["contentEn"], is_ru)
    if not gemini_client.enabled:
        return {
            "lessonId": lesson_id,
            "framework": "4D",
            "delegation": [("Разбей задание на шаги" if is_ru else "Break the assignment into clear steps")],
            "description": [("Сформулируй промпт с ролью и контекстом" if is_ru else "Write a prompt with role and context")],
            "discernment": [("Проверь факты и слабые места ответа AI" if is_ru else "Validate facts and weak points in AI output")],
            "diligence": [("Зафиксируй, что сделал сам и что делегировал AI" if is_ru else "Record what you did yourself vs delegated to AI")],
            "practiceTask": (
                f"Применить 4D к уроку «{lesson_title}» и описать результат."
                if is_ru
                else f"Apply the 4D method to lesson '{lesson_title}' and document outcomes."
            ),
        }

    prompt = (
        f"""
        Создай короткий практический AI Fluency plan в формате 4D для урока.
        Верни только JSON:
        {{
          "delegation": ["..."],
          "description": ["..."],
          "discernment": ["..."],
          "diligence": ["..."],
          "practiceTask": "..."
        }}
        Урок: {lesson_title}
        Контент:
        {lesson_content}
        """
        if is_ru
        else f"""
        Build a concise 4D AI Fluency practice plan for this lesson.
        Return only JSON:
        {{
          "delegation": ["..."],
          "description": ["..."],
          "discernment": ["..."],
          "diligence": ["..."],
          "practiceTask": "..."
        }}
        Lesson: {lesson_title}
        Content:
        {lesson_content}
        """
    )
    try:
        response = gemini_client.generate_json(prompt)
    except GeminiServiceError as exc:
        raise HTTPException(status_code=502, detail="AI fluency coach is temporarily unavailable") from exc

    payload = {
        "lessonId": lesson_id,
        "framework": "4D",
        "delegation": _safe_list(response.get("delegation")),
        "description": _safe_list(response.get("description")),
        "discernment": _safe_list(response.get("discernment")),
        "diligence": _safe_list(response.get("diligence")),
        "practiceTask": str(response.get("practiceTask", "")).strip(),
    }
    existing = db.execute(
        text(
            """
            SELECT "id"
            FROM "LessonAiFluencyState"
            WHERE "userId" = :user_id AND "lessonId" = :lesson_id
            """
        ),
        {"user_id": user.user_id, "lesson_id": lesson_id},
    ).first()
    now = datetime.now(timezone.utc)
    if existing:
        db.execute(
            text(
                """
                UPDATE "LessonAiFluencyState"
                SET "framework" = :framework,
                    "delegationJson" = :delegation_json,
                    "descriptionJson" = :description_json,
                    "discernmentJson" = :discernment_json,
                    "diligenceJson" = :diligence_json,
                    "practiceTask" = :practice_task,
                    "updatedAt" = :updated_at
                WHERE "userId" = :user_id AND "lessonId" = :lesson_id
                """
            ),
            {
                "framework": "4D",
                "delegation_json": json.dumps(payload["delegation"], ensure_ascii=False),
                "description_json": json.dumps(payload["description"], ensure_ascii=False),
                "discernment_json": json.dumps(payload["discernment"], ensure_ascii=False),
                "diligence_json": json.dumps(payload["diligence"], ensure_ascii=False),
                "practice_task": payload["practiceTask"],
                "updated_at": now,
                "user_id": user.user_id,
                "lesson_id": lesson_id,
            },
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "LessonAiFluencyState" (
                    "id", "userId", "lessonId", "framework", "delegationJson", "descriptionJson", "discernmentJson",
                    "diligenceJson", "practiceTask", "createdAt", "updatedAt"
                )
                VALUES (
                    :id, :user_id, :lesson_id, :framework, :delegation_json, :description_json, :discernment_json,
                    :diligence_json, :practice_task, :created_at, :updated_at
                )
                """
            ),
            {
                "id": str(uuid4()),
                "framework": "4D",
                "delegation_json": json.dumps(payload["delegation"], ensure_ascii=False),
                "description_json": json.dumps(payload["description"], ensure_ascii=False),
                "discernment_json": json.dumps(payload["discernment"], ensure_ascii=False),
                "diligence_json": json.dumps(payload["diligence"], ensure_ascii=False),
                "practice_task": payload["practiceTask"],
                "created_at": now,
                "updated_at": now,
                "user_id": user.user_id,
                "lesson_id": lesson_id,
            },
        )
    db.commit()
    return payload


@router.get("/lesson/{lesson_id}/ai-fluency/state")
def lesson_ai_fluency_state(lesson_id: str, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    ensure_platform_accessible(intensive)
    _int_st = resolve_intensive_state(intensive)
    if not _int_st.ended and not is_map_unlocked(user_row["reportCompleted"]):
        raise HTTPException(status_code=403, detail="Complete the initial report to unlock lessons")

    row = db.execute(
        text(
            """
            SELECT "lessonId", "delegationJson", "descriptionJson", "discernmentJson", "diligenceJson", "practiceTask"
            FROM "LessonAiFluencyState"
            WHERE "userId" = :user_id AND "lessonId" = :lesson_id
            LIMIT 1
            """
        ),
        {"user_id": user.user_id, "lesson_id": lesson_id},
    ).mappings().first()
    if not row:
        return {"exists": False}
    return {"exists": True, "payload": _fluency_row_to_payload(row)}


@router.get("/lesson/{lesson_id}")
def lesson(lesson_id: str, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user_row = get_user(db, user.user_id)
    intensive = get_effective_intensive(db, user.user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")
    ensure_platform_accessible(intensive)
    intensive_state = resolve_intensive_state(intensive)
    if not intensive_state.ended and not is_map_unlocked(user_row["reportCompleted"]):
        raise HTTPException(status_code=403, detail="Complete the initial report to unlock lessons")

    lesson_params = {"lesson_id": lesson_id}
    lesson_flow_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        lesson_flow_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        lesson_params["flow_id"] = intensive["id"]
    lesson_row = db.execute(
        text(
            f"""
            SELECT l."id", l."titleRu", l."titleEn", l."videoUrl", l."kinescopeVideoId",
                   l."contentRu", l."contentEn",
                   COALESCE(ld."kind", l."kind") AS kind,
                   ld."curriculumDayId", d."dayNumber"
            FROM "Lesson" l
            LEFT JOIN "LessonDay" ld ON ld."lessonId" = l."id"
            LEFT JOIN "CurriculumDay" d ON d."id" = ld."curriculumDayId"
            WHERE l."id" = :lesson_id
              AND (ld."lessonId" IS NULL OR {lesson_flow_sql})
            ORDER BY d."dayNumber" ASC NULLS LAST
            LIMIT 1
            """
        ),
        lesson_params,
    ).mappings().first()
    if not lesson_row:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Day-level access check: block lessons from future days (all days allowed after intensive end)
    day_number = lesson_row["dayNumber"]
    if day_number is not None and not intensive_state.ended:
        if intensive_state.open and intensive.get("startAt"):
            current_day = calculate_current_day(intensive["startAt"].isoformat())
            if day_number > current_day:
                raise HTTPException(
                    status_code=403,
                    detail=f"Day {day_number} is not yet available. Currently on day {current_day}.",
                )

    images = db.execute(
        text(
            """
            SELECT "url", "captionRu", "captionEn"
            FROM "LessonImage"
            WHERE "lessonId" = :lesson_id
            ORDER BY "sortOrder" ASC
            """
        ),
        {"lesson_id": lesson_id},
    ).mappings().all()
    hw = db.execute(
        text(
            """
            SELECT "id", "instructionRu", "instructionEn", "sampleRu", "sampleEn", "minLength"
            FROM "HomeworkTemplate"
            WHERE "lessonId" = :lesson_id
            LIMIT 1
            """
        ),
        {"lesson_id": lesson_id},
    ).mappings().first()

    day_id = lesson_row.get("curriculumDayId")
    artifact_rows = []
    if day_id:
        artifact_rows = db.execute(
            text(
                """
                SELECT "titleRu", "titleEn", "resourceUrl"
                FROM "Artifact"
                WHERE "curriculumDayId" = :day_id
                ORDER BY "id" ASC
                """
            ),
            {"day_id": day_id},
        ).mappings().all()

    is_ru = user.language == "ru"
    video_url_set = bool(str(lesson_row.get("videoUrl") or "").strip())
    ks_id = _normalize_lesson_kinescope_id(lesson_row.get("kinescopeVideoId"))
    # Primary player is videoUrl when set; Kinescope is only for lessons without a separate video URL.
    if video_url_set:
        embed_url = None
        chat_url = None
    else:
        embed_url = build_embed_url(ks_id, user.email) if ks_id else None
        chat_url = build_chat_url(ks_id) if ks_id else None

    lesson_duration_minutes: int | None = None
    if not video_url_set and ks_id and settings.kinescope_api_token:
        lesson_duration_minutes = video_duration_minutes(ks_id)

    lesson_completed = bool(
        db.execute(
            text(
                """
                SELECT 1 FROM "LessonProgress"
                WHERE "userId" = :uid AND "lessonId" = :lid AND "status" = 'completed'
                LIMIT 1
                """
            ),
            {"uid": user.user_id, "lid": lesson_id},
        ).first()
    )

    day_lessons: list[dict[str, Any]] = []
    if day_id:
        current_day_num: int | None = None
        if intensive_state.ended:
            current_day_num = 14
        elif intensive_state.open and intensive.get("startAt"):
            current_day_num = calculate_current_day(intensive["startAt"].isoformat())

        sib_rows = db.execute(
            text(
                """
                SELECT l."id", l."titleRu", l."titleEn", ld."kind", ld."sortOrder",
                  EXISTS(
                    SELECT 1 FROM "LessonProgress" lp
                    WHERE lp."lessonId" = l."id" AND lp."userId" = :uid AND lp."status" = 'completed'
                  ) AS completed
                FROM "LessonDay" ld
                JOIN "Lesson" l ON l."id" = ld."lessonId"
                WHERE ld."curriculumDayId" = :day_id
                ORDER BY
                  CASE WHEN ld."kind" = 'mandatory' THEN 0 ELSE 1 END,
                  ld."sortOrder" ASC
                """
            ),
            {"day_id": day_id, "uid": user.user_id},
        ).mappings().all()

        for row in sib_rows:
            lid = row["id"]
            locked = bool(
                day_number is not None
                and current_day_num is not None
                and day_number > current_day_num
            )
            day_lessons.append(
                {
                    "id": lid,
                    "title": _pick_locale(row["titleRu"], row["titleEn"], is_ru, "Lesson"),
                    "kind": row["kind"],
                    "completed": bool(row["completed"]),
                    "isCurrent": lid == lesson_id,
                    "locked": locked,
                }
            )

    return {
        "id": lesson_row["id"],
        "dayNumber": lesson_row["dayNumber"],
        "title": _pick_locale(lesson_row["titleRu"], lesson_row["titleEn"], is_ru, "Lesson"),
        "videoUrl": lesson_row["videoUrl"],
        "kinescopeEmbedUrl": embed_url,
        "kinescopeChatUrl": chat_url,
        "content": _pick_locale(lesson_row["contentRu"], lesson_row["contentEn"], is_ru),
        "kind": lesson_row["kind"],
        "durationMinutes": lesson_duration_minutes,
        "lessonCompleted": lesson_completed,
        "dayLessons": day_lessons,
        "images": [{"url": row["url"], "caption": _pick_locale(row["captionRu"], row["captionEn"], is_ru)} for row in images],
        "homework": (
            {
                "templateId": hw["id"],
                "instruction": _pick_locale(hw["instructionRu"], hw["instructionEn"], is_ru),
                "sample": _pick_locale(hw["sampleRu"], hw["sampleEn"], is_ru),
                "minLength": hw["minLength"],
            }
            if hw
            else None
        ),
        "artifacts": [
            {
                "title": _pick_locale(row["titleRu"], row["titleEn"], is_ru, "Artifact"),
                "resourceUrl": (row["resourceUrl"] or "").strip(),
            }
            for row in artifact_rows
        ],
    }


@router.post("/lesson/complete")
def complete_lesson(
    payload: CompleteLessonRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    intensive = get_effective_intensive(db, user.user_id)
    ensure_platform_accessible(intensive)
    lesson = db.execute(
        text('SELECT "id", "titleRu", "titleEn" FROM "Lesson" WHERE "id" = :id'),
        {"id": payload.lessonId},
    ).mappings().first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    now = datetime.now(timezone.utc)
    existing = db.execute(
        text(
            """
            SELECT "id"
            FROM "LessonProgress"
            WHERE "userId" = :user_id AND "lessonId" = :lesson_id
            """
        ),
        {"user_id": user.user_id, "lesson_id": payload.lessonId},
    ).first()
    if existing:
        db.execute(
            text(
                """
                UPDATE "LessonProgress"
                SET "status" = 'completed', "completedAt" = :completed_at
                WHERE "userId" = :user_id AND "lessonId" = :lesson_id
                """
            ),
            {"completed_at": now, "user_id": user.user_id, "lesson_id": payload.lessonId},
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "LessonProgress" ("id", "userId", "lessonId", "status", "completedAt")
                VALUES (:id, :user_id, :lesson_id, 'completed', :completed_at)
                """
            ),
            {"id": str(uuid4()), "user_id": user.user_id, "lesson_id": payload.lessonId, "completed_at": now},
        )
    update_mastery_for_lesson_completion(db, user.user_id, payload.lessonId)
    lesson_title = _pick_locale(lesson.get("titleRu"), lesson.get("titleEn"), user.language == "ru", "Lesson")
    emit_system_message(db, user_id=user.user_id, event_type="lesson_completed", meta={"lessonTitle": lesson_title})
    db.commit()
    return {"success": True}
