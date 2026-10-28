"""Performance indexes: HomeworkTemplate.lessonId, IntensiveFlowMember(flowId,isActive), HomeworkSubmission partial, Lesson.kinescopeVideoId."""

from alembic import op

revision = "20260421_25"
down_revision = "20260421_24"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No CONCURRENTLY: Alembic wraps migrations in a transaction.
    op.execute('CREATE INDEX IF NOT EXISTS "ix_HomeworkTemplate_lessonId" ON "HomeworkTemplate" ("lessonId")')
    op.execute('CREATE INDEX IF NOT EXISTS "ix_IntensiveFlowMember_flowId_isActive" ON "IntensiveFlowMember" ("flowId", "isActive")')
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_HomeworkSubmission_status_pending"
        ON "HomeworkSubmission" ("status", "reviewedAt")
        WHERE "reviewedAt" IS NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_Lesson_kinescopeVideoId"
        ON "Lesson" ("kinescopeVideoId")
        WHERE "kinescopeVideoId" IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ix_HomeworkTemplate_lessonId"')
    op.execute('DROP INDEX IF EXISTS "ix_IntensiveFlowMember_flowId_isActive"')
    op.execute('DROP INDEX IF EXISTS "ix_HomeworkSubmission_status_pending"')
    op.execute('DROP INDEX IF EXISTS "ix_Lesson_kinescopeVideoId"')
