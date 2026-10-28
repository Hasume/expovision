from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Mapping, Optional

from fastapi import HTTPException


@dataclass
class IntensiveState:
    configured: bool
    start_at: Optional[datetime]
    end_at: Optional[datetime]
    open: bool
    ended: bool
    seconds_to_start: Optional[int]
    seconds_to_end: Optional[int]


def resolve_intensive_state(config: Optional[Mapping[str, object]]) -> IntensiveState:
    if not config:
        return IntensiveState(
            configured=False,
            start_at=None,
            end_at=None,
            open=False,
            ended=False,
            seconds_to_start=None,
            seconds_to_end=None,
        )

    is_started = config.get("isStarted")
    start_at = config.get("startAt") or config.get("startsAt")
    end_at = config.get("endAt") or config.get("endsAt")
    if (is_started is False) or not isinstance(start_at, datetime):
        return IntensiveState(
            configured=False,
            start_at=None,
            end_at=None,
            open=False,
            ended=False,
            seconds_to_start=None,
            seconds_to_end=None,
        )

    now = datetime.now(timezone.utc)
    start_utc = start_at.astimezone(timezone.utc) if start_at.tzinfo else start_at.replace(tzinfo=timezone.utc)
    end_utc = None
    if isinstance(end_at, datetime):
        end_utc = end_at.astimezone(timezone.utc) if end_at.tzinfo else end_at.replace(tzinfo=timezone.utc)
    seconds = int((start_utc - now).total_seconds())
    if seconds <= 0:
        seconds_to_end = None
        ended = False
        if end_utc:
            seconds_to_end = int((end_utc - now).total_seconds())
            ended = seconds_to_end <= 0
        return IntensiveState(
            configured=True,
            start_at=start_utc,
            end_at=end_utc,
            open=not ended,
            ended=ended,
            seconds_to_start=0,
            seconds_to_end=max(0, seconds_to_end or 0) if seconds_to_end is not None else None,
        )
    return IntensiveState(
        configured=True,
        start_at=start_utc,
        end_at=end_utc,
        open=False,
        ended=False,
        seconds_to_start=seconds,
        seconds_to_end=None,
    )


def ensure_platform_open(config: Optional[Mapping[str, object]]) -> IntensiveState:
    state = resolve_intensive_state(config)
    if not state.configured:
        raise HTTPException(status_code=423, detail="Intensive start is not configured by admin yet")
    if state.ended:
        raise HTTPException(status_code=423, detail="Intensive is finished")
    if not state.open:
        raise HTTPException(status_code=423, detail="Platform is locked until intensive start")
    return state


def ensure_platform_accessible(config: Optional[Mapping[str, object]]) -> IntensiveState:
    """Like ensure_platform_open but allows read access after the intensive has ended."""
    state = resolve_intensive_state(config)
    if not state.configured:
        raise HTTPException(status_code=423, detail="Intensive start is not configured by admin yet")
    if not state.open and not state.ended:
        raise HTTPException(status_code=423, detail="Platform is locked until intensive start")
    return state
