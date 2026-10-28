"""CommunityUser ban flag + audit fields for admin moderation."""

from alembic import op

revision = "20260504_03"
down_revision = "20260504_02"
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
    op.execute('ALTER TABLE "CommunityUser" DROP COLUMN IF EXISTS "bannedReason"')
    op.execute('ALTER TABLE "CommunityUser" DROP COLUMN IF EXISTS "bannedAt"')
    op.execute('ALTER TABLE "CommunityUser" DROP COLUMN IF EXISTS "isBanned"')
