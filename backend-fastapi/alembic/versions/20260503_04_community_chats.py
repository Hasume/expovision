"""Community messaging: group chats + DMs.

CommunityChat: type='group' (linked to a topic) or 'dm' (between two users).
CommunityChatMember: membership + lastReadAt for unread tracking.
CommunityChatMessage: messages with author and body.
"""

from alembic import op

revision = "20260503_04"
down_revision = "20260503_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityChat" (
          "id"        TEXT PRIMARY KEY,
          "type"      TEXT NOT NULL DEFAULT 'dm',
          "name"      TEXT,
          "topicId"   TEXT REFERENCES "CommunityTopic"("id") ON DELETE SET NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityChatMember" (
          "chatId"     TEXT NOT NULL REFERENCES "CommunityChat"("id") ON DELETE CASCADE,
          "userId"     TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "joinedAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
          "lastReadAt" TIMESTAMP,
          PRIMARY KEY ("chatId", "userId")
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityChatMessage" (
          "id"        TEXT PRIMARY KEY,
          "chatId"    TEXT NOT NULL REFERENCES "CommunityChat"("id") ON DELETE CASCADE,
          "authorId"  TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "body"      TEXT NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute('CREATE INDEX IF NOT EXISTS "idx_chat_member_user" ON "CommunityChatMember" ("userId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_chat_message_chat" ON "CommunityChatMessage" ("chatId", "createdAt" DESC)')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_chat_topic" ON "CommunityChat" ("topicId") WHERE "topicId" IS NOT NULL')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "CommunityChatMessage"')
    op.execute('DROP TABLE IF EXISTS "CommunityChatMember"')
    op.execute('DROP TABLE IF EXISTS "CommunityChat"')
