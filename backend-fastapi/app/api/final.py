import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user, require_roles
from app.services.audit import write_audit
from app.services.common_queries import get_effective_intensive
from app.services.intensive import ensure_platform_open, resolve_intensive_state


router = APIRouter(prefix="/final", tags=["final"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads/certificates"))


class ConfirmCardRequest(BaseModel):
    userId: str = Field(min_length=2)
    confirmed: bool


class CertificateRequestBody(BaseModel):
    workEmail: str = Field(min_length=3, max_length=254, description="Work e-mail where the certificate letter will be sent")


def _get_certificate_row(db: Session, user_id: str):
    return db.execute(
        text(
            """
            SELECT "finalUnlocked", "certificatePdfUrl", "cardConfirmed", "unlockedAt"
            FROM "StudentCertificate" WHERE "userId" = :user_id
            """
        ),
        {"user_id": user_id},
    ).mappings().first()


def _all_homework_approved(db: Session, user_id: str) -> bool:
    row = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN s."status" = 'approved' THEN 1 ELSE 0 END) AS approved
            FROM "HomeworkSubmission" s
            WHERE s."userId" = :user_id
            """
        ),
        {"user_id": user_id},
    ).mappings().first()
    if not row or row["total"] == 0:
        return False
    return row["approved"] == row["total"]


def _intensive_ended(db: Session, user_id: str) -> bool:
    config = get_effective_intensive(db, user_id)
    if not config:
        return False
    state = resolve_intensive_state(config)
    return state.ended


def build_final_status_payload(
    db: Session,
    user_id: str,
    *,
    intensive_ended: bool | None = None,
) -> dict:
    # Single query: certificate row + homework aggregate in one round-trip
    row = db.execute(
        text(
            """
            SELECT
                sc."finalUnlocked",
                sc."certificatePdfUrl",
                sc."cardConfirmed",
                sc."certificateRequestedAt",
                sc."workEmail",
                sc."certificateRejectedAt",
                sc."certificateRejectionComment",
                COALESCE(hw.hw_total, 0)    AS hw_total,
                COALESCE(hw.hw_approved, 0) AS hw_approved
            FROM (SELECT 1 AS _anchor) _
            LEFT JOIN "StudentCertificate" sc ON sc."userId" = :user_id
            LEFT JOIN (
                SELECT
                    COUNT(*)                                                       AS hw_total,
                    SUM(CASE WHEN "status" = 'approved' THEN 1 ELSE 0 END)        AS hw_approved
                FROM "HomeworkSubmission"
                WHERE "userId" = :user_id
            ) hw ON true
            """
        ),
        {"user_id": user_id},
    ).mappings().first()

    if intensive_ended is None:
        intensive_ended = _intensive_ended(db, user_id)

    cert_exists = row and row["finalUnlocked"] is not None
    hw_done = bool(row and row["hw_total"] > 0 and row["hw_approved"] == row["hw_total"])

    req_at = row["certificateRequestedAt"] if cert_exists else None
    rej_at = row["certificateRejectedAt"] if cert_exists else None
    return {
        "unlocked": bool(cert_exists and row["finalUnlocked"]),
        "intensiveEnded": intensive_ended,
        "allHomeworkApproved": hw_done,
        "certificatePdfUrl": row["certificatePdfUrl"] if cert_exists else None,
        "cardConfirmed": bool(row["cardConfirmed"]) if cert_exists else False,
        "certificateRequestedAt": req_at.isoformat() if req_at else None,
        "workEmail": row["workEmail"] if cert_exists else None,
        "certificateRejectedAt": rej_at.isoformat() if rej_at else None,
        "certificateRejectionComment": row["certificateRejectionComment"] if cert_exists else None,
    }


@router.get("/status")
def final_status(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_final_status_payload(db, user.user_id)


@router.post("/request-certificate")
def request_certificate(
    payload: CertificateRequestBody,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    intensive = get_effective_intensive(db, user.user_id)
    if not intensive:
        raise HTTPException(status_code=400, detail="Intensive config not found")
    st = resolve_intensive_state(intensive)
    if not st.ended:
        raise HTTPException(status_code=403, detail="Certificate request opens after the intensive ends")

    work_email = payload.workEmail.strip().lower()

    now = datetime.now(timezone.utc)
    existing = db.execute(
        text(
            'SELECT "certificatePdfUrl", "certificateRequestedAt" FROM "StudentCertificate" WHERE "userId" = :uid'
        ),
        {"uid": user.user_id},
    ).mappings().first()
    if existing:
        db.execute(
            text(
                """
                UPDATE "StudentCertificate"
                SET "certificateRequestedAt" = :now,
                    "workEmail" = :work_email,
                    "certificateRejectedAt" = NULL,
                    "certificateRejectionComment" = NULL,
                    "updatedAt" = :now
                WHERE "userId" = :uid
                """
            ),
            {"now": now, "uid": user.user_id, "work_email": work_email},
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "StudentCertificate"
                    ("id", "userId", "certificateRequestedAt", "workEmail", "createdAt", "updatedAt")
                VALUES (:id, :uid, :now, :work_email, :now, :now)
                """
            ),
            {"id": f"cert-{uuid4().hex[:12]}", "uid": user.user_id, "now": now, "work_email": work_email},
        )
    db.commit()
    return build_final_status_payload(db, user.user_id, intensive_ended=st.ended)


