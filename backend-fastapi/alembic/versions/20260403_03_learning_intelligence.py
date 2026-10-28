"""learning intelligence: evidence, mastery, experiments

Revision ID: 20260403_03
Revises: 20260403_02
Create Date: 2026-04-03
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260403_03"
down_revision = "20260403_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "HomeworkSubmission" ADD COLUMN IF NOT EXISTS "reflectionText" TEXT NULL')
    op.execute('ALTER TABLE "HomeworkSubmission" ADD COLUMN IF NOT EXISTS "aiUsageDisclosure" TEXT NULL')
    op.execute('ALTER TABLE "HomeworkSubmission" ADD COLUMN IF NOT EXISTS "aiIntegrityRiskScore" INTEGER NULL')
    op.execute('ALTER TABLE "HomeworkSubmission" ADD COLUMN IF NOT EXISTS "aiIntegrityFlagsJson" TEXT NOT NULL DEFAULT \'[]\'')

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "Competency" (
          "id" TEXT PRIMARY KEY,
          "code" TEXT NOT NULL UNIQUE,
          "titleRu" TEXT NOT NULL,
          "titleEn" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "LessonCompetency" (
          "id" TEXT PRIMARY KEY,
          "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
          "competencyId" TEXT NOT NULL REFERENCES "Competency"("id") ON DELETE CASCADE,
          "weight" NUMERIC(6,3) NOT NULL DEFAULT 1.0,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_lesson_competency" ON "LessonCompetency" ("lessonId", "competencyId")')

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "UserMastery" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "competencyId" TEXT NOT NULL REFERENCES "Competency"("id") ON DELETE CASCADE,
          "score" NUMERIC(5,2) NOT NULL DEFAULT 0,
          "confidence" NUMERIC(4,3) NOT NULL DEFAULT 0.1,
          "evidenceCount" INTEGER NOT NULL DEFAULT 0,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_user_mastery" ON "UserMastery" ("userId", "competencyId")')
    op.execute('CREATE INDEX IF NOT EXISTS "ix_user_mastery_user_score" ON "UserMastery" ("userId", "score")')

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ContentVersion" (
          "id" TEXT PRIMARY KEY,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          "versionNumber" INTEGER NOT NULL,
          "snapshotJson" TEXT NOT NULL,
          "changeNote" TEXT NULL,
          "createdByUserId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_content_version_entity_num" ON "ContentVersion" ("entityType", "entityId", "versionNumber")')

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "Experiment" (
          "id" TEXT PRIMARY KEY,
          "code" TEXT NOT NULL UNIQUE,
          "title" TEXT NOT NULL,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          "variantAJson" TEXT NOT NULL,
          "variantBJson" TEXT NOT NULL,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdByUserId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ExperimentAssignment" (
          "id" TEXT PRIMARY KEY,
          "experimentId" TEXT NOT NULL REFERENCES "Experiment"("id") ON DELETE CASCADE,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "variant" TEXT NOT NULL,
          "assignedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_experiment_assignment_user" ON "ExperimentAssignment" ("experimentId", "userId")')

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ExperimentOutcome" (
          "id" TEXT PRIMARY KEY,
          "experimentId" TEXT NOT NULL REFERENCES "Experiment"("id") ON DELETE CASCADE,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "metricKey" TEXT NOT NULL,
          "metricValue" NUMERIC(10,4) NOT NULL,
          "metaJson" TEXT NOT NULL DEFAULT '{}',
          "recordedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "ix_experiment_outcome_exp_metric" ON "ExperimentOutcome" ("experimentId", "metricKey")')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ix_experiment_outcome_exp_metric"')
    op.execute('DROP TABLE IF EXISTS "ExperimentOutcome"')
    op.execute('DROP INDEX IF EXISTS "ux_experiment_assignment_user"')
    op.execute('DROP TABLE IF EXISTS "ExperimentAssignment"')
    op.execute('DROP TABLE IF EXISTS "Experiment"')
    op.execute('DROP INDEX IF EXISTS "ux_content_version_entity_num"')
    op.execute('DROP TABLE IF EXISTS "ContentVersion"')
    op.execute('DROP INDEX IF EXISTS "ix_user_mastery_user_score"')
    op.execute('DROP INDEX IF EXISTS "ux_user_mastery"')
    op.execute('DROP TABLE IF EXISTS "UserMastery"')
    op.execute('DROP INDEX IF EXISTS "ux_lesson_competency"')
    op.execute('DROP TABLE IF EXISTS "LessonCompetency"')
    op.execute('DROP TABLE IF EXISTS "Competency"')

    op.execute('ALTER TABLE "HomeworkSubmission" DROP COLUMN IF EXISTS "aiIntegrityFlagsJson"')
    op.execute('ALTER TABLE "HomeworkSubmission" DROP COLUMN IF EXISTS "aiIntegrityRiskScore"')
    op.execute('ALTER TABLE "HomeworkSubmission" DROP COLUMN IF EXISTS "aiUsageDisclosure"')
    op.execute('ALTER TABLE "HomeworkSubmission" DROP COLUMN IF EXISTS "reflectionText"')
