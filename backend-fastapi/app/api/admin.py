import logging
from datetime import datetime, timedelta, timezone

_log = logging.getLogger(__name__)
from pathlib import Path
from secrets import token_hex, token_urlsafe
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.core.rate_limit import limit
from app.db.session import get_db
from app.deps.auth import CurrentUser, require_roles
from app.services.audit import write_audit
from app.services import kinescope as ks
from app.services.webinar_duration import webinar_minutes_by_id_after_sync


router = APIRouter(prefix="/admin", tags=["admin"])

COURSE_COVER_DIR = Path("/app/uploads/course-covers")
COURSE_COVER_MAX_SIZE = 5 * 1024 * 1024  # 5 MB
COURSE_COVER_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

WEBINAR_THUMB_DIR = Path("/app/uploads/webinar-thumbnails")
WEBINAR_THUMB_MAX_SIZE = 5 * 1024 * 1024  # 5 MB
WEBINAR_THUMB_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


class SetStartRequest(BaseModel):
    startAtIso: datetime


class GenerateTokensRequest(BaseModel):
    count: int = Field(ge=1, le=500)
    intensiveStartAt: datetime
    flowId: Optional[str] = None


class SetUserRoleRequest(BaseModel):
    userId: str = Field(min_length=2)
    role: Literal["student", "admin"]


class UpsertFlowRequest(BaseModel):
    flowId: Optional[str] = None
    code: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = ""
    language: Literal["ru", "en"] = "ru"
    startsAtIso: datetime
    endsAtIso: datetime
    timezone: str = "UTC"
    isActive: bool = True
    tokenCount: int = Field(ge=0, le=500, default=0)


class AssignUserToFlowRequest(BaseModel):
    userId: Optional[str] = None
    email: Optional[str] = None


class SetFlowDaysRequest(BaseModel):
    dayIds: list[str] = Field(default_factory=list)


class UpsertLessonRequest(BaseModel):
    lessonId: Optional[str] = None
    curriculumDayId: str
    kind: Literal["mandatory", "optional"]
    titleRu: str = ""
    titleEn: str = ""
    contentRu: str = ""
    contentEn: str = ""
    videoUrl: str = ""
    kinescopeVideoId: Optional[str] = None
    sortOrder: int = Field(ge=1, le=100)


class UpsertWebinarRequest(BaseModel):
    webinarId: Optional[str] = None
    curriculumDayId: str
    titleRu: str = ""
    titleEn: str = ""
    summaryRu: str = ""
    summaryEn: str = ""
    startsAtIso: datetime
    durationMinutes: int = Field(ge=15, le=300)
    joinUrl: str = ""


class FlowWebinarOrderItem(BaseModel):
    webinarId: str = Field(min_length=1)
    programOrder: int = Field(ge=1, le=99)


class SetFlowWebinarOrdersRequest(BaseModel):
    orders: list[FlowWebinarOrderItem] = Field(default_factory=list)


class CreateFlowWebinarRequest(BaseModel):
    kinescopeVideoId: Optional[str] = None
    titleRu: str = ""
    titleEn: str = ""
    summaryRu: str = ""
    summaryEn: str = ""
    startsAtIso: Optional[datetime] = None
    durationMinutes: int = Field(default=90, ge=15, le=600)
    joinUrl: str = ""
    thumbnailUrl: str = ""


class LinkFlowWebinarRequest(BaseModel):
    webinarId: str = Field(min_length=1)


class SetWebinarEventIdRequest(BaseModel):
    kinescopeEventId: str = Field(min_length=1)


class UpsertArtifactRequest(BaseModel):
    artifactId: Optional[str] = None
    curriculumDayId: str
    titleRu: str = ""
    titleEn: str = ""
    resourceUrl: str = ""


class UpsertHomeworkTemplateRequest(BaseModel):
    templateId: Optional[str] = None
    curriculumDayId: str
    instructionRu: str = ""
    instructionEn: str = ""
    sampleRu: str = ""
    sampleEn: str = ""
    minLength: int = Field(ge=5, le=500)
    lessonId: Optional[str] = None


@router.post("/intensive/start", dependencies=[Depends(limit(20, 60))])
def set_start(
    payload: SetStartRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="set_intensive_start",
        endpoint=request.url.path,
        method=request.method,
        payload=payload.model_dump(mode="json"),
    )
    end_at = payload.startAtIso + timedelta(days=14)
    now = datetime.now(timezone.utc)
    exists = db.execute(text('SELECT "id" FROM "IntensiveConfig" WHERE "id" = 1')).first()
    if exists:
        db.execute(
            text(
                """
                UPDATE "IntensiveConfig"
                SET "startAt" = :start_at, "isStarted" = true, "updatedAt" = :updated_at
                WHERE "id" = 1
                """
            ),
            {"start_at": payload.startAtIso, "updated_at": now},
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "IntensiveConfig" ("id", "startAt", "isStarted", "updatedAt")
                VALUES (1, :start_at, true, :updated_at)
                """
            ),
            {"start_at": payload.startAtIso, "updated_at": now},
        )
    updated_flows = db.execute(
        text('UPDATE "IntensiveFlow" SET "startsAt" = :start_at, "endsAt" = :end_at WHERE "isActive" = true RETURNING "id"'),
        {"start_at": payload.startAtIso, "end_at": end_at},
    ).fetchall()
    db.commit()
    return {
        "success": True,
        "startAtIso": payload.startAtIso.isoformat(),
        "endsAtIso": end_at.isoformat(),
        "flowsUpdated": len(updated_flows),
    }


@router.post("/license-tokens/generate", dependencies=[Depends(limit(60, 60))])
def generate_tokens(
    payload: GenerateTokensRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    flow_code = None
    if payload.flowId:
        flow_row = db.execute(
            text('SELECT "id", "code" FROM "IntensiveFlow" WHERE "id" = :id'),
            {"id": payload.flowId},
        ).mappings().first()
        if not flow_row:
            raise HTTPException(status_code=404, detail="Flow not found")
        flow_code = flow_row["code"]

    write_audit(
        db,
        admin_user_id=user.user_id,
        action="generate_license_tokens",
        endpoint=request.url.path,
        method=request.method,
        payload=payload.model_dump(mode="json"),
    )
    now = datetime.now(timezone.utc)
    tokens = [token_hex(8).upper() for _ in range(payload.count)]

    db.execute(
        text(
            """
            INSERT INTO "LicenseToken" ("token", "intensiveStartAt", "issuedAt", "flowId")
            VALUES (:token, :intensive_start_at, :issued_at, :flow_id)
            """
        ),
        [
            {"token": t, "intensive_start_at": payload.intensiveStartAt, "issued_at": now, "flow_id": payload.flowId}
            for t in tokens
        ],
    )
    db.commit()

    result = [
        {
            "token": t,
            "intensiveStartAt": payload.intensiveStartAt.isoformat(),
            "issuedAt": now.isoformat(),
            "usedByUserId": None,
            "flowId": payload.flowId,
            "flowCode": flow_code,
        }
        for t in tokens
    ]
    return {"success": True, "tokens": result}


@router.get("/license-tokens")
def list_tokens(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT t."token", t."intensiveStartAt", t."issuedAt", t."usedAt",
                   t."usedByUserId", t."flowId", t."status",
                   f."code" AS "flowCode",
                   u."firstName", u."lastName", u."email" AS "usedByEmail"
            FROM "LicenseToken" t
            LEFT JOIN "IntensiveFlow" f ON f."id" = t."flowId"
            LEFT JOIN "User" u ON u."id" = t."usedByUserId"
            ORDER BY t."issuedAt" DESC
            LIMIT 500
            """
        )
    ).mappings().all()
    return [
        {
            "token": r["token"],
            "intensiveStartAt": r["intensiveStartAt"].isoformat() if r["intensiveStartAt"] else None,
            "issuedAt": r["issuedAt"].isoformat() if r["issuedAt"] else None,
            "usedAt": r["usedAt"].isoformat() if r["usedAt"] else None,
            "usedByUserId": r["usedByUserId"],
            "usedByEmail": r["usedByEmail"],
            "usedByName": f'{r["firstName"] or ""} {r["lastName"] or ""}'.strip() if r["usedByUserId"] else None,
            "flowId": r["flowId"],
            "flowCode": r["flowCode"],
            "status": r["status"],
        }
        for r in rows
    ]


@router.get("/flows")
def flows(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT f."id", f."code", f."titleRu", f."titleEn", f."descriptionRu", f."descriptionEn",
                   f."startsAt", f."endsAt", f."timezone", f."isActive", f."language",
                   f."createdAt", f."updatedAt",
                   COALESCE(m.cnt, 0) AS "membersCount",
                   COALESCE(fd.cnt, 0) AS "daysCount"
            FROM "IntensiveFlow" f
            LEFT JOIN (
                SELECT "flowId", COUNT(*) AS cnt
                FROM "IntensiveFlowMember"
                WHERE "isActive" = true
                GROUP BY "flowId"
            ) m ON m."flowId" = f."id"
            LEFT JOIN (
                SELECT "flowId", COUNT(*) AS cnt
                FROM "IntensiveFlowDay"
                GROUP BY "flowId"
            ) fd ON fd."flowId" = f."id"
            ORDER BY f."startsAt" DESC
            """
        )
    ).mappings().all()
    return [
        {
            **dict(row),
            "startsAt": row["startsAt"].isoformat(),
            "endsAt": row["endsAt"].isoformat(),
            "createdAt": row["createdAt"].isoformat(),
            "updatedAt": row["updatedAt"].isoformat(),
        }
        for row in rows
    ]


@router.post("/flows/upsert", dependencies=[Depends(limit(40, 60))])
def upsert_flow(
    payload: UpsertFlowRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if payload.endsAtIso <= payload.startsAtIso:
        raise HTTPException(status_code=422, detail="Flow end must be greater than flow start")
    flow_id = payload.flowId.strip() if payload.flowId else f"flow-{token_hex(6)}"
    is_new = not bool(payload.flowId)
    exists = db.execute(text('SELECT "id" FROM "IntensiveFlow" WHERE "id" = :id'), {"id": flow_id}).first()
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="upsert_flow",
        endpoint=request.url.path,
        method=request.method,
        payload={**payload.model_dump(mode="json"), "flowId": flow_id},
    )
    title_ru = payload.title if payload.language == "ru" else payload.title
    title_en = payload.title if payload.language == "en" else payload.title
    desc_ru = payload.description if payload.language == "ru" else payload.description
    desc_en = payload.description if payload.language == "en" else payload.description
    now = datetime.now(timezone.utc)
    args = {
        "id": flow_id,
        "code": payload.code,
        "title_ru": title_ru,
        "title_en": title_en,
        "desc_ru": desc_ru,
        "desc_en": desc_en,
        "starts_at": payload.startsAtIso,
        "ends_at": payload.endsAtIso,
        "timezone": payload.timezone,
        "is_active": payload.isActive,
        "language": payload.language,
        "now": now,
        "created_by": user.user_id,
    }
    if exists:
        db.execute(
            text(
                """
                UPDATE "IntensiveFlow"
                SET "code" = :code, "titleRu" = :title_ru, "titleEn" = :title_en,
                    "descriptionRu" = :desc_ru, "descriptionEn" = :desc_en,
                    "startsAt" = :starts_at, "endsAt" = :ends_at, "timezone" = :timezone,
                    "isActive" = :is_active, "language" = :language, "updatedAt" = :now
                WHERE "id" = :id
                """
            ),
            args,
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "IntensiveFlow" (
                    "id", "code", "titleRu", "titleEn", "descriptionRu", "descriptionEn",
                    "startsAt", "endsAt", "timezone", "isActive", "language",
                    "createdByUserId", "createdAt", "updatedAt"
                )
                VALUES (
                    :id, :code, :title_ru, :title_en, :desc_ru, :desc_en,
                    :starts_at, :ends_at, :timezone, :is_active, :language,
                    :created_by, :now, :now
                )
                """
            ),
            args,
        )

    generated_tokens = [token_hex(8).upper() for _ in range(payload.tokenCount)] if payload.tokenCount > 0 else []
    if generated_tokens:
        db.execute(
            text(
                """
                INSERT INTO "LicenseToken" ("token", "intensiveStartAt", "issuedAt", "flowId")
                VALUES (:token, :starts_at, :now, :flow_id)
                """
            ),
            [{"token": t, "starts_at": payload.startsAtIso, "now": now, "flow_id": flow_id} for t in generated_tokens],
        )

    db.commit()
    return {"success": True, "flowId": flow_id, "tokensGenerated": len(generated_tokens), "tokens": generated_tokens}


