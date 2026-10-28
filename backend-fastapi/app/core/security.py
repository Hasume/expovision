from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_hex
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def sha256_hex(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def create_session_id() -> str:
    return token_hex(16)


def create_access_token(subject: str, role: str, session_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_exp_minutes)
    payload: dict[str, Any] = {"sub": subject, "role": role, "sid": session_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_access_secret, algorithm="HS256")


def create_refresh_token(subject: str, role: str, session_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_exp_days)
    payload: dict[str, Any] = {"sub": subject, "role": role, "sid": session_id, "type": "refresh", "exp": expire}
    return jwt.encode(payload, settings.jwt_refresh_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_access_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Invalid access token") from exc


def decode_refresh_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise ValueError("Invalid refresh token") from exc
    if payload.get("type") != "refresh":
        raise ValueError("Invalid refresh token type")
    return payload
