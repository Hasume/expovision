"""student certificate and final section unlock

Revision ID: 20260404_07
Revises: 20260404_06
Create Date: 2026-04-04
"""

from alembic import op

revision = "20260404_07"
down_revision = "20260404_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "StudentCertificate" (
            "id"                TEXT PRIMARY KEY,
            "userId"            TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
            "certificatePdfUrl" TEXT,
            "cardConfirmed"     BOOLEAN NOT NULL DEFAULT false,
            "finalUnlocked"     BOOLEAN NOT NULL DEFAULT false,
            "unlockedAt"        TIMESTAMP,
            "unlockedByUserId"  TEXT REFERENCES "User"("id"),
            "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt"         TIMESTAMP NOT NULL DEFAULT now(),
            UNIQUE ("userId")
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_student_certificate_user" ON "StudentCertificate" ("userId")'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "StudentCertificate"')
