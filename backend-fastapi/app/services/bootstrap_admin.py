from __future__ import annotations

from datetime import datetime, timezone
from secrets import token_hex

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password


def ensure_admin_user(db: Session) -> None:
    admin_email = settings.admin_email.strip().lower()
    admin_password = settings.admin_password
    if not admin_email or not admin_password:
        return

    now = datetime.now(timezone.utc)
    existing = db.execute(
        text('SELECT "id", "role" FROM "User" WHERE LOWER("email") = :email LIMIT 1'),
        {"email": admin_email},
    ).mappings().first()

    if existing:
        if existing["role"] != "admin":
            db.execute(
                text('UPDATE "User" SET "role" = :role, "updatedAt" = :updated_at WHERE "id" = :id'),
                {"role": "admin", "updated_at": now, "id": existing["id"]},
            )
            db.commit()
        return

    db.execute(
        text(
            """
            INSERT INTO "User" (
                "id", "firstName", "lastName", "email", "passwordHash", "role",
                "language", "timezone", "reportCompleted", "onboardingDone",
                "createdAt", "updatedAt"
            )
            VALUES (
                :id, :first_name, :last_name, :email, :password_hash, 'admin',
                'ru', 'UTC', true, true,
                :created_at, :updated_at
            )
            """
        ),
        {
            "id": token_hex(16),
            "first_name": "Platform",
            "last_name": "Admin",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "created_at": now,
            "updated_at": now,
        },
    )
    db.commit()
