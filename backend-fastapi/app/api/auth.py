import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from secrets import token_hex
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.rate_limit import limit
from app.core.config import settings
from app.core.security import (
    create_session_id,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    sha256_hex,
    verify_password,
)
from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user
from app.schemas.common import (
    ActivateLicenseRequest,
    LoginRequest,
    RefreshRequest,
    RequestResetRequest,
    ResetPasswordRequest,
    SignupRequest,
)

AVATAR_DIR = Path("/app/uploads/avatars")
AVATAR_MAX_SIZE = 2 * 1024 * 1024  # 2 MB
AVATAR_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
AVATAR_ALLOWED_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}


router = APIRouter(prefix="/auth", tags=["auth"])


def _store_refresh(db: Session, user_id: str, refresh_token: str, session_id: str) -> None:
    db.execute(
        text(
            """
            UPDATE "User"
            SET "hashedRefreshToken" = :hashed_token,
                "refreshTokenExpiresAt" = :expires_at,
                "currentSessionId" = :session_id
            WHERE "id" = :user_id
            """
        ),
        {
            "hashed_token": hash_password(refresh_token),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=30),
            "session_id": session_id,
            "user_id": user_id,
        },
    )


@router.post("/signup", dependencies=[Depends(limit(30, 60))])
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    exists = db.execute(
        text('SELECT "id" FROM "User" WHERE "email" = :email'),
        {"email": payload.email},
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="User already exists")

    user_id = db.execute(
        text(
            """
            INSERT INTO "User" (
                "id", "firstName", "lastName", "email", "passwordHash", "role", "language", "timezone", "reportCompleted",
                "onboardingDone", "createdAt", "updatedAt"
            )
            VALUES (:id, :first_name, :last_name, :email, :password_hash, 'student', :language, 'UTC', false, false, :now, :now)
            RETURNING "id"
            """
        ),
        {
            "id": token_hex(16),
            "first_name": payload.firstName.strip(),
            "last_name": payload.lastName.strip(),
            "email": payload.email,
            "password_hash": hash_password(payload.password),
            "language": payload.language,
            "now": datetime.now(timezone.utc),
        },
    ).scalar_one()
    session_id = create_session_id()
    access = create_access_token(user_id, "student", session_id)
    refresh = create_refresh_token(user_id, "student", session_id)
    _store_refresh(db, user_id, refresh, session_id)
    db.commit()
    return {"userId": user_id, "email": payload.email, "accessToken": access, "refreshToken": refresh}


