"""intensive flows and memberships

Revision ID: 20260403_01
Revises: 20260402_01
Create Date: 2026-04-03
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260403_01"
down_revision = "20260402_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "IntensiveFlow" (
          "id" TEXT PRIMARY KEY,
          "code" TEXT NOT NULL UNIQUE,
          "titleRu" TEXT NOT NULL,
          "titleEn" TEXT NOT NULL,
          "descriptionRu" TEXT NULL,
          "descriptionEn" TEXT NULL,
          "startsAt" TIMESTAMP NOT NULL,
          "endsAt" TIMESTAMP NOT NULL,
          "timezone" TEXT NOT NULL DEFAULT 'UTC',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdByUserId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "IntensiveFlowMember" (
          "id" TEXT PRIMARY KEY,
          "flowId" TEXT NOT NULL REFERENCES "IntensiveFlow"("id") ON DELETE CASCADE,
          "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "roleInFlow" TEXT NOT NULL DEFAULT 'participant',
          "assignedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "assignedByUserId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "IntensiveFlowDay" (
          "id" TEXT PRIMARY KEY,
          "flowId" TEXT NOT NULL REFERENCES "IntensiveFlow"("id") ON DELETE CASCADE,
          "curriculumDayId" TEXT NOT NULL REFERENCES "CurriculumDay"("id") ON DELETE CASCADE,
          "unlockOffsetMinutes" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_IntensiveFlowMember_user_active" ON "IntensiveFlowMember" ("userId", "isActive")')
    op.execute('CREATE INDEX IF NOT EXISTS "ix_IntensiveFlowMember_flow" ON "IntensiveFlowMember" ("flowId")')
    op.execute('CREATE UNIQUE INDEX IF NOT EXISTS "ux_IntensiveFlowDay_flow_day" ON "IntensiveFlowDay" ("flowId", "curriculumDayId")')
    op.execute('CREATE INDEX IF NOT EXISTS "ix_IntensiveFlow_active_starts" ON "IntensiveFlow" ("isActive", "startsAt")')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ix_IntensiveFlow_active_starts"')
    op.execute('DROP INDEX IF EXISTS "ux_IntensiveFlowDay_flow_day"')
    op.execute('DROP INDEX IF EXISTS "ix_IntensiveFlowMember_flow"')
    op.execute('DROP INDEX IF EXISTS "ux_IntensiveFlowMember_user_active"')
    op.execute('DROP TABLE IF EXISTS "IntensiveFlowDay"')
    op.execute('DROP TABLE IF EXISTS "IntensiveFlowMember"')
    op.execute('DROP TABLE IF EXISTS "IntensiveFlow"')
