from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user


router = APIRouter(prefix="/report", tags=["report"])


@router.post("/complete-initial")
def complete_report(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(
        text('UPDATE "User" SET "reportCompleted" = true, "updatedAt" = :now WHERE "id" = :id'),
        {"now": datetime.now(timezone.utc), "id": user.user_id},
    )
    db.commit()
    return {"success": True, "mapUnlocked": True}
