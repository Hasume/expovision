"""community materials table

Revision ID: 20260503_05
Revises: 20260503_04
Create Date: 2026-05-03
"""

from alembic import op
import sqlalchemy as sa

revision = "20260503_05"
down_revision = "20260503_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityMaterial" (
            "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
            "title"       TEXT        NOT NULL,
            "type"        TEXT        NOT NULL DEFAULT 'link',
            "description" TEXT        NOT NULL DEFAULT '',
            "url"         TEXT        NOT NULL DEFAULT '',
            "locked"      BOOLEAN     NOT NULL DEFAULT FALSE,
            "sortOrder"   INTEGER     NOT NULL DEFAULT 0,
            "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
            "updatedAt"   TIMESTAMP   NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS idx_community_material_sort ON "CommunityMaterial" ("sortOrder", "createdAt" DESC)')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "CommunityMaterial"')
