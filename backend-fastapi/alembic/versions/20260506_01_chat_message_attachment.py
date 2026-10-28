"""Optional image attachment on community chat messages."""

from alembic import op

revision = "20260506_01"
down_revision = "20260504_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "CommunityChatMessage" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT NULL')


def downgrade() -> None:
    op.execute('ALTER TABLE "CommunityChatMessage" DROP COLUMN IF EXISTS "attachmentUrl"')
