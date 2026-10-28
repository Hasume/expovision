import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user
from app.services import kinescope as ks
from app.services.common_queries import get_effective_intensive
from app.services.webinar_duration import webinar_minutes_by_id_after_sync


router = APIRouter(prefix="/webinar", tags=["webinar"])
_log = logging.getLogger(__name__)


def _norm_webinar_status(raw: object) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if s in ("active", "completed"):
        return s
    return None


@router.post("/hooks/kinescope")
async def kinescope_webhook(request: Request, db: Session = Depends(get_db)):
    """Kinescope outgoing webhook (e.g. ``live.finished``) — sets ``Webinar.kinescopeVideoId`` to the VOD id.

    Docs: https://docs.kinescope.ru/instrukcii-dlya-razrabotchikov/tipy-vebhukov/ — ``data.video_id`` is the recording.
    Point Kinescope to: ``POST {PUBLIC_API}/webinar/hooks/kinescope``. Optional: set ``KINESCOPE_WEBHOOK_SECRET`` and send the
    same value in header ``X-Expovision-Kinescope-Webhook-Secret``.
    """
    secret = (settings.kinescope_webhook_secret or "").strip()
    if secret:
        hdr = (request.headers.get("X-Expovision-Kinescope-Webhook-Secret") or "").strip()
        if hdr != secret:
            _log.warning("kinescope_webhook: rejected request with invalid secret from %s", request.client)
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        _log.warning(
            "kinescope_webhook: KINESCOPE_WEBHOOK_SECRET is not set — accepting unauthenticated request from %s. "
            "Set KINESCOPE_WEBHOOK_SECRET in production to prevent unauthorized webhook calls.",
            request.client,
        )

    try:
        payload = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="JSON object expected")

    event_name = str(payload.get("event") or "").strip()
    data_obj = payload.get("data")
    if not isinstance(data_obj, dict):
        data_obj = {}

    if event_name != "live.finished":
        return {"ok": True, "ignored": event_name or True}

    event_id = str(data_obj.get("event_id") or data_obj.get("eventId") or "").strip()
    video_id = str(data_obj.get("video_id") or data_obj.get("videoId") or "").strip()
    if not event_id or not video_id:
        _log.warning("kinescope webhook live.finished missing event_id or video_id: %s", payload)
        return {"ok": True, "updated": 0}

    result = db.execute(
        text(
            """
            UPDATE "Webinar"
            SET "kinescopeVideoId" = :vid
            WHERE "kinescopeEventId" = :eid
            """
        ),
        {"vid": video_id, "eid": event_id},
    )
    db.commit()
    return {"ok": True, "updated": getattr(result, "rowcount", 0) or 0}


@router.get("/flow")
def list_flow_webinars_archive(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All webinars attached to the student's intensive flow (for replay / schedule).

    Legacy intensives (no flow membership) receive an empty list.
    """
    intensive = get_effective_intensive(db, user.user_id)
    if not intensive or intensive.get("source") != "flow":
        return {"flowId": None, "webinars": []}

    flow_id = str(intensive["id"])
    rows = db.execute(
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
            INNER JOIN "IntensiveFlowMember" m
              ON m."flowId" = fw."flowId"
             AND m."userId" = :uid
             AND m."isActive" = true
            WHERE fw."flowId" = :flow_id
            ORDER BY fw."programOrder" ASC NULLS LAST, w."startsAtIso" ASC NULLS LAST
            """
        ),
        {"flow_id": flow_id, "uid": user.user_id},
    ).mappings().all()

    duration_map = webinar_minutes_by_id_after_sync(db, list(rows))
    out = []
    for row in rows:
        out.append(
            {
                "id": row["id"],
                "titleRu": row["titleRu"] or "",
                "titleEn": row["titleEn"] or "",
                "summaryRu": row["summaryRu"] or "",
                "summaryEn": row["summaryEn"] or "",
                "joinUrl": row["joinUrl"] or "",
                "kinescopeVideoId": row["kinescopeVideoId"],
                "thumbnailUrl": row["thumbnailUrl"] or "",
                "startsAtIso": row["startsAtIso"].isoformat() if row["startsAtIso"] else None,
                "durationMinutes": duration_map[str(row["id"])],
                "webinarStatus": _norm_webinar_status(row.get("webinarStatus")),
                "dayNumber": int(row["dayNumber"] or 0),
                "programOrder": int(row["programOrder"]) if row.get("programOrder") is not None else None,
            }
        )
    return {"flowId": flow_id, "webinars": out}


