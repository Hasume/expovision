"""Webinar: nullable curriculumDayId, kinescopeVideoId, thumbnailUrl columns."""

from alembic import op

revision = "20260422_24"
down_revision = "20260422_23"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "Webinar" ALTER COLUMN "curriculumDayId" DROP NOT NULL')
    op.execute('ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "kinescopeVideoId" TEXT NULL')
    op.execute("ALTER TABLE \"Webinar\" ADD COLUMN IF NOT EXISTS \"thumbnailUrl\" TEXT NOT NULL DEFAULT ''")


def downgrade() -> None:
    op.execute('ALTER TABLE "Webinar" DROP COLUMN IF EXISTS "thumbnailUrl"')
    op.execute('ALTER TABLE "Webinar" DROP COLUMN IF EXISTS "kinescopeVideoId"')
    # Re-adding NOT NULL requires all rows to have curriculumDayId; safe only on clean state
    op.execute('ALTER TABLE "Webinar" ALTER COLUMN "curriculumDayId" SET NOT NULL')