@router.get("/flows/{flow_id}/members")
def flow_members(flow_id: str, _: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT m."id", m."userId", m."isActive", m."roleInFlow", m."assignedAt",
                   u."email", u."role"
            FROM "IntensiveFlowMember" m
            JOIN "User" u ON u."id" = m."userId"
            WHERE m."flowId" = :flow_id
            ORDER BY m."assignedAt" DESC
            """
        ),
        {"flow_id": flow_id},
    ).mappings().all()
    return [
        {
            **dict(row),
            "assignedAt": row["assignedAt"].isoformat(),
        }
        for row in rows
    ]


@router.post("/flows/{flow_id}/members/assign", dependencies=[Depends(limit(60, 60))])
def assign_user_to_flow(
    flow_id: str,
    payload: AssignUserToFlowRequest,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    flow = db.execute(text('SELECT "id" FROM "IntensiveFlow" WHERE "id" = :id'), {"id": flow_id}).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    if not payload.userId and not payload.email:
        raise HTTPException(status_code=422, detail="userId or email is required")
    user_row = None
    if payload.userId:
        user_row = db.execute(
            text('SELECT "id", "email" FROM "User" WHERE "id" = :id'),
            {"id": payload.userId},
        ).mappings().first()
    elif payload.email:
        user_row = db.execute(
            text('SELECT "id", "email" FROM "User" WHERE "email" = :email'),
            {"email": payload.email},
        ).mappings().first()
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    db.execute(
        text('UPDATE "IntensiveFlowMember" SET "isActive" = false WHERE "userId" = :user_id AND "isActive" = true'),
        {"user_id": user_row["id"]},
    )
    db.execute(
        text(
            """
            INSERT INTO "IntensiveFlowMember" (
                "id", "flowId", "userId", "isActive", "roleInFlow", "assignedAt", "assignedByUserId"
            )
            VALUES (:id, :flow_id, :user_id, true, 'participant', :assigned_at, :assigned_by)
            """
        ),
        {
            "id": f"member-{token_hex(8)}",
            "flow_id": flow_id,
            "user_id": user_row["id"],
            "assigned_at": now,
            "assigned_by": admin_user.user_id,
        },
    )
    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="assign_user_to_flow",
        endpoint=request.url.path,
        method=request.method,
        payload={"flowId": flow_id, "userId": user_row["id"], "email": user_row["email"]},
    )
    db.commit()
    return {"success": True, "flowId": flow_id, "userId": user_row["id"], "email": user_row["email"]}


@router.get("/flows/{flow_id}/days")
def flow_days(flow_id: str, _: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT fd."curriculumDayId", fd."unlockOffsetMinutes",
                   d."dayNumber", d."track", d."phase", d."focusRu", d."focusEn"
            FROM "IntensiveFlowDay" fd
            JOIN "CurriculumDay" d ON d."id" = fd."curriculumDayId"
            WHERE fd."flowId" = :flow_id
            ORDER BY d."dayNumber" ASC, d."track" ASC
            """
        ),
        {"flow_id": flow_id},
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("/flows/{flow_id}/days/set", dependencies=[Depends(limit(20, 60))])
def set_flow_days(
    flow_id: str,
    payload: SetFlowDaysRequest,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    flow = db.execute(text('SELECT "id" FROM "IntensiveFlow" WHERE "id" = :id'), {"id": flow_id}).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    if payload.dayIds:
        valid_days = db.execute(
            text('SELECT "id" FROM "CurriculumDay" WHERE "id" = ANY(:day_ids)'),
            {"day_ids": payload.dayIds},
        ).mappings().all()
        valid_ids = {row["id"] for row in valid_days}
        unknown = [x for x in payload.dayIds if x not in valid_ids]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Unknown CurriculumDay IDs: {', '.join(unknown)}")

    db.execute(text('DELETE FROM "IntensiveFlowDay" WHERE "flowId" = :flow_id'), {"flow_id": flow_id})
    if payload.dayIds:
        now_days = datetime.now(timezone.utc)
        db.execute(
            text(
                """
                INSERT INTO "IntensiveFlowDay" ("id", "flowId", "curriculumDayId", "unlockOffsetMinutes", "createdAt")
                VALUES (:id, :flow_id, :day_id, 0, :created_at)
                """
            ),
            [
                {"id": f"flowday-{token_hex(8)}", "flow_id": flow_id, "day_id": day_id, "created_at": now_days}
                for day_id in payload.dayIds
            ],
        )
    db.execute(
        text(
            """
            DELETE FROM "IntensiveFlowWebinar" fw
            WHERE fw."flowId" = :flow_id
              AND NOT EXISTS (
                SELECT 1 FROM "Webinar" w
                INNER JOIN "IntensiveFlowDay" fd
                  ON fd."curriculumDayId" = w."curriculumDayId" AND fd."flowId" = :flow_id
                WHERE w."id" = fw."webinarId"
              )
            """
        ),
        {"flow_id": flow_id},
    )
    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="set_flow_days",
        endpoint=request.url.path,
        method=request.method,
        payload={"flowId": flow_id, "dayCount": len(payload.dayIds)},
    )
    db.commit()
    return {"success": True, "flowId": flow_id, "daysAssigned": len(payload.dayIds)}


