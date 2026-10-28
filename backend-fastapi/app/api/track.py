from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user
from app.services.common_queries import get_effective_intensive
from app.services.intensive import ensure_platform_accessible, resolve_intensive_state
from app.services.unlock import calculate_current_day


router = APIRouter(prefix="/track", tags=["track"])


class SelectTrackRequest(BaseModel):
    track: Literal["A", "B", "C"]


@router.post("/select")
def select_track(
    payload: SelectTrackRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    intensive = get_effective_intensive(db, user.user_id)
    if not intensive:
        raise HTTPException(status_code=400, detail="Intensive is not configured")
    ensure_platform_accessible(intensive)
    state = resolve_intensive_state(intensive)
    # After the intensive ends, students may still pick/switch track to filter days 8–14 in the UI.
    if not state.ended:
        start = intensive.get("startAt")
        if not start:
            raise HTTPException(status_code=400, detail="Intensive start is not configured")
        current_day = calculate_current_day(start.isoformat())
        if current_day < 7:
            raise HTTPException(status_code=400, detail="Track can be chosen only on day 7 and later")
    db.execute(
        text('UPDATE "User" SET "selectedTrack" = :track, "updatedAt" = :now WHERE "id" = :id'),
        {"track": payload.track, "now": datetime.now(timezone.utc), "id": user.user_id},
    )
    db.commit()
    return {"success": True, "selectedTrack": payload.track}
