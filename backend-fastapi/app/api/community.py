"""Community forum API.

Uses a separate CommunityUser table — completely independent of the student User table.
Auth tokens are issued with role='community' so they are distinguishable from student tokens.
"""

import json
import logging
import mimetypes
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from secrets import token_hex
from typing import List, Literal, Optional
from urllib.parse import quote
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.rate_limit import limit
from app.core.security import (
    create_session_id,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/community", tags=["community"])

MAX_BODY = 10_000
PAGE_SIZE = 20

COMMUNITY_INLINE_IMG_ALLOWED_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})
COMMUNITY_INLINE_IMG_MAX_BYTES = 5 * 1024 * 1024
COMMUNITY_INLINE_IMG_DIR = Path("/app/uploads/community-inline")
COMMUNITY_CHAT_ATTACH_DIR = Path("/app/uploads/community-chat")

CANONICAL_CATEGORY_IDS = frozenset({
    "cat-learning",
    "cat-practice",
    "cat-ai",
    "cat-project",
    "cat-community",
    "cat-micro",
    "cat-platform",
})

_CATEGORY_PROFILE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "cat-learning": ("урок", "lesson", "модул", "лекци", "курс", "программ", "видео", "материал", "интенсив"),
    "cat-practice": ("дз", "homework", "задани", "практик", "сдач", "тест", "упражнен", "проверк"),
    "cat-ai": ("ai", "нейросет", "gpt", "claude", "gemini", "промпт", "chatgpt", "llm", "машинн", "ии"),
    "cat-project": ("проект", "портфолио", "кейс", "работод", "резюме", "собесед", "трудоустрой", "ваканс"),
    "cat-community": ("совет", "опыт", "карьер", "ментор", "метод", "обучен", "сообществ", "коллег"),
    "cat-micro": ("лента", "коротко", "нашёл", "ссылк", "заметк"),
    "cat-platform": ("платформ", "баг", "ошибк", "идея", "expovision", "поддержк"),
}


def _haystack_for_profile(db: Session, user_id: str) -> str:
    row = db.execute(
        text(
            """
            SELECT p."skills", p."position", p."company", u."firstName"
            FROM "CommunityUser" u
            LEFT JOIN "CommunityProfile" p ON p."userId" = u."id"
            WHERE u."id" = :id
            """
        ),
        {"id": user_id},
    ).mappings().first()
    if not row:
        return ""
    skills_raw = row["skills"] or "[]"
    try:
        skills = json.loads(skills_raw) if isinstance(skills_raw, str) else []
    except Exception:
        skills = []
    parts = [row["position"] or "", row["company"] or "", row["firstName"] or ""]
    parts.extend(str(s) for s in skills if s)
    return " ".join(parts).lower()


def _category_profile_scores(haystack: str) -> dict[str, int]:
    if not haystack.strip():
        return {}
    out: dict[str, int] = {}
    for cid, kws in _CATEGORY_PROFILE_KEYWORDS.items():
        n = sum(1 for kw in kws if kw in haystack)
        if n:
            out[cid] = n
    return out


def _validate_category_topic_kind(db: Session, category_id: Optional[str], topic_kind: str) -> None:
    if not category_id:
        return
    row = db.execute(
        text('SELECT "kindScope" FROM "CommunityCategory" WHERE "id" = :id'),
        {"id": category_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=400, detail="Category not found")
    ks = row["kindScope"] or "both"
    if ks == "discussion" and topic_kind != "discussion":
        raise HTTPException(status_code=400, detail="Эта категория только для тем обсуждения")
    if ks == "short" and topic_kind != "short":
        raise HTTPException(status_code=400, detail="Эта категория только для короткой заметки в ленту")


# Fallback quotes (RU) used when the external APIs are unavailable
_FALLBACK_QUOTES_RU: list[tuple[str, str]] = [
    ("Учиться никогда не поздно.", "Народная мудрость"),
    ("Повторение — мать учения.", "Народная мудрость"),
    ("Без труда не выловишь и рыбку из пруда.", "Народная мудрость"),
    (
        "Образование теперь непрерывно; он не может ни на минуту остановиться: "
        "в покое начинается упадок умственный и нравственный.",
        "Л. Н. Толстой",
    ),
    (
        "Образование есть величайшее дело в жизни; оно кончается только с жизнью.",
        "К. Д. Ушинский",
    ),
    ("Нет друга лучше книги.", "Л. Н. Толстой"),
    (
        "Образование — это не подготовка к жизни; образование — это и есть жизнь.",
        "Джон Дьюи",
    ),
    ("Дисциплина — мост между целями и их достижением.", "Джим Рон"),
    ("Единственное, что мешает мне учиться, — это мое образование.", "Альберт Эйнштейн"),
    ("Мы слишком часто даём детям ответы, вместо того чтобы учить их думать.", "Мария Монтессори"),
    ("Технологии — лишь инструмент. Важно, как педагог вовлекает учеников и помогает им расти.", "Билл Гейтс"),
]


def _fetch_quote_ru() -> dict:
    """Quote of the day in Russian: Forismatic (lang=ru), otherwise the local fallback list."""
    out: dict = {"text": None, "author": None}
    try:
        with httpx.Client(timeout=6.0, follow_redirects=True) as client:
            r = client.get(
                "https://api.forismatic.com/api/1.0/",
                params={"method": "getQuote", "format": "json", "lang": "ru"},
            )
            if r.status_code == 200:
                d = r.json()
                text_q = (d.get("quoteText") or "").strip()
                author_q = (d.get("quoteAuthor") or "").strip() or None
                if text_q:
                    out = {"text": text_q, "author": author_q}
    except Exception:
        logger.debug("forismatic (ru) fetch failed", exc_info=True)
    if not (out.get("text") or "").strip():
        text_f, author_f = random.choice(_FALLBACK_QUOTES_RU)
        out = {"text": text_f, "author": author_f}
    return out


def _fetch_wiki_edtech_ru() -> dict:
    """Short reference extract from Russian Wikipedia (EdTech / educational technology)."""
    wiki: dict = {"title": None, "extract": None, "url": None}
    titles_try = (
        "Образовательные_технологии",
        "Дистанционное_образование",
        "Электронное_обучение",
    )
    try:
        with httpx.Client(
            timeout=6.0,
            follow_redirects=True,
            headers={"User-Agent": "ExpovisionCommunity/1.0 (edtech)"},
        ) as client:
            for title in titles_try:
                path_enc = quote(title, safe="_")
                r = client.get(f"https://ru.wikipedia.org/api/rest_v1/page/summary/{path_enc}")
                if r.status_code != 200:
                    continue
                d = r.json()
                extract = (d.get("extract") or "").strip()
                if not extract:
                    continue
                wiki = {
                    "title": d.get("title"),
                    "extract": extract,
                    "url": (d.get("content_urls") or {}).get("desktop", {}).get("page"),
                }
                break
    except Exception:
        logger.debug("wikipedia ru fetch failed", exc_info=True)
    return wiki

# ─── Auth models ──────────────────────────────────────────────────────────────

COMMUNITY_ROLE = "community"


class CommSignupRequest(BaseModel):
    firstName: str = Field(min_length=1, max_length=80)
    lastName: str = Field(default="", max_length=80)
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)


class CommLoginRequest(BaseModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=256)


class CommRefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=16)


# ─── Auth dependency ──────────────────────────────────────────────────────────

from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


class CommCurrentUser:
    def __init__(self, user_id: str):
        self.user_id = user_id


def get_community_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> CommCurrentUser:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        from app.core.security import decode_access_token
        payload = decode_access_token(credentials.credentials)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if payload.get("role") != COMMUNITY_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community token required")
    user_id = payload.get("sub")
    session_id = payload.get("sid")
    if not user_id or not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    row = db.execute(
        text(
            'SELECT "currentSessionId", COALESCE("isBanned", false) AS "isBanned" '
            'FROM "CommunityUser" WHERE "id" = :id'
        ),
        {"id": user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if row["currentSessionId"] != session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalidated")
    if row.get("isBanned"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт заблокирован модератором",
        )
    return CommCurrentUser(user_id=user_id)


def get_optional_community_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[CommCurrentUser]:
    if not credentials:
        return None
    try:
        from app.core.security import decode_access_token
        payload = decode_access_token(credentials.credentials)
        if payload.get("role") != COMMUNITY_ROLE:
            return None
        user_id = payload.get("sub")
        session_id = payload.get("sid")
        if not user_id or not session_id:
            return None
        # Validate session against DB so that logout is respected for read endpoints too
        row = db.execute(
            text(
                'SELECT "currentSessionId", COALESCE("isBanned", false) AS "isBanned" '
                'FROM "CommunityUser" WHERE "id" = :id'
            ),
            {"id": user_id},
        ).mappings().first()
        if not row or row["currentSessionId"] != session_id:
            return None
        if row.get("isBanned"):
            return None
        return CommCurrentUser(user_id=user_id)
    except Exception:
        return None


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


def _store_refresh(db: Session, user_id: str, refresh_token: str, session_id: str) -> None:
    db.execute(
        text(
            """
            UPDATE "CommunityUser"
            SET "hashedRefreshToken" = :hashed,
                "refreshTokenExpiresAt" = :expires,
                "currentSessionId" = :sid
            WHERE "id" = :uid
            """
        ),
        {
            "hashed": hash_password(refresh_token),
            "expires": _now() + timedelta(days=30),
            "sid": session_id,
            "uid": user_id,
        },
    )


def _ensure_profile(db: Session, user_id: str) -> None:
    db.execute(
        text(
            """
            INSERT INTO "CommunityProfile" ("userId", "updatedAt")
            VALUES (:uid, :now)
            ON CONFLICT ("userId") DO NOTHING
            """
        ),
        {"uid": user_id, "now": _now()},
    )


def _add_xp(db: Session, user_id: str, delta: int) -> None:
    _ensure_profile(db, user_id)
    db.execute(
        text(
            """
            UPDATE "CommunityProfile"
            SET "communityXp" = GREATEST(0, "communityXp" + :delta),
                "updatedAt" = :now
            WHERE "userId" = :uid
            """
        ),
        {"delta": delta, "uid": user_id, "now": _now()},
    )


_ANON_PREVIEW = {
    "id": "anon",
    "firstName": "Аноним",
    "lastName": "",
    "avatarUrl": None,
    "position": None,
    "communityXp": 0,
    "isAnonymous": True,
}


def _author_preview(db: Session, user_id: str, *, is_anonymous: bool = False, viewer_id: Optional[str] = None, is_admin: bool = False) -> dict:
    """Return author info. Masks identity when anonymous (unless viewer is the author or an admin)."""
    if is_anonymous and viewer_id != user_id and not is_admin:
        return {
            "id": f"a-{user_id}",
            "firstName": _ANON_PREVIEW["firstName"],
            "lastName": _ANON_PREVIEW["lastName"],
            "avatarUrl": None,
            "position": None,
            "communityXp": 0,
            "isAnonymous": True,
        }
    row = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."avatarUrl",
                   p."position", p."communityXp"
            FROM "CommunityUser" u
            LEFT JOIN "CommunityProfile" p ON p."userId" = u."id"
            WHERE u."id" = :uid
            """
        ),
        {"uid": user_id},
    ).mappings().first()
    if not row:
        return {"id": user_id, "firstName": "?", "lastName": "", "avatarUrl": None, "position": None, "communityXp": 0, "isAnonymous": False}
    return {
        "id": row["id"],
        "firstName": row["firstName"],
        "lastName": row["lastName"],
        "avatarUrl": row["avatarUrl"],
        "position": row["position"],
        "communityXp": row["communityXp"] or 0,
        "isAnonymous": is_anonymous,
    }


def _vote_counts(db: Session, target_type: str, target_id: str) -> dict:
    row = db.execute(
        text(
            """
            SELECT
              COALESCE(SUM(CASE WHEN "value" = 1  THEN 1 ELSE 0 END), 0) AS likes,
              COALESCE(SUM(CASE WHEN "value" = -1 THEN 1 ELSE 0 END), 0) AS dislikes
            FROM "CommunityVote"
            WHERE "targetType" = :tt AND "targetId" = :tid
            """
        ),
        {"tt": target_type, "tid": target_id},
    ).mappings().first()
    return {"likes": int(row["likes"]), "dislikes": int(row["dislikes"])}


def _my_vote(db: Session, user_id: str, target_type: str, target_id: str) -> Optional[int]:
    row = db.execute(
        text(
            """
            SELECT "value" FROM "CommunityVote"
            WHERE "userId" = :uid AND "targetType" = :tt AND "targetId" = :tid
            """
        ),
        {"uid": user_id, "tt": target_type, "tid": target_id},
    ).mappings().first()
    return int(row["value"]) if row else None


# ─── Batch helpers (eliminates N+1) ──────────────────────────────────────────

def _batch_vote_counts(db: Session, target_type: str, target_ids: list[str]) -> dict[str, dict]:
    """Return {id: {likes, dislikes}} for all given ids in a single query."""
    if not target_ids:
        return {}
    rows = db.execute(
        text(
            """
            SELECT "targetId",
              COALESCE(SUM(CASE WHEN "value" = 1  THEN 1 ELSE 0 END), 0) AS likes,
              COALESCE(SUM(CASE WHEN "value" = -1 THEN 1 ELSE 0 END), 0) AS dislikes
            FROM "CommunityVote"
            WHERE "targetType" = :tt AND "targetId" = ANY(:ids)
            GROUP BY "targetId"
            """
        ),
        {"tt": target_type, "ids": target_ids},
    ).mappings().all()
    result = {tid: {"likes": 0, "dislikes": 0} for tid in target_ids}
    for r in rows:
        result[r["targetId"]] = {"likes": int(r["likes"]), "dislikes": int(r["dislikes"])}
    return result


def _batch_my_votes(db: Session, user_id: str, target_type: str, target_ids: list[str]) -> dict[str, Optional[int]]:
    """Return {id: vote_value | None} in a single query."""
    if not user_id or not target_ids:
        return {tid: None for tid in target_ids}
    rows = db.execute(
        text(
            """
            SELECT "targetId", "value"
            FROM "CommunityVote"
            WHERE "userId" = :uid AND "targetType" = :tt AND "targetId" = ANY(:ids)
            """
        ),
        {"uid": user_id, "tt": target_type, "ids": target_ids},
    ).mappings().all()
    result: dict[str, Optional[int]] = {tid: None for tid in target_ids}
    for r in rows:
        result[r["targetId"]] = int(r["value"])
    return result


def _batch_author_previews(
    db: Session,
    user_ids: list[str],
    *,
    anon_map: dict[str, bool],
    viewer_id: Optional[str],
    is_admin: bool,
) -> dict[str, dict]:
    """Return {user_id: author_dict} in a single query. anon_map: {uid: is_anonymous}."""
    result: dict[str, dict] = {}
    # Pre-fill anonymous slots (no DB hit needed)
    non_anon_ids: list[str] = []
    for uid in user_ids:
        is_anon = anon_map.get(uid, False)
        if is_anon and viewer_id != uid and not is_admin:
            result[uid] = {
                "id": f"a-{uid}",
                "firstName": _ANON_PREVIEW["firstName"],
                "lastName": _ANON_PREVIEW["lastName"],
                "avatarUrl": None,
                "position": None,
                "communityXp": 0,
                "isAnonymous": True,
            }
        else:
            non_anon_ids.append(uid)

    if not non_anon_ids:
        return result

    rows = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."avatarUrl",
                   p."position", p."communityXp"
            FROM "CommunityUser" u
            LEFT JOIN "CommunityProfile" p ON p."userId" = u."id"
            WHERE u."id" = ANY(:ids)
            """
        ),
        {"ids": non_anon_ids},
    ).mappings().all()

    fetched = {r["id"]: r for r in rows}
    for uid in non_anon_ids:
        is_anon = anon_map.get(uid, False)
        r = fetched.get(uid)
        if r:
            result[uid] = {
                "id": r["id"],
                "firstName": r["firstName"],
                "lastName": r["lastName"],
                "avatarUrl": r["avatarUrl"],
                "position": r["position"],
                "communityXp": r["communityXp"] or 0,
                "isAnonymous": is_anon,
            }
        else:
            result[uid] = {
                "id": uid, "firstName": "?", "lastName": "", "avatarUrl": None,
                "position": None, "communityXp": 0, "isAnonymous": is_anon,
            }
    return result