@router.get("/flows/{flow_id}/webinars")
def flow_webinars(
    flow_id: str,
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    flow = db.execute(text('SELECT "id" FROM "IntensiveFlow" WHERE "id" = :id'), {"id": flow_id}).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    rows = db.execute(
        text(
            """
            SELECT w."id", w."titleRu", w."titleEn", w."summaryRu", w."summaryEn",
                   w."startsAtIso", w."durationMinutes", w."joinUrl",
                   w."kinescopeVideoId", w."kinescopeEventId", w."webinarStatus", w."thumbnailUrl",
                   COALESCE(d."dayNumber", 0) AS "dayNumber",
                   d."track",
                   fw."programOrder",
                   (w."curriculumDayId" IS NULL) AS "isFlowLevel"
            FROM "Webinar" w
            LEFT JOIN "CurriculumDay" d ON d."id" = w."curriculumDayId"
            LEFT JOIN "IntensiveFlowWebinar" fw ON fw."webinarId" = w."id" AND fw."flowId" = :flow_id
            WHERE (
                -- curriculum-day webinars whose day is in this flow
                (w."curriculumDayId" IS NOT NULL AND EXISTS (
                    SELECT 1 FROM "IntensiveFlowDay" fd
                    WHERE fd."curriculumDayId" = w."curriculumDayId" AND fd."flowId" = :flow_id
                ))
                OR
                -- flow-level webinars (no curriculumDayId) directly linked
                (w."curriculumDayId" IS NULL AND fw."webinarId" IS NOT NULL)
            )
            ORDER BY fw."programOrder" ASC NULLS LAST, "dayNumber" ASC, w."startsAtIso" ASC NULLS LAST
            """
        ),
        {"flow_id": flow_id},
    ).mappings().all()
    dm = webinar_minutes_by_id_after_sync(db, list(rows))
    out = []
    for row in rows:
        r = dict(row)
        r["durationMinutes"] = dm[str(row["id"])]
        if r.get("startsAtIso") is not None:
            r["startsAtIso"] = r["startsAtIso"].isoformat()
        out.append(r)
    return out


@router.post("/flows/{flow_id}/webinars", dependencies=[Depends(limit(20, 60))])
def create_flow_webinar(
    flow_id: str,
    payload: CreateFlowWebinarRequest,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    flow = db.execute(text('SELECT "id" FROM "IntensiveFlow" WHERE "id" = :id'), {"id": flow_id}).mappings().first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    # Determine Kinescope video/embed ID from pasted input
    kid = (payload.kinescopeVideoId or "").strip() or None

    # Try to fetch VOD metadata if existing ID given
    ks_meta: dict = {}
    if kid and settings.kinescope_api_token:
        try:
            ks_meta = ks.get_video(kid)
        except Exception:
            pass

    title_ru = payload.titleRu.strip() or ks_meta.get("title") or kid or ""
    title_en = payload.titleEn.strip() or ks_meta.get("title") or kid or ""
    thumbnail_url = payload.thumbnailUrl.strip() or ks_meta.get("thumbnail_url") or ""

    # If no Kinescope ID was pasted, auto-create a live event in Kinescope
    ks_event_id: str | None = None
    rtmp_url: str = ""
    stream_key: str = ""
    if not kid and settings.kinescope_api_token:
        try:
            event_name = title_ru or title_en or "Webinar"
            live_event = ks.create_live_event(
                name=event_name,
                scheduled_time_iso=payload.startsAtIso,
            )
            ks_event_id = live_event.get("event_id") or None
            kid = live_event.get("embed_id") or None
            rtmp_url = live_event.get("rtmp_url") or ks.RTMP_URL
            stream_key = live_event.get("stream_key") or ""
            if not thumbnail_url:
                thumbnail_url = live_event.get("thumbnail_url") or ""
        except Exception as exc:
            # Non-fatal: webinar is still saved locally without live event
            import logging
            logging.getLogger(__name__).warning("Kinescope create_live_event failed: %s", exc)

    # Re-use existing Webinar row if same kinescopeVideoId already exists
    existing_webinar = None
    if kid:
        existing_webinar = db.execute(
            text('SELECT "id" FROM "Webinar" WHERE "kinescopeVideoId" = :kid'),
            {"kid": kid},
        ).mappings().first()

    now = datetime.now(timezone.utc)
    if existing_webinar:
        webinar_id = existing_webinar["id"]
        db.execute(
            text(
                """
                UPDATE "Webinar"
                SET "titleRu" = :title_ru, "titleEn" = :title_en,
                    "summaryRu" = :summary_ru, "summaryEn" = :summary_en,
                    "startsAtIso" = :starts_at, "durationMinutes" = :duration,
                    "joinUrl" = :join_url, "thumbnailUrl" = :thumb,
                    "kinescopeEventId" = COALESCE("kinescopeEventId", :event_id)
                WHERE "id" = :id
                """
            ),
            {
                "id": webinar_id,
                "title_ru": title_ru,
                "title_en": title_en,
                "summary_ru": payload.summaryRu,
                "summary_en": payload.summaryEn,
                "starts_at": payload.startsAtIso,
                "duration": payload.durationMinutes,
                "join_url": payload.joinUrl,
                "thumb": thumbnail_url,
                "event_id": ks_event_id,
            },
        )
    else:
        webinar_id = f"wb-flow-{token_hex(6)}"
        db.execute(
            text(
                """
                INSERT INTO "Webinar" ("id", "curriculumDayId", "titleRu", "titleEn", "summaryRu", "summaryEn",
                                       "startsAtIso", "durationMinutes", "joinUrl",
                                       "kinescopeVideoId", "kinescopeEventId", "thumbnailUrl")
                VALUES (:id, NULL, :title_ru, :title_en, :summary_ru, :summary_en,
                        :starts_at, :duration, :join_url, :kid, :event_id, :thumb)
                """
            ),
            {
                "id": webinar_id,
                "title_ru": title_ru,
                "title_en": title_en,
                "summary_ru": payload.summaryRu,
                "summary_en": payload.summaryEn,
                "starts_at": payload.startsAtIso,
                "duration": payload.durationMinutes,
                "join_url": payload.joinUrl,
                "kid": kid,
                "event_id": ks_event_id,
                "thumb": thumbnail_url,
            },
        )

    # Add to this flow (if not already there)
    already_linked = db.execute(
        text('SELECT "id" FROM "IntensiveFlowWebinar" WHERE "flowId" = :fid AND "webinarId" = :wid'),
        {"fid": flow_id, "wid": webinar_id},
    ).mappings().first()
    if not already_linked:
        max_order_row = db.execute(
            text('SELECT COALESCE(MAX("programOrder"), 0) AS mo FROM "IntensiveFlowWebinar" WHERE "flowId" = :fid'),
            {"fid": flow_id},
        ).mappings().first()
        next_order = int((max_order_row or {}).get("mo") or 0) + 1
        db.execute(
            text(
                """
                INSERT INTO "IntensiveFlowWebinar" ("id", "flowId", "webinarId", "programOrder", "createdAt")
                VALUES (:id, :fid, :wid, :ord, :now)
                """
            ),
            {"id": f"flwb-{token_hex(8)}", "fid": flow_id, "wid": webinar_id, "ord": next_order, "now": now},
        )

    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="create_flow_webinar",
        endpoint=request.url.path,
        method=request.method,
        payload={"flowId": flow_id, "webinarId": webinar_id, "kinescopeVideoId": kid, "kinescopeEventId": ks_event_id},
    )
    db.commit()
    return {
        "success": True,
        "webinarId": webinar_id,
        "kinescopeEventId": ks_event_id,
        "rtmpUrl": rtmp_url or None,
        "streamKey": stream_key or None,
    }


@router.delete("/flows/{flow_id}/webinars/{webinar_id}", dependencies=[Depends(limit(20, 60))])
def delete_flow_webinar(
    flow_id: str,
    webinar_id: str,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    db.execute(
        text('DELETE FROM "IntensiveFlowWebinar" WHERE "flowId" = :fid AND "webinarId" = :wid'),
        {"fid": flow_id, "wid": webinar_id},
    )
    # Delete the Webinar row itself if it's flow-level and no longer referenced
    orphan = db.execute(
        text(
            """
            SELECT "id" FROM "Webinar"
            WHERE "id" = :wid AND "curriculumDayId" IS NULL
              AND NOT EXISTS (SELECT 1 FROM "IntensiveFlowWebinar" fw2 WHERE fw2."webinarId" = :wid)
            """
        ),
        {"wid": webinar_id},
    ).first()
    if orphan:
        db.execute(text('DELETE FROM "Webinar" WHERE "id" = :wid'), {"wid": webinar_id})

    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="delete_flow_webinar",
        endpoint=request.url.path,
        method=request.method,
        payload={"flowId": flow_id, "webinarId": webinar_id},
    )
    db.commit()
    return {"success": True}


@router.get("/kinescope/live-folders")
def admin_kinescope_live_folders(_: CurrentUser = Depends(require_roles("admin"))):
    """Folders under the **live** catalog project (GET /v1/projects?catalog_type=live), not VOD."""
    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")
    try:
        live_proj = ks.resolve_live_catalog_project_id()
        rows = ks.list_project_folders(live_proj)
    except RuntimeError as exc:
        _log.error("Kinescope list live folders failed: %s", exc)
        raise HTTPException(status_code=502, detail="External service error") from exc
    folders: list[dict] = []
    for r in rows:
        fid = ks.live_folder_id_from_row(r)
        if fid:
            nm = r.get("name") or r.get("title") or ""
            folders.append({"id": fid, "name": str(nm)})
    return {
        "liveProjectId": live_proj,
        "vodProjectId": settings.kinescope_project_id or None,
        "folders": folders,
        "hint": "Live events use parent_id from **live** catalog. Set KINESCOPE_LIVE_PROJECT_ID if you have several live roots; "
        "KINESCOPE_LIVE_PARENT_ID = one folder `id` below; KINESCOPE_PROJECT_ID is for VOD/recording.",
    }


@router.get("/webinars/{webinar_id}/stream-info")
def webinar_stream_info(
    webinar_id: str,
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Return RTMP URL and stream key for a live webinar (requires kinescopeEventId)."""
    row = db.execute(
        text('SELECT "kinescopeEventId", "kinescopeVideoId", "webinarStatus" FROM "Webinar" WHERE "id" = :id'),
        {"id": webinar_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Webinar not found")

    event_id = row.get("kinescopeEventId")
    if not event_id:
        # No live event created via API — return static RTMP without key
        return {
            "rtmpUrl": ks.RTMP_URL,
            "streamKey": None,
            "eventStatus": None,
            "noEventId": True,
        }

    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")

    try:
        live = ks.get_live_event(event_id)
        return {
            "rtmpUrl": live.get("rtmp_url") or ks.RTMP_URL,
            "streamKey": live.get("stream_key") or None,
            "eventStatus": live.get("status") or None,
            "noEventId": False,
        }
    except RuntimeError as exc:
        _log.error("Kinescope get live event %s failed: %s", event_id, exc)
        raise HTTPException(status_code=502, detail="External service error") from exc


@router.post("/webinars/{webinar_id}/create-event", dependencies=[Depends(limit(10, 60))])
def webinar_create_event(
    webinar_id: str,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Create a Kinescope live event for an existing webinar that has no kinescopeEventId.

    If a live event already exists, returns the current stream credentials.
    """
    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")

    row = db.execute(
        text('SELECT "id", "kinescopeEventId", "kinescopeVideoId", "titleRu", "titleEn", "startsAtIso" FROM "Webinar" WHERE "id" = :id'),
        {"id": webinar_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Webinar not found")

    event_id = row.get("kinescopeEventId")
    # If already has event, just return stream info instead of creating duplicate
    if event_id:
        try:
            live = ks.get_live_event(event_id)
            return {
                "rtmpUrl": live.get("rtmp_url") or ks.RTMP_URL,
                "streamKey": live.get("stream_key") or None,
                "eventStatus": live.get("status") or None,
                "kinescopeEventId": event_id,
                "alreadyExisted": True,
            }
        except RuntimeError:
            pass

    # Create a new live event in Kinescope
    name = (row.get("titleRu") or row.get("titleEn") or "Webinar").strip()
    starts_at = row.get("startsAtIso")
    try:
        live = ks.create_live_event(
            name=name,
            scheduled_time_iso=starts_at,
        )
    except RuntimeError as exc:
        _log.error("webinar_create_event Kinescope error webinar_id=%s: %s", webinar_id, exc)
        raise HTTPException(status_code=502, detail="External service error") from exc

    new_event_id = live.get("event_id") or ""
    new_embed_id = live.get("embed_id") or ""
    rtmp_url = live.get("rtmp_url") or ks.RTMP_URL
    stream_key = live.get("stream_key") or ""

    update_fields: dict = {"kinescopeEventId": new_event_id, "id": webinar_id}
    db.execute(
        text('UPDATE "Webinar" SET "kinescopeEventId" = :kinescopeEventId WHERE "id" = :id'),
        update_fields,
    )
    if new_embed_id and not row.get("kinescopeVideoId"):
        db.execute(
            text('UPDATE "Webinar" SET "kinescopeVideoId" = :kid WHERE "id" = :id'),
            {"kid": new_embed_id, "id": webinar_id},
        )
    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="create_kinescope_event",
        endpoint=request.url.path,
        method=request.method,
        payload={"webinarId": webinar_id, "kinescopeEventId": new_event_id},
    )
    db.commit()

    return {
        "rtmpUrl": rtmp_url,
        "streamKey": stream_key or None,
        "eventStatus": live.get("status") or "waiting",
        "kinescopeEventId": new_event_id,
        "kinescopeVideoId": new_embed_id or row.get("kinescopeVideoId"),
        "alreadyExisted": False,
    }


@router.patch("/webinars/{webinar_id}/event-id", dependencies=[Depends(limit(10, 60))])
def webinar_set_event_id(
    webinar_id: str,
    payload: SetWebinarEventIdRequest,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Manually link a Kinescope event UUID to a webinar (e.g., from the Kinescope dashboard URL)."""
    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")

    row = db.execute(
        text('SELECT "id" FROM "Webinar" WHERE "id" = :id'),
        {"id": webinar_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Webinar not found")

    event_id = payload.kinescopeEventId.strip()
    # Fetch event from Kinescope to validate and get credentials
    try:
        live = ks.get_live_event(event_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"Kinescope API error: {exc}") from exc

    embed_id = live.get("embed_id") or ""
    db.execute(
        text('UPDATE "Webinar" SET "kinescopeEventId" = :eid WHERE "id" = :id'),
        {"eid": event_id, "id": webinar_id},
    )
    if embed_id:
        db.execute(
            text('UPDATE "Webinar" SET "kinescopeVideoId" = :kid WHERE "id" = :id'),
            {"kid": embed_id, "id": webinar_id},
        )
    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="set_kinescope_event_id",
        endpoint=request.url.path,
        method=request.method,
        payload={"webinarId": webinar_id, "kinescopeEventId": event_id},
    )
    db.commit()

    return {
        "rtmpUrl": live.get("rtmp_url") or ks.RTMP_URL,
        "streamKey": live.get("stream_key") or None,
        "eventStatus": live.get("status") or None,
        "kinescopeEventId": event_id,
        "kinescopeVideoId": embed_id,
    }


@router.post("/webinars/{webinar_id}/start", dependencies=[Depends(limit(10, 60))])
def start_webinar(
    webinar_id: str,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Enable (start) a Kinescope live event and mark the webinar as active."""
    row = db.execute(
        text(
            'SELECT "kinescopeEventId", "kinescopeVideoId", "webinarStatus" FROM "Webinar" WHERE "id" = :id'
        ),
        {"id": webinar_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Webinar not found")

    event_id = row.get("kinescopeEventId")
    has_video_id = bool((row.get("kinescopeVideoId") or "").strip())
    # If there is a Kinescope live event ID, try to enable it via API; failures are non-fatal
    if event_id and settings.kinescope_api_token:
        try:
            ks.enable_live_event(event_id)
            if not has_video_id:
                live = ks.get_live_event(event_id)
                embed = (live.get("embed_id") or "").strip() or str(event_id).strip()
                if embed:
                    db.execute(
                        text(
                            'UPDATE "Webinar" SET "kinescopeVideoId" = :kid WHERE "id" = :id '
                            'AND ("kinescopeVideoId" IS NULL OR LENGTH(TRIM(COALESCE("kinescopeVideoId", \'\'))) = 0)'
                        ),
                        {"kid": embed, "id": webinar_id},
                    )
        except RuntimeError as exc:
            import logging
            logging.getLogger(__name__).warning("enable_live_event failed: %s", exc)

    db.execute(
        text('UPDATE "Webinar" SET "webinarStatus" = \'active\' WHERE "id" = :id'),
        {"id": webinar_id},
    )
    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="start_webinar",
        endpoint=request.url.path,
        method=request.method,
        payload={"webinarId": webinar_id, "kinescopeEventId": event_id},
    )
    db.commit()
    return {"success": True, "webinarStatus": "active"}


@router.post("/webinars/{webinar_id}/finish", dependencies=[Depends(limit(10, 60))])
def finish_webinar(
    webinar_id: str,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Complete (finish) a Kinescope live event and mark the webinar as completed."""
    row = db.execute(
        text(
            'SELECT "kinescopeEventId", "webinarStatus", "titleRu", "titleEn", "startsAtIso" FROM "Webinar" WHERE "id" = :id'
        ),
        {"id": webinar_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Webinar not found")

    event_id = row.get("kinescopeEventId")
    new_playback_id = ""
    if event_id and settings.kinescope_api_token:
        try:
            finished = ks.finish_live_event(event_id)
            new_playback_id = ks.playback_video_id_from_live_payload(finished)
        except RuntimeError as exc:
            logging.getLogger(__name__).warning("finish_live_event failed: %s", exc)
        if not new_playback_id:
            # Kinescope often links VOD to the event many seconds after /complete — wait for real VOD id.
            new_playback_id = ks.poll_recording_video_id(
                event_id, max_attempts=28, delay_sec=2.0
            )
        if not new_playback_id:
            try:
                refreshed = ks.get_live_event(event_id)
                new_playback_id = ks.playback_video_id_from_live_payload(refreshed)
            except RuntimeError as exc:
                logging.getLogger(__name__).warning("get_live_event after finish failed: %s", exc)
        if not new_playback_id and settings.kinescope_project_id:
            starts_iso = row["startsAtIso"].isoformat() if row.get("startsAtIso") else None
            new_playback_id = ks.find_live_recording_in_vod_catalog(
                event_id,
                [str(row.get("titleRu") or ""), str(row.get("titleEn") or "")],
                created_after_iso=starts_iso,
            )

    set_clause = '"webinarStatus" = \'completed\''
    params: dict[str, object] = {"id": webinar_id}
    if new_playback_id:
        set_clause += ', "kinescopeVideoId" = :kid'
        params["kid"] = new_playback_id

    db.execute(
        text(f'UPDATE "Webinar" SET {set_clause} WHERE "id" = :id'),
        params,
    )
    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="finish_webinar",
        endpoint=request.url.path,
        method=request.method,
        payload={"webinarId": webinar_id, "kinescopeEventId": event_id},
    )
    db.commit()
    return {
        "success": True,
        "webinarStatus": "completed",
        "kinescopeVideoId": new_playback_id or None,
    }


@router.get("/webinars")
def list_all_webinars(
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Return all flow-level webinars (global list for reuse across flows)."""
    rows = db.execute(
        text(
            """
            SELECT w."id", w."titleRu", w."titleEn", w."kinescopeVideoId", w."kinescopeEventId",
                   w."thumbnailUrl", w."startsAtIso", w."durationMinutes", w."webinarStatus",
                   COUNT(DISTINCT fw."flowId") AS "flowCount"
            FROM "Webinar" w
            LEFT JOIN "IntensiveFlowWebinar" fw ON fw."webinarId" = w."id"
            WHERE w."curriculumDayId" IS NULL
            GROUP BY w."id"
            ORDER BY w."startsAtIso" DESC NULLS LAST
            """
        )
    ).mappings().all()
    dm = webinar_minutes_by_id_after_sync(db, list(rows))
    out = []
    for row in rows:
        r = dict(row)
        r["durationMinutes"] = dm[str(row["id"])]
        if r.get("startsAtIso") is not None:
            r["startsAtIso"] = r["startsAtIso"].isoformat()
        out.append(r)
    return out


@router.post("/flows/{flow_id}/webinars/link", dependencies=[Depends(limit(20, 60))])
def link_flow_webinar(
    flow_id: str,
    payload: LinkFlowWebinarRequest,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Link an existing Webinar record to this flow (for multi-flow reuse)."""
    webinar_id: str = payload.webinarId.strip()

    flow = db.execute(text('SELECT "id" FROM "IntensiveFlow" WHERE "id" = :id'), {"id": flow_id}).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    webinar = db.execute(text('SELECT "id" FROM "Webinar" WHERE "id" = :id'), {"id": webinar_id}).first()
    if not webinar:
        raise HTTPException(status_code=404, detail="Webinar not found")

    already_linked = db.execute(
        text('SELECT "id" FROM "IntensiveFlowWebinar" WHERE "flowId" = :fid AND "webinarId" = :wid'),
        {"fid": flow_id, "wid": webinar_id},
    ).first()
    if already_linked:
        return {"success": True, "webinarId": webinar_id, "alreadyLinked": True}

    now = datetime.now(timezone.utc)
    max_order_row = db.execute(
        text('SELECT COALESCE(MAX("programOrder"), 0) AS mo FROM "IntensiveFlowWebinar" WHERE "flowId" = :fid'),
        {"fid": flow_id},
    ).mappings().first()
    next_order = int((max_order_row or {}).get("mo") or 0) + 1
    db.execute(
        text(
            """
            INSERT INTO "IntensiveFlowWebinar" ("id", "flowId", "webinarId", "programOrder", "createdAt")
            VALUES (:id, :fid, :wid, :ord, :now)
            """
        ),
        {"id": f"flwb-{token_hex(8)}", "fid": flow_id, "wid": webinar_id, "ord": next_order, "now": now},
    )
    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="link_flow_webinar",
        endpoint=request.url.path,
        method=request.method,
        payload={"flowId": flow_id, "webinarId": webinar_id},
    )
    db.commit()
    return {"success": True, "webinarId": webinar_id}


@router.post("/flows/{flow_id}/webinars/orders", dependencies=[Depends(limit(20, 60))])
def set_flow_webinar_orders(
    flow_id: str,
    payload: SetFlowWebinarOrdersRequest,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    flow = db.execute(text('SELECT "id" FROM "IntensiveFlow" WHERE "id" = :id'), {"id": flow_id}).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    orders = [x.programOrder for x in payload.orders]
    if len(set(orders)) != len(orders):
        raise HTTPException(status_code=422, detail="programOrder values must be unique within the flow")
    if payload.orders:
        webinar_ids = [item.webinarId for item in payload.orders]
        valid_rows = db.execute(
            text(
                """
                SELECT w."id"
                FROM "Webinar" w
                INNER JOIN "IntensiveFlowDay" fd
                  ON fd."curriculumDayId" = w."curriculumDayId" AND fd."flowId" = :flow_id
                WHERE w."id" = ANY(:wids)
                """
            ),
            {"flow_id": flow_id, "wids": webinar_ids},
        ).scalars().all()
        valid_set = set(valid_rows)
        invalid = [wid for wid in webinar_ids if wid not in valid_set]
        if invalid:
            raise HTTPException(
                status_code=422,
                detail=f'Webinars not attached to this flow: {", ".join(invalid)}',
            )
    db.execute(text('DELETE FROM "IntensiveFlowWebinar" WHERE "flowId" = :flow_id'), {"flow_id": flow_id})
    if payload.orders:
        now = datetime.now(timezone.utc)
        db.execute(
            text(
                """
                INSERT INTO "IntensiveFlowWebinar" ("id", "flowId", "webinarId", "programOrder", "createdAt")
                VALUES (:id, :flow_id, :wid, :ord, :now)
                """
            ),
            [
                {"id": f"flwb-{token_hex(8)}", "flow_id": flow_id, "wid": item.webinarId, "ord": item.programOrder, "now": now}
                for item in payload.orders
            ],
        )
    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="set_flow_webinar_orders",
        endpoint=request.url.path,
        method=request.method,
        payload={"flowId": flow_id, "count": len(payload.orders)},
    )
    db.commit()
    return {"success": True, "flowId": flow_id, "ordersSaved": len(payload.orders)}


class DuplicateFlowRequest(BaseModel):
    code: str = Field(min_length=1)
    title: str = Field(min_length=1)
    startsAtIso: datetime
    endsAtIso: datetime
    tokenCount: int = Field(ge=0, le=500, default=0)


@router.post("/flows/{flow_id}/duplicate", dependencies=[Depends(limit(10, 60))])
def duplicate_flow(
    flow_id: str,
    payload: DuplicateFlowRequest,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    source = db.execute(
        text(
            """
            SELECT "id", "code", "titleRu", "titleEn", "descriptionRu", "descriptionEn",
                   "startsAt", "endsAt", "timezone", "isActive", "language"
            FROM "IntensiveFlow" WHERE "id" = :id
            """
        ),
        {"id": flow_id},
    ).mappings().first()
    if not source:
        raise HTTPException(status_code=404, detail="Source flow not found")
    if payload.endsAtIso <= payload.startsAtIso:
        raise HTTPException(status_code=422, detail="End must be after start")

    new_id = f"flow-{token_hex(6)}"
    now = datetime.now(timezone.utc)

    src_lang = source.get("language", "ru")
    db.execute(
        text(
            """
            INSERT INTO "IntensiveFlow" (
                "id", "code", "titleRu", "titleEn", "descriptionRu", "descriptionEn",
                "startsAt", "endsAt", "timezone", "isActive", "language",
                "createdByUserId", "createdAt", "updatedAt"
            )
            VALUES (
                :id, :code, :title_ru, :title_en, :desc_ru, :desc_en,
                :starts_at, :ends_at, :timezone, true, :language,
                :created_by, :now, :now
            )
            """
        ),
        {
            "id": new_id,
            "code": payload.code,
            "title_ru": payload.title,
            "title_en": payload.title,
            "desc_ru": source["descriptionRu"] or "",
            "desc_en": source["descriptionEn"] or "",
            "starts_at": payload.startsAtIso,
            "ends_at": payload.endsAtIso,
            "timezone": source["timezone"],
            "language": src_lang,
            "created_by": admin_user.user_id,
            "now": now,
        },
    )

    source_days = db.execute(
        text('SELECT "curriculumDayId", "unlockOffsetMinutes" FROM "IntensiveFlowDay" WHERE "flowId" = :flow_id'),
        {"flow_id": flow_id},
    ).mappings().all()

    if source_days:
        db.execute(
            text(
                """
                INSERT INTO "IntensiveFlowDay" ("id", "flowId", "curriculumDayId", "unlockOffsetMinutes", "createdAt")
                VALUES (:id, :flow_id, :day_id, :offset, :now)
                """
            ),
            [
                {"id": f"flowday-{token_hex(8)}", "flow_id": new_id, "day_id": day["curriculumDayId"],
                 "offset": day["unlockOffsetMinutes"], "now": now}
                for day in source_days
            ],
        )

    source_webinars = db.execute(
        text('SELECT "webinarId", "programOrder" FROM "IntensiveFlowWebinar" WHERE "flowId" = :flow_id'),
        {"flow_id": flow_id},
    ).mappings().all()
    if source_webinars:
        db.execute(
            text(
                """
                INSERT INTO "IntensiveFlowWebinar" ("id", "flowId", "webinarId", "programOrder", "createdAt")
                VALUES (:id, :flow_id, :wid, :ord, :now)
                """
            ),
            [
                {"id": f"flwb-{token_hex(8)}", "flow_id": new_id, "wid": sw["webinarId"],
                 "ord": sw["programOrder"], "now": now}
                for sw in source_webinars
            ],
        )

    generated_tokens = [token_hex(8).upper() for _ in range(payload.tokenCount)] if payload.tokenCount > 0 else []
    if generated_tokens:
        db.execute(
            text(
                """
                INSERT INTO "LicenseToken" ("token", "intensiveStartAt", "issuedAt", "flowId")
                VALUES (:token, :starts_at, :now, :flow_id)
                """
            ),
            [{"token": t, "starts_at": payload.startsAtIso, "now": now, "flow_id": new_id} for t in generated_tokens],
        )

    write_audit(
        db,
        admin_user_id=admin_user.user_id,
        action="duplicate_flow",
        endpoint=request.url.path,
        method=request.method,
        payload={"sourceFlowId": flow_id, "newFlowId": new_id, "code": payload.code, "daysCount": len(source_days), "tokensGenerated": len(generated_tokens)},
    )
    db.commit()
    return {"success": True, "flowId": new_id, "daysCount": len(source_days), "tokensGenerated": len(generated_tokens), "tokens": generated_tokens}


@router.get("/report")
def report(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    stats = db.execute(
        text(
            """
            SELECT
              (SELECT COUNT(*)   FROM "User")                                                      AS total_users,
              (SELECT COUNT(*)   FROM "User"              WHERE "reportCompleted" = true)          AS report_done,
              (SELECT COUNT(*)   FROM "LicenseToken")                                             AS total_tokens,
              (SELECT COUNT(*)   FROM "LicenseToken"      WHERE "usedByUserId" IS NOT NULL)        AS used_tokens,
              (SELECT COUNT(*)   FROM "HomeworkSubmission" WHERE "status" = 'pending_review')      AS pending_hw,
              (SELECT COUNT(*)   FROM "HomeworkSubmission" WHERE "status" = 'overdue')             AS overdue_hw,
              (SELECT "startAt"  FROM "IntensiveConfig"   WHERE "id" = 1)                         AS intensive_start,
              (SELECT json_object_agg("selectedTrack", c) FROM (
                SELECT "selectedTrack", COUNT(*) AS c FROM "User"
                WHERE "selectedTrack" IN ('A','B','C') GROUP BY "selectedTrack"
              ) t)                                                                                 AS track_dist
            """
        )
    ).mappings().first()

    raw_dist = stats["track_dist"] or {}
    dist = {"A": int(raw_dist.get("A") or 0), "B": int(raw_dist.get("B") or 0), "C": int(raw_dist.get("C") or 0)}
    start_at = stats["intensive_start"]
    return {
        "totalUsers": int(stats["total_users"] or 0),
        "reportCompletedUsers": int(stats["report_done"] or 0),
        "trackDistribution": dist,
        "totalTokens": int(stats["total_tokens"] or 0),
        "usedTokens": int(stats["used_tokens"] or 0),
        "pendingHomeworkReviews": int(stats["pending_hw"] or 0),
        "overdueHomework": int(stats["overdue_hw"] or 0),
        "intensiveStartAt": (start_at.isoformat() if start_at else datetime.now(timezone.utc).isoformat()),
    }


@router.get("/audit-logs")
def audit_logs(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT "id", "action", "endpoint", "method", "payloadJson", "createdAt"
            FROM "AdminAuditLog"
            ORDER BY "createdAt" DESC
            LIMIT 200
            """
        )
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "action": row["action"],
            "endpoint": row["endpoint"],
            "method": row["method"],
            "payloadJson": row["payloadJson"],
            "createdAt": row["createdAt"].isoformat(),
        }
        for row in rows
    ]


@router.get("/users")
def users(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT
              u."id",
              u."firstName",
              u."lastName",
              u."email",
              u."role",
              u."language",
              u."selectedTrack",
              u."reportCompleted",
              u."onboardingDone",
              u."onboardingProfile",
              u."recommendedTrack",
              u."startedAt",
              u."createdAt",
              COALESCE(lp_stats."completedLessons", 0) AS "completedLessons",
              COALESCE(lp_stats."totalLessons", 0) AS "totalLessons",
              COALESCE(hw_stats."completedHomework", 0) AS "completedHomework",
              COALESCE(hw_stats."overdueHomework", 0) AS "overdueHomework",
              COALESCE(hw_stats."pendingHomework", 0) AS "pendingHomework"
            FROM "User" u
            LEFT JOIN (
              SELECT
                lp."userId" AS "userId",
                COUNT(*) AS "completedLessons",
                (SELECT COUNT(*) FROM "Lesson") AS "totalLessons"
              FROM "LessonProgress" lp
              GROUP BY lp."userId"
            ) lp_stats ON lp_stats."userId" = u."id"
            LEFT JOIN (
              SELECT
                hs."userId" AS "userId",
                SUM(CASE WHEN hs."status" IN ('approved', 'pending_review') THEN 1 ELSE 0 END) AS "completedHomework",
                SUM(CASE WHEN hs."status" = 'overdue' THEN 1 ELSE 0 END) AS "overdueHomework",
                SUM(CASE WHEN hs."status" = 'pending_review' THEN 1 ELSE 0 END) AS "pendingHomework"
              FROM "HomeworkSubmission" hs
              GROUP BY hs."userId"
            ) hw_stats ON hw_stats."userId" = u."id"
            ORDER BY u."createdAt" DESC
            LIMIT 500
            """
        )
    ).mappings().all()
    return [
        {
            "id": row["id"],
            "firstName": row["firstName"],
            "lastName": row["lastName"],
            "email": row["email"],
            "role": row["role"],
            "language": row["language"],
            "selectedTrack": row["selectedTrack"],
            "reportCompleted": row["reportCompleted"],
            "onboardingDone": row["onboardingDone"],
            "onboardingProfile": row["onboardingProfile"],
            "recommendedTrack": row["recommendedTrack"],
            "startedAt": row["startedAt"].isoformat() if row["startedAt"] else None,
            "createdAt": row["createdAt"].isoformat(),
            "completedLessons": int(row["completedLessons"] or 0),
            "totalLessons": int(row["totalLessons"] or 0),
            "completedHomework": int(row["completedHomework"] or 0),
            "overdueHomework": int(row["overdueHomework"] or 0),
            "pendingHomework": int(row["pendingHomework"] or 0),
            "stage": (
                "registered"
                if not row["reportCompleted"]
                else "onboarding"
                if not row["onboardingDone"]
                else "track_pending"
                if not row["selectedTrack"]
                else "learning"
            ),
        }
        for row in rows
    ]


@router.get("/users/{user_id}/profile")
def user_profile(user_id: str, _: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    user_row = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."email", u."role", u."language",
                   u."selectedTrack", u."reportCompleted", u."onboardingDone",
                   u."onboardingProfile", u."recommendedTrack", u."startedAt", u."createdAt"
            FROM "User" u WHERE u."id" = :id
            """
        ),
        {"id": user_id},
    ).mappings().first()
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    lesson_progress = db.execute(
        text(
            """
            SELECT d."dayNumber", d."track",
                   l."id" AS "lessonId", l."titleRu", l."titleEn", ld."kind",
                   CASE WHEN lp."id" IS NOT NULL THEN true ELSE false END AS "completed"
            FROM "Lesson" l
            JOIN "LessonDay" ld ON ld."lessonId" = l."id"
            JOIN "CurriculumDay" d ON d."id" = ld."curriculumDayId"
            LEFT JOIN "LessonProgress" lp ON lp."lessonId" = l."id" AND lp."userId" = :user_id
            WHERE (d."track" IS NULL OR d."track" = COALESCE(:track, d."track"))
            ORDER BY d."dayNumber" ASC, ld."sortOrder" ASC
            """
        ),
        {"user_id": user_id, "track": user_row["selectedTrack"]},
    ).mappings().all()

    hw_submissions = db.execute(
        text(
            """
            SELECT d."dayNumber", s."status", s."reviewComment", s."reviewedAt",
                   s."createdAt" AS "submittedAt", s."dueAt",
                   s."aiIntegrityRiskScore"
            FROM "HomeworkSubmission" s
            JOIN "HomeworkTemplate" h ON h."id" = s."templateId"
            JOIN "CurriculumDay" d ON d."id" = h."curriculumDayId"
            WHERE s."userId" = :user_id
            ORDER BY d."dayNumber" ASC
            """
        ),
        {"user_id": user_id},
    ).mappings().all()

    cert_row = db.execute(
        text(
            """
            SELECT "finalUnlocked", "certificatePdfUrl", "cardConfirmed", "unlockedAt",
                   "certificateRequestedAt", "certificateRejectedAt", "certificateRejectionComment"
            FROM "StudentCertificate" WHERE "userId" = :user_id
            """
        ),
        {"user_id": user_id},
    ).mappings().first()

    days_map: dict[int, dict] = {}
    for row in lesson_progress:
        day_num = row["dayNumber"]
        if day_num not in days_map:
            days_map[day_num] = {"dayNumber": day_num, "track": row["track"], "lessons": [], "homework": None}
        days_map[day_num]["lessons"].append({
            "lessonId": row["lessonId"],
            "title": row["titleRu"] if user_row["language"] == "ru" else row["titleEn"],
            "kind": row["kind"],
            "completed": row["completed"],
        })

    for row in hw_submissions:
        day_num = row["dayNumber"]
        if day_num not in days_map:
            days_map[day_num] = {"dayNumber": day_num, "track": None, "lessons": [], "homework": None}
        days_map[day_num]["homework"] = {
            "status": row["status"],
            "reviewComment": row["reviewComment"],
            "reviewedAt": row["reviewedAt"].isoformat() if row["reviewedAt"] else None,
            "submittedAt": row["submittedAt"].isoformat() if row["submittedAt"] else None,
            "dueAt": row["dueAt"].isoformat() if row["dueAt"] else None,
            "aiIntegrityRiskScore": row["aiIntegrityRiskScore"],
        }

    total_lessons = sum(len(d["lessons"]) for d in days_map.values())
    completed_lessons = sum(1 for d in days_map.values() for l in d["lessons"] if l["completed"])
    hw_list = [d["homework"] for d in days_map.values() if d["homework"]]
    approved_hw = sum(1 for h in hw_list if h["status"] == "approved")
    pending_hw = sum(1 for h in hw_list if h["status"] == "pending_review")
    rejected_hw = sum(1 for h in hw_list if h["status"] == "rejected")
    overdue_hw = sum(1 for h in hw_list if h["status"] == "overdue")

    return {
        "user": {
            "id": user_row["id"],
            "firstName": user_row["firstName"],
            "lastName": user_row["lastName"],
            "email": user_row["email"],
            "role": user_row["role"],
            "language": user_row["language"],
            "selectedTrack": user_row["selectedTrack"],
            "reportCompleted": user_row["reportCompleted"],
            "onboardingDone": user_row["onboardingDone"],
            "onboardingProfile": user_row["onboardingProfile"],
            "recommendedTrack": user_row["recommendedTrack"],
            "startedAt": user_row["startedAt"].isoformat() if user_row["startedAt"] else None,
            "createdAt": user_row["createdAt"].isoformat(),
        },
        "stats": {
            "totalLessons": total_lessons,
            "completedLessons": completed_lessons,
            "totalHomework": len(hw_list),
            "approvedHomework": approved_hw,
            "pendingHomework": pending_hw,
            "rejectedHomework": rejected_hw,
            "overdueHomework": overdue_hw,
            "progressPercent": round((completed_lessons / total_lessons * 100) if total_lessons > 0 else 0),
        },
        "days": sorted(days_map.values(), key=lambda d: d["dayNumber"]),
        "certificate": {
            "hasCertificatePdf": bool(cert_row and cert_row["certificatePdfUrl"]),
            "cardConfirmed": bool(cert_row and cert_row["cardConfirmed"]),
            "finalUnlocked": bool(cert_row and cert_row["finalUnlocked"]),
            "unlockedAt": cert_row["unlockedAt"].isoformat() if cert_row and cert_row["unlockedAt"] else None,
            "certificateRequestedAt": cert_row["certificateRequestedAt"].isoformat()
            if cert_row and cert_row["certificateRequestedAt"] is not None
            else None,
            "certificateRejectedAt": cert_row["certificateRejectedAt"].isoformat()
            if cert_row and cert_row["certificateRejectedAt"] is not None
            else None,
            "certificateRejectionComment": cert_row["certificateRejectionComment"] if cert_row else None,
        }
        if cert_row
        else {
            "hasCertificatePdf": False,
            "cardConfirmed": False,
            "finalUnlocked": False,
            "unlockedAt": None,
            "certificateRequestedAt": None,
            "certificateRejectedAt": None,
            "certificateRejectionComment": None,
        },
    }


@router.get("/certificate-requests")
def certificate_requests(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """Students who pressed «Request certificate» after the intensive ended (newest first)."""
    rows = db.execute(
        text(
            """
            SELECT
              sc."userId" AS "userId",
              u."firstName",
              u."lastName",
              u."email",
              sc."certificateRequestedAt",
              sc."certificatePdfUrl",
              sc."cardConfirmed",
              sc."finalUnlocked"
            FROM "StudentCertificate" sc
            JOIN "User" u ON u."id" = sc."userId"
            WHERE sc."certificateRequestedAt" IS NOT NULL
              AND u."role" = 'student'
            ORDER BY sc."certificateRequestedAt" DESC
            LIMIT 300
            """
        )
    ).mappings().all()
    return [
        {
            "userId": row["userId"],
            "firstName": row["firstName"],
            "lastName": row["lastName"],
            "email": row["email"],
            "certificateRequestedAt": row["certificateRequestedAt"].isoformat() if row["certificateRequestedAt"] else None,
            "hasCertificatePdf": bool(row["certificatePdfUrl"]),
            "cardConfirmed": bool(row["cardConfirmed"]),
            "finalUnlocked": bool(row["finalUnlocked"]),
        }
        for row in rows
    ]


@router.post("/users/role")
def set_user_role(
    payload: SetUserRoleRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.execute(text('SELECT "id" FROM "User" WHERE "id" = :id'), {"id": payload.userId}).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="set_user_role",
        endpoint=request.url.path,
        method=request.method,
        payload=payload.model_dump(mode="json"),
    )
    db.execute(
        text('UPDATE "User" SET "role" = :role, "updatedAt" = :updated_at WHERE "id" = :id'),
        {"role": payload.role, "updated_at": datetime.now(timezone.utc), "id": payload.userId},
    )
    db.commit()
    return {"success": True}


@router.post("/users/{user_id}/reset-password")
def admin_reset_user_password(
    user_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.execute(text('SELECT "id" FROM "User" WHERE "id" = :id'), {"id": user_id}).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    new_password = token_urlsafe(12)
    now = datetime.now(timezone.utc)
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="admin_reset_user_password",
        endpoint=request.url.path,
        method=request.method,
        payload={"targetUserId": user_id},
    )
    db.execute(
        text(
            """
            UPDATE "User"
            SET "passwordHash" = :password_hash,
                "hashedRefreshToken" = NULL,
                "refreshTokenExpiresAt" = NULL,
                "currentSessionId" = NULL,
                "updatedAt" = :now
            WHERE "id" = :uid
            """
        ),
        {"password_hash": hash_password(new_password), "now": now, "uid": user_id},
    )
    db.commit()
    return {"success": True, "newPassword": new_password}


@router.get("/content/days")
def content_days(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT
                d."id", d."dayNumber", d."track", d."phase", d."focusRu", d."focusEn",
                COALESCE(lc.cnt, 0) AS "lessonsCount",
                COALESCE(wc.cnt, 0) AS "webinarsCount",
                COALESCE(ac.cnt, 0) AS "artifactsCount",
                COALESCE(hc.cnt, 0) AS "homeworkCount"
            FROM "CurriculumDay" d
            LEFT JOIN (SELECT "curriculumDayId", COUNT(*) AS cnt FROM "LessonDay"        GROUP BY "curriculumDayId") lc ON lc."curriculumDayId" = d."id"
            LEFT JOIN (SELECT "curriculumDayId", COUNT(*) AS cnt FROM "Webinar"         GROUP BY "curriculumDayId") wc ON wc."curriculumDayId" = d."id"
            LEFT JOIN (SELECT "curriculumDayId", COUNT(*) AS cnt FROM "Artifact"        GROUP BY "curriculumDayId") ac ON ac."curriculumDayId" = d."id"
            LEFT JOIN (SELECT "curriculumDayId", COUNT(*) AS cnt FROM "HomeworkTemplate" GROUP BY "curriculumDayId") hc ON hc."curriculumDayId" = d."id"
            ORDER BY d."dayNumber" ASC, d."track" ASC
            """
        )
    ).mappings().all()
    return [dict(row) for row in rows]


@router.get("/content/day/{day_id}")
def content_day(day_id: str, _: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    day = db.execute(
        text(
            """
            SELECT "id", "dayNumber", "track", "phase", "focusRu", "focusEn"
            FROM "CurriculumDay"
            WHERE "id" = :id
            """
        ),
        {"id": day_id},
    ).mappings().first()
    if not day:
        raise HTTPException(status_code=404, detail="Day not found")
    lessons = db.execute(
        text(
            """
            SELECT l."id", ld."kind", l."titleRu", l."titleEn", l."contentRu", l."contentEn",
                   l."videoUrl", l."kinescopeVideoId", ld."sortOrder"
            FROM "LessonDay" ld
            JOIN "Lesson" l ON l."id" = ld."lessonId"
            WHERE ld."curriculumDayId" = :id
            ORDER BY ld."sortOrder" ASC
            """
        ),
        {"id": day_id},
    ).mappings().all()
    webinars = db.execute(
        text(
            """
            SELECT "id", "titleRu", "titleEn", "summaryRu", "summaryEn", "startsAtIso", "durationMinutes", "joinUrl"
            FROM "Webinar"
            WHERE "curriculumDayId" = :id
            ORDER BY "startsAtIso" ASC
            """
        ),
        {"id": day_id},
    ).mappings().all()
    artifacts = db.execute(
        text(
            """
            SELECT "id", "titleRu", "titleEn", "resourceUrl"
            FROM "Artifact"
            WHERE "curriculumDayId" = :id
            """
        ),
        {"id": day_id},
    ).mappings().all()
    homework = db.execute(
        text(
            """
            SELECT "id", "instructionRu", "instructionEn", "sampleRu", "sampleEn", "minLength", "lessonId"
            FROM "HomeworkTemplate"
            WHERE "curriculumDayId" = :id
            """
        ),
        {"id": day_id},
    ).mappings().all()
    return {
        **dict(day),
        "lessons": [dict(x) for x in lessons],
        "webinars": [
            {
                **dict(x),
                "startsAtIso": x["startsAtIso"].isoformat(),
            }
            for x in webinars
        ],
        "artifacts": [dict(x) for x in artifacts],
        "homeworkTemplates": [dict(x) for x in homework],
    }


@router.post("/content/lesson")
def upsert_lesson(
    payload: UpsertLessonRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    day = db.execute(text('SELECT "dayNumber" FROM "CurriculumDay" WHERE "id" = :id'), {"id": payload.curriculumDayId}).first()
    if not day:
        raise HTTPException(status_code=404, detail="Curriculum day not found")
    lesson_id = payload.lessonId.strip() if payload.lessonId else f"lesson-{day[0]}-{token_hex(4)}"
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="upsert_lesson",
        endpoint=request.url.path,
        method=request.method,
        payload={**payload.model_dump(mode="json"), "lessonId": lesson_id},
    )
    exists = db.execute(text('SELECT "id" FROM "Lesson" WHERE "id" = :id'), {"id": lesson_id}).first()
    lesson_params = {
        "kind": payload.kind,
        "title_ru": payload.titleRu,
        "title_en": payload.titleEn,
        "content_ru": payload.contentRu,
        "content_en": payload.contentEn,
        "video_url": payload.videoUrl,
        "kinescope_video_id": payload.kinescopeVideoId or None,
        "sort_order": payload.sortOrder,
        "id": lesson_id,
    }
    if exists:
        db.execute(
            text(
                """
                UPDATE "Lesson"
                SET "kind" = :kind, "titleRu" = :title_ru, "titleEn" = :title_en,
                    "contentRu" = :content_ru, "contentEn" = :content_en, "videoUrl" = :video_url,
                    "kinescopeVideoId" = :kinescope_video_id, "sortOrder" = :sort_order
                WHERE "id" = :id
                """
            ),
            lesson_params,
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "Lesson" ("id", "kind", "titleRu", "titleEn", "contentRu", "contentEn", "videoUrl", "kinescopeVideoId", "sortOrder")
                VALUES (:id, :kind, :title_ru, :title_en, :content_ru, :content_en, :video_url, :kinescope_video_id, :sort_order)
                """
            ),
            lesson_params,
        )
    max_sort = db.execute(
        text('SELECT COALESCE(MAX("sortOrder"), 0) FROM "LessonDay" WHERE "curriculumDayId" = :did'),
        {"did": payload.curriculumDayId},
    ).scalar()
    db.execute(
        text(
            """
            INSERT INTO "LessonDay" ("id", "lessonId", "curriculumDayId", "kind", "sortOrder")
            VALUES (:ld_id, :lesson_id, :day_id, :kind, :sort)
            ON CONFLICT ("lessonId", "curriculumDayId") DO UPDATE
            SET "kind" = EXCLUDED."kind", "sortOrder" = EXCLUDED."sortOrder"
            """
        ),
        {
            "ld_id": f"ld-{lesson_id}-{token_hex(4)}",
            "lesson_id": lesson_id,
            "day_id": payload.curriculumDayId,
            "kind": payload.kind,
            "sort": payload.sortOrder if payload.sortOrder else (max_sort or 0) + 1,
        },
    )
    db.commit()
    return {"success": True, "lessonId": lesson_id}


@router.post("/content/webinar")
def upsert_webinar(
    payload: UpsertWebinarRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    day = db.execute(text('SELECT "dayNumber" FROM "CurriculumDay" WHERE "id" = :id'), {"id": payload.curriculumDayId}).first()
    if not day:
        raise HTTPException(status_code=404, detail="Curriculum day not found")
    webinar_id = payload.webinarId.strip() if payload.webinarId else f"wb-{day[0]}-{token_hex(4)}"
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="upsert_webinar",
        endpoint=request.url.path,
        method=request.method,
        payload={**payload.model_dump(mode="json"), "webinarId": webinar_id},
    )
    exists = db.execute(text('SELECT "id" FROM "Webinar" WHERE "id" = :id'), {"id": webinar_id}).first()
    args = {
        "id": webinar_id,
        "day_id": payload.curriculumDayId,
        "title_ru": payload.titleRu,
        "title_en": payload.titleEn,
        "summary_ru": payload.summaryRu,
        "summary_en": payload.summaryEn,
        "starts_at": payload.startsAtIso,
        "duration": payload.durationMinutes,
        "join_url": payload.joinUrl,
    }
    if exists:
        db.execute(
            text(
                """
                UPDATE "Webinar"
                SET "curriculumDayId" = :day_id, "titleRu" = :title_ru, "titleEn" = :title_en,
                    "summaryRu" = :summary_ru, "summaryEn" = :summary_en,
                    "startsAtIso" = :starts_at, "durationMinutes" = :duration, "joinUrl" = :join_url
                WHERE "id" = :id
                """
            ),
            args,
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "Webinar" ("id", "curriculumDayId", "titleRu", "titleEn", "summaryRu", "summaryEn", "startsAtIso", "durationMinutes", "joinUrl")
                VALUES (:id, :day_id, :title_ru, :title_en, :summary_ru, :summary_en, :starts_at, :duration, :join_url)
                """
            ),
            args,
        )
    db.commit()
    return {"success": True, "webinarId": webinar_id}


@router.post("/content/artifact")
def upsert_artifact(
    payload: UpsertArtifactRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    day = db.execute(text('SELECT "dayNumber" FROM "CurriculumDay" WHERE "id" = :id'), {"id": payload.curriculumDayId}).first()
    if not day:
        raise HTTPException(status_code=404, detail="Curriculum day not found")
    artifact_id = payload.artifactId.strip() if payload.artifactId else f"artifact-{day[0]}-{token_hex(4)}"
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="upsert_artifact",
        endpoint=request.url.path,
        method=request.method,
        payload={**payload.model_dump(mode="json"), "artifactId": artifact_id},
    )
    exists = db.execute(text('SELECT "id" FROM "Artifact" WHERE "id" = :id'), {"id": artifact_id}).first()
    args = {
        "id": artifact_id,
        "day_id": payload.curriculumDayId,
        "title_ru": payload.titleRu,
        "title_en": payload.titleEn,
        "resource_url": payload.resourceUrl,
    }
    if exists:
        db.execute(
            text(
                """
                UPDATE "Artifact"
                SET "curriculumDayId" = :day_id, "titleRu" = :title_ru, "titleEn" = :title_en, "resourceUrl" = :resource_url
                WHERE "id" = :id
                """
            ),
            args,
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "Artifact" ("id", "curriculumDayId", "titleRu", "titleEn", "resourceUrl")
                VALUES (:id, :day_id, :title_ru, :title_en, :resource_url)
                """
            ),
            args,
        )
    db.commit()
    return {"success": True, "artifactId": artifact_id}


@router.post("/content/homework-template")
def upsert_homework_template(
    payload: UpsertHomeworkTemplateRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    day = db.execute(text('SELECT "dayNumber" FROM "CurriculumDay" WHERE "id" = :id'), {"id": payload.curriculumDayId}).first()
    if not day:
        raise HTTPException(status_code=404, detail="Curriculum day not found")
    template_id = payload.templateId.strip() if payload.templateId else f"hw-{day[0]}-{token_hex(4)}"
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="upsert_homework_template",
        endpoint=request.url.path,
        method=request.method,
        payload={**payload.model_dump(mode="json"), "templateId": template_id},
    )
    exists = db.execute(text('SELECT "id" FROM "HomeworkTemplate" WHERE "id" = :id'), {"id": template_id}).first()
    args = {
        "id": template_id,
        "day_id": payload.curriculumDayId,
        "instruction_ru": payload.instructionRu,
        "instruction_en": payload.instructionEn,
        "sample_ru": payload.sampleRu,
        "sample_en": payload.sampleEn,
        "min_length": payload.minLength,
        "lesson_id": payload.lessonId,
    }
    if exists:
        db.execute(
            text(
                """
                UPDATE "HomeworkTemplate"
                SET "curriculumDayId" = :day_id, "instructionRu" = :instruction_ru, "instructionEn" = :instruction_en,
                    "sampleRu" = :sample_ru, "sampleEn" = :sample_en, "minLength" = :min_length, "lessonId" = :lesson_id
                WHERE "id" = :id
                """
            ),
            args,
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "HomeworkTemplate" (
                    "id", "curriculumDayId", "instructionRu", "instructionEn", "sampleRu", "sampleEn", "minLength", "lessonId", "dueHourOffset"
                )
                VALUES (:id, :day_id, :instruction_ru, :instruction_en, :sample_ru, :sample_en, :min_length, :lesson_id, 24)
                """
            ),
            args,
        )
    db.commit()
    return {"success": True, "templateId": template_id}


@router.get("/flows/{flow_id}/chat")
def flow_chat(
    flow_id: str,
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text(
            """
            SELECT cm."id", cm."userId", cm."kind", cm."eventType", cm."body", cm."meta", cm."createdAt",
                   COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), SPLIT_PART(u."email", '@', 1)) AS "senderName",
                   u."email" AS "senderEmail"
            FROM "ChatMessage" cm
            LEFT JOIN "User" u ON u."id" = cm."userId"
            WHERE cm."flowId" = :flow_id
            ORDER BY cm."createdAt" DESC
            LIMIT 200
            """
        ),
        {"flow_id": flow_id},
    ).mappings().all()
    return [
        {
            "id": r["id"],
            "userId": r["userId"],
            "kind": r["kind"],
            "eventType": r["eventType"],
            "body": r["body"],
            "meta": r["meta"],
            "senderName": r["senderName"],
            "senderEmail": r["senderEmail"],
            "createdAt": r["createdAt"].isoformat() if r["createdAt"] else None,
        }
        for r in rows
    ]


@router.delete("/chat/messages/{message_id}", dependencies=[Depends(limit(30, 60))])
def delete_chat_message(
    message_id: str,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    row = db.execute(text('SELECT "id" FROM "ChatMessage" WHERE "id" = :id'), {"id": message_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    db.execute(text('DELETE FROM "ChatMessage" WHERE "id" = :id'), {"id": message_id})
    write_audit(db, admin_user_id=admin_user.user_id, action="delete_chat_message", endpoint=request.url.path, method=request.method, payload={"messageId": message_id})
    db.commit()
    return {"success": True}


class ReorderLessonsRequest(BaseModel):
    curriculumDayId: str
    lessonIds: list[str] = Field(min_length=1)


@router.delete("/content/lesson/{lesson_id}", dependencies=[Depends(limit(20, 60))])
def delete_lesson(
    lesson_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    row = db.execute(text('SELECT "id" FROM "Lesson" WHERE "id" = :id'), {"id": lesson_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Lesson not found")
    db.execute(text('DELETE FROM "Lesson" WHERE "id" = :id'), {"id": lesson_id})
    write_audit(db, admin_user_id=user.user_id, action="delete_lesson", endpoint=request.url.path, method=request.method, payload={"lessonId": lesson_id})
    db.commit()
    return {"success": True}


@router.delete("/content/webinar/{webinar_id}", dependencies=[Depends(limit(20, 60))])
def delete_webinar(
    webinar_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    row = db.execute(text('SELECT "id" FROM "Webinar" WHERE "id" = :id'), {"id": webinar_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Webinar not found")
    db.execute(text('DELETE FROM "Webinar" WHERE "id" = :id'), {"id": webinar_id})
    write_audit(db, admin_user_id=user.user_id, action="delete_webinar", endpoint=request.url.path, method=request.method, payload={"webinarId": webinar_id})
    db.commit()
    return {"success": True}


@router.delete("/content/artifact/{artifact_id}", dependencies=[Depends(limit(20, 60))])
def delete_artifact(
    artifact_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    row = db.execute(text('SELECT "id" FROM "Artifact" WHERE "id" = :id'), {"id": artifact_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Artifact not found")
    db.execute(text('DELETE FROM "Artifact" WHERE "id" = :id'), {"id": artifact_id})
    write_audit(db, admin_user_id=user.user_id, action="delete_artifact", endpoint=request.url.path, method=request.method, payload={"artifactId": artifact_id})
    db.commit()
    return {"success": True}


@router.delete("/content/homework-template/{template_id}", dependencies=[Depends(limit(20, 60))])
def delete_homework_template(
    template_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    row = db.execute(text('SELECT "id" FROM "HomeworkTemplate" WHERE "id" = :id'), {"id": template_id}).first()
    if not row:
        raise HTTPException(status_code=404, detail="Homework template not found")
    db.execute(text('DELETE FROM "HomeworkTemplate" WHERE "id" = :id'), {"id": template_id})
    write_audit(db, admin_user_id=user.user_id, action="delete_homework_template", endpoint=request.url.path, method=request.method, payload={"templateId": template_id})
    db.commit()
    return {"success": True}


@router.post("/content/lesson/reorder", dependencies=[Depends(limit(20, 60))])
def reorder_lessons(
    payload: ReorderLessonsRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if payload.lessonIds:
        db.execute(
            text('UPDATE "LessonDay" SET "sortOrder" = :order WHERE "lessonId" = :id AND "curriculumDayId" = :day_id'),
            [{"order": idx, "id": lid, "day_id": payload.curriculumDayId} for idx, lid in enumerate(payload.lessonIds, start=1)],
        )
    write_audit(db, admin_user_id=user.user_id, action="reorder_lessons", endpoint=request.url.path, method=request.method, payload=payload.model_dump(mode="json"))
    db.commit()
    return {"success": True}


@router.delete("/flows/{flow_id}/members/{user_id}", dependencies=[Depends(limit(20, 60))])
def remove_flow_member(
    flow_id: str,
    user_id: str,
    request: Request,
    admin_user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text('SELECT "id" FROM "IntensiveFlowMember" WHERE "flowId" = :fid AND "userId" = :uid'),
        {"fid": flow_id, "uid": user_id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Member not found in this flow")
    db.execute(
        text('DELETE FROM "IntensiveFlowMember" WHERE "flowId" = :fid AND "userId" = :uid'),
        {"fid": flow_id, "uid": user_id},
    )
    write_audit(db, admin_user_id=admin_user.user_id, action="remove_flow_member", endpoint=request.url.path, method=request.method, payload={"flowId": flow_id, "userId": user_id})
    db.commit()
    return {"success": True}


@router.get("/flows/{flow_id}/leaderboard")
def flow_leaderboard(
    flow_id: str,
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    # totalLessons and totalHomework are constant per flow — compute once with CTEs,
    # then join per-user aggregates instead of N×4 LATERAL subqueries.
    rows = db.execute(
        text(
            """
            WITH flow_totals AS (
                SELECT
                    (
                        SELECT COUNT(DISTINCT l."id")
                        FROM "Lesson" l
                        JOIN "LessonDay" ld ON ld."lessonId" = l."id"
                        JOIN "CurriculumDay" cd ON cd."id" = ld."curriculumDayId"
                        JOIN "IntensiveFlowDay" fd ON fd."curriculumDayId" = cd."id" AND fd."flowId" = :flow_id
                        WHERE ld."kind" = 'mandatory'
                    ) AS total_lessons,
                    (
                        SELECT COUNT(*)
                        FROM "HomeworkTemplate" ht
                        JOIN "CurriculumDay" cd ON cd."id" = ht."curriculumDayId"
                        JOIN "IntensiveFlowDay" fd ON fd."curriculumDayId" = cd."id" AND fd."flowId" = :flow_id
                    ) AS total_homework
            ),
            members AS (
                SELECT m."userId"
                FROM "IntensiveFlowMember" m
                WHERE m."flowId" = :flow_id AND m."isActive" = true
            ),
            lesson_counts AS (
                SELECT lp."userId", COUNT(*) AS cnt
                FROM "LessonProgress" lp
                JOIN members mb ON mb."userId" = lp."userId"
                WHERE lp."status" = 'completed'
                GROUP BY lp."userId"
            ),
            hw_counts AS (
                SELECT hs."userId", COUNT(*) AS cnt
                FROM "HomeworkSubmission" hs
                JOIN members mb ON mb."userId" = hs."userId"
                WHERE hs."status" = 'approved'
                GROUP BY hs."userId"
            )
            SELECT u."id", u."firstName", u."lastName", u."email", u."selectedTrack",
                   COALESCE(lc.cnt, 0) AS "completedLessons",
                   ft.total_lessons    AS "totalLessons",
                   COALESCE(hc.cnt, 0) AS "approvedHomework",
                   ft.total_homework   AS "totalHomework"
            FROM "IntensiveFlowMember" m
            JOIN "User" u ON u."id" = m."userId"
            CROSS JOIN flow_totals ft
            LEFT JOIN lesson_counts lc ON lc."userId" = u."id"
            LEFT JOIN hw_counts hc ON hc."userId" = u."id"
            WHERE m."flowId" = :flow_id AND m."isActive" = true
            ORDER BY "completedLessons" DESC, "approvedHomework" DESC
            """
        ),
        {"flow_id": flow_id},
    ).mappings().all()
    return [
        {
            "userId": r["id"],
            "firstName": r["firstName"],
            "lastName": r["lastName"],
            "email": r["email"],
            "selectedTrack": r["selectedTrack"],
            "completedLessons": r["completedLessons"],
            "totalLessons": r["totalLessons"],
            "approvedHomework": r["approvedHomework"],
            "totalHomework": r["totalHomework"],
            "progressPercent": round(r["completedLessons"] / r["totalLessons"] * 100) if r["totalLessons"] > 0 else 0,
        }
        for r in rows
    ]


# ── Course management ──────────────────────────────────────────────────


class UpsertCourseRequest(BaseModel):
    courseId: Optional[str] = None
    titleRu: str = ""
    titleEn: str = ""
    descriptionRu: str = ""
    descriptionEn: str = ""
    coverUrl: str = ""
    sortOrder: int = Field(ge=0, le=999, default=0)


class AddCourseLessonRequest(BaseModel):
    lessonId: str = Field(min_length=1)


class ReorderCourseLessonsRequest(BaseModel):
    lessonIds: list[str] = Field(default_factory=list)


@router.get("/courses")
def list_courses(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT c."id", c."titleRu", c."titleEn", c."descriptionRu", c."descriptionEn",
                   c."coverUrl", c."sortOrder", c."createdAt",
                   COALESCE(cl.cnt, 0) AS "lessonCount"
            FROM "Course" c
            LEFT JOIN (
                SELECT "courseId", COUNT(*) AS cnt FROM "CourseLesson" GROUP BY "courseId"
            ) cl ON cl."courseId" = c."id"
            ORDER BY c."sortOrder" ASC, c."createdAt" ASC
        """)
    ).mappings().all()
    return [
        {**dict(r), "createdAt": r["createdAt"].isoformat() if r["createdAt"] else None}
        for r in rows
    ]


