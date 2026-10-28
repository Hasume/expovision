"""add missing onboarding answer columns on User

Revision ID: 20260406_13
Revises: 20260404_12
Create Date: 2026-04-06
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260406_13"
down_revision = "20260404_12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "levelAnswer" TEXT NULL')
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "interestAnswer" TEXT NULL')
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timeAnswer" TEXT NULL')
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "goalAnswer" TEXT NULL')
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "experienceAnswer" TEXT NULL')


def downgrade() -> None:
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "experienceAnswer"')
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "goalAnswer"')
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "timeAnswer"')
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "interestAnswer"')
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "levelAnswer"')

