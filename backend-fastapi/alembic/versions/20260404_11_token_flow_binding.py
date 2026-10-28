"""add flowId to LicenseToken for flow binding

Revision ID: 20260404_11
Revises: 20260404_10
Create Date: 2026-04-04
"""

from alembic import op

revision = "20260404_11"
down_revision = "20260404_10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE "LicenseToken"
        ADD COLUMN IF NOT EXISTS "flowId" TEXT NULL
            REFERENCES "IntensiveFlow"("id") ON DELETE SET NULL
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_license_token_flow" ON "LicenseToken" ("flowId")'
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_license_token_flow"')
    op.execute('ALTER TABLE "LicenseToken" DROP COLUMN IF EXISTS "flowId"')