@router.post("/courses")
def upsert_course(
    payload: UpsertCourseRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    course_id = payload.courseId.strip() if payload.courseId else f"course-{token_hex(6)}"
    write_audit(db, admin_user_id=user.user_id, action="upsert_course", endpoint=request.url.path, method=request.method, payload={**payload.model_dump(mode="json"), "courseId": course_id})
    exists = db.execute(text('SELECT "id" FROM "Course" WHERE "id" = :id'), {"id": course_id}).first()
    if exists:
        db.execute(
            text("""
                UPDATE "Course"
                SET "titleRu" = :title_ru, "titleEn" = :title_en,
                    "descriptionRu" = :desc_ru, "descriptionEn" = :desc_en,
                    "coverUrl" = :cover_url, "sortOrder" = :sort_order
                WHERE "id" = :id
            """),
            {"title_ru": payload.titleRu, "title_en": payload.titleEn, "desc_ru": payload.descriptionRu, "desc_en": payload.descriptionEn, "cover_url": payload.coverUrl, "sort_order": payload.sortOrder, "id": course_id},
        )
    else:
        db.execute(
            text("""
                INSERT INTO "Course" ("id", "titleRu", "titleEn", "descriptionRu", "descriptionEn", "coverUrl", "sortOrder", "createdAt")
                VALUES (:id, :title_ru, :title_en, :desc_ru, :desc_en, :cover_url, :sort_order, :created_at)
            """),
            {"id": course_id, "title_ru": payload.titleRu, "title_en": payload.titleEn, "desc_ru": payload.descriptionRu, "desc_en": payload.descriptionEn, "cover_url": payload.coverUrl, "sort_order": payload.sortOrder, "created_at": datetime.now(timezone.utc)},
        )
    db.commit()
    return {"success": True, "courseId": course_id}


def _delete_previous_course_cover_file(previous_cover_url: str) -> None:
    if not previous_cover_url or not previous_cover_url.startswith("/uploads/course-covers/"):
        return
    if ".." in previous_cover_url:
        return
    path = Path("/app") / previous_cover_url.lstrip("/")
    try:
        path.resolve().relative_to(COURSE_COVER_DIR.resolve())
    except ValueError:
        return
    if path.is_file():
        path.unlink(missing_ok=True)


@router.post("/course-covers/upload")
async def upload_course_cover(
    request: Request,
    file: UploadFile = File(...),
    previousCoverUrl: str = Form(default=""),
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if file.content_type not in COURSE_COVER_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF images are allowed")
    content = await file.read()
    if len(content) > COURSE_COVER_MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        ext = "jpg"

    _delete_previous_course_cover_file(previousCoverUrl.strip())

    COURSE_COVER_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"cover_{uuid4().hex[:12]}.{ext}"
    file_path = COURSE_COVER_DIR / safe_name
    file_path.write_bytes(content)
    cover_url = f"/uploads/course-covers/{safe_name}"
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="upload_course_cover",
        endpoint=request.url.path,
        method=request.method,
        payload={"filename": safe_name},
    )
    db.commit()
    return {"success": True, "coverUrl": cover_url}


@router.post("/webinar-thumbnails/upload")
async def upload_webinar_thumbnail(
    request: Request,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if file.content_type not in WEBINAR_THUMB_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF images are allowed")
    content = await file.read()
    if len(content) > WEBINAR_THUMB_MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "jpg"
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        ext = "jpg"

    WEBINAR_THUMB_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"wb_thumb_{uuid4().hex[:12]}.{ext}"
    file_path = WEBINAR_THUMB_DIR / safe_name
    file_path.write_bytes(content)
    thumb_url = f"/uploads/webinar-thumbnails/{safe_name}"
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="upload_webinar_thumbnail",
        endpoint=request.url.path,
        method=request.method,
        payload={"filename": safe_name},
    )
    db.commit()
    return {"success": True, "thumbnailUrl": thumb_url}


@router.delete("/courses/{course_id}")
def delete_course(
    course_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    exists = db.execute(text('SELECT "id" FROM "Course" WHERE "id" = :id'), {"id": course_id}).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Course not found")
    write_audit(db, admin_user_id=user.user_id, action="delete_course", endpoint=request.url.path, method=request.method, payload={"courseId": course_id})
    db.execute(text('DELETE FROM "Course" WHERE "id" = :id'), {"id": course_id})
    db.commit()
    return {"success": True}


@router.get("/courses/{course_id}/lessons")
def course_lessons(course_id: str, _: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    course = db.execute(text('SELECT "id" FROM "Course" WHERE "id" = :id'), {"id": course_id}).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    rows = db.execute(
        text("""
            SELECT l."id", l."titleRu", l."titleEn", l."contentRu", l."contentEn",
                   l."kind", l."videoUrl", l."kinescopeVideoId", l."sortOrder",
                   cl."sortOrder" AS "clSortOrder",
                   COALESCE(
                       (SELECT json_agg(
                           json_build_object(
                               'dayNumber', d."dayNumber",
                               'track', d."track",
                               'phase', d."phase"
                           ) ORDER BY d."dayNumber"
                       )
                       FROM "LessonDay" ld
                       JOIN "CurriculumDay" d ON d."id" = ld."curriculumDayId"
                       WHERE ld."lessonId" = l."id"),
                       '[]'::json
                   ) AS "assignedDays"
            FROM "CourseLesson" cl
            JOIN "Lesson" l ON l."id" = cl."lessonId"
            WHERE cl."courseId" = :course_id
            ORDER BY cl."sortOrder" ASC
        """),
        {"course_id": course_id},
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/courses/{course_id}/lessons")
def add_course_lesson(
    course_id: str,
    payload: AddCourseLessonRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    course = db.execute(text('SELECT "id" FROM "Course" WHERE "id" = :id'), {"id": course_id}).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    lesson = db.execute(text('SELECT "id" FROM "Lesson" WHERE "id" = :id'), {"id": payload.lessonId}).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    existing = db.execute(
        text('SELECT "id" FROM "CourseLesson" WHERE "courseId" = :cid AND "lessonId" = :lid'),
        {"cid": course_id, "lid": payload.lessonId},
    ).first()
    if existing:
        return {"success": True, "alreadyExists": True}
    max_order = db.execute(
        text('SELECT COALESCE(MAX("sortOrder"), 0) FROM "CourseLesson" WHERE "courseId" = :cid'),
        {"cid": course_id},
    ).scalar()
    write_audit(db, admin_user_id=user.user_id, action="add_course_lesson", endpoint=request.url.path, method=request.method, payload={"courseId": course_id, "lessonId": payload.lessonId})
    db.execute(
        text("""
            INSERT INTO "CourseLesson" ("id", "courseId", "lessonId", "sortOrder")
            VALUES (:id, :cid, :lid, :sort_order)
        """),
        {"id": f"cl-{token_hex(6)}", "cid": course_id, "lid": payload.lessonId, "sort_order": (max_order or 0) + 1},
    )
    db.commit()
    return {"success": True}


@router.delete("/courses/{course_id}/lessons/{lesson_id}")
def remove_course_lesson(
    course_id: str,
    lesson_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    write_audit(db, admin_user_id=user.user_id, action="remove_course_lesson", endpoint=request.url.path, method=request.method, payload={"courseId": course_id, "lessonId": lesson_id})
    db.execute(
        text('DELETE FROM "CourseLesson" WHERE "courseId" = :cid AND "lessonId" = :lid'),
        {"cid": course_id, "lid": lesson_id},
    )
    db.commit()
    return {"success": True}


@router.post("/courses/{course_id}/lessons/reorder")
def reorder_course_lessons(
    course_id: str,
    payload: ReorderCourseLessonsRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    write_audit(db, admin_user_id=user.user_id, action="reorder_course_lessons", endpoint=request.url.path, method=request.method, payload={"courseId": course_id, "count": len(payload.lessonIds)})
    if payload.lessonIds:
        db.execute(
            text('UPDATE "CourseLesson" SET "sortOrder" = :sort WHERE "courseId" = :cid AND "lessonId" = :lid'),
            [{"sort": idx, "cid": course_id, "lid": lesson_id} for idx, lesson_id in enumerate(payload.lessonIds, start=1)],
        )
    db.commit()
    return {"success": True}


@router.get("/courses/all-lessons")
def all_lessons_for_picker(_: CurrentUser = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """All lessons in the system, for the course lesson picker."""
    rows = db.execute(
        text("""
            SELECT l."id", l."titleRu", l."titleEn", l."kind",
                   d."dayNumber", d."track", d."phase"
            FROM "Lesson" l
            JOIN "LessonDay" ld ON ld."lessonId" = l."id"
            JOIN "CurriculumDay" d ON d."id" = ld."curriculumDayId"
            ORDER BY d."dayNumber" ASC, d."track" ASC, ld."sortOrder" ASC
        """)
    ).mappings().all()
    return [dict(r) for r in rows]


class CreateCourseLessonRequest(BaseModel):
    courseId: str = Field(min_length=1)
    lessonId: Optional[str] = None
    titleRu: str = ""
    titleEn: str = ""
    contentRu: str = ""
    contentEn: str = ""
    videoUrl: str = ""
    kinescopeVideoId: Optional[str] = None
    sortOrder: int = Field(ge=0, le=100, default=1)


@router.post("/courses/lesson")
def upsert_course_lesson(
    payload: CreateCourseLessonRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Create or update a lesson inside a course (no curriculumDayId required)."""
    course = db.execute(text('SELECT "id" FROM "Course" WHERE "id" = :id'), {"id": payload.courseId}).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    lesson_id = payload.lessonId.strip() if payload.lessonId else f"lesson-c-{token_hex(5)}"
    write_audit(db, admin_user_id=user.user_id, action="upsert_course_lesson", endpoint=request.url.path, method=request.method, payload={**payload.model_dump(mode="json"), "lessonId": lesson_id})
    exists = db.execute(text('SELECT "id" FROM "Lesson" WHERE "id" = :id'), {"id": lesson_id}).first()
    if exists:
        db.execute(
            text("""
                UPDATE "Lesson"
                SET "titleRu" = :title_ru, "titleEn" = :title_en,
                    "contentRu" = :content_ru, "contentEn" = :content_en,
                    "videoUrl" = :video_url, "kinescopeVideoId" = :kinescope_video_id,
                    "sortOrder" = :sort_order
                WHERE "id" = :id
            """),
            {"title_ru": payload.titleRu, "title_en": payload.titleEn, "content_ru": payload.contentRu, "content_en": payload.contentEn, "video_url": payload.videoUrl, "kinescope_video_id": payload.kinescopeVideoId or None, "sort_order": payload.sortOrder, "id": lesson_id},
        )
    else:
        max_cl = db.execute(text('SELECT COALESCE(MAX("sortOrder"), 0) FROM "CourseLesson" WHERE "courseId" = :cid'), {"cid": payload.courseId}).scalar()
        db.execute(
            text("""
                INSERT INTO "Lesson" ("id", "kind", "titleRu", "titleEn", "contentRu", "contentEn", "videoUrl", "kinescopeVideoId", "sortOrder")
                VALUES (:id, 'mandatory', :title_ru, :title_en, :content_ru, :content_en, :video_url, :kinescope_video_id, :sort_order)
            """),
            {"id": lesson_id, "title_ru": payload.titleRu, "title_en": payload.titleEn, "content_ru": payload.contentRu, "content_en": payload.contentEn, "video_url": payload.videoUrl, "kinescope_video_id": payload.kinescopeVideoId or None, "sort_order": payload.sortOrder},
        )
        db.execute(
            text('INSERT INTO "CourseLesson" ("id", "courseId", "lessonId", "sortOrder") VALUES (:id, :cid, :lid, :sort) ON CONFLICT ("courseId", "lessonId") DO NOTHING'),
            {"id": f"cl-{token_hex(6)}", "cid": payload.courseId, "lid": lesson_id, "sort": (max_cl or 0) + 1},
        )
    db.commit()
    return {"success": True, "lessonId": lesson_id}


class AssignLessonToDayRequest(BaseModel):
    lessonId: str = Field(min_length=1)
    kind: Literal["mandatory", "optional"] = "mandatory"


@router.post("/content/day/{day_id}/assign-lesson")
def assign_lesson_to_day(
    day_id: str,
    payload: AssignLessonToDayRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Assign an existing lesson (from a course) to a curriculum day."""
    day = db.execute(text('SELECT "id" FROM "CurriculumDay" WHERE "id" = :id'), {"id": day_id}).first()
    if not day:
        raise HTTPException(status_code=404, detail="Day not found")
    lesson = db.execute(text('SELECT "id" FROM "Lesson" WHERE "id" = :id'), {"id": payload.lessonId}).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    max_sort = db.execute(
        text('SELECT COALESCE(MAX("sortOrder"), 0) FROM "LessonDay" WHERE "curriculumDayId" = :did'),
        {"did": day_id},
    ).scalar()
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="assign_lesson_to_day",
        endpoint=request.url.path,
        method=request.method,
        payload={"dayId": day_id, "lessonId": payload.lessonId, "kind": payload.kind},
    )
    db.execute(
        text(
            """
            INSERT INTO "LessonDay" ("id", "lessonId", "curriculumDayId", "kind", "sortOrder")
            VALUES (:ld_id, :lid, :did, :kind, :sort)
            ON CONFLICT ("lessonId", "curriculumDayId") DO UPDATE
            SET "kind" = EXCLUDED."kind"
            """
        ),
        {
            "ld_id": f"ld-{payload.lessonId}-{token_hex(4)}",
            "lid": payload.lessonId,
            "did": day_id,
            "kind": payload.kind,
            "sort": (max_sort or 0) + 1,
        },
    )
    db.commit()
    return {"success": True}


@router.post("/content/day/{day_id}/unassign-lesson/{lesson_id}")
def unassign_lesson_from_day(
    day_id: str,
    lesson_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Remove a lesson from a day (deletes from LessonDay, keeps lesson in course)."""
    write_audit(db, admin_user_id=user.user_id, action="unassign_lesson_from_day", endpoint=request.url.path, method=request.method, payload={"dayId": day_id, "lessonId": lesson_id})
    db.execute(
        text('DELETE FROM "LessonDay" WHERE "lessonId" = :lid AND "curriculumDayId" = :did'),
        {"lid": lesson_id, "did": day_id},
    )
    db.commit()
    return {"success": True}


# ── Lesson inline edit (any lesson, regardless of course) ─────────────


class UpdateLessonRequest(BaseModel):
    titleRu: str = ""
    titleEn: str = ""
    contentRu: str = ""
    contentEn: str = ""
    videoUrl: str = ""
    kinescopeVideoId: str | None = None
    kind: Literal["mandatory", "optional"] = "mandatory"


@router.put("/lesson/{lesson_id}")
def update_lesson(
    lesson_id: str,
    payload: UpdateLessonRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Update any lesson's core fields (title, content, video, kind)."""
    existing = db.execute(text('SELECT "id" FROM "Lesson" WHERE "id" = :id'), {"id": lesson_id}).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Lesson not found")
    write_audit(db, admin_user_id=user.user_id, action="update_lesson", endpoint=request.url.path, method=request.method, payload={**payload.model_dump(mode="json"), "lessonId": lesson_id})
    db.execute(
        text("""
            UPDATE "Lesson"
            SET "titleRu" = :title_ru, "titleEn" = :title_en,
                "contentRu" = :content_ru, "contentEn" = :content_en,
                "videoUrl" = :video_url, "kinescopeVideoId" = :kinescope_video_id,
                "kind" = :kind
            WHERE "id" = :id
        """),
        {
            "title_ru": payload.titleRu,
            "title_en": payload.titleEn,
            "content_ru": payload.contentRu,
            "content_en": payload.contentEn,
            "video_url": payload.videoUrl,
            "kinescope_video_id": payload.kinescopeVideoId or None,
            "kind": payload.kind,
            "id": lesson_id,
        },
    )
    # Propagate kind change to all day assignments for this lesson.
    db.execute(
        text('UPDATE "LessonDay" SET "kind" = :kind WHERE "lessonId" = :id'),
        {"kind": payload.kind, "id": lesson_id},
    )
    db.commit()
    return {"success": True}


# ── Kinescope video management ────────────────────────────────────────


class InitUploadRequest(BaseModel):
    title: str = Field(min_length=1)


@router.post("/video/init-upload")
def video_init_upload(
    payload: InitUploadRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")
    write_audit(db, admin_user_id=user.user_id, action="video_init_upload", endpoint=request.url.path, method=request.method, payload=payload.model_dump())
    db.commit()
    # TODO(security): Kinescope does not currently offer scoped upload-only tokens.
    # The full KINESCOPE_API_TOKEN is required by the TUS uploader in the browser.
    # Mitigation: this endpoint is admin-only (require_roles("admin")) and the token
    # is sent over HTTPS. When Kinescope adds upload session tokens, replace with
    # a short-lived scoped token here instead of the master API key.
    _log.warning(
        "video_init_upload: returning Kinescope API token to browser for admin %s — "
        "replace with scoped upload token when Kinescope supports it",
        user.user_id,
    )
    return {
        "uploadUrl": "https://uploader.kinescope.io/video",
        "uploadToken": settings.kinescope_api_token,
        "projectId": settings.kinescope_project_id or "",
    }


@router.get("/video/folders")
def video_folders(
    _: CurrentUser = Depends(require_roles("admin")),
):
    """List folders in the configured Kinescope project."""
    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")
    try:
        return ks.list_folders()
    except RuntimeError as e:
        _log.error("Kinescope list_folders failed: %s", e)
        raise HTTPException(status_code=502, detail="External service error")


@router.get("/video/library")
def video_library(
    _: CurrentUser = Depends(require_roles("admin")),
    folder_id: Optional[str] = Query(None, description="Kinescope folder UUID; list videos inside folder"),
    without_folder: bool = Query(False, description="If true, only videos not assigned to any folder"),
    q: Optional[str] = Query(None, description="Search in title/description"),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=100),
):
    """List videos: whole project (default), or filtered by folder / root-only / search."""
    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")
    try:
        if folder_id:
            return ks.list_videos(page=page, per_page=per_page, folder_id=folder_id, q=q)
        if without_folder:
            return ks.list_videos(page=page, per_page=per_page, without_folder=True, q=q)
        return ks.list_videos(page=page, per_page=per_page, q=q)
    except RuntimeError as e:
        _log.error("Kinescope list_videos failed: %s", e)
        raise HTTPException(status_code=502, detail="External service error")


@router.get("/video/{video_id}/status")
def video_status(
    video_id: str,
    _: CurrentUser = Depends(require_roles("admin")),
):
    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")
    try:
        meta = ks.get_video(video_id)
        meta["kinescopeApiUnavailable"] = False
        return meta
    except RuntimeError:
        # Live streams / IDs not yet in VOD API still work in embed; avoid 502 so admin can fill the form manually
        return {
            "id": video_id,
            "title": "",
            "status": "unknown",
            "duration": 0,
            "thumbnail_url": None,
            "play_link": "",
            "embed_link": "",
            "kinescopeApiUnavailable": True,
        }


@router.delete("/video/{video_id}")
def video_delete(
    video_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if not settings.kinescope_api_token:
        raise HTTPException(status_code=500, detail="KINESCOPE_API_TOKEN not configured")
    write_audit(db, admin_user_id=user.user_id, action="video_delete", endpoint=request.url.path, method=request.method, payload={"videoId": video_id})
    try:
        ks.delete_video(video_id)
    except RuntimeError as e:
        _log.error("Kinescope delete_video %s failed: %s", video_id, e)
        raise HTTPException(status_code=502, detail="External service error")
    db.execute(text('UPDATE "Lesson" SET "kinescopeVideoId" = NULL WHERE "kinescopeVideoId" = :vid'), {"vid": video_id})
    db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════════════
#  Community admin endpoints (main-platform JWT, no community token required)
# ══════════════════════════════════════════════════════════════

from datetime import timezone as _tz  # noqa: E402


class BanCommunityUserRequest(BaseModel):
    mode: Literal["preserve", "purge_messages", "purge_all"] = "preserve"
    reason: str = Field(default="", max_length=2000)


def _purge_community_user_public_content(db: Session, uid: str, mode: str) -> None:
    if mode == "preserve":
        return
    if mode in ("purge_messages", "purge_all"):
        db.execute(text('DELETE FROM "CommunityChatMessage" WHERE "authorId" = :uid'), {"uid": uid})
    if mode == "purge_all":
        db.execute(text('DELETE FROM "CommunityVote" WHERE "userId" = :uid'), {"uid": uid})
        db.execute(text('DELETE FROM "CommunityReply" WHERE "authorId" = :uid'), {"uid": uid})
        db.execute(text('DELETE FROM "CommunityTopic" WHERE "authorId" = :uid'), {"uid": uid})
        db.execute(text('DELETE FROM "CommunityChatMember" WHERE "userId" = :uid'), {"uid": uid})


def _fmt_community_topic_admin(db, row: dict) -> dict:
    author = db.execute(
        text('SELECT "firstName", "lastName", "avatarUrl" FROM "CommunityUser" WHERE "id" = :id'),
        {"id": row.get("authorId")},
    ).mappings().first()
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row.get("body"),
        "status": row["status"],
        "isPinned": bool(row.get("isPinned", False)),
        "isClosed": bool(row.get("isClosed", False)),
        "replyCount": int(row.get("replyCount", 0)),
        "viewCount": int(row.get("viewCount", 0)),
        "createdAt": row["createdAt"].isoformat() if row.get("createdAt") else None,
        "closesAt": row["closesAt"].isoformat() if row.get("closesAt") else None,
        "categoryId": row.get("categoryId"),
        "isAnonymous": bool(row.get("isAnonymous", False)),
        "author": {
            "id": row.get("authorId", ""),
            "firstName": author["firstName"] if author else "?",
            "lastName": author["lastName"] if author else "",
            "avatarUrl": author["avatarUrl"] if author else None,
        },
    }


@router.get("/community/pending")
def admin_comm_pending(
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text(
            """
            SELECT t."id", t."categoryId", t."authorId", t."title", t."body",
                   t."isPinned", t."isClosed", t."status", t."approvedAt", t."closesAt",
                   t."viewCount", t."createdAt", t."updatedAt",
                   COALESCE(t."isAnonymous", false) AS "isAnonymous",
                   COUNT(r."id") AS "replyCount"
            FROM "CommunityTopic" t
            LEFT JOIN "CommunityReply" r ON r."topicId" = t."id"
            WHERE t."status" = 'pending'
            GROUP BY t."id"
            ORDER BY t."createdAt" ASC
            """
        )
    ).mappings().all()
    items = [_fmt_community_topic_admin(db, dict(r)) for r in rows]
    return {"items": items, "total": len(items)}


@router.get("/community/topics")
def admin_comm_topics(
    status: Optional[str] = None,
    q: Optional[str] = None,
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    conditions = ["1=1"]
    params: dict = {}
    if status:
        conditions.append('t."status" = :status')
        params["status"] = status
    if q:
        conditions.append('LOWER(t."title") LIKE LOWER(:q)')
        params["q"] = f"%{q}%"
    where = " AND ".join(conditions)
    rows = db.execute(
        text(
            f"""
            SELECT t."id", t."categoryId", t."authorId", t."title",
                   t."isPinned", t."isClosed", t."status", t."approvedAt", t."closesAt",
                   t."viewCount", t."createdAt", t."updatedAt",
                   COALESCE(t."isAnonymous", false) AS "isAnonymous",
                   COUNT(r."id") AS "replyCount"
            FROM "CommunityTopic" t
            LEFT JOIN "CommunityReply" r ON r."topicId" = t."id"
            WHERE {where}
            GROUP BY t."id"
            ORDER BY t."createdAt" DESC
            LIMIT 300
            """
        ),
        params,
    ).mappings().all()
    items = [_fmt_community_topic_admin(db, dict(r)) for r in rows]
    return {"items": items, "total": len(items)}


@router.post("/community/topics/{topic_id}/approve")
def admin_comm_approve(
    topic_id: str,
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text('SELECT "id", "status" FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Topic is not pending")
    from datetime import datetime, timedelta
    now = datetime.now(_tz.utc)
    closes_at = now + timedelta(hours=24)
    db.execute(
        text(
            "UPDATE \"CommunityTopic\" SET \"status\" = 'active', \"approvedAt\" = :now, \"closesAt\" = :closes WHERE \"id\" = :id"
        ),
        {"now": now, "closes": closes_at, "id": topic_id},
    )
    db.commit()
    return {"success": True, "closesAt": closes_at.isoformat()}


@router.post("/community/topics/{topic_id}/reject")
def admin_comm_reject(
    topic_id: str,
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text('SELECT "id" FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")
    db.execute(text('DELETE FROM "CommunityTopic" WHERE "id" = :id'), {"id": topic_id})
    db.commit()
    return {"success": True}


@router.post("/community/topics/{topic_id}/pin")
def admin_comm_pin(
    topic_id: str,
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text('SELECT "id", "isPinned" FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")
    new_val = not row["isPinned"]
    db.execute(
        text('UPDATE "CommunityTopic" SET "isPinned" = :val WHERE "id" = :id'),
        {"val": new_val, "id": topic_id},
    )
    db.commit()
    return {"success": True, "isPinned": new_val}


@router.delete("/community/topics/{topic_id}", status_code=204)
def admin_comm_delete_topic(
    topic_id: str,
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    db.execute(text('DELETE FROM "CommunityTopic" WHERE "id" = :id'), {"id": topic_id})
    db.commit()


@router.get("/community/users")
def admin_comm_users(
    q: Optional[str] = None,
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    search_clause = ""
    params: dict = {}
    if q:
        search_clause = """
            AND (
                LOWER(cu."firstName") LIKE LOWER(:q)
                OR LOWER(cu."lastName") LIKE LOWER(:q)
                OR LOWER(cu."email") LIKE LOWER(:q)
            )
        """
        params["q"] = f"%{q}%"
    rows = db.execute(
        text(
            f"""
            SELECT cu."id", cu."firstName", cu."lastName", cu."email", cu."avatarUrl",
                   cu."createdAt",
                   COALESCE(cu."isBanned", false) AS "isBanned",
                   cu."bannedAt",
                   cu."bannedReason",
                   cp."position", cp."company",
                   (SELECT COUNT(*) FROM "CommunityTopic" t WHERE t."authorId" = cu."id" AND t."status" != 'pending') AS topics,
                   (SELECT COUNT(*) FROM "CommunityReply" r WHERE r."authorId" = cu."id") AS replies,
                   COALESCE(cp."communityXp", 0) AS xp
            FROM "CommunityUser" cu
            LEFT JOIN "CommunityProfile" cp ON cp."userId" = cu."id"
            WHERE 1=1 {search_clause}
            ORDER BY cu."createdAt" DESC
            LIMIT 1000
            """
        ),
        params,
    ).mappings().all()
    items = [
        {
            "id": r["id"],
            "firstName": r["firstName"],
            "lastName": r["lastName"],
            "email": r["email"],
            "avatarUrl": r["avatarUrl"],
            "position": r["position"],
            "company": r["company"],
            "joinedAt": r["createdAt"].isoformat() if r["createdAt"] else None,
            "topics": int(r["topics"] or 0),
            "replies": int(r["replies"] or 0),
            "xp": int(r["xp"] or 0),
            "isBanned": bool(r.get("isBanned")),
            "bannedAt": r["bannedAt"].isoformat() if r.get("bannedAt") else None,
            "bannedReason": r.get("bannedReason"),
        }
        for r in rows
    ]
    return {"items": items, "total": len(items)}


@router.post("/community/users/{community_user_id}/ban")
def admin_comm_ban_user(
    community_user_id: str,
    payload: BanCommunityUserRequest,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    exists = db.execute(
        text('SELECT "id" FROM "CommunityUser" WHERE "id" = :id'),
        {"id": community_user_id},
    ).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Community user not found")

    _purge_community_user_public_content(db, community_user_id, payload.mode)

    now = datetime.now(_tz.utc)
    reason = (payload.reason or "").strip() or None
    db.execute(
        text(
            """
            UPDATE "CommunityUser"
            SET "isBanned" = true,
                "bannedAt" = :now,
                "bannedReason" = :reason,
                "currentSessionId" = NULL,
                "hashedRefreshToken" = NULL,
                "refreshTokenExpiresAt" = NULL,
                "updatedAt" = :now
            WHERE "id" = :uid
            """
        ),
        {"now": now, "reason": reason, "uid": community_user_id},
    )
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="community_user_ban",
        endpoint=request.url.path,
        method=request.method,
        payload={"communityUserId": community_user_id, "mode": payload.mode, "reason": payload.reason[:500] if payload.reason else ""},
    )
    db.commit()
    return {"success": True}


@router.post("/community/users/{community_user_id}/unban")
def admin_comm_unban_user(
    community_user_id: str,
    request: Request,
    user: CurrentUser = Depends(require_roles("admin", "mentor", "curator")),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text('SELECT "id", COALESCE("isBanned", false) AS "isBanned" FROM "CommunityUser" WHERE "id" = :id'),
        {"id": community_user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Community user not found")
    if not row.get("isBanned"):
        raise HTTPException(status_code=400, detail="User is not banned")

    now = datetime.now(_tz.utc)
    db.execute(
        text(
            """
            UPDATE "CommunityUser"
            SET "isBanned" = false,
                "bannedAt" = NULL,
                "bannedReason" = NULL,
                "updatedAt" = :now
            WHERE "id" = :uid
            """
        ),
        {"now": now, "uid": community_user_id},
    )
    write_audit(
        db,
        admin_user_id=user.user_id,
        action="community_user_unban",
        endpoint=request.url.path,
        method=request.method,
        payload={"communityUserId": community_user_id},
    )
    db.commit()
    return {"success": True}
