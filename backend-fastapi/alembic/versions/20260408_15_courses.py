"""create Course and CourseLesson tables

Revision ID: 20260408_15
Revises: 20260408_14
Create Date: 2026-04-08
"""

from alembic import op

revision = "20260408_15"
down_revision = "20260408_14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS "Course" (
            "id"            TEXT PRIMARY KEY,
            "titleRu"       TEXT NOT NULL DEFAULT '',
            "titleEn"       TEXT NOT NULL DEFAULT '',
            "descriptionRu" TEXT NOT NULL DEFAULT '',
            "descriptionEn" TEXT NOT NULL DEFAULT '',
            "coverUrl"      TEXT NOT NULL DEFAULT '',
            "sortOrder"     INTEGER NOT NULL DEFAULT 0,
            "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS "CourseLesson" (
            "id"        TEXT PRIMARY KEY,
            "courseId"   TEXT NOT NULL REFERENCES "Course"("id") ON DELETE CASCADE,
            "lessonId"  TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            UNIQUE ("courseId", "lessonId")
        )
    """)
    op.execute('CREATE INDEX IF NOT EXISTS "idx_course_lesson_course" ON "CourseLesson" ("courseId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_course_lesson_lesson" ON "CourseLesson" ("lessonId")')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "CourseLesson"')
    op.execute('DROP TABLE IF EXISTS "Course"')