def _batch_preview_replies(db: Session, topic_ids: list[str]) -> dict[str, list[dict]]:
    """Fetch up to 3 earliest replies per topic in one query (replaces N per-topic queries)."""
    if not topic_ids:
        return {}
    rows = db.execute(
        text(
            """
            SELECT sub."topicId", sub."id", sub."body", sub."createdAt",
                   u."firstName", u."lastName", u."avatarUrl"
            FROM (
                SELECT r."topicId", r."id", r."body", r."createdAt", r."authorId",
                       ROW_NUMBER() OVER (PARTITION BY r."topicId" ORDER BY r."createdAt") AS rn
                FROM "CommunityReply" r
                WHERE r."topicId" = ANY(:ids)
            ) sub
            JOIN "CommunityUser" u ON u."id" = sub."authorId"
            WHERE sub.rn <= 3
            ORDER BY sub."topicId", sub."createdAt"
            """
        ),
        {"ids": topic_ids},
    ).mappings().all()
    result: dict[str, list[dict]] = {tid: [] for tid in topic_ids}
    for r in rows:
        result[r["topicId"]].append(
            {
                "id": r["id"],
                "body": r["body"][:200],
                "createdAt": _isoformat_utc(r["createdAt"]),
                "author": {
                    "firstName": r["firstName"],
                    "lastName": r["lastName"],
                    "avatarUrl": r["avatarUrl"],
                },
            }
        )
    return result


def _batch_participants_for_cards(
    db: Session,
    topic_ids: list[str],
    author_id_map: dict[str, str],
    topic_anon_map: dict[str, bool],
    *,
    viewer_id: Optional[str],
    is_admin: bool,
    limit_per_topic: int = 12,
) -> dict[str, list[dict]]:
    """Return {topic_id: [participant_dicts]} using 2 queries instead of N×2 queries."""
    if not topic_ids:
        return {}

    reply_rows = db.execute(
        text(
            """
            SELECT "topicId", "authorId", "isAnonymous"
            FROM "CommunityReply"
            WHERE "topicId" = ANY(:ids)
            ORDER BY "topicId", "createdAt" ASC
            """
        ),
        {"ids": topic_ids},
    ).mappings().all()

    topic_pairs: dict[str, list[tuple[str, bool]]] = {tid: [] for tid in topic_ids}
    for tid in topic_ids:
        author_id = author_id_map.get(tid)
        if author_id:
            topic_pairs[tid].append((author_id, topic_anon_map.get(tid, False)))
    for r in reply_rows:
        uid = r["authorId"]
        if uid:
            topic_pairs[r["topicId"]].append((uid, bool(r["isAnonymous"])))

    all_anon_map: dict[str, bool] = {}
    topic_deduped: dict[str, list[tuple[str, bool]]] = {}
    for tid, pairs in topic_pairs.items():
        seen: set[str] = set()
        deduped: list[tuple[str, bool]] = []
        for uid, ia in pairs:
            if uid not in seen:
                seen.add(uid)
                deduped.append((uid, ia))
                if len(deduped) >= limit_per_topic:
                    break
        topic_deduped[tid] = deduped
        for uid, ia in deduped:
            all_anon_map[uid] = ia

    author_map = _batch_author_previews(
        db,
        list(all_anon_map.keys()),
        anon_map=all_anon_map,
        viewer_id=viewer_id,
        is_admin=is_admin,
    )
    return {
        tid: [author_map[uid] for uid, _ in pairs if uid in author_map]
        for tid, pairs in topic_deduped.items()
    }


def _is_community_admin(db: Session, community_user_id: str) -> bool:
    """Admin check: community user email must match a main User with admin/mentor/curator role."""
    if not community_user_id:
        return False
    row = db.execute(
        text(
            """
            SELECT u.role FROM "User" u
            JOIN "CommunityUser" cu ON LOWER(cu."email") = LOWER(u."email")
            WHERE cu."id" = :cuid
              AND u."role" IN ('admin', 'mentor', 'curator')
            LIMIT 1
            """
        ),
        {"cuid": community_user_id},
    ).first()
    return row is not None


_SUMMARY_PROMPT = """\
Ты — аналитик-рассказчик образовательного сообщества ExpoVision.
Пиши живо, как журналист: интересно, конкретно, полезно для тех, кто не участвовал в обсуждении.

════════════════════════════════════════
ТЕМА: {title}
КАТЕГОРИЯ: {category}
АВТОР: {author}
УЧАСТНИКИ ОБСУЖДЕНИЯ: {participants}
════════════════════════════════════════

ИСХОДНЫЙ ВОПРОС:
{body}

ОТВЕТЫ УЧАСТНИКОВ ({reply_count} шт.):
{replies_text}

════════════════════════════════════════
ДРУГИЕ ЗАКРЫТЫЕ ТЕМЫ СООБЩЕСТВА (используй для перекрёстных ссылок):
{related_topics}
════════════════════════════════════════

Напиши аналитическое резюме в формате Markdown. Используй точно эту структуру:

**Суть обсуждения**
2–3 предложения: о чём шёл разговор, почему эта тема важна и актуальна для участников интенсива.

**Кто о чём говорил**
Упомяни 2–4 участников по имени и их конкретные позиции, инсайты или вопросы. Пиши живо: «Имя предложил…», «Имя поделился опытом…», «Имя обратил внимание на…». Это делает резюме человечным и ценным.

**Главные выводы**
- [конкретный практичный вывод 1]
- [вывод 2]
- [вывод 3, если есть]

**Связи с другими обсуждениями**
Если среди перечисленных выше тем есть реально похожие или дополняющие эту — упомяни 1–3 из них. Ссылки СТРОГО в формате: [Название темы](/community/topics/ID_ТЕМЫ), где ID_ТЕМЫ — реальный ID из списка выше. Не придумывай несуществующих тем. Если связей нет — пропусти раздел.

**Итог одной строкой**
Одно ёмкое предложение — главный инсайт или практический совет для тех, кто столкнётся с этой темой позже.

{sparse_instructions}

ПРАВИЛА:
— Только русский язык
— Не придумывай факты, которых нет в обсуждении
— Ссылки строго в формате [текст](/community/topics/ID) — ничего лишнего вокруг
— Заголовки разделов через **жирный**, без символов ##
— Длина: 250–450 слов (если выше не указано иное для коротких обсуждений)
"""

SUMMARY_REPLIES_MAX = 30
RELATED_TOPICS_MAX = 15

_FALLBACK_BODY_CHARS = 650
_FALLBACK_REPLY_CHARS = 320


def _fallback_discussion_summary(
    *,
    title: str,
    body: str,
    category_label: str,
    author_name: str,
    replies: list,
) -> str:
    """Summary built without an LLM; never empty for a closed discussion topic that has data in the DB."""
    t = (title or "").strip() or "Обсуждение"
    cat = category_label.strip() or "без категории"
    body_excerpt = (body or "").strip().replace("\r\n", "\n")
    if len(body_excerpt) > _FALLBACK_BODY_CHARS:
        body_excerpt = body_excerpt[: _FALLBACK_BODY_CHARS - 1].rstrip() + "…"

    lines: list[str] = [
        "**Суть обсуждения**",
        f"Тема «{t}» ({cat}). Автор: {author_name}.",
    ]
    if body_excerpt:
        lines.append("")
        lines.append(body_excerpt)

    lines.extend(["", "**Ответы участников**"])
    if not replies:
        lines.append("Ответов от других участников не было.")
    else:
        for r in replies[:SUMMARY_REPLIES_MAX]:
            snippet = (r["body"] or "").strip().replace("\r\n", " ")
            if len(snippet) > _FALLBACK_REPLY_CHARS:
                snippet = snippet[: _FALLBACK_REPLY_CHARS - 1].rstrip() + "…"
            who = f"{r['firstName']} {r['lastName']}".strip() or "Участник"
            lines.append(f"— **{who}:** {snippet}")

    lines.extend(
        [
            "",
            "**Итог одной строкой**",
            "Итоги и контекст — в формулировке вопроса и ответах выше; полная история на странице темы.",
        ]
    )
    return "\n".join(lines).strip()


