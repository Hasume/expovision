"""make Lesson.curriculumDayId nullable so lessons can live in courses without a day

Revision ID: 20260408_16
Revises: 20260408_15
Create Date: 2026-04-08
"""

from alembic import op

revision = "20260408_16"
down_revision = "20260408_15"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "Lesson" ALTER COLUMN "curriculumDayId" DROP NOT NULL')


def downgrade() -> None:
    op.execute('UPDATE "Lesson" SET "curriculumDayId" = (SELECT "id" FROM "CurriculumDay" LIMIT 1) WHERE "curriculumDayId" IS NULL')
    op.execute('ALTER TABLE "Lesson" ALTER COLUMN "curriculumDayId" SET NOT NULL')
