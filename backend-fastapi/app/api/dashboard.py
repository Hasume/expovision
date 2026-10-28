import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.rate_limit import limit
from app.api.auth import me_response_from_current_user
from app.api.curriculum import build_roadmap_payload
from app.api.final import build_final_status_payload
from app.api.homework import build_homework_mine_payload
from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user
from app.services.common_queries import get_effective_intensive
from app.services.webinar_duration import webinar_minutes_by_id_after_sync
from app.services.gemini_client import GeminiServiceError, gemini_client
from app.services.intensive import resolve_intensive_state
from app.services.mastery import get_mastery_summary
from app.services.unlock import calculate_current_day, effective_current_day_for_access, is_map_unlocked, is_split_available


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardAssistantRequest(BaseModel):
    question: str = Field(min_length=2, max_length=4000)


def _safe_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]



def _pick_locale(ru: str | None, en: str | None, is_ru: bool) -> str:
    primary = (ru if is_ru else en) or ""
    if primary.strip():
        return primary
    fallback = (en if is_ru else ru) or ""
    return fallback


def _estimate_learning_minutes(action: dict[str, int]) -> int:
    return (
        action["lessonsCompleted"] * 18
        + action["homeworkSubmitted"] * 22
        + action["fluencyGenerated"] * 10
        + action["reflectionAdded"] * 8
    )


def _load_user_dashboard_context(db: Session, user: "CurrentUser"):
    intensive = get_effective_intensive(db, user.user_id)
    if not intensive:
        raise HTTPException(status_code=400, detail="Intensive config not found")

    intensive_state = resolve_intensive_state(intensive)
    start_iso = intensive["startAt"].isoformat() if intensive.get("startAt") else None
    current_day = effective_current_day_for_access(start_iso, intensive_state.open, intensive_state.ended)
    display_day = calculate_current_day(start_iso) if start_iso else current_day
    if intensive_state.ended:
        display_day = 14
    is_ru = user.language == "ru"
    map_open = intensive_state.ended or (intensive_state.open and is_map_unlocked(user.report_completed))
    ctx_params: dict[str, object] = {"user_id": user.user_id}
    day_filter_sql = 'd."track" IS NULL'
    flow_filter_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_filter_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        ctx_params["flow_id"] = intensive["id"]
    if user.selected_track:
        day_filter_sql = '(d."track" IS NULL OR d."track" = :selected_track)'
        ctx_params["selected_track"] = user.selected_track

    hw_stats = db.execute(
        text(
            """
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN "status" = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
              SUM(CASE WHEN "status" != 'overdue' THEN 1 ELSE 0 END) AS completed_count
            FROM "HomeworkSubmission"
            WHERE "userId" = :user_id
            """
        ),
        {"user_id": user.user_id},
    ).mappings().first()

    progress_stats = db.execute(
        text(
            f"""
            SELECT
              COUNT(DISTINCT l."id") FILTER (WHERE lp."id" IS NOT NULL) AS completed_lessons,
              COUNT(DISTINCT l."id") AS total_lessons
            FROM "Lesson" l
            JOIN "LessonDay" ld ON ld."lessonId" = l."id"
            JOIN "CurriculumDay" d ON d."id" = ld."curriculumDayId"
            LEFT JOIN "LessonProgress" lp
              ON lp."lessonId" = l."id"
             AND lp."userId" = :user_id
            WHERE {day_filter_sql}
              AND {flow_filter_sql}
            """
        ),
        ctx_params,
    ).mappings().first()

    webinars = db.execute(
        text(
            f"""
            SELECT w."titleRu", w."titleEn", w."joinUrl", d."dayNumber"
            FROM "Webinar" w
            JOIN "CurriculumDay" d ON d."id" = w."curriculumDayId"
            WHERE {day_filter_sql}
              AND {flow_filter_sql}
            ORDER BY d."dayNumber" ASC
            LIMIT 3
            """
        ),
        ctx_params,
    ).mappings().all()

    action_stats_row = db.execute(
        text(
            """
            SELECT
              (SELECT COUNT(*) FROM "LessonProgress" lp WHERE lp."userId" = :user_id AND lp."status" = 'completed') AS lessons_completed,
              (SELECT COUNT(*) FROM "HomeworkSubmission" hs WHERE hs."userId" = :user_id) AS homework_submitted,
              (SELECT COUNT(*) FROM "LessonAiFluencyState" fs WHERE fs."userId" = :user_id) AS fluency_generated,
              (SELECT COUNT(*) FROM "HomeworkSubmission" hs WHERE hs."userId" = :user_id AND COALESCE(TRIM(hs."reflectionText"), '') <> '') AS reflection_added
            """
        ),
        {"user_id": user.user_id},
    ).mappings().first()
    action_stats = {
        "lessonsCompleted": int((action_stats_row or {}).get("lessons_completed") or 0),
        "homeworkSubmitted": int((action_stats_row or {}).get("homework_submitted") or 0),
        "fluencyGenerated": int((action_stats_row or {}).get("fluency_generated") or 0),
        "reflectionAdded": int((action_stats_row or {}).get("reflection_added") or 0),
    }
    action_stats["actionCount"] = (
        action_stats["lessonsCompleted"]
        + action_stats["homeworkSubmitted"]
        + action_stats["fluencyGenerated"]
        + action_stats["reflectionAdded"]
    )
    action_stats["minutesSpent"] = _estimate_learning_minutes(action_stats)

    mastery = get_mastery_summary(db, user.user_id)
    return {
        "user": user,
        "intensive": intensive,
        "intensive_state": intensive_state,
        "current_day": display_day,
        "is_ru": is_ru,
        "map_open": map_open,
        "homework_total": int(hw_stats["total"] or 0),
        "homework_overdue": int(hw_stats["overdue_count"] or 0),
        "homework_completed": int(hw_stats["completed_count"] or 0),
        "lessons_completed": int(progress_stats["completed_lessons"] or 0),
        "lessons_total": int(progress_stats["total_lessons"] or 0),
        "webinars": webinars,
        "mastery": mastery,
    }


