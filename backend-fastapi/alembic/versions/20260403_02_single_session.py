"""single active session per user

Revision ID: 20260403_02
Revises: 20260403_01
Create Date: 2026-04-03
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260403_02"
down_revision = "20260403_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentSessionId" TEXT NULL')
    op.execute('CREATE INDEX IF NOT EXISTS "ix_User_currentSessionId" ON "User" ("currentSessionId")')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ix_User_currentSessionId"')
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "currentSessionId"')
