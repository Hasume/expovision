"""Community chat schema improvements: soft-delete, edit history, member roles, group management.

Adds:
- CommunityChatMessage.deletedAt, updatedAt, replyToMessageId, messageType
  (editedAt added in 20260506_04)
- CommunityChatMember.role  (owner / admin / member)
- CommunityChat.ownerId, description, avatarUrl
- Index for non-deleted messages
- Backfill: first joined member of each group chat becomes owner
"""

from alembic import op

revision = "20260506_02"
down_revision = "20260506_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── CommunityChatMessage ────────────────────────────────────────────────
    op.execute(
        'ALTER TABLE "CommunityChatMessage" ADD COLUMN IF NOT EXISTS "messageType" TEXT NOT NULL DEFAULT \'text\''
    )
    op.execute(
        'ALTER TABLE "CommunityChatMessage" ADD COLUMN IF NOT EXISTS "replyToMessageId" TEXT NULL'
    )
    op.execute(
        'ALTER TABLE "CommunityChatMessage" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NULL'
    )
    op.execute(
        'ALTER TABLE "CommunityChatMessage" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP NULL'
    )
    # Allow empty body for image-only messages
    op.execute(
        'ALTER TABLE "CommunityChatMessage" ALTER COLUMN "body" DROP NOT NULL'
    )

    # ── CommunityChatMember ─────────────────────────────────────────────────
    op.execute(
        "ALTER TABLE \"CommunityChatMember\" ADD COLUMN IF NOT EXISTS \"role\" TEXT NOT NULL DEFAULT 'member'"
    )

    # ── CommunityChat ───────────────────────────────────────────────────────
    op.execute(
        'ALTER TABLE "CommunityChat" ADD COLUMN IF NOT EXISTS "description" TEXT NULL'
    )
    op.execute(
        'ALTER TABLE "CommunityChat" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT NULL'
    )
    op.execute(
        """
        ALTER TABLE "CommunityChat"
        ADD COLUMN IF NOT EXISTS "ownerId" TEXT NULL
        REFERENCES "CommunityUser"("id") ON DELETE SET NULL
        """
    )

    # ── Indexes ─────────────────────────────────────────────────────────────
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "idx_chat_message_chat_active"
        ON "CommunityChatMessage" ("chatId", "createdAt" DESC)
        WHERE "deletedAt" IS NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "idx_chat_member_role"
        ON "CommunityChatMember" ("chatId", "role")
        """
    )

    # ── Backfill: promote first-joined member of each group to owner ────────
    op.execute(
        """
        UPDATE "CommunityChatMember" mb
        SET "role" = 'owner'
        FROM (
            SELECT DISTINCT ON ("chatId") "chatId", "userId"
            FROM "CommunityChatMember"
            ORDER BY "chatId", "joinedAt"
        ) first_member
        WHERE mb."chatId" = first_member."chatId"
          AND mb."userId" = first_member."userId"
          AND EXISTS (
            SELECT 1 FROM "CommunityChat" c
            WHERE c."id" = mb."chatId" AND c."type" = 'group'
          )
        """
    )

    op.execute(
        """
        UPDATE "CommunityChat" c
        SET "ownerId" = (
            SELECT "userId" FROM "CommunityChatMember"
            WHERE "chatId" = c."id" AND "role" = 'owner'
            LIMIT 1
        )
        WHERE "type" = 'group'
        """
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_chat_member_role"')
    op.execute('DROP INDEX IF EXISTS "idx_chat_message_chat_active"')
    op.execute('ALTER TABLE "CommunityChat" DROP COLUMN IF EXISTS "ownerId"')
    op.execute('ALTER TABLE "CommunityChat" DROP COLUMN IF EXISTS "avatarUrl"')
    op.execute('ALTER TABLE "CommunityChat" DROP COLUMN IF EXISTS "description"')
    op.execute('ALTER TABLE "CommunityChatMember" DROP COLUMN IF EXISTS "role"')
    op.execute('ALTER TABLE "CommunityChatMessage" ALTER COLUMN "body" SET NOT NULL')
    op.execute('ALTER TABLE "CommunityChatMessage" DROP COLUMN IF EXISTS "deletedAt"')
    op.execute('ALTER TABLE "CommunityChatMessage" DROP COLUMN IF EXISTS "updatedAt"')
    op.execute('ALTER TABLE "CommunityChatMessage" DROP COLUMN IF EXISTS "replyToMessageId"')
    op.execute('ALTER TABLE "CommunityChatMessage" DROP COLUMN IF EXISTS "messageType"')
