"""bootstrap core schema tables before feature migrations

Revision ID: 20260402_00
Revises:
Create Date: 2026-04-06
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260402_00"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT PRIMARY KEY,
          "firstName" TEXT,
          "lastName" TEXT,
          "email" TEXT NOT NULL UNIQUE,
          "passwordHash" TEXT NOT NULL,
          "role" TEXT NOT NULL DEFAULT 'student',
          "language" TEXT NOT NULL DEFAULT 'ru',
          "timezone" TEXT NOT NULL DEFAULT 'UTC',
          "startedAt" TIMESTAMP NULL,
          "selectedTrack" TEXT NULL,
          "reportCompleted" BOOLEAN NOT NULL DEFAULT false,
          "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
          "onboardingProfile" TEXT NULL,
          "recommendedTrack" TEXT NULL,
          "passwordResetRequestedAt" TIMESTAMP NULL,
          "hashedRefreshToken" TEXT NULL,
          "refreshTokenExpiresAt" TIMESTAMP NULL,
          "currentSessionId" TEXT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "IntensiveConfig" (
          "id" SMALLINT PRIMARY KEY,
          "startAt" TIMESTAMP NULL,
          "isStarted" BOOLEAN NOT NULL DEFAULT false,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "LicenseToken" (
          "token" TEXT PRIMARY KEY,
          "intensiveStartAt" TIMESTAMP NOT NULL,
          "issuedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "usedByUserId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
          "usedAt" TIMESTAMP NULL
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "Notification" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "channel" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "body" TEXT NOT NULL,
          "scheduledFor" TIMESTAMP NOT NULL,
          "sentAt" TIMESTAMP NULL,
          "status" TEXT NOT NULL DEFAULT 'scheduled',
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CurriculumDay" (
          "id" TEXT PRIMARY KEY,
          "dayNumber" SMALLINT NOT NULL,
          "phase" TEXT NOT NULL DEFAULT 'core',
          "track" TEXT NULL,
          "focusRu" TEXT NOT NULL DEFAULT '',
          "focusEn" TEXT NOT NULL DEFAULT '',
          "messageRu" TEXT NOT NULL DEFAULT '',
          "messageEn" TEXT NOT NULL DEFAULT ''
        )
        """
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ux_curriculum_day_day_track" ON "CurriculumDay" ("dayNumber", "track")'
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "Lesson" (
          "id" TEXT PRIMARY KEY,
          "curriculumDayId" TEXT NOT NULL REFERENCES "CurriculumDay"("id") ON DELETE CASCADE,
          "kind" TEXT NOT NULL DEFAULT 'mandatory',
          "titleRu" TEXT NOT NULL DEFAULT '',
          "titleEn" TEXT NOT NULL DEFAULT '',
          "contentRu" TEXT NOT NULL DEFAULT '',
          "contentEn" TEXT NOT NULL DEFAULT '',
          "videoUrl" TEXT NOT NULL DEFAULT '',
          "sortOrder" INTEGER NOT NULL DEFAULT 1
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "Webinar" (
          "id" TEXT PRIMARY KEY,
          "curriculumDayId" TEXT NOT NULL REFERENCES "CurriculumDay"("id") ON DELETE CASCADE,
          "titleRu" TEXT NOT NULL DEFAULT '',
          "titleEn" TEXT NOT NULL DEFAULT '',
          "startsAtIso" TIMESTAMP NULL,
          "durationMinutes" INTEGER NOT NULL DEFAULT 60,
          "joinUrl" TEXT NOT NULL DEFAULT ''
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "Artifact" (
          "id" TEXT PRIMARY KEY,
          "curriculumDayId" TEXT NOT NULL REFERENCES "CurriculumDay"("id") ON DELETE CASCADE,
          "titleRu" TEXT NOT NULL DEFAULT '',
          "titleEn" TEXT NOT NULL DEFAULT '',
          "resourceUrl" TEXT NOT NULL DEFAULT ''
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "HomeworkTemplate" (
          "id" TEXT PRIMARY KEY,
          "curriculumDayId" TEXT NOT NULL REFERENCES "CurriculumDay"("id") ON DELETE CASCADE,
          "lessonId" TEXT NULL REFERENCES "Lesson"("id") ON DELETE SET NULL,
          "instructionRu" TEXT NOT NULL DEFAULT '',
          "instructionEn" TEXT NOT NULL DEFAULT '',
          "sampleRu" TEXT NOT NULL DEFAULT '',
          "sampleEn" TEXT NOT NULL DEFAULT '',
          "minLength" INTEGER NOT NULL DEFAULT 20,
          "dueHourOffset" INTEGER NOT NULL DEFAULT 24
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "LessonImage" (
          "id" TEXT PRIMARY KEY,
          "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
          "url" TEXT NOT NULL DEFAULT '',
          "captionRu" TEXT NOT NULL DEFAULT '',
          "captionEn" TEXT NOT NULL DEFAULT '',
          "sortOrder" INTEGER NOT NULL DEFAULT 1
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "LessonProgress" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
          "status" TEXT NOT NULL DEFAULT 'locked',
          "completedAt" TIMESTAMP NULL
        )
        """
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ux_lesson_progress_user_lesson" ON "LessonProgress" ("userId", "lessonId")'
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "HomeworkSubmission" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "templateId" TEXT NOT NULL REFERENCES "HomeworkTemplate"("id") ON DELETE CASCADE,
          "answerText" TEXT NOT NULL DEFAULT '',
          "isCompleted" BOOLEAN NOT NULL DEFAULT false,
          "status" TEXT NOT NULL DEFAULT 'pending_review',
          "dueAt" TIMESTAMP NULL,
          "reviewComment" TEXT NULL,
          "reviewedAt" TIMESTAMP NULL,
          "reviewedById" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
          "reflectionText" TEXT NULL,
          "aiUsageDisclosure" TEXT NULL,
          "aiIntegrityRiskScore" INTEGER NULL,
          "aiIntegrityFlagsJson" TEXT NOT NULL DEFAULT '[]',
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ux_homework_submission_user_template" ON "HomeworkSubmission" ("userId", "templateId")'
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "tokenHash" TEXT NOT NULL,
          "expiresAt" TIMESTAMP NOT NULL,
          "usedAt" TIMESTAMP NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_password_reset_token_hash" ON "PasswordResetToken" ("tokenHash")'
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
          "id" TEXT PRIMARY KEY,
          "adminUserId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
          "action" TEXT NOT NULL,
          "endpoint" TEXT NOT NULL,
          "method" TEXT NOT NULL,
          "payloadJson" TEXT NOT NULL DEFAULT '{}',
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )

    # Some admin leaderboard queries still use this legacy table name.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "LessonCompletion" (
          "id" TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "lessonId" TEXT NOT NULL REFERENCES "Lesson"("id") ON DELETE CASCADE,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "LessonCompletion"')
    op.execute('DROP TABLE IF EXISTS "AdminAuditLog"')
    op.execute('DROP INDEX IF EXISTS "idx_password_reset_token_hash"')
    op.execute('DROP TABLE IF EXISTS "PasswordResetToken"')
    op.execute('DROP INDEX IF EXISTS "ux_homework_submission_user_template"')
    op.execute('DROP TABLE IF EXISTS "HomeworkSubmission"')
    op.execute('DROP INDEX IF EXISTS "ux_lesson_progress_user_lesson"')
    op.execute('DROP TABLE IF EXISTS "LessonProgress"')
    op.execute('DROP TABLE IF EXISTS "LessonImage"')
    op.execute('DROP TABLE IF EXISTS "HomeworkTemplate"')
    op.execute('DROP TABLE IF EXISTS "Artifact"')
    op.execute('DROP TABLE IF EXISTS "Webinar"')
    op.execute('DROP TABLE IF EXISTS "Lesson"')
    op.execute('DROP INDEX IF EXISTS "ux_curriculum_day_day_track"')
    op.execute('DROP TABLE IF EXISTS "CurriculumDay"')
    op.execute('DROP TABLE IF EXISTS "Notification"')
    op.execute('DROP TABLE IF EXISTS "LicenseToken"')
    op.execute('DROP TABLE IF EXISTS "IntensiveConfig"')
    op.execute('DROP TABLE IF EXISTS "User"')
