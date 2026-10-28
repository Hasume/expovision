"""Idempotent repair: CommunityUser ban columns.

Duplicate of 20260504_03 using IF NOT EXISTS — fixes DBs where code was deployed
but migration 20260504_03 did not run (restored backup, skipped revision, etc.).
"""

from alembic import op

revision = "20260504_05"
down_revision = "20260504_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        '''
        ALTER TABLE "CommunityUser"
          ADD COLUMN IF NOT EXISTS "isBanned" BOOLEAN NOT NULL DEFAULT false
        '''
    )
    op.execute(
        '''
        ALTER TABLE "CommunityUser"
          ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP NULL
        '''
    )
    op.execute(
        '''
        ALTER TABLE "CommunityUser"
          ADD COLUMN IF NOT EXISTS "bannedReason" TEXT NULL
        '''
    )


def downgrade() -> None:
    pass