def format_countdown(seconds: int, is_ru: bool) -> str:
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60
    if is_ru:
        if seconds < 60:
            return "меньше минуты"
        return f"{days}д {hours}ч {minutes}м"
    if seconds < 60:
        return "less than a minute"
    return f"{days}d {hours}h {minutes}m"


def build_dashboard_payload(db: Session, user: CurrentUser, *, _intensive: dict | None = None) -> dict:
    intensive = _intensive if _intensive is not None else get_effective_intensive(db, user.user_id)
    if not intensive:
        raise HTTPException(status_code=400, detail="Intensive config not found")

    day_filter_sql = '"d"."track" IS NULL'
    params = {"user_id": user.user_id, "current_day": 1}
    flow_filter_sql = "1=1"
    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        flow_filter_sql = 'EXISTS (SELECT 1 FROM "IntensiveFlowDay" fd WHERE fd."flowId" = :flow_id AND fd."curriculumDayId" = d."id")'
        params["flow_id"] = intensive["id"]
    if user.selected_track:
        day_filter_sql = '("d"."track" IS NULL OR "d"."track" = :selected_track)'
        params["selected_track"] = user.selected_track

    intensive_state = resolve_intensive_state(intensive)
    start_iso = intensive["startAt"].isoformat() if intensive.get("startAt") else None
    current_day = effective_current_day_for_access(start_iso, intensive_state.open, intensive_state.ended)
    params["current_day"] = current_day
    # UI day counter: when the intensive is over (natural or early), show day 14 so dashboard
    # matches full programme completion (access_day is already 14 via effective_current_day_for_access).
    display_day = calculate_current_day(start_iso) if start_iso else current_day
    if intensive_state.ended:
        display_day = 14

    lessons = db.execute(
        text(
            f"""
            SELECT l."id", (lp."id" IS NOT NULL) AS done
            FROM "Lesson" l
            JOIN (
              SELECT DISTINCT ld."lessonId"
              FROM "LessonDay" ld
              JOIN "CurriculumDay" d ON d."id" = ld."curriculumDayId"
              WHERE d."dayNumber" <= :current_day
                AND {day_filter_sql}
                AND {flow_filter_sql}
            ) eligible ON eligible."lessonId" = l."id"
            LEFT JOIN "LessonProgress" lp
              ON lp."lessonId" = l."id" AND lp."userId" = :user_id
            """
        ),
        params,
    ).mappings().all()
    completed = sum(1 for row in lessons if row["done"])
    progress = (
        0
        if len(lessons) == 0 or (not intensive_state.open and not intensive_state.ended)
        else round((completed / len(lessons)) * 100)
    )
    if intensive_state.ended:
        progress = 100

    today = db.execute(
        text(
            f"""
            SELECT "focusRu", "focusEn"
            FROM "CurriculumDay" d
            WHERE d."dayNumber" = :current_day
              AND {day_filter_sql}
              AND {flow_filter_sql}
            LIMIT 1
            """
        ),
        params,
    ).mappings().first()

    if intensive.get("source") == "flow" and intensive.get("hasCustomDays"):
        # For flow intensives: anchor on IntensiveFlowWebinar to include both
        # curriculum-day webinars and flow-level webinars (curriculumDayId IS NULL).
        webinars = db.execute(
            text(
                """
                SELECT w."id", w."titleRu", w."titleEn", w."summaryRu", w."summaryEn",
                       w."joinUrl", w."kinescopeVideoId", w."thumbnailUrl",
                       w."startsAtIso", w."durationMinutes", w."webinarStatus",
                       COALESCE(d."dayNumber", 0) AS "dayNumber",
                       fw."programOrder"
                FROM "IntensiveFlowWebinar" fw
                JOIN "Webinar" w ON w."id" = fw."webinarId"
                LEFT JOIN "CurriculumDay" d ON d."id" = w."curriculumDayId"
                WHERE fw."flowId" = :flow_id
                ORDER BY fw."programOrder" ASC NULLS LAST, w."startsAtIso" ASC NULLS LAST
                """
            ),
            params,
        ).mappings().all()
    else:
        webinars = db.execute(
            text(
                f"""
                SELECT w."id", w."titleRu", w."titleEn", w."summaryRu", w."summaryEn",
                       w."joinUrl", NULL AS "kinescopeVideoId", '' AS "thumbnailUrl",
                       w."startsAtIso", w."durationMinutes", w."webinarStatus", d."dayNumber",
                       NULL AS "programOrder"
                FROM "Webinar" w
                JOIN "CurriculumDay" d ON d."id" = w."curriculumDayId"
                WHERE {flow_filter_sql}
                ORDER BY w."startsAtIso" ASC NULLS LAST, d."dayNumber" ASC
                """
            ),
            params,
        ).mappings().all()

    webinar_duration_minutes = webinar_minutes_by_id_after_sync(db, list(webinars))

    action_stats_row = db.execute(
        text(
            """
            SELECT
              (SELECT COUNT(*) FROM "LessonProgress" lp WHERE lp."userId" = :user_id AND lp."status" = 'completed') AS lessons_completed,
              (SELECT COUNT(*) FROM "HomeworkSubmission" hs WHERE hs."userId" = :user_id) AS homework_submitted,
              (SELECT COUNT(*) FROM "LessonAiFluencyState" fs WHERE fs."userId" = :user_id) AS fluency_generated,
              (SELECT COUNT(*) FROM "HomeworkSubmission" hs WHERE hs."userId" = :user_id AND COALESCE(TRIM(hs."reflectionText"), '') <> '') AS reflection_added
            """
        ),
        {"user_id": user.user_id},
    ).mappings().first()
    action_stats = {
        "lessonsCompleted": int((action_stats_row or {}).get("lessons_completed") or 0),
        "homeworkSubmitted": int((action_stats_row or {}).get("homework_submitted") or 0),
        "fluencyGenerated": int((action_stats_row or {}).get("fluency_generated") or 0),
        "reflectionAdded": int((action_stats_row or {}).get("reflection_added") or 0),
    }
    action_stats["actionCount"] = (
        action_stats["lessonsCompleted"]
        + action_stats["homeworkSubmitted"]
        + action_stats["fluencyGenerated"]
        + action_stats["reflectionAdded"]
    )
    action_stats["minutesSpent"] = _estimate_learning_minutes(action_stats)

    is_ru = user.language == "ru"
    mastery = get_mastery_summary(db, user.user_id)
    weakest = mastery["weakest"][0] if mastery["weakest"] else None
    next_best_action = (
        (
            f"Укрепи компетенцию: {weakest['titleRu']}. Повтори обязательный урок и перепроверь домашку."
            if weakest
            else "Заверши обязательный урок дня и сдай домашнее задание с reflection."
        )
        if is_ru
        else (
            f"Strengthen competency: {weakest['titleEn']}. Revisit mandatory lesson and improve homework."
            if weakest
            else "Finish today's mandatory lesson and submit homework with reflection."
        )
    )
    map_open = intensive_state.ended or (intensive_state.open and is_map_unlocked(user.report_completed))
    intensive_start_iso = intensive_state.start_at.isoformat() if intensive_state.start_at else None
    intensive_end_iso = intensive_state.end_at.isoformat() if intensive_state.end_at else None

    def _norm_webinar_status(raw: object) -> str | None:
        if raw is None:
            return None
        s = str(raw).strip().lower()
        if s in ("active", "completed"):
            return s
        return None

    return {
        "currentDay": display_day,
        "progressPercent": progress,
        "todayFocus": (
            _pick_locale(today["focusRu"], today["focusEn"], is_ru)
            if today
            else ("Сфокусируйся на обязательном уроке и домашке" if is_ru else "Focus on mandatory lesson and homework")
        ),
        "message": (
            (
                "Интенсив завершён. Все дни программы и курсы в библиотеке открыты; раздел «Финал» — сертификат и итоги."
                if is_ru
                else "Intensive is over. All programme days and library courses are open; use Final for your certificate and wrap-up."
            )
            if intensive_state.ended
            else (
                (
                    f"День {display_day} открыт. Выполни обязательный шаг и закрепи результат домашкой."
                    if is_ru
                    else f"Day {display_day} is open. Complete mandatory step and homework."
                )
                if map_open
                else (
                    (
                        "Старт интенсива еще не задан администратором."
                        if is_ru
                        else "Intensive start is not configured by admin yet."
                    )
                    if not intensive_state.configured
                    else (
                        f"Платформа откроется через {format_countdown(intensive_state.seconds_to_start or 0, True)}."
                        if is_ru
                        else f"Platform opens in {format_countdown(intensive_state.seconds_to_start or 0, False)}."
                    )
                    if not intensive_state.open
                    else (
                        "Сначала заверши стартовый отчёт, после этого откроется карта маршрута."
                        if is_ru
                        else "Complete initial report first, then route map will unlock."
                    )
                )
            )
        ),
        "splitAvailable": is_split_available(current_day),  # uses access_day: ended → all days available
        "reportCompleted": user.report_completed,
        "mapUnlocked": map_open,
        "weekOneWebinars": [
            {
                "id": row["id"],
                "title": _pick_locale(row["titleRu"], row["titleEn"], is_ru),
                "summary": _pick_locale(row["summaryRu"], row["summaryEn"], is_ru),
                "day": row["dayNumber"],
                "joinUrl": row["joinUrl"],
                "kinescopeVideoId": row["kinescopeVideoId"],
                "thumbnailUrl": row["thumbnailUrl"] or "",
                "startsAtIso": row["startsAtIso"].isoformat() if row["startsAtIso"] else None,
                "durationMinutes": webinar_duration_minutes.get(str(row["id"]), int(row["durationMinutes"] or 0)),
                "unlocked": map_open and row["dayNumber"] <= current_day,
                "programOrder": row["programOrder"],
                "webinarStatus": _norm_webinar_status(row.get("webinarStatus")),
            }
            for row in webinars
        ],
        "trackSelected": user.selected_track,
        "intensiveConfigured": intensive_state.configured,
        "platformOpen": intensive_state.open or intensive_state.ended,
        "intensiveEnded": intensive_state.ended,
        "intensiveStartAtIso": intensive_start_iso,
        "intensiveEndAtIso": intensive_end_iso,
        "secondsToStart": intensive_state.seconds_to_start,
        "secondsToEnd": intensive_state.seconds_to_end,
        "flowId": intensive.get("id"),
        "flowCode": intensive.get("code"),
        "flowTitle": _pick_locale(intensive.get("titleRu"), intensive.get("titleEn"), is_ru),
        "flowSource": intensive.get("source"),
        "masteryAvgScore": mastery["avgScore"],
        "weakCompetencies": [
            {
                "code": row["code"],
                "title": _pick_locale(row["titleRu"], row["titleEn"], is_ru),
                "score": float(row["score"]),
            }
            for row in mastery["weakest"]
        ],
        "nextBestAction": next_best_action,
        "actionStats": action_stats,
    }