def _generate_ai_summary(db: Session, topic_id: str) -> Optional[str]:
    """Discussion summary: Gemini when available, otherwise a deterministic summary of the topic and replies."""
    from app.services.gemini_client import GeminiServiceError, gemini_client

    # ── Current topic ────────────────────────────────────────────
    row = db.execute(
        text(
            """
            SELECT t."title", t."body", t."categoryId", t."authorId",
                   COALESCE(t."topicKind", 'discussion') AS "topicKind"
            FROM "CommunityTopic" t
            WHERE t."id" = :id
            """
        ),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        return None

    if row.get("topicKind") == "short":
        return None

    # Category name
    category_name = ""
    if row["categoryId"]:
        cat = db.execute(
            text('SELECT "nameRu" FROM "CommunityCategory" WHERE "id" = :id'),
            {"id": row["categoryId"]},
        ).mappings().first()
        category_name = cat["nameRu"] if cat else ""

    # Author name
    author_row = db.execute(
        text('SELECT "firstName", "lastName" FROM "CommunityUser" WHERE "id" = :id'),
        {"id": row["authorId"]},
    ).mappings().first()
    author_name = f"{author_row['firstName']} {author_row['lastName']}" if author_row else "Автор"

    # ── Replies with participant names ───────────────────────────
    replies = db.execute(
        text(
            """
            SELECT r."body", u."firstName", u."lastName"
            FROM "CommunityReply" r
            JOIN "CommunityUser" u ON u."id" = r."authorId"
            WHERE r."topicId" = :tid
            ORDER BY r."createdAt"
            LIMIT :lim
            """
        ),
        {"tid": topic_id, "lim": SUMMARY_REPLIES_MAX},
    ).mappings().all()

    reply_count = len(replies)
    if reply_count >= 2:
        sparse_instructions = ""
    elif reply_count == 1:
        sparse_instructions = (
            "ДОПОЛНИТЕЛЬНО (один ответ):\n"
            "— Сожми объём до примерно 120–220 слов.\n"
            "— В «Кто о чём говорил» опиши только автора темы и автора единственного ответа.\n"
        )
    else:
        sparse_instructions = (
            "ДОПОЛНИТЕЛЬНО (ответов нет):\n"
            "— Объём примерно 80–150 слов.\n"
            "— Раздел «Кто о чём говорил» замени одним предложением: обсуждения от других участников не было.\n"
            "— «Главные выводы»: один пункт — суть вопроса или зачем тема была важна.\n"
        )

    # Unique participant list (excluding author)
    seen_names: set[str] = {author_name}
    participant_names: list[str] = []
    for r in replies:
        name = f"{r['firstName']} {r['lastName']}"
        if name not in seen_names:
            seen_names.add(name)
            participant_names.append(name)

    replies_text = (
        "\n".join(f"[{r['firstName']} {r['lastName']}]: {r['body'][:700]}" for r in replies)
        if replies
        else "(Ответов нет — тема закрыта без участия других пользователей.)"
    )

    fallback = _fallback_discussion_summary(
        title=row["title"],
        body=row["body"] or "",
        category_label=category_name or "без категории",
        author_name=author_name,
        replies=list(replies),
    )

    if not gemini_client.enabled:
        return fallback

    # ── Related closed topics for cross-links ────────────────────
    related_rows = db.execute(
        text(
            """
            SELECT t."id", t."title", cc."nameRu" AS "catName"
            FROM "CommunityTopic" t
            LEFT JOIN "CommunityCategory" cc ON cc."id" = t."categoryId"
            WHERE t."status" = 'closed'
              AND COALESCE(t."topicKind", 'discussion') <> 'short'
              AND t."id" != :tid
            ORDER BY t."closesAt" DESC NULLS LAST
            LIMIT :lim
            """
        ),
        {"tid": topic_id, "lim": RELATED_TOPICS_MAX},
    ).mappings().all()

    if related_rows:
        related_topics = "\n".join(
            f'ID={r["id"]} | Тема: «{r["title"]}» | Категория: {r["catName"] or "—"}'
            for r in related_rows
        )
    else:
        related_topics = "Других закрытых тем пока нет."

    prompt = _SUMMARY_PROMPT.format(
        title=row["title"],
        category=category_name or "без категории",
        author=author_name,
        participants=", ".join(participant_names) if participant_names else "только автор",
        body=row["body"][:2000],
        reply_count=reply_count,
        replies_text=replies_text,
        related_topics=related_topics,
        sparse_instructions=sparse_instructions,
    )

    try:
        summary = gemini_client.generate_text(prompt, temperature=0.65, max_tokens=900)
    except GeminiServiceError as exc:
        logger.warning("Gemini summary failed for topic %s: %s", topic_id, exc)
        return fallback

    clean = (summary or "").strip()
    return clean if clean else fallback


def _auto_close_expired(db: Session) -> None:
    """Lazily auto-close topics whose 24-hour discussion window has passed.

    Also queues AI summary generation for newly closed topics.
    """
    now = _now()
    result = db.execute(
        text(
            """
            UPDATE "CommunityTopic"
            SET "status" = 'closed',
                "isClosed" = true,
                "updatedAt" = :now
            WHERE "status" = 'active'
              AND "closesAt" IS NOT NULL
              AND "closesAt" < :now
            RETURNING "id", "title", "aiSummary"
            """
        ),
        {"now": now},
    ).mappings().all()

    # For each newly closed topic: generate AI summary + create group chat.
    # We already have title from RETURNING — no extra SELECT needed.
    for row in result:
        if not row["aiSummary"]:
            summary = _generate_ai_summary(db, row["id"])
            if summary:
                db.execute(
                    text('UPDATE "CommunityTopic" SET "aiSummary" = :s WHERE "id" = :id'),
                    {"s": summary, "id": row["id"]},
                )
        _create_group_chat(db, row["id"], row["title"])


# ─── Auth endpoints ───────────────────────────────────────────────────────────


@router.post("/auth/signup", dependencies=[Depends(limit(20, 60))])
def community_signup(payload: CommSignupRequest, db: Session = Depends(get_db)):
    exists = db.execute(
        text('SELECT "id" FROM "CommunityUser" WHERE "email" = :email'),
        {"email": payload.email},
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = token_hex(16)
    now = _now()
    db.execute(
        text(
            """
            INSERT INTO "CommunityUser"
              ("id", "firstName", "lastName", "email", "passwordHash", "createdAt", "updatedAt")
            VALUES (:id, :first, :last, :email, :hash, :now, :now)
            """
        ),
        {
            "id": user_id,
            "first": payload.firstName.strip(),
            "last": payload.lastName.strip(),
            "email": payload.email.lower().strip(),
            "hash": hash_password(payload.password),
            "now": now,
        },
    )
    _ensure_profile(db, user_id)
    session_id = create_session_id()
    access = create_access_token(user_id, COMMUNITY_ROLE, session_id)
    refresh = create_refresh_token(user_id, COMMUNITY_ROLE, session_id)
    _store_refresh(db, user_id, refresh, session_id)
    db.commit()
    return {
        "userId": user_id,
        "email": payload.email,
        "accessToken": access,
        "refreshToken": refresh,
    }


@router.post("/auth/login", dependencies=[Depends(limit(40, 60))])
def community_login(payload: CommLoginRequest, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            'SELECT "id", "passwordHash", COALESCE("isBanned", false) AS "isBanned" '
            'FROM "CommunityUser" WHERE "email" = :email'
        ),
        {"email": payload.email.lower().strip()},
    ).mappings().first()
    if not row or not verify_password(payload.password, row["passwordHash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if row.get("isBanned"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт заблокирован. Обратитесь в поддержку.",
        )

    session_id = create_session_id()
    access = create_access_token(row["id"], COMMUNITY_ROLE, session_id)
    refresh = create_refresh_token(row["id"], COMMUNITY_ROLE, session_id)
    _store_refresh(db, row["id"], refresh, session_id)
    db.commit()
    return {
        "userId": row["id"],
        "email": payload.email,
        "accessToken": access,
        "refreshToken": refresh,
    }


@router.post("/auth/refresh", dependencies=[Depends(limit(80, 60))])
def community_refresh(payload: CommRefreshRequest, db: Session = Depends(get_db)):
    try:
        token_payload = decode_refresh_token(payload.refreshToken)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    if token_payload.get("role") != COMMUNITY_ROLE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a community token")

    user_id = token_payload.get("sub")
    row = db.execute(
        text(
            """
            SELECT "id", "hashedRefreshToken", "refreshTokenExpiresAt", "currentSessionId",
                   COALESCE("isBanned", false) AS "isBanned"
            FROM "CommunityUser" WHERE "id" = :id
            """
        ),
        {"id": user_id},
    ).mappings().first()
    if not row or not row["hashedRefreshToken"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked")
    if row.get("isBanned"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт заблокирован модератором",
        )
    if row["refreshTokenExpiresAt"] < _now().replace(tzinfo=None):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
    if not verify_password(payload.refreshToken, row["hashedRefreshToken"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if token_payload.get("sid") != row["currentSessionId"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalidated")

    session_id = row["currentSessionId"]
    access = create_access_token(row["id"], COMMUNITY_ROLE, session_id)
    refresh = create_refresh_token(row["id"], COMMUNITY_ROLE, session_id)
    _store_refresh(db, row["id"], refresh, session_id)
    db.commit()
    return {"accessToken": access, "refreshToken": refresh}


@router.post("/auth/logout")
def community_logout(payload: CommRefreshRequest, db: Session = Depends(get_db)):
    try:
        token_payload = decode_refresh_token(payload.refreshToken)
    except ValueError:
        return {"success": True}
    db.execute(
        text(
            """
            UPDATE "CommunityUser"
            SET "hashedRefreshToken" = NULL, "refreshTokenExpiresAt" = NULL, "currentSessionId" = NULL
            WHERE "id" = :id
            """
        ),
        {"id": token_payload.get("sub")},
    )
    db.commit()
    return {"success": True}


@router.get("/auth/me")
def community_me(
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."email", u."avatarUrl", u."createdAt",
                   p."bio", p."position", p."company", p."location", p."website",
                   p."linkedinUrl", p."githubUrl", p."skills", p."communityXp"
            FROM "CommunityUser" u
            LEFT JOIN "CommunityProfile" p ON p."userId" = u."id"
            WHERE u."id" = :uid
            """
        ),
        {"uid": current.user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    skills_raw = row["skills"]
    try:
        skills = json.loads(skills_raw) if skills_raw else []
    except Exception:
        skills = []
    return {
        "id": row["id"],
        "firstName": row["firstName"],
        "lastName": row["lastName"],
        "email": row["email"],
        "avatarUrl": row["avatarUrl"],
        "createdAt": _isoformat_utc(row["createdAt"]),
        "bio": row["bio"],
        "position": row["position"],
        "company": row["company"],
        "location": row["location"],
        "website": row["website"],
        "linkedinUrl": row["linkedinUrl"],
        "githubUrl": row["githubUrl"],
        "skills": skills,
        "communityXp": row["communityXp"] or 0,
        "isAdmin": _is_community_admin(db, current.user_id),
    }


@router.post("/attachments/image", dependencies=[Depends(limit(30, 60))])
async def upload_community_inline_image(
    file: UploadFile = File(...),
    current: CommCurrentUser = Depends(get_community_user),
):
    """Image for markdown composers (topics, replies, chat). Stored under /uploads/community-inline/."""
    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in COMMUNITY_INLINE_IMG_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF images are allowed")
    content = await file.read()
    if len(content) > COMMUNITY_INLINE_IMG_MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    raw_ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    ext_by_mime = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
    ext = raw_ext if raw_ext in ("jpg", "jpeg", "png", "webp", "gif") else ext_by_mime.get(mime, "jpg")
    if ext == "jpeg":
        ext = "jpg"

    safe_name = f"{uuid4().hex}.{ext}"
    user_dir = COMMUNITY_INLINE_IMG_DIR / current.user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    (user_dir / safe_name).write_bytes(content)

    url_path = f"/uploads/community-inline/{current.user_id}/{safe_name}"
    return {"url": url_path}


# ─── Categories ───────────────────────────────────────────────────────────────


@router.get("/categories")
def list_categories(
    for_kind: Optional[Literal["discussion", "short"]] = Query(None, alias="forKind"),
    suggested: bool = Query(False),
    current: Optional[CommCurrentUser] = Depends(get_optional_community_user),
    db: Session = Depends(get_db),
):
    sql = (
        'SELECT "id", "slug", "nameRu", "nameEn", "description", "color", "sortOrder", '
        'COALESCE("kindScope", \'both\') AS "kindScope" '
        'FROM "CommunityCategory"'
    )
    if for_kind == "discussion":
        sql += ' WHERE COALESCE("kindScope", \'both\') IN (\'both\', \'discussion\')'
    elif for_kind == "short":
        sql += ' WHERE COALESCE("kindScope", \'both\') IN (\'both\', \'short\')'
    sql += ' ORDER BY "sortOrder", "nameRu"'
    rows = db.execute(text(sql)).mappings().all()
    items = [dict(r) for r in rows]

    scores: dict[str, int] = {}
    if suggested and current:
        scores = _category_profile_scores(_haystack_for_profile(db, current.user_id))
        for c in items:
            c["profileMatchScore"] = scores.get(c["id"], 0)
        items.sort(key=lambda x: (-int(x.get("profileMatchScore", 0)), x["sortOrder"], x["nameRu"]))
    return items


# ─── Topics ───────────────────────────────────────────────────────────────────


class CreateTopicRequest(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    body: str = Field(min_length=10, max_length=MAX_BODY)
    categoryId: Optional[str] = None
    isAnonymous: bool = False
    topicKind: Literal["discussion", "short"] = "discussion"


class UpdateTopicRequest(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    body: str = Field(min_length=10, max_length=MAX_BODY)
    categoryId: Optional[str] = None


def _format_topic(db: Session, row: dict, viewer_id: Optional[str] = None, is_admin: bool = False) -> dict:
    votes = _vote_counts(db, "topic", row["id"])
    is_anon = bool(row.get("isAnonymous", False))
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "isPinned": row["isPinned"],
        "isClosed": row["isClosed"],
        "status": row.get("status", "active"),
        "approvedAt": _isoformat_utc(row.get("approvedAt")),
        "closesAt": _isoformat_utc(row.get("closesAt")),
        "viewCount": row["viewCount"],
        "categoryId": row["categoryId"],
        "topicKind": row.get("topicKind") or "discussion",
        "replyCount": row.get("replyCount", 0),
        "isAnonymous": is_anon,
        "author": _author_preview(db, row["authorId"], is_anonymous=is_anon, viewer_id=viewer_id, is_admin=is_admin),
        "votes": votes,
        "myVote": _my_vote(db, viewer_id, "topic", row["id"]) if viewer_id else None,
        "createdAt": _isoformat_utc(row["createdAt"]),
        "updatedAt": _isoformat_utc(row["updatedAt"]),
        "aiSummary": row.get("aiSummary"),
    }


@router.get("/topics", dependencies=[Depends(limit(60, 60))])
def list_topics(
    category: Optional[str] = None,
    q: Optional[str] = Query(default=None, max_length=200),
    author_id: Optional[str] = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1, le=10000),
    sort: Literal["recent", "popular"] = "recent",
    unanswered: bool = False,
    pinned_only: bool = False,
    discussion_archive: bool = Query(False),
    from_followed: bool = Query(False),
    current: Optional[CommCurrentUser] = Depends(get_optional_community_user),
    db: Session = Depends(get_db),
):
    if page < 1:
        page = 1

    # Lazily auto-close expired topics before listing
    _auto_close_expired(db)

    offset = (page - 1) * PAGE_SIZE
    viewer_id = current.user_id if current else None
    is_admin = _is_community_admin(db, viewer_id) if viewer_id else False

    if from_followed:
        if not viewer_id:
            raise HTTPException(status_code=401, detail="Authentication required for followed-only feed")

    params: dict[str, object] = {"limit": PAGE_SIZE, "offset": offset}
    where_clauses: list[str] = []

    if discussion_archive:
        where_clauses.append("t.\"status\" = 'closed'")
        where_clauses.append("(COALESCE(t.\"topicKind\", 'discussion') <> 'short')")
    elif not is_admin:
        # Author viewing own publications (e.g. profile grid): include pending/moderation topics.
        author_views_own = bool(author_id and viewer_id and author_id == viewer_id)
        if author_views_own:
            where_clauses.append("t.\"status\" IN ('active', 'closed', 'pending')")
        else:
            # Closed discussions live in /feed and the archive (discussion_archive); this is the active question feed only
            where_clauses.append("t.\"status\" = 'active'")

    effective_unanswered = unanswered and not discussion_archive
    effective_pinned = pinned_only and not discussion_archive

    if category:
        where_clauses.append('t."categoryId" = :category')
        params["category"] = category
    if q:
        where_clauses.append('(LOWER(t."title") LIKE :q OR LOWER(t."body") LIKE :q)')
        params["q"] = f"%{q.lower()}%"
    if author_id:
        where_clauses.append('t."authorId" = :author_id')
        params["author_id"] = author_id
    if effective_pinned:
        where_clauses.append('t."isPinned" = true')
    if from_followed:
        where_clauses.append(
            """EXISTS (
            SELECT 1 FROM "CommunityFollow" cf
            WHERE cf."followerId" = :follower_uid AND cf."followingId" = t."authorId"
        )"""
        )
        params["follower_uid"] = viewer_id

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    if discussion_archive:
        if sort == "popular":
            order_sql = 'COUNT(r."id") DESC, t."viewCount" DESC, t."closesAt" DESC NULLS LAST'
        else:
            order_sql = 't."closesAt" DESC NULLS LAST, t."createdAt" DESC'
    elif sort == "popular":
        order_sql = 't."isPinned" DESC, COUNT(r."id") DESC, t."viewCount" DESC, t."createdAt" DESC'
    else:
        order_sql = 't."isPinned" DESC, t."status" ASC, t."createdAt" DESC'

    having_sql = ' HAVING COUNT(r."id") = 0' if effective_unanswered else ""

    rows = db.execute(
        text(
            f"""
            SELECT t."id", t."categoryId", t."authorId", t."title", t."body",
                   t."isPinned", t."isClosed", t."status", t."approvedAt", t."closesAt",
                   t."viewCount", t."createdAt", t."updatedAt", t."aiSummary", t."isAnonymous",
                   COALESCE(t."topicKind", 'discussion') AS "topicKind",
                   COUNT(r."id") AS "replyCount"
            FROM "CommunityTopic" t
            LEFT JOIN "CommunityReply" r ON r."topicId" = t."id"
            {where_sql}
            GROUP BY t."id"
            {having_sql}
            ORDER BY {order_sql}
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).mappings().all()

    count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
    count_row = db.execute(
        text(
            f"""
            SELECT COUNT(*) FROM (
              SELECT t."id"
              FROM "CommunityTopic" t
              LEFT JOIN "CommunityReply" r ON r."topicId" = t."id"
              {where_sql}
              GROUP BY t."id"
              {having_sql}
            ) _sub
            """
        ),
        count_params,
    ).scalar()

    db.commit()  # commit the auto-close updates

    if not rows:
        return {"items": [], "total": count_row, "page": page, "pageSize": PAGE_SIZE}

    # ── Batch-fetch votes, authors, and (for archive) participants ───────────
    topic_ids = [r["id"] for r in rows]
    topic_vote_counts = _batch_vote_counts(db, "topic", topic_ids)
    topic_my_votes = _batch_my_votes(db, viewer_id or "", "topic", topic_ids)
    topic_anon_map = {r["authorId"]: bool(r.get("isAnonymous", False)) for r in rows}
    author_ids = list({r["authorId"] for r in rows})
    author_map = _batch_author_previews(
        db, author_ids, anon_map=topic_anon_map, viewer_id=viewer_id, is_admin=is_admin
    )

    # For discussion_archive: batch-fetch participants for ALL topics in 2 queries
    participants_map: dict[str, list[dict]] = {}
    if discussion_archive:
        participants_map = _batch_participants_for_cards(
            db,
            topic_ids,
            author_id_map={r["id"]: r["authorId"] for r in rows},
            topic_anon_map={r["id"]: bool(r.get("isAnonymous", False)) for r in rows},
            viewer_id=viewer_id,
            is_admin=is_admin,
        )

    items: list[dict] = []
    for r in rows:
        rd = dict(r)
        is_anon = bool(rd.get("isAnonymous", False))
        topic: dict = {
            "id": rd["id"],
            "title": rd["title"],
            "body": rd["body"],
            "isPinned": rd["isPinned"],
            "isClosed": rd["isClosed"],
            "status": rd.get("status", "active"),
            "approvedAt": _isoformat_utc(rd.get("approvedAt")),
            "closesAt": _isoformat_utc(rd.get("closesAt")),
            "viewCount": rd["viewCount"],
            "categoryId": rd["categoryId"],
            "topicKind": rd.get("topicKind") or "discussion",
            "replyCount": rd.get("replyCount", 0),
            "isAnonymous": is_anon,
            "author": author_map.get(rd["authorId"], {
                "id": rd["authorId"], "firstName": "?", "lastName": "",
                "avatarUrl": None, "position": None, "communityXp": 0, "isAnonymous": is_anon,
            }),
            "votes": topic_vote_counts.get(rd["id"], {"likes": 0, "dislikes": 0}),
            "myVote": topic_my_votes.get(rd["id"]) if viewer_id else None,
            "createdAt": _isoformat_utc(rd["createdAt"]),
            "updatedAt": _isoformat_utc(rd["updatedAt"]),
            "aiSummary": rd.get("aiSummary"),
        }
        if discussion_archive:
            topic["participants"] = participants_map.get(rd["id"], [])
        items.append(topic)

    return {
        "items": items,
        "total": count_row,
        "page": page,
        "pageSize": PAGE_SIZE,
    }


@router.post("/topics", dependencies=[Depends(limit(10, 60))])
def create_topic(
    payload: CreateTopicRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    tk = payload.topicKind if payload.topicKind in ("discussion", "short") else "discussion"
    if payload.categoryId:
        exists = db.execute(
            text('SELECT "id" FROM "CommunityCategory" WHERE "id" = :id'),
            {"id": payload.categoryId},
        ).first()
        if not exists:
            raise HTTPException(status_code=400, detail="Category not found")
    _validate_category_topic_kind(db, payload.categoryId, tk)

    topic_id = f"t-{token_hex(10)}"
    now = _now()
    db.execute(
        text(
            """
            INSERT INTO "CommunityTopic"
              ("id", "categoryId", "authorId", "title", "body", "status", "isAnonymous", "topicKind", "createdAt", "updatedAt")
            VALUES (:id, :cat, :author, :title, :body, 'pending', :anon, :tkind, :now, :now)
            """
        ),
        {
            "id": topic_id,
            "cat": payload.categoryId,
            "author": current.user_id,
            "title": payload.title.strip(),
            "body": payload.body,
            "anon": payload.isAnonymous,
            "tkind": tk,
            "now": now,
        },
    )
    # XP awarded upon approval, not submission
    db.commit()

    row = db.execute(
        text('SELECT * FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    return _format_topic(db, dict(row), current.user_id)


@router.get("/topics/{topic_id}", dependencies=[Depends(limit(120, 60))])
def get_topic(
    topic_id: str,
    current: Optional[CommCurrentUser] = Depends(get_optional_community_user),
    db: Session = Depends(get_db),
):
    # Lazily auto-close before fetching
    _auto_close_expired(db)

    row = db.execute(
        text('SELECT * FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")

    updated: dict = dict(row)

    viewer_id = current.user_id if current else None
    # Single admin check, reused for both pending-gate and reply masking
    is_admin = _is_community_admin(db, viewer_id) if viewer_id else False
    topic_status = row.get("status", "active")

    # Pending topics are only visible to the author and admins
    if topic_status == "pending":
        is_author = viewer_id == row["authorId"]
        if not is_author and not is_admin:
            raise HTTPException(status_code=403, detail="Topic is pending review")

    # Only count authenticated views to prevent anonymous view inflation
    if current:
        db.execute(
            text('UPDATE "CommunityTopic" SET "viewCount" = "viewCount" + 1 WHERE "id" = :id'),
            {"id": topic_id},
        )
        db.commit()
        updated["viewCount"] = int(updated.get("viewCount") or 0) + 1

    replies_rows = db.execute(
        text(
            """
            SELECT "id", "topicId", "authorId", "parentId", "body", "isAccepted", "isAnonymous", "createdAt", "updatedAt"
            FROM "CommunityReply"
            WHERE "topicId" = :topic_id
            ORDER BY "createdAt"
            """
        ),
        {"topic_id": topic_id},
    ).mappings().all()

    # Batch-fetch all votes and authors for replies in 3 queries instead of N*3
    reply_ids = [r["id"] for r in replies_rows]
    reply_vote_counts = _batch_vote_counts(db, "reply", reply_ids)
    reply_my_votes = _batch_my_votes(db, viewer_id or "", "reply", reply_ids)
    reply_anon_map = {r["authorId"]: bool(r.get("isAnonymous", False)) for r in replies_rows}
    reply_author_ids = list({r["authorId"] for r in replies_rows})
    reply_authors = _batch_author_previews(
        db, reply_author_ids, anon_map=reply_anon_map, viewer_id=viewer_id, is_admin=is_admin
    )

    def fmt_reply(r: dict) -> dict:
        return {
            "id": r["id"],
            "topicId": r["topicId"],
            "parentId": r["parentId"],
            "body": r["body"],
            "isAccepted": r["isAccepted"],
            "isAnonymous": bool(r.get("isAnonymous", False)),
            "author": reply_authors.get(r["authorId"], {
                "id": r["authorId"], "firstName": "?", "lastName": "",
                "avatarUrl": None, "position": None, "communityXp": 0, "isAnonymous": False,
            }),
            "votes": reply_vote_counts.get(r["id"], {"likes": 0, "dislikes": 0}),
            "myVote": reply_my_votes.get(r["id"]) if viewer_id else None,
            "createdAt": _isoformat_utc(r["createdAt"]),
            "updatedAt": _isoformat_utc(r["updatedAt"]),
        }

    # Lazily generate AI summary for newly closed topics (full discussions only)
    if (
        updated.get("status") == "closed"
        and not updated.get("aiSummary")
        and updated.get("topicKind") != "short"
    ):
        summary = _generate_ai_summary(db, topic_id)
        if summary:
            db.execute(
                text('UPDATE "CommunityTopic" SET "aiSummary" = :s WHERE "id" = :id'),
                {"s": summary, "id": topic_id},
            )
            db.commit()
            updated["aiSummary"] = summary

    topic = _format_topic(db, updated, viewer_id, is_admin=is_admin)
    topic["replies"] = [fmt_reply(dict(r)) for r in replies_rows]
    return topic


@router.put("/topics/{topic_id}")
def update_topic(
    topic_id: str,
    payload: UpdateTopicRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            'SELECT "authorId", COALESCE("topicKind", \'discussion\') AS "topicKind" '
            'FROM "CommunityTopic" WHERE "id" = :id'
        ),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")
    if row["authorId"] != current.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if payload.categoryId:
        exists = db.execute(
            text('SELECT "id" FROM "CommunityCategory" WHERE "id" = :id'),
            {"id": payload.categoryId},
        ).first()
        if not exists:
            raise HTTPException(status_code=400, detail="Category not found")
    _validate_category_topic_kind(db, payload.categoryId, row["topicKind"])

    db.execute(
        text(
            """
            UPDATE "CommunityTopic"
            SET "title" = :title, "body" = :body, "categoryId" = :cat, "updatedAt" = :now
            WHERE "id" = :id
            """
        ),
        {"title": payload.title.strip(), "body": payload.body, "cat": payload.categoryId, "now": _now(), "id": topic_id},
    )
    db.commit()
    return {"success": True}


@router.delete("/topics/{topic_id}")
def delete_topic(
    topic_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text('SELECT "authorId" FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")
    if row["authorId"] != current.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.execute(text('DELETE FROM "CommunityTopic" WHERE "id" = :id'), {"id": topic_id})
    db.commit()
    return {"success": True}


# ─── Admin endpoints ──────────────────────────────────────────────────────────


@router.get("/admin/pending")
def admin_pending_topics(
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """List topics awaiting admin review. Admin only."""
    if not _is_community_admin(db, current.user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    rows = db.execute(
        text(
            """
            SELECT t."id", t."categoryId", t."authorId", t."title", t."body",
                   t."isPinned", t."isClosed", t."status", t."approvedAt", t."closesAt",
                   t."viewCount", t."createdAt", t."updatedAt", t."aiSummary",
                   COALESCE(t."topicKind", 'discussion') AS "topicKind",
                   COUNT(r."id") AS "replyCount"
            FROM "CommunityTopic" t
            LEFT JOIN "CommunityReply" r ON r."topicId" = t."id"
            WHERE t."status" = 'pending'
            GROUP BY t."id"
            ORDER BY t."createdAt" ASC
            LIMIT 200
            """
        )
    ).mappings().all()

    if not rows:
        return {"items": [], "total": 0}

    topic_ids = [r["id"] for r in rows]
    vote_counts = _batch_vote_counts(db, "topic", topic_ids)
    my_votes = _batch_my_votes(db, current.user_id, "topic", topic_ids)
    anon_map = {r["authorId"]: bool(r.get("isAnonymous", False)) for r in rows}
    author_ids = list({r["authorId"] for r in rows})
    author_map = _batch_author_previews(
        db, author_ids, anon_map=anon_map, viewer_id=current.user_id, is_admin=True
    )

    def _fmt(rd: dict) -> dict:
        is_anon = bool(rd.get("isAnonymous", False))
        return {
            "id": rd["id"],
            "title": rd["title"],
            "body": rd["body"],
            "isPinned": rd["isPinned"],
            "isClosed": rd["isClosed"],
            "status": rd.get("status", "pending"),
            "approvedAt": _isoformat_utc(rd.get("approvedAt")),
            "closesAt": _isoformat_utc(rd.get("closesAt")),
            "viewCount": rd["viewCount"],
            "categoryId": rd["categoryId"],
            "topicKind": rd.get("topicKind") or "discussion",
            "replyCount": rd.get("replyCount", 0),
            "isAnonymous": is_anon,
            "author": author_map.get(rd["authorId"], {
                "id": rd["authorId"], "firstName": "?", "lastName": "",
                "avatarUrl": None, "position": None, "communityXp": 0, "isAnonymous": is_anon,
            }),
            "votes": vote_counts.get(rd["id"], {"likes": 0, "dislikes": 0}),
            "myVote": my_votes.get(rd["id"]),
            "createdAt": _isoformat_utc(rd["createdAt"]),
            "updatedAt": _isoformat_utc(rd["updatedAt"]),
            "aiSummary": rd.get("aiSummary"),
        }

    return {
        "items": [_fmt(dict(r)) for r in rows],
        "total": len(rows),
    }


@router.get("/admin/users")
def admin_community_users(
    q: Optional[str] = None,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """List all community members with stats. Admin only."""
    if not _is_community_admin(db, current.user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    search_clause = ""
    params: dict = {}
    if q:
        search_clause = """
            AND (
                LOWER(cu."firstName") LIKE LOWER(:q)
                OR LOWER(cu."lastName")  LIKE LOWER(:q)
                OR LOWER(cu."email")     LIKE LOWER(:q)
            )
        """
        params["q"] = f"%{q}%"

    rows = db.execute(
        text(
            f"""
            SELECT
                cu."id",
                cu."firstName",
                cu."lastName",
                cu."email",
                cu."avatarUrl",
                cu."createdAt",
                cp."position",
                cp."company",
                (SELECT COUNT(*) FROM "CommunityTopic"  t WHERE t."authorId" = cu."id" AND t."status" != 'pending') AS topics,
                (SELECT COUNT(*) FROM "CommunityReply"  r WHERE r."authorId" = cu."id") AS replies,
                COALESCE(cp."communityXp", 0) AS xp
            FROM "CommunityUser" cu
            LEFT JOIN "CommunityProfile" cp ON cp."userId" = cu."id"
            WHERE 1=1 {search_clause}
            ORDER BY cu."createdAt" DESC
            LIMIT 200
            """
        ),
        params,
    ).mappings().all()

    return {
        "items": [
            {
                "id": r["id"],
                "firstName": r["firstName"],
                "lastName": r["lastName"],
                "email": r["email"],
                "avatarUrl": r["avatarUrl"],
                "position": r["position"],
                "company": r["company"],
                "joinedAt": _isoformat_utc(r["createdAt"]),
                "topics": int(r["topics"] or 0),
                "replies": int(r["replies"] or 0),
                "xp": int(r["xp"] or 0),
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.get("/admin/topics")
def admin_all_topics(
    status: Optional[str] = None,
    q: Optional[str] = None,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """List all topics for admin moderation. Admin only."""
    if not _is_community_admin(db, current.user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

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
            SELECT t."id", t."categoryId", t."authorId", t."title", t."body",
                   t."isPinned", t."isClosed", t."status", t."approvedAt", t."closesAt",
                   t."viewCount", t."createdAt", t."updatedAt", t."aiSummary",
                   COALESCE(t."topicKind", 'discussion') AS "topicKind",
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

    if not rows:
        return {"items": [], "total": 0}

    # Batch-fetch votes and authors (replaces _format_topic N+1)
    topic_ids_admin = [r["id"] for r in rows]
    vote_counts_admin = _batch_vote_counts(db, "topic", topic_ids_admin)
    my_votes_admin = _batch_my_votes(db, current.user_id, "topic", topic_ids_admin)
    anon_map_admin = {r["authorId"]: bool(r.get("isAnonymous", False)) for r in rows}
    author_ids_admin = list({r["authorId"] for r in rows})
    author_map_admin = _batch_author_previews(
        db, author_ids_admin, anon_map=anon_map_admin, viewer_id=current.user_id, is_admin=True
    )

    def _fmt_admin(rd: dict) -> dict:
        is_anon = bool(rd.get("isAnonymous", False))
        return {
            "id": rd["id"],
            "title": rd["title"],
            "body": rd["body"],
            "isPinned": rd["isPinned"],
            "isClosed": rd["isClosed"],
            "status": rd.get("status"),
            "approvedAt": _isoformat_utc(rd.get("approvedAt")),
            "closesAt": _isoformat_utc(rd.get("closesAt")),
            "viewCount": rd["viewCount"],
            "categoryId": rd["categoryId"],
            "topicKind": rd.get("topicKind") or "discussion",
            "replyCount": rd.get("replyCount", 0),
            "isAnonymous": is_anon,
            "author": author_map_admin.get(rd["authorId"], {
                "id": rd["authorId"], "firstName": "?", "lastName": "",
                "avatarUrl": None, "position": None, "communityXp": 0, "isAnonymous": is_anon,
            }),
            "votes": vote_counts_admin.get(rd["id"], {"likes": 0, "dislikes": 0}),
            "myVote": my_votes_admin.get(rd["id"]),
            "createdAt": _isoformat_utc(rd["createdAt"]),
            "updatedAt": _isoformat_utc(rd["updatedAt"]),
            "aiSummary": rd.get("aiSummary"),
        }

    return {
        "items": [_fmt_admin(dict(r)) for r in rows],
        "total": len(rows),
    }


@router.post("/topics/{topic_id}/approve")
def approve_topic(
    topic_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Approve a pending topic and start the 24-hour discussion window."""
    if not _is_community_admin(db, current.user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    row = db.execute(
        text('SELECT "id", "status", "authorId" FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Topic is not pending")

    now = _now()
    closes_at = now + timedelta(hours=24)

    db.execute(
        text(
            """
            UPDATE "CommunityTopic"
            SET "status" = 'active',
                "approvedAt" = :now,
                "closesAt" = :closes_at,
                "updatedAt" = :now
            WHERE "id" = :id
            """
        ),
        {"id": topic_id, "now": now, "closes_at": closes_at},
    )

    # Award XP to the author upon approval
    _add_xp(db, row["authorId"], 15)
    db.commit()

    updated = db.execute(
        text('SELECT * FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    return _format_topic(db, dict(updated), current.user_id)


@router.post("/topics/{topic_id}/reject")
def reject_topic(
    topic_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Reject and delete a pending topic."""
    if not _is_community_admin(db, current.user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    row = db.execute(
        text('SELECT "id", "status" FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")
    if row["status"] != "pending":
        raise HTTPException(status_code=400, detail="Only pending topics can be rejected")

    db.execute(text('DELETE FROM "CommunityTopic" WHERE "id" = :id'), {"id": topic_id})
    db.commit()
    return {"success": True}


@router.post("/topics/{topic_id}/pin")
def pin_topic(
    topic_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Toggle pin state. Admin only."""
    if not _is_community_admin(db, current.user_id):
        raise HTTPException(status_code=403, detail="Admin access required")

    row = db.execute(
        text('SELECT "id", "isPinned" FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Topic not found")

    new_pinned = not row["isPinned"]
    db.execute(
        text('UPDATE "CommunityTopic" SET "isPinned" = :pin, "updatedAt" = :now WHERE "id" = :id'),
        {"pin": new_pinned, "now": _now(), "id": topic_id},
    )
    db.commit()
    return {"isPinned": new_pinned}


# ─── Feed ─────────────────────────────────────────────────────────────────────


FEED_PAGE_SIZE = 15


@router.get("/feed")
def community_feed(
    category: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    from_followed: bool = Query(False),
    current: Optional[CommCurrentUser] = Depends(get_optional_community_user),
    db: Session = Depends(get_db),
):
    """Feed: archive of closed discussions with AI summaries and the full reply history."""
    if page < 1:
        page = 1

    _auto_close_expired(db)
    viewer_id = current.user_id if current else None

    if from_followed:
        if not viewer_id:
            raise HTTPException(status_code=401, detail="Authentication required for followed-only feed")

    offset = (page - 1) * FEED_PAGE_SIZE
    params: dict = {"limit": FEED_PAGE_SIZE, "offset": offset}
    where_clauses = [
        "t.\"status\" = 'closed'",
        "(COALESCE(t.\"topicKind\", 'discussion') <> 'short')",
    ]

    if category:
        where_clauses.append('t."categoryId" = :category')
        params["category"] = category
    if q:
        where_clauses.append('(LOWER(t."title") LIKE :q OR LOWER(t."body") LIKE :q)')
        params["q"] = f"%{q.lower()}%"
    if from_followed:
        where_clauses.append(
            """EXISTS (
            SELECT 1 FROM "CommunityFollow" cf
            WHERE cf."followerId" = :follower_uid AND cf."followingId" = t."authorId"
        )"""
        )
        params["follower_uid"] = viewer_id

    where_sql = "WHERE " + " AND ".join(where_clauses)

    rows = db.execute(
        text(
            f"""
            SELECT t."id", t."categoryId", t."authorId", t."title", t."body",
                   t."isPinned", t."isClosed", t."status", t."approvedAt", t."closesAt",
                   t."viewCount", t."createdAt", t."updatedAt", t."aiSummary",
                   COALESCE(t."topicKind", 'discussion') AS "topicKind",
                   COUNT(r."id") AS "replyCount"
            FROM "CommunityTopic" t
            LEFT JOIN "CommunityReply" r ON r."topicId" = t."id"
            {where_sql}
            GROUP BY t."id"
            ORDER BY t."isPinned" DESC, t."closesAt" DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).mappings().all()

    count_row = db.execute(
        text(f'SELECT COUNT(*) FROM "CommunityTopic" t {where_sql}'),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    ).scalar()

    db.commit()

    if not rows:
        return {"items": [], "total": count_row, "page": page, "pageSize": FEED_PAGE_SIZE}

    # Batch-fetch all per-item data in 4 queries instead of 4×N
    topic_ids = [r["id"] for r in rows]
    feed_vote_counts = _batch_vote_counts(db, "topic", topic_ids)
    feed_my_votes = _batch_my_votes(db, viewer_id or "", "topic", topic_ids)
    # Feed shows closed topics; anonymous flag is irrelevant for closed discussions
    anon_map_feed: dict[str, bool] = {r["authorId"]: False for r in rows}
    author_ids_feed = list({r["authorId"] for r in rows})
    author_map_feed = _batch_author_previews(
        db, author_ids_feed, anon_map=anon_map_feed, viewer_id=viewer_id, is_admin=False
    )
    preview_replies_map = _batch_preview_replies(db, topic_ids)

    items: list[dict] = []
    for r in rows:
        rd = dict(r)
        aid = rd["authorId"]
        items.append(
            {
                "id": rd["id"],
                "title": rd["title"],
                "body": rd["body"],
                "isPinned": rd["isPinned"],
                "isClosed": rd["isClosed"],
                "status": rd.get("status", "active"),
                "approvedAt": _isoformat_utc(rd.get("approvedAt")),
                "closesAt": _isoformat_utc(rd.get("closesAt")),
                "viewCount": rd["viewCount"],
                "categoryId": rd["categoryId"],
                "topicKind": rd.get("topicKind") or "discussion",
                "replyCount": rd.get("replyCount", 0),
                "isAnonymous": False,
                "author": author_map_feed.get(
                    aid,
                    {"id": aid, "firstName": "?", "lastName": "", "avatarUrl": None, "position": None, "communityXp": 0, "isAnonymous": False},
                ),
                "votes": feed_vote_counts.get(rd["id"], {"likes": 0, "dislikes": 0}),
                "myVote": feed_my_votes.get(rd["id"]) if viewer_id else None,
                "createdAt": _isoformat_utc(rd["createdAt"]),
                "updatedAt": _isoformat_utc(rd["updatedAt"]),
                "aiSummary": rd.get("aiSummary"),
                "previewReplies": preview_replies_map.get(rd["id"], []),
            }
        )

    return {
        "items": items,
        "total": count_row,
        "page": page,
        "pageSize": FEED_PAGE_SIZE,
    }


@router.get("/discover/context")
def community_discover_context(
    current: Optional[CommCurrentUser] = Depends(get_optional_community_user),
    db: Session = Depends(get_db),
):
    """Q&A side column: stats, quote of the day (RU) and a short ru.wikipedia extract. No API keys needed."""
    topics_n = (
        db.execute(
            text(
                'SELECT COUNT(*) FROM "CommunityTopic" t WHERE t."status" IN (\'active\', \'closed\')'
            )
        ).scalar()
        or 0
    )
    replies_n = db.execute(text('SELECT COUNT(*) FROM "CommunityReply"')).scalar() or 0
    unanswered_n = (
        db.execute(
            text(
                """
                SELECT COUNT(*) FROM (
                  SELECT t."id"
                  FROM "CommunityTopic" t
                  LEFT JOIN "CommunityReply" r ON r."topicId" = t."id"
                  WHERE t."status" IN ('active', 'closed')
                  GROUP BY t."id"
                  HAVING COUNT(r."id") = 0
                ) _
                """
            )
        ).scalar()
        or 0
    )

    quote = _fetch_quote_ru()
    wiki = _fetch_wiki_edtech_ru()

    suggested_categories: Optional[list[dict]] = None
    if current:
        hay = _haystack_for_profile(db, current.user_id)
        scores = _category_profile_scores(hay)
        cat_rows = db.execute(
            text(
                """
                SELECT "id", "slug", "nameRu", "nameEn", "description", "color", "sortOrder",
                       COALESCE("kindScope", 'both') AS "kindScope"
                FROM "CommunityCategory"
                ORDER BY "sortOrder", "nameRu"
                """
            )
        ).mappings().all()
        suggested_categories = []
        for cr in cat_rows:
            d = dict(cr)
            d["profileMatchScore"] = int(scores.get(d["id"], 0))
            suggested_categories.append(d)
        suggested_categories.sort(
            key=lambda x: (-x["profileMatchScore"], x["sortOrder"], x["nameRu"]),
        )

    db.commit()
    out = {
        "stats": {
            "topics": int(topics_n),
            "replies": int(replies_n),
            "unanswered": int(unanswered_n),
        },
        "quote": quote,
        "wiki": wiki,
    }
    if suggested_categories is not None:
        out["suggestedCategories"] = suggested_categories
    return out


# ─── Replies ──────────────────────────────────────────────────────────────────


class CreateReplyRequest(BaseModel):
    body: str = Field(min_length=2, max_length=MAX_BODY)
    parentId: Optional[str] = None
    isAnonymous: bool = False


class UpdateReplyRequest(BaseModel):
    body: str = Field(min_length=2, max_length=MAX_BODY)


@router.post("/topics/{topic_id}/replies", dependencies=[Depends(limit(20, 60))])
def create_reply(
    topic_id: str,
    payload: CreateReplyRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    topic = db.execute(
        text('SELECT "id", "isClosed", "status" FROM "CommunityTopic" WHERE "id" = :id'),
        {"id": topic_id},
    ).mappings().first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    topic_status = topic.get("status", "active")
    if topic_status == "pending":
        raise HTTPException(status_code=403, detail="Topic is pending review")
    if topic_status == "closed" or topic["isClosed"]:
        raise HTTPException(status_code=403, detail="Topic is closed — discussion ended")

    if payload.parentId:
        parent = db.execute(
            text('SELECT "id" FROM "CommunityReply" WHERE "id" = :id AND "topicId" = :tid'),
            {"id": payload.parentId, "tid": topic_id},
        ).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent reply not found in this topic")

    reply_id = f"r-{token_hex(10)}"
    now = _now()
    db.execute(
        text(
            """
            INSERT INTO "CommunityReply"
              ("id", "topicId", "authorId", "parentId", "body", "isAnonymous", "createdAt", "updatedAt")
            VALUES (:id, :tid, :author, :parent, :body, :anon, :now, :now)
            """
        ),
        {
            "id": reply_id,
            "tid": topic_id,
            "author": current.user_id,
            "parent": payload.parentId,
            "body": payload.body,
            "anon": payload.isAnonymous,
            "now": now,
        },
    )
    _add_xp(db, current.user_id, 5)
    db.commit()

    row = db.execute(
        text('SELECT * FROM "CommunityReply" WHERE "id" = :id'),
        {"id": reply_id},
    ).mappings().first()
    votes = _vote_counts(db, "reply", reply_id)
    is_anon = bool(row.get("isAnonymous", False))
    return {
        "id": row["id"],
        "topicId": row["topicId"],
        "parentId": row["parentId"],
        "body": row["body"],
        "isAccepted": row["isAccepted"],
        "isAnonymous": is_anon,
        "author": _author_preview(db, row["authorId"], is_anonymous=is_anon, viewer_id=current.user_id),
        "votes": votes,
        "myVote": None,
        "createdAt": _isoformat_utc(row["createdAt"]),
        "updatedAt": _isoformat_utc(row["updatedAt"]),
    }


@router.put("/replies/{reply_id}")
def update_reply(
    reply_id: str,
    payload: UpdateReplyRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text('SELECT "authorId" FROM "CommunityReply" WHERE "id" = :id'),
        {"id": reply_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Reply not found")
    if row["authorId"] != current.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.execute(
        text('UPDATE "CommunityReply" SET "body" = :body, "updatedAt" = :now WHERE "id" = :id'),
        {"body": payload.body, "now": _now(), "id": reply_id},
    )
    db.commit()
    return {"success": True}


@router.delete("/replies/{reply_id}")
def delete_reply(
    reply_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text('SELECT "authorId" FROM "CommunityReply" WHERE "id" = :id'),
        {"id": reply_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Reply not found")
    if row["authorId"] != current.user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.execute(text('DELETE FROM "CommunityReply" WHERE "id" = :id'), {"id": reply_id})
    db.commit()
    return {"success": True}


# ─── Votes ────────────────────────────────────────────────────────────────────


class VoteRequest(BaseModel):
    targetType: Literal["topic", "reply"]
    targetId: str = Field(min_length=1)
    value: Literal[1, -1]


@router.post("/vote", dependencies=[Depends(limit(60, 60))])
def vote(
    payload: VoteRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    if payload.targetType == "topic":
        target = db.execute(
            text('SELECT "authorId" FROM "CommunityTopic" WHERE "id" = :id'),
            {"id": payload.targetId},
        ).mappings().first()
    else:
        target = db.execute(
            text('SELECT "authorId" FROM "CommunityReply" WHERE "id" = :id'),
            {"id": payload.targetId},
        ).mappings().first()

    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    if target["authorId"] == current.user_id:
        raise HTTPException(status_code=400, detail="Cannot vote on your own content")

    existing = db.execute(
        text(
            """
            SELECT "value" FROM "CommunityVote"
            WHERE "userId" = :uid AND "targetType" = :tt AND "targetId" = :tid
            """
        ),
        {"uid": current.user_id, "tt": payload.targetType, "tid": payload.targetId},
    ).mappings().first()

    author_id = target["authorId"]
    now = _now()

    if existing:
        old_value = int(existing["value"])
        if old_value == payload.value:
            db.execute(
                text(
                    """
                    DELETE FROM "CommunityVote"
                    WHERE "userId" = :uid AND "targetType" = :tt AND "targetId" = :tid
                    """
                ),
                {"uid": current.user_id, "tt": payload.targetType, "tid": payload.targetId},
            )
            _add_xp(db, author_id, -2 if old_value == 1 else 1)
            db.commit()
            return {"action": "removed", "votes": _vote_counts(db, payload.targetType, payload.targetId)}
        else:
            db.execute(
                text(
                    """
                    UPDATE "CommunityVote"
                    SET "value" = :value, "createdAt" = :now
                    WHERE "userId" = :uid AND "targetType" = :tt AND "targetId" = :tid
                    """
                ),
                {"value": payload.value, "now": now, "uid": current.user_id, "tt": payload.targetType, "tid": payload.targetId},
            )
            _add_xp(db, author_id, 4 if payload.value == 1 else -4)
    else:
        db.execute(
            text(
                """
                INSERT INTO "CommunityVote" ("userId", "targetType", "targetId", "value", "createdAt")
                VALUES (:uid, :tt, :tid, :value, :now)
                """
            ),
            {"uid": current.user_id, "tt": payload.targetType, "tid": payload.targetId, "value": payload.value, "now": now},
        )
        _add_xp(db, author_id, 2 if payload.value == 1 else -1)

    db.commit()
    return {"action": "voted", "value": payload.value, "votes": _vote_counts(db, payload.targetType, payload.targetId)}


# ─── Profiles ─────────────────────────────────────────────────────────────────


class UpdateProfileRequest(BaseModel):
    bio: Optional[str] = Field(None, max_length=300)
    position: Optional[str] = Field(None, max_length=100)
    company: Optional[str] = Field(None, max_length=100)
    location: Optional[str] = Field(None, max_length=100)
    website: Optional[str] = Field(None, max_length=200)
    linkedinUrl: Optional[str] = Field(None, max_length=200)
    githubUrl: Optional[str] = Field(None, max_length=200)
    skills: list[str] = Field(default_factory=list, max_length=20)


def _community_user_is_banned(db: Session, user_id: str) -> bool:
    r = db.execute(
        text('SELECT COALESCE("isBanned", false) AS b FROM "CommunityUser" WHERE "id" = :id'),
        {"id": user_id},
    ).mappings().first()
    return bool(r and r.get("b"))


def _build_public_profile(db: Session, user_id: str, viewer_id: Optional[str] = None) -> dict:
    row = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."avatarUrl", u."createdAt",
                   p."bio", p."position", p."company", p."location", p."website",
                   p."linkedinUrl", p."githubUrl", p."skills", p."communityXp"
            FROM "CommunityUser" u
            LEFT JOIN "CommunityProfile" p ON p."userId" = u."id"
            WHERE u."id" = :uid
            """
        ),
        {"uid": user_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    topics_count = db.execute(
        text('SELECT COUNT(*) FROM "CommunityTopic" WHERE "authorId" = :uid'),
        {"uid": user_id},
    ).scalar()
    replies_count = db.execute(
        text('SELECT COUNT(*) FROM "CommunityReply" WHERE "authorId" = :uid'),
        {"uid": user_id},
    ).scalar()
    followers_count = db.execute(
        text('SELECT COUNT(*) FROM "CommunityFollow" WHERE "followingId" = :uid'),
        {"uid": user_id},
    ).scalar()
    following_count = db.execute(
        text('SELECT COUNT(*) FROM "CommunityFollow" WHERE "followerId" = :uid'),
        {"uid": user_id},
    ).scalar()
    likes_received = db.execute(
        text(
            """
            SELECT COUNT(*) FROM "CommunityVote" v
            WHERE v."value" = 1
              AND (
                EXISTS (
                  SELECT 1 FROM "CommunityTopic" t
                  WHERE t."id" = v."targetId" AND t."authorId" = :uid AND v."targetType" = 'topic'
                )
                OR EXISTS (
                  SELECT 1 FROM "CommunityReply" r
                  WHERE r."id" = v."targetId" AND r."authorId" = :uid AND v."targetType" = 'reply'
                )
              )
            """
        ),
        {"uid": user_id},
    ).scalar()

    skills_raw = row["skills"]
    try:
        skills = json.loads(skills_raw) if skills_raw else []
    except Exception:
        skills = []

    is_followed_by_viewer = False
    if viewer_id and viewer_id != user_id:
        fr = db.execute(
            text(
                """
                SELECT 1 FROM "CommunityFollow"
                WHERE "followerId" = :viewer AND "followingId" = :profile
                """
            ),
            {"viewer": viewer_id, "profile": user_id},
        ).first()
        is_followed_by_viewer = bool(fr)

    return {
        "id": row["id"],
        "firstName": row["firstName"],
        "lastName": row["lastName"],
        "avatarUrl": row["avatarUrl"],
        "createdAt": _isoformat_utc(row["createdAt"]),
        "bio": row["bio"],
        "position": row["position"],
        "company": row["company"],
        "location": row["location"],
        "website": row["website"],
        "linkedinUrl": row["linkedinUrl"],
        "githubUrl": row["githubUrl"],
        "skills": skills,
        "communityXp": row["communityXp"] or 0,
        "stats": {
            "topicsCount": int(topics_count or 0),
            "repliesCount": int(replies_count or 0),
            "likesReceived": int(likes_received or 0),
            "followersCount": int(followers_count or 0),
            "followingCount": int(following_count or 0),
        },
        "isFollowedByViewer": is_followed_by_viewer,
    }


@router.get("/profiles/me")
def get_my_profile(
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    _ensure_profile(db, current.user_id)
    db.commit()
    return _build_public_profile(db, current.user_id, viewer_id=current.user_id)


@router.get("/profiles/{user_id}")
def get_profile(
    user_id: str,
    current: Optional[CommCurrentUser] = Depends(get_optional_community_user),
    db: Session = Depends(get_db),
):
    viewer_id = current.user_id if current else None
    return _build_public_profile(db, user_id, viewer_id=viewer_id)


@router.put("/profiles/me")
def update_my_profile(
    payload: UpdateProfileRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    _ensure_profile(db, current.user_id)
    skills_clean = [s.strip() for s in payload.skills if s.strip()][:20]
    db.execute(
        text(
            """
            UPDATE "CommunityProfile"
            SET "bio" = :bio, "position" = :position, "company" = :company,
                "location" = :location, "website" = :website,
                "linkedinUrl" = :linkedin, "githubUrl" = :github,
                "skills" = :skills, "updatedAt" = :now
            WHERE "userId" = :uid
            """
        ),
        {
            "bio": payload.bio,
            "position": payload.position,
            "company": payload.company,
            "location": payload.location,
            "website": payload.website,
            "linkedin": payload.linkedinUrl,
            "github": payload.githubUrl,
            "skills": json.dumps(skills_clean, ensure_ascii=False),
            "now": _now(),
            "uid": current.user_id,
        },
    )
    db.commit()
    return _build_public_profile(db, current.user_id, viewer_id=current.user_id)


@router.post("/profiles/{user_id}/follow", dependencies=[Depends(limit(40, 60))])
def follow_profile(
    user_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    if user_id == current.user_id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    if _community_user_is_banned(db, current.user_id):
        raise HTTPException(status_code=403, detail="Account restricted")
    exists = db.execute(text('SELECT 1 FROM "CommunityUser" WHERE "id" = :id'), {"id": user_id}).first()
    if not exists:
        raise HTTPException(status_code=404, detail="User not found")
    if _community_user_is_banned(db, user_id):
        raise HTTPException(status_code=403, detail="Cannot follow this user")
    now = _now()
    db.execute(
        text(
            """
            INSERT INTO "CommunityFollow" ("followerId", "followingId", "createdAt")
            VALUES (:follower, :following, :now)
            ON CONFLICT ("followerId", "followingId") DO NOTHING
            """
        ),
        {"follower": current.user_id, "following": user_id, "now": now},
    )
    db.commit()
    return _build_public_profile(db, user_id, viewer_id=current.user_id)


@router.delete("/profiles/{user_id}/follow", dependencies=[Depends(limit(40, 60))])
def unfollow_profile(
    user_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    if user_id == current.user_id:
        raise HTTPException(status_code=400, detail="Cannot unfollow yourself")
    db.execute(
        text(
            """
            DELETE FROM "CommunityFollow"
            WHERE "followerId" = :follower AND "followingId" = :following
            """
        ),
        {"follower": current.user_id, "following": user_id},
    )
    db.commit()
    return _build_public_profile(db, user_id, viewer_id=current.user_id)


@router.get("/me/following", dependencies=[Depends(limit(60, 60))])
def list_my_following(
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=10, ge=1, le=50),
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Accounts that the current user follows (subscriptions)."""
    offset = (page - 1) * page_size
    uid = current.user_id
    total = db.execute(
        text('SELECT COUNT(*) FROM "CommunityFollow" WHERE "followerId" = :uid'),
        {"uid": uid},
    ).scalar()
    total_n = int(total or 0)
    rows = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."avatarUrl", f."createdAt"
            FROM "CommunityFollow" f
            JOIN "CommunityUser" u ON u."id" = f."followingId"
            WHERE f."followerId" = :uid
            ORDER BY f."createdAt" DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {"uid": uid, "limit": page_size, "offset": offset},
    ).mappings().all()
    return {
        "items": [
            {
                "id": r["id"],
                "firstName": r["firstName"],
                "lastName": r["lastName"],
                "avatarUrl": r.get("avatarUrl"),
                "since": _isoformat_utc(r.get("createdAt")),
            }
            for r in rows
        ],
        "total": total_n,
        "page": page,
        "pageSize": page_size,
    }


@router.get("/me/followers", dependencies=[Depends(limit(60, 60))])
def list_my_followers(
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=10, ge=1, le=50),
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Users subscribed to the current user."""
    offset = (page - 1) * page_size
    uid = current.user_id
    total = db.execute(
        text('SELECT COUNT(*) FROM "CommunityFollow" WHERE "followingId" = :uid'),
        {"uid": uid},
    ).scalar()
    total_n = int(total or 0)
    rows = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."avatarUrl", f."createdAt"
            FROM "CommunityFollow" f
            JOIN "CommunityUser" u ON u."id" = f."followerId"
            WHERE f."followingId" = :uid
            ORDER BY f."createdAt" DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {"uid": uid, "limit": page_size, "offset": offset},
    ).mappings().all()
    return {
        "items": [
            {
                "id": r["id"],
                "firstName": r["firstName"],
                "lastName": r["lastName"],
                "avatarUrl": r.get("avatarUrl"),
                "since": _isoformat_utc(r.get("createdAt")),
            }
            for r in rows
        ],
        "total": total_n,
        "page": page,
        "pageSize": page_size,
    }


@router.delete("/me/followers/{user_id}", dependencies=[Depends(limit(40, 60))])
def remove_my_follower(
    user_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Remove a user from your followers (they will no longer follow you)."""
    if user_id == current.user_id:
        raise HTTPException(status_code=400, detail="Invalid user")
    row = db.execute(
        text(
            """
            DELETE FROM "CommunityFollow"
            WHERE "followerId" = :follower AND "followingId" = :me
            RETURNING 1
            """
        ),
        {"follower": user_id, "me": current.user_id},
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not a follower")
    db.commit()
    return {"success": True}


# ─── Chats (group + DM) ───────────────────────────────────────────────────────

CHAT_MSG_PAGE = 50


class SendTextMessageRequest(BaseModel):
    body: str = Field("", max_length=4000)
    reply_to_message_id: Optional[str] = Field(None, max_length=100)


async def _save_chat_message_image(upload: UploadFile) -> str:
    mime = (upload.content_type or "").split(";")[0].strip().lower()
    if mime not in COMMUNITY_INLINE_IMG_ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF images are allowed")
    content = await upload.read()
    if len(content) > COMMUNITY_INLINE_IMG_MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    raw_ext = upload.filename.rsplit(".", 1)[-1].lower() if upload.filename and "." in upload.filename else ""
    ext_by_mime = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
    ext = raw_ext if raw_ext in ("jpg", "jpeg", "png", "webp", "gif") else ext_by_mime.get(mime, "jpg")
    if ext == "jpeg":
        ext = "jpg"

    safe_name = f"{uuid4().hex}.{ext}"
    COMMUNITY_CHAT_ATTACH_DIR.mkdir(parents=True, exist_ok=True)
    dest = COMMUNITY_CHAT_ATTACH_DIR / safe_name
    dest.write_bytes(content)
    return f"/uploads/community-chat/{safe_name}"


def _resolve_community_attachment_path(stored: str) -> Path:
    if not stored or ".." in stored or "\x00" in stored:
        raise HTTPException(status_code=404, detail="Attachment not found")
    s = stored.strip()
    if not s.startswith("/uploads/"):
        raise HTTPException(status_code=404, detail="Attachment not found")
    rel = s.removeprefix("/uploads/")
    if not rel.startswith(("community-chat/", "community-inline/")):
        raise HTTPException(status_code=404, detail="Attachment not found")
    root = Path("/app/uploads").resolve()
    full = (root / rel).resolve()
    try:
        full.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if not full.is_file():
        raise HTTPException(status_code=404, detail="Attachment not found")
    return full


def _create_group_chat(db: Session, topic_id: str, topic_title: str) -> Optional[str]:
    """Create a group chat for a closed topic. Preserves isAnonymous per participant.

    The topic author becomes the group owner; all other participants get role='member'.
    """
    existing = db.execute(
        text('SELECT "id" FROM "CommunityChat" WHERE "topicId" = :tid'),
        {"tid": topic_id},
    ).first()
    if existing:
        return existing[0]

    # Topic author row first (becomes owner), then reply authors
    topic_row = db.execute(
        text('SELECT "authorId", "isAnonymous" FROM "CommunityTopic" WHERE "id" = :tid'),
        {"tid": topic_id},
    ).mappings().first()
    if not topic_row:
        return None

    reply_rows = db.execute(
        text(
            """
            SELECT DISTINCT "authorId" AS uid, bool_or("isAnonymous") AS anon
            FROM "CommunityReply" WHERE "topicId" = :tid
            GROUP BY "authorId"
            """
        ),
        {"tid": topic_id},
    ).all()

    owner_id = topic_row["authorId"]
    owner_anon = bool(topic_row["isAnonymous"])

    all_members: list[tuple[str, bool, str]] = [(owner_id, owner_anon, "owner")]
    for row in reply_rows:
        uid = row[0]
        if uid != owner_id:
            all_members.append((uid, bool(row[1]), "member"))

    if len(all_members) < 2:
        return None

    chat_id = f"c-{token_hex(12)}"
    now = _now()
    name = f"Обсуждение: {topic_title[:60]}"

    db.execute(
        text(
            'INSERT INTO "CommunityChat" '
            '("id", "type", "name", "topicId", "ownerId", "createdAt", "updatedAt") '
            "VALUES (:id, 'group', :name, :tid, :owner, :now, :now)"
        ),
        {"id": chat_id, "name": name, "tid": topic_id, "owner": owner_id, "now": now},
    )
    for uid, anon, role in all_members:
        db.execute(
            text(
                'INSERT INTO "CommunityChatMember" ("chatId", "userId", "isAnonymous", "role", "joinedAt") '
                "VALUES (:cid, :uid, :anon, :role, :now) ON CONFLICT DO NOTHING"
            ),
            {"cid": chat_id, "uid": uid, "anon": anon, "role": role, "now": now},
        )
    return chat_id


def _get_or_create_dm(db: Session, user_a: str, user_b: str) -> str:
    """Return existing DM chat id or create a new one."""
    existing = db.execute(
        text(
            """
            SELECT c."id" FROM "CommunityChat" c
            JOIN "CommunityChatMember" m1 ON m1."chatId" = c."id" AND m1."userId" = :a
            JOIN "CommunityChatMember" m2 ON m2."chatId" = c."id" AND m2."userId" = :b
            WHERE c."type" = 'dm' LIMIT 1
            """
        ),
        {"a": user_a, "b": user_b},
    ).first()
    if existing:
        return existing[0]

    chat_id = f"dm-{token_hex(12)}"
    now = _now()
    db.execute(
        text('INSERT INTO "CommunityChat" ("id", "type", "createdAt", "updatedAt") VALUES (:id, \'dm\', :now, :now)'),
        {"id": chat_id, "now": now},
    )
    for uid in (user_a, user_b):
        db.execute(
            text('INSERT INTO "CommunityChatMember" ("chatId", "userId", "joinedAt") VALUES (:cid, :uid, :now)'),
            {"cid": chat_id, "uid": uid, "now": now},
        )
    return chat_id


def _get_member_role(db: Session, chat_id: str, user_id: str) -> Optional[str]:
    """Return the member's role in a chat, or None if they are not a member."""
    return db.execute(
        text('SELECT "role" FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": user_id},
    ).scalar()


def _unread_count(db: Session, chat_id: str, user_id: str) -> int:
    row = db.execute(
        text(
            """
            SELECT COUNT(*) FROM "CommunityChatMessage" m
            JOIN "CommunityChatMember" mb ON mb."chatId" = m."chatId" AND mb."userId" = :uid
            WHERE m."chatId" = :cid AND m."authorId" != :uid
              AND m."deletedAt" IS NULL
              AND (mb."lastReadAt" IS NULL OR m."createdAt" > mb."lastReadAt")
            """
        ),
        {"cid": chat_id, "uid": user_id},
    ).scalar()
    return int(row or 0)


def _chat_member_public_preview(
    db: Session,
    chat_id: str,
    viewer_id: str,
    member_user_id: str,
    first_name: str,
    last_name: str,
    avatar_url: Optional[str],
) -> dict:
    """Public view of a chat member, honouring anonymity within the group."""
    row_m = db.execute(
        text('SELECT "isAnonymous" FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": member_user_id},
    ).mappings().first()
    is_anon = bool(row_m and row_m.get("isAnonymous"))
    if is_anon and member_user_id != viewer_id:
        return {
            "id": f"a-{member_user_id}",
            "firstName": "Аноним",
            "lastName": "",
            "avatarUrl": None,
            "isAnonymous": True,
        }
    return {
        "id": member_user_id,
        "firstName": first_name,
        "lastName": last_name,
        "avatarUrl": avatar_url,
        "isAnonymous": is_anon,
    }


def _format_chat(db: Session, row: dict, viewer_id: str) -> dict:
    last_msg = db.execute(
        text(
            """
            SELECT m."body", m."attachmentUrl", m."createdAt", m."authorId", u."firstName", u."lastName"
            FROM "CommunityChatMessage" m
            JOIN "CommunityUser" u ON u."id" = m."authorId"
            WHERE m."chatId" = :cid AND m."deletedAt" IS NULL
            ORDER BY m."createdAt" DESC LIMIT 1
            """
        ),
        {"cid": row["id"]},
    ).mappings().first()

    members = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."avatarUrl",
                   mb."isAnonymous"
            FROM "CommunityChatMember" mb
            JOIN "CommunityUser" u ON u."id" = mb."userId"
            WHERE mb."chatId" = :cid
            """
        ),
        {"cid": row["id"]},
    ).mappings().all()

    name = row.get("name")
    if row["type"] == "dm" and not name:
        other = next((m for m in members if m["id"] != viewer_id), None)
        if other:
            is_other_anon = bool(other.get("isAnonymous", False))
            name = "Аноним" if is_other_anon else f"{other['firstName']} {other['lastName']}"

    def fmt_member(m: dict) -> dict:
        md = dict(m)
        return _chat_member_public_preview(
            db,
            row["id"],
            viewer_id,
            md["id"],
            md["firstName"],
            md["lastName"],
            md.get("avatarUrl"),
        )

    # For last message: mask if sender is anonymous in this chat
    last_message = None
    if last_msg:
        sender_anon = db.execute(
            text('SELECT "isAnonymous" FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
            {"cid": row["id"], "uid": last_msg.get("authorId", "")},
        ).scalar()
        is_sender_anon = bool(sender_anon)
        last_message = {
            "body": last_msg["body"],
            "hasAttachment": bool(last_msg.get("attachmentUrl")),
            "createdAt": _isoformat_utc(last_msg["createdAt"]),
            "authorName": "Аноним" if is_sender_anon else f"{last_msg['firstName']} {last_msg['lastName']}",
        }

    return {
        "id": row["id"],
        "type": row["type"],
        "name": name,
        "topicId": row.get("topicId"),
        "description": row.get("description"),
        "ownerId": row.get("ownerId"),
        "createdAt": _isoformat_utc(row.get("createdAt")),
        "updatedAt": _isoformat_utc(row.get("updatedAt")),
        "lastMessage": last_message,
        "unreadCount": _unread_count(db, row["id"], viewer_id),
        "members": [fmt_member(dict(m)) for m in members],
        # viewer's own anon flag in this chat
        "myIsAnonymous": bool(next((m.get("isAnonymous", False) for m in members if m["id"] == viewer_id), False)),
    }


@router.post("/chats/{chat_id}/reveal")
def reveal_identity(
    chat_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Reveal the current user's identity in a group chat (set isAnonymous=false)."""
    member = db.execute(
        text('SELECT "isAnonymous" FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": current.user_id},
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this chat")

    db.execute(
        text('UPDATE "CommunityChatMember" SET "isAnonymous" = FALSE WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": current.user_id},
    )
    db.commit()
    return {"success": True, "isAnonymous": False}


@router.get("/chats/unread")
def unread_count(
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            """
            SELECT COUNT(*) FROM "CommunityChatMessage" m
            JOIN "CommunityChatMember" mb ON mb."chatId" = m."chatId" AND mb."userId" = :uid
            WHERE m."authorId" != :uid
              AND (mb."lastReadAt" IS NULL OR m."createdAt" > mb."lastReadAt")
            """
        ),
        {"uid": current.user_id},
    ).scalar()
    return {"unread": int(row or 0)}


@router.get("/chats")
def list_chats(
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text(
            """
            SELECT c."id", c."type", c."name", c."description", c."ownerId",
                   c."topicId", c."createdAt", c."updatedAt"
            FROM "CommunityChat" c
            JOIN "CommunityChatMember" m ON m."chatId" = c."id" AND m."userId" = :uid
            ORDER BY c."updatedAt" DESC
            """
        ),
        {"uid": current.user_id},
    ).mappings().all()

    if not rows:
        return []

    chat_ids = [r["id"] for r in rows]

    # 1. Batch: last non-deleted message per chat
    last_msg_rows = db.execute(
        text(
            """
            SELECT DISTINCT ON (m."chatId")
                   m."chatId", m."body", m."attachmentUrl", m."createdAt", m."authorId",
                   u."firstName", u."lastName", mb."isAnonymous" AS sender_anon
            FROM "CommunityChatMessage" m
            LEFT JOIN "CommunityUser" u ON u."id" = m."authorId"
            LEFT JOIN "CommunityChatMember" mb ON mb."chatId" = m."chatId" AND mb."userId" = m."authorId"
            WHERE m."chatId" = ANY(:ids) AND m."deletedAt" IS NULL
            ORDER BY m."chatId", m."createdAt" DESC
            """
        ),
        {"ids": chat_ids},
    ).mappings().all()
    last_msg_map: dict[str, dict] = {r["chatId"]: dict(r) for r in last_msg_rows}

    # 2. Batch: all members for all chats
    member_rows = db.execute(
        text(
            """
            SELECT mb."chatId", u."id", u."firstName", u."lastName", u."avatarUrl",
                   mb."isAnonymous"
            FROM "CommunityChatMember" mb
            JOIN "CommunityUser" u ON u."id" = mb."userId"
            WHERE mb."chatId" = ANY(:ids)
            """
        ),
        {"ids": chat_ids},
    ).mappings().all()
    chat_members_map: dict[str, list[dict]] = {}
    for r in member_rows:
        chat_members_map.setdefault(r["chatId"], []).append(dict(r))

    # 3. Batch: unread counts for viewer
    unread_rows = db.execute(
        text(
            """
            SELECT m."chatId", COUNT(*) AS cnt
            FROM "CommunityChatMessage" m
            JOIN "CommunityChatMember" mb ON mb."chatId" = m."chatId" AND mb."userId" = :uid
            WHERE m."chatId" = ANY(:ids)
              AND m."authorId" != :uid
              AND m."deletedAt" IS NULL
              AND (mb."lastReadAt" IS NULL OR m."createdAt" > mb."lastReadAt")
            GROUP BY m."chatId"
            """
        ),
        {"ids": chat_ids, "uid": current.user_id},
    ).mappings().all()
    unread_map: dict[str, int] = {r["chatId"]: int(r["cnt"]) for r in unread_rows}

    def _fmt_chat_batch(row: dict) -> dict:
        cid = row["id"]
        members = chat_members_map.get(cid, [])
        last_msg_raw = last_msg_map.get(cid)

        name = row.get("name")
        if row["type"] == "dm" and not name:
            other = next((m for m in members if m["id"] != current.user_id), None)
            if other:
                name = "Аноним" if other.get("isAnonymous") else f"{other['firstName']} {other['lastName']}"

        last_message = None
        if last_msg_raw:
            is_sender_anon = bool(last_msg_raw.get("sender_anon"))
            last_message = {
                "body": last_msg_raw["body"],
                "hasAttachment": bool(last_msg_raw.get("attachmentUrl")),
                "createdAt": _isoformat_utc(last_msg_raw["createdAt"]),
                "authorName": "Аноним" if is_sender_anon else f"{last_msg_raw['firstName']} {last_msg_raw['lastName']}",
            }

        def _fmt_member(m: dict) -> dict:
            uid = m["id"]
            is_anon = bool(m.get("isAnonymous"))
            if is_anon and uid != current.user_id:
                return {"id": f"a-{uid}", "firstName": "Аноним", "lastName": "", "avatarUrl": None, "isAnonymous": True}
            return {
                "id": uid,
                "firstName": m["firstName"],
                "lastName": m["lastName"],
                "avatarUrl": m.get("avatarUrl"),
                "isAnonymous": is_anon,
            }

        return {
            "id": cid,
            "type": row["type"],
            "name": name,
            "topicId": row.get("topicId"),
            "description": row.get("description"),
            "ownerId": row.get("ownerId"),
            "createdAt": _isoformat_utc(row.get("createdAt")),
            "updatedAt": _isoformat_utc(row.get("updatedAt")),
            "lastMessage": last_message,
            "unreadCount": unread_map.get(cid, 0),
            "members": [_fmt_member(m) for m in members],
            "myIsAnonymous": bool(next((m.get("isAnonymous", False) for m in members if m["id"] == current.user_id), False)),
        }

    return [_fmt_chat_batch(dict(r)) for r in rows]


@router.get("/chats/{chat_id}/messages")
def get_messages(
    chat_id: str,
    before: Optional[str] = None,
    after: Optional[str] = None,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Fetch messages for a chat.

    Supports two cursor modes:
    - before=<messageId>  — load older messages (infinite scroll upwards)
    - after=<messageId>   — fetch only new messages since that message (delta polling)

    Using both at once is not allowed and returns 400.
    """
    if before and after:
        raise HTTPException(status_code=400, detail="Cannot use both 'before' and 'after' at once")

    member = db.execute(
        text('SELECT "userId" FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": current.user_id},
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    params: dict = {"cid": chat_id, "limit": CHAT_MSG_PAGE}
    cursor_clause = ""
    use_delta = False

    if before:
        cursor_time = db.execute(
            text(
                'SELECT "createdAt" FROM "CommunityChatMessage" '
                'WHERE "id" = :id AND "chatId" = :cid'
            ),
            {"id": before, "cid": chat_id},
        ).scalar()
        if cursor_time:
            cursor_clause = 'AND m."createdAt" < :cursor'
            params["cursor"] = cursor_time

    if after:
        cursor_time = db.execute(
            text(
                'SELECT "createdAt" FROM "CommunityChatMessage" '
                'WHERE "id" = :id AND "chatId" = :cid'
            ),
            {"id": after, "cid": chat_id},
        ).scalar()
        if cursor_time:
            use_delta = True
            cursor_clause = 'AND m."createdAt" > :cursor'
            params["cursor"] = cursor_time
        # Invalid or foreign message id: ignore delta and return a normal page (bounded query)

    limit_clause = "LIMIT :limit" if not use_delta else ""

    rows = db.execute(
        text(
            f"""
            SELECT m."id", m."chatId", m."authorId", m."body", m."attachmentUrl", m."createdAt",
                   m."editedAt", m."deletedAt", m."replyToMessageId", m."messageType",
                   u."firstName", u."lastName", u."avatarUrl"
            FROM "CommunityChatMessage" m
            LEFT JOIN "CommunityUser" u ON u."id" = m."authorId"
            WHERE m."chatId" = :cid
              AND m."deletedAt" IS NULL
              {cursor_clause}
            ORDER BY m."createdAt" {"ASC" if use_delta else "DESC"}
            {limit_clause}
            """
        ),
        params,
    ).mappings().all()

    # Mark chat as read for the viewer
    db.execute(
        text('UPDATE "CommunityChatMember" SET "lastReadAt" = :now WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": current.user_id, "now": _now()},
    )
    db.commit()

    # For before-cursor (DESC order) reverse so result is chronological; delta fetch is already ASC
    ordered = list(rows) if use_delta else list(reversed(rows))

    # Batch-fetch member anonymity flags (replaces per-message _chat_member_public_preview query)
    member_anon_rows = db.execute(
        text('SELECT "userId", "isAnonymous" FROM "CommunityChatMember" WHERE "chatId" = :cid'),
        {"cid": chat_id},
    ).mappings().all()
    member_anon_map: dict[str, bool] = {r["userId"]: bool(r["isAnonymous"]) for r in member_anon_rows}

    def _fmt_msg_author(r: dict) -> dict:
        uid = r["authorId"]
        is_anon = member_anon_map.get(uid, False)
        if is_anon and uid != current.user_id:
            return {"id": f"a-{uid}", "firstName": "Аноним", "lastName": "", "avatarUrl": None, "isAnonymous": True}
        return {
            "id": uid,
            "firstName": r["firstName"] or "",
            "lastName": r["lastName"] or "",
            "avatarUrl": r.get("avatarUrl"),
            "isAnonymous": is_anon,
        }

    return {
        "messages": [
            {
                "id": r["id"],
                "chatId": r["chatId"],
                "body": r["body"] or "",
                "hasAttachment": bool(r.get("attachmentUrl")),
                "messageType": r.get("messageType") or "text",
                "replyToMessageId": r.get("replyToMessageId"),
                "editedAt": _isoformat_utc(r.get("editedAt")),
                "createdAt": _isoformat_utc(r["createdAt"]),
                "author": _fmt_msg_author(dict(r)),
            }
            for r in ordered
        ],
        "hasMore": not use_delta and len(rows) == CHAT_MSG_PAGE,
    }


@router.get("/chats/{chat_id}")
def get_chat(
    chat_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    member = db.execute(
        text('SELECT "userId" FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": current.user_id},
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    row = db.execute(
        text('SELECT * FROM "CommunityChat" WHERE "id" = :id'),
        {"id": chat_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Chat not found")
    return _format_chat(db, dict(row), current.user_id)


@router.get("/chats/messages/{message_id}/attachment")
def get_chat_message_attachment(
    message_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text(
            """
            SELECT m."chatId", m."attachmentUrl"
            FROM "CommunityChatMessage" m
            WHERE m."id" = :mid
            """
        ),
        {"mid": message_id},
    ).mappings().first()
    if not row or not row.get("attachmentUrl"):
        raise HTTPException(status_code=404, detail="Attachment not found")

    member = db.execute(
        text('SELECT "userId" FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": row["chatId"], "uid": current.user_id},
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    disk_path = _resolve_community_attachment_path(row["attachmentUrl"])
    media_type = mimetypes.guess_type(disk_path.name)[0] or "application/octet-stream"
    return FileResponse(path=str(disk_path), media_type=media_type, filename=disk_path.name)


@router.post("/chats/{chat_id}/messages", dependencies=[Depends(limit(30, 60))])
async def send_message(
    chat_id: str,
    request: Request,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    if _community_user_is_banned(db, current.user_id):
        raise HTTPException(status_code=403, detail="Account restricted")

    member = db.execute(
        text('SELECT "userId" FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": current.user_id},
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    ctype = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    body_text = ""
    saved_att: Optional[str] = None
    reply_to_id: Optional[str] = None

    if ctype == "multipart/form-data":
        form = await request.form()
        body_text = str(form.get("body") or "").strip()
        uf = form.get("file")
        if isinstance(uf, UploadFile) and uf.filename:
            saved_att = await _save_chat_message_image(uf)
    elif ctype == "application/json":
        raw = await request.json()
        data = SendTextMessageRequest.model_validate(raw)
        body_text = data.body.strip()
        reply_to_id = (data.reply_to_message_id or "").strip() or None
    else:
        raise HTTPException(status_code=415, detail="Use application/json or multipart/form-data")

    if not body_text and not saved_att:
        raise HTTPException(status_code=400, detail="Empty message")

    # Validate reply-to message belongs to the same chat
    if reply_to_id:
        reply_exists = db.execute(
            text('SELECT 1 FROM "CommunityChatMessage" WHERE "id" = :id AND "chatId" = :cid AND "deletedAt" IS NULL'),
            {"id": reply_to_id, "cid": chat_id},
        ).first()
        if not reply_exists:
            reply_to_id = None

    msg_id = f"m-{token_hex(12)}"
    now = _now()
    db.execute(
        text(
            'INSERT INTO "CommunityChatMessage" '
            '("id", "chatId", "authorId", "body", "attachmentUrl", "replyToMessageId", "createdAt") '
            "VALUES (:id, :cid, :author, :body, :att, :reply, :now)"
        ),
        {
            "id": msg_id,
            "cid": chat_id,
            "author": current.user_id,
            "body": body_text,
            "att": saved_att,
            "reply": reply_to_id,
            "now": now,
        },
    )
    db.execute(
        text('UPDATE "CommunityChat" SET "updatedAt" = :now WHERE "id" = :id'),
        {"now": now, "id": chat_id},
    )
    db.execute(
        text('UPDATE "CommunityChatMember" SET "lastReadAt" = :now WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": current.user_id, "now": now},
    )
    db.commit()

    u = db.execute(
        text('SELECT "firstName", "lastName", "avatarUrl" FROM "CommunityUser" WHERE "id" = :id'),
        {"id": current.user_id},
    ).mappings().first()
    return {
        "id": msg_id,
        "chatId": chat_id,
        "body": body_text,
        "hasAttachment": bool(saved_att),
        "messageType": "text",
        "replyToMessageId": reply_to_id,
        "editedAt": None,
        "createdAt": _isoformat_utc(now),
        "author": {
            "id": current.user_id,
            "firstName": u["firstName"] if u else "",
            "lastName": u["lastName"] if u else "",
            "avatarUrl": u["avatarUrl"] if u else None,
        },
    }


@router.post("/dm/{target_user_id}")
def start_or_get_dm(
    target_user_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    if target_user_id == current.user_id:
        raise HTTPException(status_code=400, detail="Cannot DM yourself")
    target = db.execute(
        text('SELECT "id" FROM "CommunityUser" WHERE "id" = :id'),
        {"id": target_user_id},
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent DM initiation if either side has blocked the other.
    # Return a generic 403 to avoid leaking block status to the initiator.
    if _is_blocked(db, current.user_id, target_user_id):
        raise HTTPException(status_code=403, detail="Cannot start a conversation with this user")

    chat_id = _get_or_create_dm(db, current.user_id, target_user_id)
    db.commit()
    row = db.execute(
        text('SELECT * FROM "CommunityChat" WHERE "id" = :id'),
        {"id": chat_id},
    ).mappings().first()
    return _format_chat(db, dict(row), current.user_id)


# ─── Message management ────────────────────────────────────────────────────────

class EditMessageRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


@router.patch("/chats/{chat_id}/messages/{message_id}", dependencies=[Depends(limit(30, 60))])
def edit_message(
    chat_id: str,
    message_id: str,
    payload: EditMessageRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Edit own message. Only the author may edit; deleted messages cannot be edited."""
    if _community_user_is_banned(db, current.user_id):
        raise HTTPException(status_code=403, detail="Account restricted")

    row = db.execute(
        text(
            'SELECT "authorId", "chatId", "deletedAt" FROM "CommunityChatMessage" WHERE "id" = :id'
        ),
        {"id": message_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    if row["chatId"] != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if row["deletedAt"] is not None:
        raise HTTPException(status_code=410, detail="Message has been deleted")
    if row["authorId"] != current.user_id:
        raise HTTPException(status_code=403, detail="Cannot edit another user's message")

    # Verify the editor is still a member of this chat
    if not _get_member_role(db, chat_id, current.user_id):
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    now = _now()
    db.execute(
        text(
            'UPDATE "CommunityChatMessage" SET "body" = :body, "editedAt" = :now, "updatedAt" = :now '
            'WHERE "id" = :id'
        ),
        {"body": payload.body.strip(), "now": now, "id": message_id},
    )
    db.commit()
    return {"id": message_id, "body": payload.body.strip(), "editedAt": _isoformat_utc(now)}


@router.delete("/chats/{chat_id}/messages/{message_id}", dependencies=[Depends(limit(30, 60))])
def delete_message(
    chat_id: str,
    message_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Soft-delete a message.

    - Author may always delete their own message.
    - Admin / owner may delete any message in the chat (moderation).
    """
    row = db.execute(
        text(
            'SELECT "authorId", "chatId", "deletedAt" FROM "CommunityChatMessage" WHERE "id" = :id'
        ),
        {"id": message_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Message not found")
    if row["chatId"] != chat_id:
        raise HTTPException(status_code=404, detail="Message not found")
    if row["deletedAt"] is not None:
        raise HTTPException(status_code=410, detail="Message already deleted")

    role = _get_member_role(db, chat_id, current.user_id)
    if not role:
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    is_author = row["authorId"] == current.user_id
    is_moderator = role in ("owner", "admin")

    if not is_author and not is_moderator:
        raise HTTPException(status_code=403, detail="Cannot delete another user's message")

    now = _now()
    db.execute(
        text('UPDATE "CommunityChatMessage" SET "deletedAt" = :now WHERE "id" = :id'),
        {"now": now, "id": message_id},
    )
    db.commit()
    return {"id": message_id, "deletedAt": _isoformat_utc(now)}


# ─── Group chat management ─────────────────────────────────────────────────────

class CreateGroupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    member_ids: List[str] = Field(default_factory=list)

    @field_validator("member_ids")
    @classmethod
    def limit_members(cls, v: List[str]) -> List[str]:
        if len(v) > 49:
            raise ValueError("Cannot add more than 49 members at once")
        return v


@router.post("/chats/group", dependencies=[Depends(limit(10, 60))])
def create_group_chat(
    payload: CreateGroupRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Create a new group chat. Creator becomes owner."""
    if _community_user_is_banned(db, current.user_id):
        raise HTTPException(status_code=403, detail="Account restricted")

    # Deduplicate and exclude self
    unique_ids = list({uid for uid in payload.member_ids if uid != current.user_id})

    # Verify all invited users exist
    if unique_ids:
        placeholders = ", ".join(f":uid{i}" for i in range(len(unique_ids)))
        found = db.execute(
            text(f'SELECT COUNT(*) FROM "CommunityUser" WHERE "id" IN ({placeholders})'),
            {f"uid{i}": uid for i, uid in enumerate(unique_ids)},
        ).scalar()
        if int(found or 0) != len(unique_ids):
            raise HTTPException(status_code=400, detail="One or more invited users not found")

    chat_id = f"c-{token_hex(12)}"
    now = _now()

    db.execute(
        text(
            'INSERT INTO "CommunityChat" '
            '("id", "type", "name", "description", "ownerId", "createdAt", "updatedAt") '
            "VALUES (:id, 'group', :name, :desc, :owner, :now, :now)"
        ),
        {"id": chat_id, "name": payload.name, "desc": payload.description, "owner": current.user_id, "now": now},
    )
    # Add creator as owner
    db.execute(
        text(
            'INSERT INTO "CommunityChatMember" ("chatId", "userId", "role", "joinedAt") '
            "VALUES (:cid, :uid, 'owner', :now)"
        ),
        {"cid": chat_id, "uid": current.user_id, "now": now},
    )
    # Add invited members
    for uid in unique_ids:
        db.execute(
            text(
                'INSERT INTO "CommunityChatMember" ("chatId", "userId", "role", "joinedAt") '
                "VALUES (:cid, :uid, 'member', :now) ON CONFLICT DO NOTHING"
            ),
            {"cid": chat_id, "uid": uid, "now": now},
        )
    db.commit()

    row = db.execute(
        text('SELECT * FROM "CommunityChat" WHERE "id" = :id'),
        {"id": chat_id},
    ).mappings().first()
    return _format_chat(db, dict(row), current.user_id)


class UpdateChatRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


@router.patch("/chats/{chat_id}", dependencies=[Depends(limit(20, 60))])
def update_chat(
    chat_id: str,
    payload: UpdateChatRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Update group chat name / description. Requires admin or owner role."""
    role = _get_member_role(db, chat_id, current.user_id)
    if not role:
        raise HTTPException(status_code=403, detail="Not a member of this chat")
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only admins and owner can update the chat")

    chat_row = db.execute(
        text('SELECT "type" FROM "CommunityChat" WHERE "id" = :id'),
        {"id": chat_id},
    ).mappings().first()
    if not chat_row:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat_row["type"] != "group":
        raise HTTPException(status_code=400, detail="Cannot update a direct message chat")

    updates: dict = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.description is not None:
        updates["description"] = payload.description

    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    set_clause = ", ".join(f'"{k}" = :{k}' for k in updates)
    updates["id"] = chat_id
    updates["now"] = _now()
    db.execute(
        text(f'UPDATE "CommunityChat" SET {set_clause}, "updatedAt" = :now WHERE "id" = :id'),
        updates,
    )
    db.commit()

    row = db.execute(
        text('SELECT * FROM "CommunityChat" WHERE "id" = :id'),
        {"id": chat_id},
    ).mappings().first()
    return _format_chat(db, dict(row), current.user_id)


# ─── Participant management ────────────────────────────────────────────────────

@router.get("/chats/{chat_id}/participants")
def list_participants(
    chat_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """List all participants of a chat. Requires membership."""
    role = _get_member_role(db, chat_id, current.user_id)
    if not role:
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    rows = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."avatarUrl",
                   mb."role", mb."isAnonymous", mb."joinedAt"
            FROM "CommunityChatMember" mb
            JOIN "CommunityUser" u ON u."id" = mb."userId"
            WHERE mb."chatId" = :cid
            ORDER BY mb."joinedAt"
            """
        ),
        {"cid": chat_id},
    ).mappings().all()

    return [
        {
            "id": r["id"],
            "firstName": r["firstName"],
            "lastName": r["lastName"],
            "avatarUrl": r["avatarUrl"],
            "role": r.get("role") or "member",
            "isAnonymous": bool(r.get("isAnonymous", False)),
            "joinedAt": _isoformat_utc(r.get("joinedAt")),
        }
        for r in rows
    ]


class AddParticipantRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=100)


@router.post("/chats/{chat_id}/participants", dependencies=[Depends(limit(20, 60))])
def add_participant(
    chat_id: str,
    payload: AddParticipantRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Add a new participant. Requires admin or owner role."""
    my_role = _get_member_role(db, chat_id, current.user_id)
    if not my_role:
        raise HTTPException(status_code=403, detail="Not a member of this chat")
    if my_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only admins and owner can add participants")

    chat_row = db.execute(
        text('SELECT "type" FROM "CommunityChat" WHERE "id" = :id'),
        {"id": chat_id},
    ).mappings().first()
    if not chat_row:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat_row["type"] != "group":
        raise HTTPException(status_code=400, detail="Cannot add participants to a direct message chat")

    target = db.execute(
        text('SELECT "id" FROM "CommunityUser" WHERE "id" = :id'),
        {"id": payload.user_id},
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    already = _get_member_role(db, chat_id, payload.user_id)
    if already:
        raise HTTPException(status_code=409, detail="User is already a participant")

    now = _now()
    db.execute(
        text(
            'INSERT INTO "CommunityChatMember" ("chatId", "userId", "role", "joinedAt") '
            "VALUES (:cid, :uid, 'member', :now)"
        ),
        {"cid": chat_id, "uid": payload.user_id, "now": now},
    )
    db.commit()
    return {"chatId": chat_id, "userId": payload.user_id, "role": "member"}


class UpdateParticipantRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$")


@router.patch("/chats/{chat_id}/participants/{user_id}", dependencies=[Depends(limit(20, 60))])
def update_participant_role(
    chat_id: str,
    user_id: str,
    payload: UpdateParticipantRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Change a participant's role. Only the owner may do this."""
    my_role = _get_member_role(db, chat_id, current.user_id)
    if my_role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can change roles")

    target_role = _get_member_role(db, chat_id, user_id)
    if not target_role:
        raise HTTPException(status_code=404, detail="User is not a participant of this chat")
    if target_role == "owner":
        raise HTTPException(status_code=400, detail="Cannot change the owner's role")
    if user_id == current.user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    db.execute(
        text('UPDATE "CommunityChatMember" SET "role" = :role WHERE "chatId" = :cid AND "userId" = :uid'),
        {"role": payload.role, "cid": chat_id, "uid": user_id},
    )
    db.commit()
    return {"chatId": chat_id, "userId": user_id, "role": payload.role}


@router.delete("/chats/{chat_id}/participants/{user_id}", dependencies=[Depends(limit(20, 60))])
def remove_participant(
    chat_id: str,
    user_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Remove a participant from the chat.

    - Owner can remove any non-owner.
    - Admin can remove members.
    - A member can remove themselves (leave).
    """
    my_role = _get_member_role(db, chat_id, current.user_id)
    if not my_role:
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    target_role = _get_member_role(db, chat_id, user_id)
    if not target_role:
        raise HTTPException(status_code=404, detail="User is not a participant of this chat")

    is_self = user_id == current.user_id

    if target_role == "owner" and not is_self:
        raise HTTPException(status_code=400, detail="Cannot remove the owner. Transfer ownership first.")

    if not is_self:
        if my_role == "member":
            raise HTTPException(status_code=403, detail="Only admins and owner can remove other participants")
        if my_role == "admin" and target_role in ("admin", "owner"):
            raise HTTPException(status_code=403, detail="Admins cannot remove other admins or the owner")

    db.execute(
        text('DELETE FROM "CommunityChatMember" WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": user_id},
    )
    db.commit()
    return {"chatId": chat_id, "userId": user_id, "removed": True}


# ─── Moderation ────────────────────────────────────────────────────────────────

class ReportMessageRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


@router.post("/messages/{message_id}/report", dependencies=[Depends(limit(10, 60))])
def report_message(
    message_id: str,
    payload: ReportMessageRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Report a message. Persisted to CommunityMessageReport for moderation review."""
    row = db.execute(
        text('SELECT "chatId", "authorId" FROM "CommunityChatMessage" WHERE "id" = :id'),
        {"id": message_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Message not found")

    if not _get_member_role(db, row["chatId"], current.user_id):
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    if row["authorId"] == current.user_id:
        raise HTTPException(status_code=400, detail="Cannot report your own message")

    report_id = f"r-{token_hex(10)}"
    try:
        db.execute(
            text(
                'INSERT INTO "CommunityMessageReport" '
                '("id", "messageId", "reporterId", "reason", "status", "createdAt") '
                "VALUES (:id, :mid, :reporter, :reason, 'pending', :now)"
            ),
            {
                "id": report_id,
                "mid": message_id,
                "reporter": current.user_id,
                "reason": payload.reason[:500],
                "now": _now(),
            },
        )
        db.commit()
    except Exception:
        # Duplicate report (unique constraint) — silently ignore
        db.rollback()

    logger.warning(
        "MESSAGE_REPORT report=%s chat=%s message=%s reporter=%s",
        report_id,
        row["chatId"],
        message_id,
        current.user_id,
    )
    return {"reported": True}


# ─── Block / unblock users ─────────────────────────────────────────────────────

@router.post("/users/{user_id}/block", dependencies=[Depends(limit(20, 60))])
def block_user(
    user_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Block another community user. Prevents them from initiating DMs with you."""
    if user_id == current.user_id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    target = db.execute(
        text('SELECT "id" FROM "CommunityUser" WHERE "id" = :id'),
        {"id": user_id},
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    db.execute(
        text(
            'INSERT INTO "CommunityBlockedUser" ("blockerId", "blockedId", "createdAt") '
            "VALUES (:blocker, :blocked, :now) ON CONFLICT DO NOTHING"
        ),
        {"blocker": current.user_id, "blocked": user_id, "now": _now()},
    )
    db.commit()
    return {"blocked": True, "userId": user_id}


@router.delete("/users/{user_id}/block", dependencies=[Depends(limit(20, 60))])
def unblock_user(
    user_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Remove a block on another user."""
    db.execute(
        text(
            'DELETE FROM "CommunityBlockedUser" '
            'WHERE "blockerId" = :blocker AND "blockedId" = :blocked'
        ),
        {"blocker": current.user_id, "blocked": user_id},
    )
    db.commit()
    return {"unblocked": True, "userId": user_id}


@router.get("/users/blocked")
def list_blocked_users(
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Return the list of users blocked by the current user."""
    rows = db.execute(
        text(
            """
            SELECT u."id", u."firstName", u."lastName", u."avatarUrl",
                   b."createdAt" AS "blockedAt"
            FROM "CommunityBlockedUser" b
            JOIN "CommunityUser" u ON u."id" = b."blockedId"
            WHERE b."blockerId" = :uid
            ORDER BY b."createdAt" DESC
            """
        ),
        {"uid": current.user_id},
    ).mappings().all()

    return [
        {
            "id": r["id"],
            "firstName": r["firstName"],
            "lastName": r["lastName"],
            "avatarUrl": r["avatarUrl"],
            "blockedAt": _isoformat_utc(r.get("blockedAt")),
        }
        for r in rows
    ]


def _is_blocked(db: Session, user_a: str, user_b: str) -> bool:
    """Return True if either user has blocked the other."""
    row = db.execute(
        text(
            """
            SELECT 1 FROM "CommunityBlockedUser"
            WHERE ("blockerId" = :a AND "blockedId" = :b)
               OR ("blockerId" = :b AND "blockedId" = :a)
            LIMIT 1
            """
        ),
        {"a": user_a, "b": user_b},
    ).first()
    return row is not None


# ─── Mute / unmute chats ──────────────────────────────────────────────────────

class MuteChatRequest(BaseModel):
    mute_until: Optional[str] = Field(
        None,
        description="ISO-8601 datetime to mute until. Omit for indefinite mute.",
    )


@router.post("/chats/{chat_id}/mute", dependencies=[Depends(limit(20, 60))])
def mute_chat(
    chat_id: str,
    payload: MuteChatRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Mute notifications for a chat. Does not prevent reading or sending messages."""
    if not _get_member_role(db, chat_id, current.user_id):
        raise HTTPException(status_code=403, detail="Not a member of this chat")

    mute_until = None
    if payload.mute_until:
        from datetime import datetime
        try:
            mute_until = datetime.fromisoformat(payload.mute_until.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid mute_until datetime format")

    db.execute(
        text(
            'INSERT INTO "CommunityChatMuted" ("chatId", "userId", "mutedUntil", "createdAt") '
            "VALUES (:cid, :uid, :until, :now) "
            'ON CONFLICT ("chatId", "userId") DO UPDATE SET "mutedUntil" = EXCLUDED."mutedUntil"'
        ),
        {"cid": chat_id, "uid": current.user_id, "until": mute_until, "now": _now()},
    )
    db.commit()
    return {"muted": True, "chatId": chat_id, "mutedUntil": payload.mute_until}


@router.delete("/chats/{chat_id}/mute", dependencies=[Depends(limit(20, 60))])
def unmute_chat(
    chat_id: str,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Re-enable notifications for a previously muted chat."""
    db.execute(
        text(
            'DELETE FROM "CommunityChatMuted" WHERE "chatId" = :cid AND "userId" = :uid'
        ),
        {"cid": chat_id, "uid": current.user_id},
    )
    db.commit()
    return {"muted": False, "chatId": chat_id}


# ─── Transfer ownership ────────────────────────────────────────────────────────

class TransferOwnershipRequest(BaseModel):
    new_owner_id: str = Field(..., min_length=1, max_length=100)


@router.post("/chats/{chat_id}/transfer-ownership", dependencies=[Depends(limit(5, 60))])
def transfer_ownership(
    chat_id: str,
    payload: TransferOwnershipRequest,
    current: CommCurrentUser = Depends(get_community_user),
    db: Session = Depends(get_db),
):
    """Transfer group ownership to another member. Only the current owner can do this."""
    my_role = _get_member_role(db, chat_id, current.user_id)
    if my_role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can transfer ownership")

    if payload.new_owner_id == current.user_id:
        raise HTTPException(status_code=400, detail="You are already the owner")

    new_owner_role = _get_member_role(db, chat_id, payload.new_owner_id)
    if not new_owner_role:
        raise HTTPException(status_code=404, detail="New owner is not a participant of this chat")

    # Demote current owner → member, promote new owner → owner
    db.execute(
        text('UPDATE "CommunityChatMember" SET "role" = \'member\' WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": current.user_id},
    )
    db.execute(
        text('UPDATE "CommunityChatMember" SET "role" = \'owner\' WHERE "chatId" = :cid AND "userId" = :uid'),
        {"cid": chat_id, "uid": payload.new_owner_id},
    )
    db.execute(
        text('UPDATE "CommunityChat" SET "ownerId" = :uid WHERE "id" = :cid'),
        {"uid": payload.new_owner_id, "cid": chat_id},
    )
    db.commit()

    logger.info(
        "OWNERSHIP_TRANSFER chat=%s from=%s to=%s",
        chat_id,
        current.user_id,
        payload.new_owner_id,
    )
    return {"chatId": chat_id, "newOwnerId": payload.new_owner_id}