class RejectCertificateRequest(BaseModel):
    comment: str = Field(default="", max_length=1000, description="Reason shown to the student")


@router.post("/admin/reject-certificate/{user_id}")
def admin_reject_certificate(
    user_id: str,
    payload: RejectCertificateRequest,
    request: Request,
    admin: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    """Reject a pending certificate request. Clears the request so the student can resubmit."""
    target = db.execute(text('SELECT "id" FROM "User" WHERE "id" = :id'), {"id": user_id}).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.execute(
        text('SELECT "certificateRequestedAt" FROM "StudentCertificate" WHERE "userId" = :uid'),
        {"uid": user_id},
    ).mappings().first()
    if not existing or not existing["certificateRequestedAt"]:
        raise HTTPException(status_code=422, detail="No pending certificate request for this student")

    now = datetime.now(timezone.utc)
    db.execute(
        text(
            """
            UPDATE "StudentCertificate"
            SET "certificateRequestedAt" = NULL,
                "certificateRejectedAt" = :now,
                "certificateRejectionComment" = :comment,
                "updatedAt" = :now
            WHERE "userId" = :uid
            """
        ),
        {"now": now, "uid": user_id, "comment": payload.comment.strip() or None},
    )

    write_audit(
        db,
        admin_user_id=admin.user_id,
        action="reject_certificate_request",
        endpoint=request.url.path,
        method=request.method,
        payload={"userId": user_id, "comment": payload.comment},
    )
    db.commit()
    return {"success": True}


@router.get("")
def get_final(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    cert = _get_certificate_row(db, user.user_id)
    if not cert or not cert["finalUnlocked"]:
        raise HTTPException(status_code=403, detail="Final section is locked. Complete all homework and wait for admin confirmation.")

    row = db.execute(
        text('SELECT "selectedTrack", "language", "firstName", "lastName" FROM "User" WHERE "id" = :id'),
        {"id": user.user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    outcome_type = "roadmap" if row["selectedTrack"] == "A" else "ai_toolkit" if row["selectedTrack"] == "B" else "mvp_case"
    is_ru = row["language"] == "ru"
    full_name = f'{row["firstName"]} {row["lastName"]}'.strip()

    return {
        "achievements": (
            ["Прошел 14-дневный маршрут", "Сформировал персональный фокус", "Закрыл обязательные ежедневные шаги"]
            if is_ru
            else ["Completed 14-day route", "Defined personal focus", "Closed mandatory daily steps"]
        ),
        "outcomeType": outcome_type,
        "nextSteps": (
            ["Запланировать 30-дневное продолжение", "Опубликовать результат в портфолио", "Подключиться к следующему продвинутому треку"]
            if is_ru
            else ["Plan 30-day continuation", "Publish result in portfolio", "Join advanced track"]
        ),
        "certificatePdfUrl": cert["certificatePdfUrl"],
        "cardConfirmed": cert["cardConfirmed"],
        "studentName": full_name,
    }


@router.get("/certificate/download")
def download_certificate(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    cert = _get_certificate_row(db, user.user_id)
    if not cert or not cert["finalUnlocked"] or not cert["certificatePdfUrl"]:
        raise HTTPException(status_code=403, detail="Certificate not available")

    file_path = _web_url_to_file_path(cert["certificatePdfUrl"])
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Certificate file not found on server")

    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename="certificate.pdf",
    )


# --- Admin endpoints ---

def _web_url_to_file_path(web_url: str) -> Path:
    """Convert a stored web URL (/uploads/certificates/...) back to the filesystem path.

    Handles legacy records that stored the absolute server path (/app/uploads/...).
    """
    if web_url.startswith("/uploads/"):
        return Path("/app") / web_url.lstrip("/")
    # Legacy absolute path stored before this fix
    return Path(web_url)


@router.post("/admin/upload-certificate/{user_id}")
async def admin_upload_certificate(
    user_id: str,
    request: Request,
    file: UploadFile = File(...),
    admin: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.execute(text('SELECT "id" FROM "User" WHERE "id" = :id'), {"id": user_id}).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Only PDF files are accepted")

    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="File too large (max 10MB)")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{user_id}_{uuid4().hex[:8]}.pdf"
    file_path = UPLOAD_DIR / safe_filename
    # Store a web-accessible relative URL, not the absolute server path.
    # Absolute paths would leak internal server directory structure to clients.
    web_url = f"/uploads/certificates/{safe_filename}"

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="File too large (max 10MB)")
    file_path.write_bytes(content)

    now = datetime.now(timezone.utc)
    existing = _get_certificate_row(db, user_id)
    if existing:
        old_url = existing["certificatePdfUrl"]
        if old_url:
            old_path = _web_url_to_file_path(old_url)
            if old_path.is_file():
                old_path.unlink(missing_ok=True)
        db.execute(
            text(
                """
                UPDATE "StudentCertificate"
                SET "certificatePdfUrl" = :pdf_url, "updatedAt" = :now
                WHERE "userId" = :user_id
                """
            ),
            {"pdf_url": web_url, "now": now, "user_id": user_id},
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "StudentCertificate" ("id", "userId", "certificatePdfUrl", "createdAt", "updatedAt")
                VALUES (:id, :user_id, :pdf_url, :now, :now)
                """
            ),
            {"id": f"cert-{uuid4().hex[:12]}", "user_id": user_id, "pdf_url": web_url, "now": now},
        )

    write_audit(db, admin_user_id=admin.user_id, action="upload_certificate",
                endpoint=request.url.path, method=request.method,
                payload={"userId": user_id, "filename": safe_filename})
    db.commit()
    return {"success": True, "certificatePdfUrl": web_url}


@router.post("/admin/confirm-card")
def admin_confirm_card(
    payload: ConfirmCardRequest,
    request: Request,
    admin: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.execute(text('SELECT "id" FROM "User" WHERE "id" = :id'), {"id": payload.userId}).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)
    existing = _get_certificate_row(db, payload.userId)
    if existing:
        db.execute(
            text(
                """
                UPDATE "StudentCertificate"
                SET "cardConfirmed" = :confirmed, "updatedAt" = :now
                WHERE "userId" = :user_id
                """
            ),
            {"confirmed": payload.confirmed, "now": now, "user_id": payload.userId},
        )
    else:
        db.execute(
            text(
                """
                INSERT INTO "StudentCertificate" ("id", "userId", "cardConfirmed", "createdAt", "updatedAt")
                VALUES (:id, :user_id, :confirmed, :now, :now)
                """
            ),
            {"id": f"cert-{uuid4().hex[:12]}", "user_id": payload.userId, "confirmed": payload.confirmed, "now": now},
        )

    write_audit(db, admin_user_id=admin.user_id, action="confirm_card",
                endpoint=request.url.path, method=request.method,
                payload={"userId": payload.userId, "confirmed": payload.confirmed})
    db.commit()
    return {"success": True, "cardConfirmed": payload.confirmed}


@router.post("/admin/unlock/{user_id}")
def admin_unlock_final(
    user_id: str,
    request: Request,
    admin: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.execute(text('SELECT "id" FROM "User" WHERE "id" = :id'), {"id": user_id}).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    cert = _get_certificate_row(db, user_id)
    if not cert:
        raise HTTPException(status_code=422, detail="Upload certificate PDF first")
    if not cert["certificatePdfUrl"]:
        raise HTTPException(status_code=422, detail="Upload certificate PDF first")
    if not cert["cardConfirmed"]:
        raise HTTPException(status_code=422, detail="Confirm card delivery first")

    if not _all_homework_approved(db, user_id):
        raise HTTPException(status_code=422, detail="Not all homework is approved for this student")

    now = datetime.now(timezone.utc)
    db.execute(
        text(
            """
            UPDATE "StudentCertificate"
            SET "finalUnlocked" = true, "unlockedAt" = :now, "unlockedByUserId" = :admin_id, "updatedAt" = :now
            WHERE "userId" = :user_id
            """
        ),
        {"now": now, "admin_id": admin.user_id, "user_id": user_id},
    )

    write_audit(db, admin_user_id=admin.user_id, action="unlock_final_section",
                endpoint=request.url.path, method=request.method,
                payload={"userId": user_id})
    db.commit()
    return {"success": True, "finalUnlocked": True}


@router.get("/admin/certificate-status/{user_id}")
def admin_certificate_status(
    user_id: str,
    _: CurrentUser = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.execute(
        text('SELECT "id", "firstName", "lastName", "email" FROM "User" WHERE "id" = :id'),
        {"id": user_id},
    ).mappings().first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    cert = _get_certificate_row(db, user_id)
    hw_done = _all_homework_approved(db, user_id)
    intensive_done = _intensive_ended(db, user_id)

    return {
        "userId": user_id,
        "email": target["email"],
        "firstName": target["firstName"],
        "lastName": target["lastName"],
        "hasCertificatePdf": bool(cert and cert["certificatePdfUrl"]),
        "cardConfirmed": bool(cert and cert["cardConfirmed"]),
        "finalUnlocked": bool(cert and cert["finalUnlocked"]),
        "allHomeworkApproved": hw_done,
        "intensiveEnded": intensive_done,
        "unlockedAt": cert["unlockedAt"].isoformat() if cert and cert["unlockedAt"] else None,
    }