@router.post("/login", dependencies=[Depends(limit(60, 60))])
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    row = db.execute(
        text('SELECT "id", "passwordHash", "role" FROM "User" WHERE "email" = :email'),
        {"email": payload.email},
    ).mappings().first()
    if not row or not verify_password(payload.password, row["passwordHash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    session_id = create_session_id()
    access = create_access_token(row["id"], row["role"], session_id)
    refresh = create_refresh_token(row["id"], row["role"], session_id)
    _store_refresh(db, row["id"], refresh, session_id)
    db.commit()
    return {"userId": row["id"], "email": payload.email, "accessToken": access, "refreshToken": refresh}


@router.post("/activate-license", dependencies=[Depends(limit(20, 60))])
def activate_license(payload: ActivateLicenseRequest, db: Session = Depends(get_db)):
    license_row = db.execute(
        text('SELECT "token", "intensiveStartAt", "usedByUserId", "flowId" FROM "LicenseToken" WHERE "token" = :token'),
        {"token": payload.token},
    ).mappings().first()
    if not license_row:
        raise HTTPException(status_code=400, detail="License token not found")
    if license_row["usedByUserId"]:
        raise HTTPException(status_code=400, detail="License token already used")

    user = db.execute(
        text('SELECT "id" FROM "User" WHERE "email" = :email'),
        {"email": payload.email},
    ).mappings().first()
    now = datetime.now(timezone.utc)
    if user:
        user_id = user["id"]
        db.execute(
            text(
                """
                UPDATE "User"
                SET "passwordHash" = :password_hash,
                    "firstName" = :first_name,
                    "lastName" = :last_name,
                    "language" = :language,
                    "startedAt" = :started_at,
                    "updatedAt" = :now
                WHERE "id" = :id
                """
            ),
            {
                "password_hash": hash_password(payload.password),
                "first_name": payload.firstName.strip(),
                "last_name": payload.lastName.strip(),
                "language": payload.language,
                "started_at": license_row["intensiveStartAt"],
                "now": now,
                "id": user_id,
            },
        )
    else:
        user_id = token_hex(16)
        db.execute(
            text(
                """
                INSERT INTO "User" (
                    "id", "firstName", "lastName", "email", "passwordHash", "role", "language", "timezone",
                    "startedAt", "reportCompleted", "onboardingDone", "createdAt", "updatedAt"
                )
                VALUES (:id, :first_name, :last_name, :email, :password_hash, 'student', :language, 'UTC', :started_at, false, false, :now, :now)
                """
            ),
            {
                "id": user_id,
                "first_name": payload.firstName.strip(),
                "last_name": payload.lastName.strip(),
                "email": payload.email,
                "password_hash": hash_password(payload.password),
                "language": payload.language,
                "started_at": license_row["intensiveStartAt"],
                "now": now,
            },
        )

    db.execute(
        text(
            """
            UPDATE "LicenseToken"
            SET "usedAt" = :used_at,
                "usedByUserId" = :user_id
            WHERE "token" = :token
            """
        ),
        {"used_at": now, "user_id": user_id, "token": payload.token},
    )

    flow_id = license_row["flowId"]
    if flow_id:
        existing_member = db.execute(
            text('SELECT "id" FROM "IntensiveFlowMember" WHERE "flowId" = :flow_id AND "userId" = :user_id'),
            {"flow_id": flow_id, "user_id": user_id},
        ).first()
        if not existing_member:
            db.execute(
                text(
                    """
                    INSERT INTO "IntensiveFlowMember" ("id", "flowId", "userId", "isActive", "roleInFlow", "assignedAt")
                    VALUES (:id, :flow_id, :user_id, true, 'participant', :now)
                    """
                ),
                {"id": f"fm-{token_hex(8)}", "flow_id": flow_id, "user_id": user_id, "now": now},
            )

    db.commit()
    return {"success": True, "userId": user_id, "startedAt": license_row["intensiveStartAt"].isoformat(), "flowId": flow_id}


@router.post("/refresh", dependencies=[Depends(limit(80, 60))])
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        token_payload = decode_refresh_token(payload.refreshToken)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user_id = token_payload.get("sub")
    row = db.execute(
        text('SELECT "id", "role", "hashedRefreshToken", "refreshTokenExpiresAt", "currentSessionId" FROM "User" WHERE "id" = :id'),
        {"id": user_id},
    ).mappings().first()
    if not row or not row["hashedRefreshToken"] or not row["refreshTokenExpiresAt"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")
    if row["refreshTokenExpiresAt"] < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
    if not verify_password(payload.refreshToken, row["hashedRefreshToken"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if token_payload.get("sid") != row["currentSessionId"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalidated by a newer login")
    access = create_access_token(row["id"], row["role"], row["currentSessionId"])
    refresh_token = create_refresh_token(row["id"], row["role"], row["currentSessionId"])
    _store_refresh(db, row["id"], refresh_token, row["currentSessionId"])
    db.commit()
    return {"accessToken": access, "refreshToken": refresh_token}


@router.post("/logout")
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        token_payload = decode_refresh_token(payload.refreshToken)
    except ValueError:
        return {"success": True}
    db.execute(
        text(
            """
            UPDATE "User"
            SET "hashedRefreshToken" = NULL,
                "refreshTokenExpiresAt" = NULL,
                "currentSessionId" = NULL
            WHERE "id" = :id
            """
        ),
        {"id": token_payload.get("sub")},
    )
    db.commit()
    return {"success": True}


def me_response_from_current_user(user: CurrentUser) -> dict:
    """Shape of GET /auth/me — uses fields already loaded in get_current_user (no extra User SELECT)."""
    return {
        "id": user.user_id,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "email": user.email,
        "startedAt": user.started_at.isoformat() if user.started_at else None,
        "timezone": user.timezone,
        "selectedTrack": user.selected_track,
        "language": user.language_stored,
        "role": user.role,
        "onboardingDone": user.onboarding_done,
        "onboardingProfile": user.onboarding_profile,
        "recommendedTrack": user.recommended_track,
        "reportCompleted": user.report_completed,
        "avatarUrl": user.avatar_url,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return me_response_from_current_user(user)


class UpdateProfileRequest(BaseModel):
    firstName: str = Field(min_length=1, max_length=100)
    lastName: str = Field(min_length=1, max_length=100)
    language: str = Field(default="ru", pattern=r"^(ru|en)$")
    timezone: str = Field(default="UTC", max_length=50)


@router.put("/profile")
def update_profile(payload: UpdateProfileRequest, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(
        text(
            """
            UPDATE "User"
            SET "firstName" = :first_name, "lastName" = :last_name,
                "language" = :language, "timezone" = :timezone, "updatedAt" = :now
            WHERE "id" = :id
            """
        ),
        {
            "first_name": payload.firstName.strip(),
            "last_name": payload.lastName.strip(),
            "language": payload.language,
            "timezone": payload.timezone,
            "now": datetime.now(timezone.utc),
            "id": user.user_id,
        },
    )
    db.commit()
    return {"success": True}


class ChangePasswordRequest(BaseModel):
    currentPassword: str = Field(min_length=1)
    newPassword: str = Field(min_length=6, max_length=128)


@router.post("/password/change", dependencies=[Depends(limit(10, 60))])
def change_password(payload: ChangePasswordRequest, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        text('SELECT "passwordHash" FROM "User" WHERE "id" = :id'),
        {"id": user.user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(payload.currentPassword, row["passwordHash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    # Invalidate refresh token so any other session (e.g. a stolen token) loses access.
    # The current access token remains valid until its natural expiry (~30 min).
    db.execute(
        text(
            """
            UPDATE "User"
            SET "passwordHash" = :hash,
                "hashedRefreshToken" = NULL,
                "refreshTokenExpiresAt" = NULL,
                "updatedAt" = :now
            WHERE "id" = :id
            """
        ),
        {"hash": hash_password(payload.newPassword), "now": datetime.now(timezone.utc), "id": user.user_id},
    )
    db.commit()
    return {"success": True}


@router.post("/avatar")
async def upload_avatar(file: UploadFile, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if file.content_type not in AVATAR_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF images are allowed")
    content = await file.read()
    if len(content) > AVATAR_MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 2 MB)")

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    raw_ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    ext = raw_ext if raw_ext in AVATAR_ALLOWED_EXTS else "jpg"
    safe_name = f"{user.user_id}_{uuid4().hex[:8]}.{ext}"
    file_path = AVATAR_DIR / safe_name
    file_path.write_bytes(content)

    avatar_url = f"/uploads/avatars/{safe_name}"

    old_url = db.execute(
        text('SELECT "avatarUrl" FROM "User" WHERE "id" = :id'),
        {"id": user.user_id},
    ).scalar()
    if old_url:
        old_path = Path("/app") / old_url.lstrip("/")
        if old_path.is_file():
            old_path.unlink(missing_ok=True)

    db.execute(
        text('UPDATE "User" SET "avatarUrl" = :url, "updatedAt" = :now WHERE "id" = :id'),
        {"url": avatar_url, "now": datetime.now(timezone.utc), "id": user.user_id},
    )
    db.commit()
    return {"success": True, "avatarUrl": avatar_url}


@router.delete("/avatar")
def delete_avatar(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    old_url = db.execute(
        text('SELECT "avatarUrl" FROM "User" WHERE "id" = :id'),
        {"id": user.user_id},
    ).scalar()
    if old_url:
        old_path = Path("/app") / old_url.lstrip("/")
        if old_path.is_file():
            old_path.unlink(missing_ok=True)
    db.execute(
        text('UPDATE "User" SET "avatarUrl" = NULL, "updatedAt" = :now WHERE "id" = :id'),
        {"now": datetime.now(timezone.utc), "id": user.user_id},
    )
    db.commit()
    return {"success": True}


@router.post("/password/request-reset", dependencies=[Depends(limit(5, 900))])
def request_reset(payload: RequestResetRequest, db: Session = Depends(get_db)):
    user = db.execute(
        text('SELECT "id" FROM "User" WHERE "email" = :email'),
        {"email": payload.email},
    ).mappings().first()
    if not user:
        return {"success": True}
    raw_token = token_hex(24)
    token_hash = sha256_hex(raw_token)
    now = datetime.now(timezone.utc)
    db.execute(
        text(
            """
            INSERT INTO "PasswordResetToken" ("id", "userId", "tokenHash", "expiresAt", "createdAt")
            VALUES (:id, :user_id, :token_hash, :expires_at, :created_at)
            """
        ),
        {
            "id": token_hex(16),
            "user_id": user["id"],
            "token_hash": token_hash,
            "expires_at": now + timedelta(hours=1),
            "created_at": now,
        },
    )
    db.execute(
        text('UPDATE "User" SET "passwordResetRequestedAt" = :now WHERE "id" = :id'),
        {"now": now, "id": user["id"]},
    )
    db.commit()
    if settings.password_reset_return_token_in_response:
        return {"success": True, "resetToken": raw_token}
    return {"success": True}


@router.post("/password/reset")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    token_row = db.execute(
        text(
            """
            SELECT "id", "userId"
            FROM "PasswordResetToken"
            WHERE "tokenHash" = :token_hash
              AND "usedAt" IS NULL
              AND "expiresAt" > :now
            ORDER BY "createdAt" DESC
            LIMIT 1
            """
        ),
        {"token_hash": sha256_hex(payload.token), "now": datetime.now(timezone.utc)},
    ).mappings().first()
    if not token_row:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    now = datetime.now(timezone.utc)
    db.execute(
        text(
            """
            UPDATE "User"
            SET "passwordHash" = :password_hash,
                "hashedRefreshToken" = NULL,
                "refreshTokenExpiresAt" = NULL,
                "currentSessionId" = NULL,
                "updatedAt" = :now
            WHERE "id" = :user_id
            """
        ),
        {"password_hash": hash_password(payload.newPassword), "now": now, "user_id": token_row["userId"]},
    )
    db.execute(
        text('UPDATE "PasswordResetToken" SET "usedAt" = :now WHERE "id" = :id'),
        {"now": now, "id": token_row["id"]},
    )
    db.commit()
    return {"success": True}
