"""Add missing performance indexes for FK columns and common query patterns.

Covers:
- Artifact(curriculumDayId) — JOIN from CurriculumDay
- Webinar(curriculumDayId)  — JOIN from CurriculumDay
- HomeworkTemplate(curriculumDayId) — JOIN from CurriculumDay
- LessonImage(lessonId)     — lookup by lesson
- LessonCompletion(userId)  — aggregate counts in admin
- Notification(userId)      — user notification queries
- LessonProgress(userId, status) — dashboard completion aggregates

Revision ID: 20260418_18
Revises: 20260408_17
Create Date: 2026-04-18
"""

from alembic import op

revision = "20260418_18"
down_revision = "20260408_17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No CONCURRENTLY: Alembic wraps migrations in a transaction; Postgres rejects it.
    op.execute('CREATE INDEX IF NOT EXISTS "idx_artifact_curriculum_day" ON "Artifact" ("curriculumDayId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_webinar_curriculum_day" ON "Webinar" ("curriculumDayId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_homework_template_curriculum_day" ON "HomeworkTemplate" ("curriculumDayId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_lesson_image_lesson" ON "LessonImage" ("lessonId")')
    # Legacy admin table; absent on some databases (skipped bootstrap / pre–20260402_00 installs).
    op.execute(
        """
        DO $body$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema()
              AND c.relkind = 'r'
              AND c.relname = 'LessonCompletion'
          ) THEN
            EXECUTE $stmt$
              CREATE INDEX IF NOT EXISTS "idx_lesson_completion_user" ON "LessonCompletion" ("userId")
            $stmt$;
          END IF;
        END
        $body$;
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_notification_user" ON "Notification" ("userId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_lesson_progress_user_status" ON "LessonProgress" ("userId", "status")')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_artifact_curriculum_day"')
    op.execute('DROP INDEX IF EXISTS "idx_webinar_curriculum_day"')
    op.execute('DROP INDEX IF EXISTS "idx_homework_template_curriculum_day"')
    op.execute('DROP INDEX IF EXISTS "idx_lesson_image_lesson"')
    op.execute('DROP INDEX IF EXISTS "idx_lesson_completion_user"')
    op.execute('DROP INDEX IF EXISTS "idx_notification_user"')
    op.execute('DROP INDEX IF EXISTS "idx_lesson_progress_user_status"')