@router.get("/{webinar_id}")
def get_webinar(
    webinar_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            """
            SELECT w."id", w."titleRu", w."titleEn", w."summaryRu", w."summaryEn",
                   w."joinUrl", w."kinescopeVideoId", w."kinescopeEventId", w."thumbnailUrl",
                   w."startsAtIso", w."durationMinutes", w."webinarStatus"
            FROM "Webinar" w
            WHERE w."id" = :wid
            """
        ),
        {"wid": webinar_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Webinar not found")

    # Determine flowId for this student (used for flow chat on the page)
    flow_row = db.execute(
        text(
            """
            SELECT fw."flowId"
            FROM "IntensiveFlowWebinar" fw
            JOIN "IntensiveFlowMember" m
              ON m."flowId" = fw."flowId" AND m."userId" = :uid AND m."isActive" = true
            WHERE fw."webinarId" = :wid
            LIMIT 1
            """
        ),
        {"wid": webinar_id, "uid": user.user_id},
    ).mappings().first()
    flow_id = flow_row["flowId"] if flow_row else None

    kid = (row["kinescopeVideoId"] or "").strip() or None
    event_id = (row.get("kinescopeEventId") or "").strip() or None
    webinar_status = _norm_webinar_status(row.get("webinarStatus"))
    thumbnail_url: str = (row["thumbnailUrl"] or "").strip()
    recording_pending = False

    # Completed: resolve real VOD id. Using the live *event* UUID in /embed/ shows event_default_poster
    # and master.m3u8 ends in sourcewaiting — that is not the recording; recording has its own video_id
    # (see Kinescope live.finished webhook). Short poll here only when GET has no VOD yet.
    if webinar_status == "completed" and event_id and settings.kinescope_api_token:
        try:
            ev = event_id.strip()
            r = ks.resolve_recording_for_webinar(event_id)
            vod_id = (r["vod_id"] or "").strip()
            if not vod_id:
                vod_id = (
                    ks.poll_recording_video_id(event_id, max_attempts=12, delay_sec=1.0) or ""
                ).strip()
            if not vod_id and settings.kinescope_project_id:
                starts_iso = row["startsAtIso"].isoformat() if row["startsAtIso"] else None
                vod_id = (
                    ks.find_live_recording_in_vod_catalog(
                        ev,
                        [row["titleRu"] or "", row["titleEn"] or ""],
                        created_after_iso=starts_iso,
                    )
                    or ""
                ).strip()
            embed_fb = (r["embed_id"] or "").strip()
            target = vod_id
            if not target and embed_fb and embed_fb != ev:
                target = embed_fb
            if target and target != kid:
                kid = target
                db.execute(
                    text('UPDATE "Webinar" SET "kinescopeVideoId" = :kid WHERE "id" = :wid'),
                    {"kid": target, "wid": webinar_id},
                )
                db.commit()
            poster_src = (r.get("poster_url") or "").strip()
            thumb_candidate = ""
            vid_for_poster = vod_id or (kid or "")
            if vid_for_poster:
                try:
                    meta = ks.get_video(vid_for_poster)
                    thumb_candidate = (meta.get("thumbnail_url") or "").strip()
                except Exception:
                    pass
            if not thumb_candidate and poster_src:
                thumb_candidate = poster_src
            if thumb_candidate and thumb_candidate != thumbnail_url:
                thumbnail_url = thumb_candidate
                db.execute(
                    text('UPDATE "Webinar" SET "thumbnailUrl" = :th WHERE "id" = :wid'),
                    {"th": thumb_candidate, "wid": webinar_id},
                )
                db.commit()
            if (kid or "").strip() == ev and not vod_id:
                recording_pending = True
                kid = None
        except Exception as exc:
            _log.warning("webinar %s recording resolve failed: %s", webinar_id, exc, exc_info=True)

    # Live / not completed: resolve embed id once if DB empty.
    elif not kid and event_id and settings.kinescope_api_token:
        try:
            live = ks.get_live_event(event_id)
            resolved = (live.get("embed_id") or "").strip()
            if not resolved and event_id:
                resolved = event_id
            if resolved:
                kid = resolved
                db.execute(
                    text(
                        """
                        UPDATE "Webinar"
                        SET "kinescopeVideoId" = :kid
                        WHERE "id" = :wid
                          AND (
                            "kinescopeVideoId" IS NULL
                            OR LENGTH(TRIM(COALESCE("kinescopeVideoId", ''))) = 0
                          )
                        """
                    ),
                    {"kid": resolved, "wid": webinar_id},
                )
                db.commit()
        except Exception as exc:
            _log.warning("webinar %s live embed resolve failed: %s", webinar_id, exc, exc_info=True)

    kinescope_embed_url: str | None = None
    kinescope_chat_url: str | None = None
    if kid:
        # Plain embed URL — matches Kinescope official embed code exactly.
        # Extra query params (watermark, autoplay) require project-level settings to be on;
        # sending them unconditionally breaks live streams in some accounts.
        kinescope_embed_url = ks.build_embed_url(kid)
        # Chat only while the session is live; completed webinars are VOD replays (lesson-style, no chat).
        if webinar_status == "active":
            kinescope_chat_url = ks.build_chat_url(kid)
        if not thumbnail_url and settings.kinescope_api_token:
            try:
                meta = ks.get_video(kid)
                thumbnail_url = (meta.get("thumbnail_url") or "").strip() or thumbnail_url
            except Exception:
                pass

    duration_minutes = webinar_minutes_by_id_after_sync(
        db,
        [{"id": webinar_id, "kinescopeVideoId": kid, "durationMinutes": row["durationMinutes"]}],
    )[webinar_id]

    is_ru = user.language == "ru"
    return {
        "id": row["id"],
        "titleRu": row["titleRu"],
        "titleEn": row["titleEn"],
        "title": row["titleRu"] if is_ru else row["titleEn"],
        "summaryRu": row["summaryRu"],
        "summaryEn": row["summaryEn"],
        "summary": row["summaryRu"] if is_ru else row["summaryEn"],
        "joinUrl": row["joinUrl"] or "",
        "kinescopeVideoId": kid,
        "kinescopeEmbedUrl": kinescope_embed_url,
        "kinescopeChatUrl": kinescope_chat_url,
        "thumbnailUrl": thumbnail_url,
        "startsAtIso": row["startsAtIso"].isoformat() if row["startsAtIso"] else None,
        "durationMinutes": duration_minutes,
        "flowId": flow_id,
        "webinarStatus": webinar_status,
        "recordingPending": recording_pending,
    }
