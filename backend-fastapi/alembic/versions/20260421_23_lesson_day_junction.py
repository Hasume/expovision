"""Add LessonDay junction table for many-to-many lesson-day assignment."""

from alembic import op

revision = "20260421_23"
down_revision = "20260421_22"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "LessonDay" (
            "id"              TEXT NOT NULL PRIMARY KEY,
            "lessonId"        TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
            "curriculumDayId" TEXT NOT NULL REFERENCES "CurriculumDay"("id") ON DELETE CASCADE,
            "kind"            TEXT NOT NULL DEFAULT 'mandatory',
            "sortOrder"       INTEGER NOT NULL DEFAULT 1,
            CONSTRAINT "uq_lesson_day" UNIQUE ("lessonId", "curriculumDayId")
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_lesson_day_day_sort" ON "LessonDay" ("curriculumDayId", "sortOrder")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_lesson_day_lesson" ON "LessonDay" ("lessonId")'
    )

    # Migrate existing one-to-one assignments into the junction table.
    op.execute(
        """
        INSERT INTO "LessonDay" ("id", "lessonId", "curriculumDayId", "kind", "sortOrder")
        SELECT 'ld-' || "id", "id", "curriculumDayId", "kind", "sortOrder"
        FROM "Lesson"
        WHERE "curriculumDayId" IS NOT NULL
        ON CONFLICT DO NOTHING
        """
    )

    # Drop the FK column that prevented multi-day assignment.
    op.execute('ALTER TABLE "Lesson" DROP COLUMN IF EXISTS "curriculumDayId"')


def downgrade() -> None:
    op.execute(
        'ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "curriculumDayId" TEXT REFERENCES "CurriculumDay"("id") ON DELETE CASCADE'
    )
    # Restore the first assignment (lowest sortOrder) for each lesson.
    op.execute(
        """
        UPDATE "Lesson" l
        SET "curriculumDayId" = (
            SELECT ld."curriculumDayId"
            FROM "LessonDay" ld
            WHERE ld."lessonId" = l."id"
            ORDER BY ld."sortOrder" ASC
            LIMIT 1
        )
        """
    )
    op.execute('DROP INDEX IF EXISTS "idx_lesson_day_lesson"')
    op.execute('DROP INDEX IF EXISTS "idx_lesson_day_day_sort"')
    op.execute('DROP TABLE IF EXISTS "LessonDay"')
