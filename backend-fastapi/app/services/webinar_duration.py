"""Sync ``Webinar.durationMinutes`` from Kinescope VOD ``duration`` when a video id is set."""

from __future__ import annotations

from typing import Any, Mapping

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import kinescope as ks


def webinar_minutes_by_id_after_sync(db: Session, rows: list[Mapping[str, Any]]) -> dict[str, int]:
    """For each webinar row with ``kinescopeVideoId``, fetch duration from API; UPDATE when stored value differs.

    Returns a map ``webinar_id -> durationMinutes`` (falls back to stored minutes when API yields nothing).
    """
    if not rows:
        return {}
    updates: list[tuple[str, int]] = []
    out: dict[str, int] = {}
    for row in rows:
        wid = str(row["id"])
        kid = str(row.get("kinescopeVideoId") or "").strip()
        stored = int(row.get("durationMinutes") or 0)
        dm = stored
        if kid and settings.kinescope_api_token:
            real = ks.video_duration_minutes(kid)
            if real:
                dm = real
                if real != stored:
                    updates.append((wid, real))
        out[wid] = dm
    for wid, dm in updates:
        db.execute(
            text('UPDATE "Webinar" SET "durationMinutes" = :dm WHERE "id" = :wid'),
            {"dm": dm, "wid": wid},
        )
    if updates:
        db.commit()
    return out
