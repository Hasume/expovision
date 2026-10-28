from datetime import datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db


auth_scheme = HTTPBearer(auto_error=True)


class CurrentUser:
    def __init__(
        self,
        user_id: str,
        role: str,
        language: str,
        email: str = "",
        selected_track: str | None = None,
        report_completed: bool = False,
        onboarding_done: bool = False,
        first_name: str | None = None,
        last_name: str | None = None,
        avatar_url: str | None = None,
        timezone: str = "UTC",
        *,
        language_stored: str | None = None,
        started_at: datetime | None = None,
        onboarding_profile: str | None = None,
        recommended_track: str | None = None,
        created_at: datetime | None = None,
    ):
        self.user_id = user_id
        self.role = role
        self.language = language
        self.email = email
        self.selected_track = selected_track
        self.report_completed = report_completed
        self.onboarding_done = onboarding_done
        self.first_name = first_name
        self.last_name = last_name
        self.avatar_url = avatar_url
        self.timezone = timezone
        self.language_stored = language_stored
        self.started_at = started_at
        self.onboarding_profile = onboarding_profile
        self.recommended_track = recommended_track
        self.created_at = created_at


def _normalize_locale(value: str | None) -> str | None:
    if not value:
        return None
    lowered = value.strip().lower()
    if lowered.startswith("ru"):
        return "ru"
    if lowered.startswith("en"):
        return "en"
    return None


def _resolve_request_locale(request: Request, stored_language: str | None) -> str:
    from_query = _normalize_locale(request.query_params.get("lang"))
    if from_query:
        return from_query

    from_header = _normalize_locale(request.headers.get("x-locale"))
    if from_header:
        return from_header

    from_stored = _normalize_locale(stored_language)
    if from_stored:
        return from_stored

    from_accept = _normalize_locale(request.headers.get("accept-language"))
    if from_accept:
        return from_accept

    return "ru"


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(auth_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> CurrentUser:
    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is missing in token")

    row = db.execute(
        text(
            """
            SELECT "id", "role", "language", "email", "currentSessionId",
                   "selectedTrack", "reportCompleted", "onboardingDone",
                   "firstName", "lastName", "avatarUrl", "timezone",
                   "startedAt", "onboardingProfile", "recommendedTrack", "createdAt"
            FROM "User"
            WHERE "id" = :id
            """
        ),
        {"id": user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if row["currentSessionId"] != session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalidated by a newer login")

    return CurrentUser(
        user_id=row["id"],
        role=row["role"],
        language=_resolve_request_locale(request, row["language"]),
        email=row["email"] or "",
        selected_track=row["selectedTrack"],
        report_completed=bool(row["reportCompleted"]),
        onboarding_done=bool(row["onboardingDone"]),
        first_name=row["firstName"],
        last_name=row["lastName"],
        avatar_url=row["avatarUrl"],
        timezone=row["timezone"] or "UTC",
        language_stored=row["language"],
        started_at=row["startedAt"],
        onboarding_profile=row["onboardingProfile"],
        recommended_track=row["recommendedTrack"],
        created_at=row["createdAt"],
    )


def require_roles(*roles: str):
    def checker(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return checker