@router.get("")
def get_dashboard(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_dashboard_payload(db, user)



@router.get("/student-bootstrap")
def student_bootstrap(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user_payload = me_response_from_current_user(user)
    if user.role != "student":
        return {
            "user": user_payload,
            "dashboard": None,
            "finalStatus": None,
            "insights": None,
            "roadmap": None,
            "homeworkMine": None,
        }

    # Load intensive once and share across all builders — saves 2 duplicate DB queries
    intensive = get_effective_intensive(db, user.user_id)
    dashboard_payload = build_dashboard_payload(db, user, _intensive=intensive)
    intensive_ended = bool(dashboard_payload.get("intensiveEnded"))
    final_payload = build_final_status_payload(db, user.user_id, intensive_ended=intensive_ended)
    roadmap_payload = None
    homework_payload = None
    if dashboard_payload["platformOpen"] and (dashboard_payload["reportCompleted"] or intensive_ended):
        roadmap_payload = build_roadmap_payload(db, user, _intensive=intensive)
        homework_payload = build_homework_mine_payload(db, user, _intensive=intensive)

    return {
        "user": user_payload,
        "dashboard": dashboard_payload,
        "finalStatus": final_payload,
        # insights intentionally omitted — fetched separately on /dashboard/insights
        # to avoid blocking the bootstrap on a synchronous Gemini API call
        "roadmap": roadmap_payload,
        "homeworkMine": homework_payload,
    }


@router.post("/assistant", dependencies=[Depends(limit(10, 60))])
def dashboard_assistant(
    payload: DashboardAssistantRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = _load_user_dashboard_context(db, user)
    is_ru = bool(ctx["is_ru"])
    fallback_answer = (
        "Начни с урока текущего дня, затем выполни домашку и проверь дедлайн перед отправкой."
        if is_ru
        else "Start with today's lesson, then complete homework and verify deadline before submission."
    )
    fallback_actions = (
        ["Открыть урок дня", "Перейти к домашке", "Проверить дедлайн"]
        if is_ru
        else ["Open today's lesson", "Go to homework", "Check deadline"]
    )
    if not gemini_client.enabled:
        return {"answer": fallback_answer, "nextActions": fallback_actions, "source": "fallback"}

    webinars = ctx["webinars"]
    webinar_title = None
    if webinars:
        webinar_title = _pick_locale(webinars[0]["titleRu"], webinars[0]["titleEn"], is_ru)

    prompt = f"""
You are an in-dashboard AI learning assistant.
Return only JSON:
{{
  "answer": "...",
  "nextActions": ["...", "...", "..."]
}}

Language: {"ru" if is_ru else "en"}
User question: {payload.question}
Current day: {ctx["current_day"]}/14
Lessons completed: {ctx["lessons_completed"]}/{ctx["lessons_total"]}
Homework completed: {ctx["homework_completed"]}
Homework overdue: {ctx["homework_overdue"]}
Track: {ctx["user"].selected_track}
Upcoming webinar: {webinar_title or "none"}

Constraints:
- Keep answer concise and practical.
- Never provide unsafe, medical, legal, or financial advice.
- Recommend concrete next actions in the platform context.
"""
    try:
        generated = gemini_client.generate_json(prompt)
    except GeminiServiceError:
        generated = {}

    answer = str(generated.get("answer", "")).strip() or fallback_answer
    next_actions = _safe_list(generated.get("nextActions")) or fallback_actions
    return {"answer": answer, "nextActions": next_actions[:5], "source": "ai"}
