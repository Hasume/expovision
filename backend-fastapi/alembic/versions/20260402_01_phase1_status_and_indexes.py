"""phase1 status enums indexes ai tables

Revision ID: 20260402_01
Revises:
Create Date: 2026-04-02
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260402_01"
down_revision = "20260402_00"
branch_labels = None
depends_on = None


def _create_enum_if_missing(sql_enum_body: str) -> None:
    # PostgreSQL before 15 does not support CREATE TYPE IF NOT EXISTS for ENUM types.
    op.execute(
        f"""
        DO $$ BEGIN
            {sql_enum_body};
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )


def upgrade() -> None:
    _create_enum_if_missing(
        'CREATE TYPE "ContentStatus" AS ENUM (\'draft\', \'review\', \'published\', \'archived\')'
    )
    _create_enum_if_missing(
        'CREATE TYPE "MediaStatus" AS ENUM (\'uploading\', \'ready\', \'failed\', \'archived\')'
    )
    _create_enum_if_missing(
        'CREATE TYPE "LicenseStatus" AS ENUM ('
        "'new', 'assigned', 'activated', 'revoked', 'expired')"
    )
    _create_enum_if_missing(
        'CREATE TYPE "NotificationStatus" AS ENUM (\'scheduled\', \'sent\', \'failed\', \'cancelled\')'
    )
    _create_enum_if_missing(
        'CREATE TYPE "AiJobStatus" AS ENUM (\'queued\', \'running\', \'completed\', \'failed\', \'cancelled\')'
    )

    op.execute('ALTER TABLE "LicenseToken" ADD COLUMN IF NOT EXISTS "status" "LicenseStatus" NOT NULL DEFAULT \'new\'')
    op.execute('ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "statusV2" "NotificationStatus" NOT NULL DEFAULT \'scheduled\'')

    op.execute('ALTER TABLE "CurriculumDay" ADD COLUMN IF NOT EXISTS "contentStatus" "ContentStatus" NOT NULL DEFAULT \'published\'')
    op.execute('ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "contentStatus" "ContentStatus" NOT NULL DEFAULT \'published\'')
    op.execute('ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "contentStatus" "ContentStatus" NOT NULL DEFAULT \'published\'')
    op.execute('ALTER TABLE "Artifact" ADD COLUMN IF NOT EXISTS "contentStatus" "ContentStatus" NOT NULL DEFAULT \'published\'')
    op.execute('ALTER TABLE "HomeworkTemplate" ADD COLUMN IF NOT EXISTS "contentStatus" "ContentStatus" NOT NULL DEFAULT \'published\'')

    op.execute('ALTER TABLE "LessonImage" ADD COLUMN IF NOT EXISTS "mediaStatus" "MediaStatus" NOT NULL DEFAULT \'ready\'')
    op.execute('ALTER TABLE "LessonImage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP NULL')
    op.execute('ALTER TABLE "LessonImage" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT NULL')

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "AiIntegration" (
          "id" TEXT PRIMARY KEY,
          "provider" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "keyRef" TEXT NOT NULL,
          "isEnabled" BOOLEAN NOT NULL DEFAULT true,
          "status" "ContentStatus" NOT NULL DEFAULT 'published',
          "limitsJson" TEXT NOT NULL DEFAULT '{}',
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "AiJob" (
          "id" TEXT PRIMARY KEY,
          "integrationId" TEXT NOT NULL REFERENCES "AiIntegration"("id") ON DELETE CASCADE,
          "jobType" TEXT NOT NULL,
          "payloadJson" TEXT NOT NULL,
          "status" "AiJobStatus" NOT NULL DEFAULT 'queued',
          "resultJson" TEXT NULL,
          "errorText" TEXT NULL,
          "createdByUserId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute('CREATE INDEX IF NOT EXISTS "idx_hw_status_dueat" ON "HomeworkSubmission" ("status", "dueAt")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_lesson_day_kind_sort" ON "Lesson" ("curriculumDayId", "kind", "sortOrder")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_audit_created_admin_action" ON "AdminAuditLog" ("createdAt", "adminUserId", "action")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_license_status_used_issued" ON "LicenseToken" ("status", "usedByUserId", "issuedAt")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_aijob_status_created" ON "AiJob" ("status", "createdAt")')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_aijob_status_created"')
    op.execute('DROP INDEX IF EXISTS "idx_license_status_used_issued"')
    op.execute('DROP INDEX IF EXISTS "idx_audit_created_admin_action"')
    op.execute('DROP INDEX IF EXISTS "idx_lesson_day_kind_sort"')
    op.execute('DROP INDEX IF EXISTS "idx_hw_status_dueat"')
    op.execute('DROP TABLE IF EXISTS "AiJob"')
    op.execute('DROP TABLE IF EXISTS "AiIntegration"')
