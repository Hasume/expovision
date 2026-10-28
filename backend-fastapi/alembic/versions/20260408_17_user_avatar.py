"""add avatarUrl column to User table

Revision ID: 20260408_17
Revises: 20260408_16
Create Date: 2026-04-08
"""

from alembic import op

revision = "20260408_17"
down_revision = "20260408_16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT NULL')


def downgrade() -> None:
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarUrl"')
