"""add kinescopeVideoId column to Lesson

Revision ID: 20260408_14
Revises: 20260406_13
Create Date: 2026-04-08
"""

from alembic import op

revision = "20260408_14"
down_revision = "20260406_13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "kinescopeVideoId" TEXT DEFAULT NULL')


def downgrade() -> None:
    op.execute('ALTER TABLE "Lesson" DROP COLUMN IF EXISTS "kinescopeVideoId"')
