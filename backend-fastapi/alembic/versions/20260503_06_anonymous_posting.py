"""anonymous posting support

Revision ID: 20260503_06
Revises: 20260503_05
Create Date: 2026-05-03
"""

from alembic import op

revision = "20260503_06"
down_revision = "20260503_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Topic: author can post anonymously
    op.execute('ALTER TABLE "CommunityTopic" ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT FALSE')
    # Reply: each reply can be anonymous independently
    op.execute('ALTER TABLE "CommunityReply" ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT FALSE')
    # ChatMember: anonymous in the group chat, can reveal later
    op.execute('ALTER TABLE "CommunityChatMember" ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT FALSE')


def downgrade() -> None:
    op.execute('ALTER TABLE "CommunityTopic" DROP COLUMN IF EXISTS "isAnonymous"')
    op.execute('ALTER TABLE "CommunityReply" DROP COLUMN IF EXISTS "isAnonymous"')
    op.execute('ALTER TABLE "CommunityChatMember" DROP COLUMN IF EXISTS "isAnonymous"')
