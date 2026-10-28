"""Webinar: add kinescopeEventId and webinarStatus columns for live event management."""

from alembic import op

revision = "20260422_27"
down_revision = "20260422_26"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "kinescopeEventId" TEXT NULL')
    op.execute('ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "webinarStatus" TEXT NULL')


def downgrade() -> None:
    op.execute('ALTER TABLE "Webinar" DROP COLUMN IF EXISTS "webinarStatus"')
    op.execute('ALTER TABLE "Webinar" DROP COLUMN IF EXISTS "kinescopeEventId"')
