"""Webinar summary + per-flow program order for webinars."""

from alembic import op

revision = "20260420_21"
down_revision = "20260419_20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "summaryRu" TEXT NOT NULL DEFAULT \'\'')
    op.execute('ALTER TABLE "Webinar" ADD COLUMN IF NOT EXISTS "summaryEn" TEXT NOT NULL DEFAULT \'\'')
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "IntensiveFlowWebinar" (
          "id" TEXT PRIMARY KEY,
          "flowId" TEXT NOT NULL REFERENCES "IntensiveFlow"("id") ON DELETE CASCADE,
          "webinarId" TEXT NOT NULL REFERENCES "Webinar"("id") ON DELETE CASCADE,
          "programOrder" INTEGER NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT "ck_IntensiveFlowWebinar_programOrder" CHECK ("programOrder" >= 1 AND "programOrder" <= 99),
          CONSTRAINT "ux_IntensiveFlowWebinar_flow_webinar" UNIQUE ("flowId", "webinarId"),
          CONSTRAINT "ux_IntensiveFlowWebinar_flow_order" UNIQUE ("flowId", "programOrder")
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "ix_IntensiveFlowWebinar_flow" ON "IntensiveFlowWebinar" ("flowId")')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ix_IntensiveFlowWebinar_flow"')
    op.execute('DROP TABLE IF EXISTS "IntensiveFlowWebinar"')
    op.execute('ALTER TABLE "Webinar" DROP COLUMN IF EXISTS "summaryEn"')
    op.execute('ALTER TABLE "Webinar" DROP COLUMN IF EXISTS "summaryRu"')
