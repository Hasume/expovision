"""Community profile subscriptions (followers / following)."""

from alembic import op

revision = "20260504_04"
down_revision = "20260504_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityFollow" (
          "followerId"  TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "followingId" TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("followerId", "followingId"),
          CONSTRAINT "chk_community_follow_not_self" CHECK ("followerId" <> "followingId")
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_follow_following" ON "CommunityFollow" ("followingId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_follow_follower" ON "CommunityFollow" ("followerId")')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "CommunityFollow"')
