from datetime import datetime, timezone
from typing import Optional


def effective_current_day_for_access(
    start_at_iso: Optional[str],
    open: bool,
    ended: bool,
    now: Optional[datetime] = None,
) -> int:
    """Program day used to unlock scheduled content. When the intensive has ended (by end date),
    all standard programme days are treated as open (capped at 14)."""
    if ended:
        return 14
    if open and start_at_iso:
        return calculate_current_day(start_at_iso, now)
    return 1


def calculate_current_day(started_at_iso: str, now: Optional[datetime] = None) -> int:
    current = now or datetime.now(timezone.utc)
    started_at = datetime.fromisoformat(started_at_iso.replace("Z", "+00:00"))
    day_ms = 24 * 60 * 60
    diff = int((current.timestamp() - started_at.timestamp()) // day_ms) + 1
    if diff < 1:
        return 1
    if diff > 14:
        return 14
    return diff


def is_split_available(current_day: int) -> bool:
    return current_day >= 7


def is_map_unlocked(report_completed: bool) -> bool:
    return report_completed
