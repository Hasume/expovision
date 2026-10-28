"""Add aiSummary column to CommunityTopic for Gemini-generated discussion summaries."""

from alembic import op

revision = "20260503_03"
down_revision = "20260503_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE "CommunityTopic"
          ADD COLUMN IF NOT EXISTS "aiSummary" TEXT
        """
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "CommunityTopic" DROP COLUMN IF EXISTS "aiSummary"')
