"""Add CommunityChatMessage.editedAt — required by GET /chats/.../messages and PATCH message."""

from alembic import op

revision = "20260506_04"
down_revision = "20260506_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "CommunityChatMessage" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP NULL'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "CommunityChatMessage" DROP COLUMN IF EXISTS "editedAt"')
