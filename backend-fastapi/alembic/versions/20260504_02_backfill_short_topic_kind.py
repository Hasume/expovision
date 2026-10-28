"""Align topicKind with cat-micro for legacy rows."""

from alembic import op

revision = "20260504_02"
down_revision = "20260504_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE "CommunityTopic"
        SET "topicKind" = 'short'
        WHERE "categoryId" = 'cat-micro'
          AND COALESCE("topicKind", 'discussion') = 'discussion'
        """
    )


def downgrade() -> None:
    pass
