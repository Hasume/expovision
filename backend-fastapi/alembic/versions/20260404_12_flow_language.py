"""add language column to IntensiveFlow

Revision ID: 20260404_12
Revises: 20260404_11
Create Date: 2026-04-04
"""

from alembic import op

revision = "20260404_12"
down_revision = "20260404_11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE "IntensiveFlow"
        ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'ru'
        """
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "IntensiveFlow" DROP COLUMN IF EXISTS "language"')
