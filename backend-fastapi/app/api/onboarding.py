from datetime import datetime, timezone
import json
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user


router = APIRouter(prefix="/onboarding", tags=["onboarding"])


class OnboardingRequest(BaseModel):
    level: Literal["newbie", "chatgpt_tried", "coded_before"]
    interest: Literal["it_professions", "ai_in_work", "build_product"]
    dailyTime: Literal["30m", "1h", "2h_plus"]
    goal: Literal["understand_market", "build_ai_scenarios", "build_mvp"]
    experience: list[Literal["chatgpt", "figma", "coding", "none"]]


_ONBOARDING_COLUMNS = frozenset({
    "onboardingDone", "onboardingProfile", "recommendedTrack",
    "levelAnswer", "interestAnswer", "timeAnswer", "goalAnswer",
    "experienceAnswer", "updatedAt",
})


@router.post("")
def submit_onboarding(
    payload: OnboardingRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    language = user.language
    if payload.interest == "it_professions":
        profile_label = "Новичок-практик" if language == "ru" else "Beginner practitioner"
        recommended_track = "A"
    elif payload.interest == "ai_in_work":
        profile_label = "AI-практик" if language == "ru" else "AI practitioner"
        recommended_track = "B"
    else:
        profile_label = "Создатель продукта" if language == "ru" else "Builder mindset"
        recommended_track = "C"

    update_candidates = [
        ("onboardingDone", "onboarding_done", True),
        ("onboardingProfile", "profile", profile_label),
        ("recommendedTrack", "track", recommended_track),
        ("levelAnswer", "level", payload.level),
        ("interestAnswer", "interest", payload.interest),
        ("timeAnswer", "daily_time", payload.dailyTime),
        ("goalAnswer", "goal", payload.goal),
        ("experienceAnswer", "experience", json.dumps(payload.experience, ensure_ascii=False)),
        ("updatedAt", "updated_at", datetime.now(timezone.utc)),
    ]

    assignments = [
        f'"{col}" = :{param}'
        for col, param, _ in update_candidates
        if col in _ONBOARDING_COLUMNS
    ]
    query_params: dict[str, object] = {"user_id": user.user_id}
    for col, param, value in update_candidates:
        if col in _ONBOARDING_COLUMNS:
            query_params[param] = value

    db.execute(
        text('UPDATE "User" SET ' + ", ".join(assignments) + ' WHERE "id" = :user_id'),
        query_params,
    )
    db.commit()
    return {"profileLabel": profile_label, "recommendedTrack": recommended_track}
