"""persist lesson ai and homework draft states

Revision ID: 20260404_01
Revises: 20260403_03
Create Date: 2026-04-04
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260404_01"
down_revision = "20260403_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "LessonAiFluencyState" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
          "framework" TEXT NOT NULL DEFAULT '4D',
          "delegationJson" TEXT NOT NULL DEFAULT '[]',
          "descriptionJson" TEXT NOT NULL DEFAULT '[]',
          "discernmentJson" TEXT NOT NULL DEFAULT '[]',
          "diligenceJson" TEXT NOT NULL DEFAULT '[]',
          "practiceTask" TEXT NOT NULL DEFAULT '',
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ux_lesson_ai_fluency_state_user_lesson" '
        'ON "LessonAiFluencyState" ("userId", "lessonId")'
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "HomeworkDraftState" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "dayNumber" INTEGER NOT NULL,
          "answerText" TEXT NOT NULL DEFAULT '',
          "reflectionText" TEXT NOT NULL DEFAULT '',
          "aiUsageDisclosure" TEXT NOT NULL DEFAULT '',
          "coachJson" TEXT NULL,
          "evidenceJson" TEXT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ux_homework_draft_state_user_day" '
        'ON "HomeworkDraftState" ("userId", "dayNumber")'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ux_homework_draft_state_user_day"')
    op.execute('DROP TABLE IF EXISTS "HomeworkDraftState"')
    op.execute('DROP INDEX IF EXISTS "ux_lesson_ai_fluency_state_user_lesson"')
    op.execute('DROP TABLE IF EXISTS "LessonAiFluencyState"')
