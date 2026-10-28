"""Community chat safety: blocked users, message reports, muted chats.

CommunityBlockedUser  — user-to-user block list.
CommunityMessageReport — persisted report records for moderation queue.
CommunityChatMuted    — per-user mute settings per chat (with optional expiry).
"""

from alembic import op

revision = "20260506_03"
down_revision = "20260506_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── CommunityBlockedUser ────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityBlockedUser" (
          "blockerId"  TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "blockedId"  TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("blockerId", "blockedId"),
          CHECK ("blockerId" != "blockedId")
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_blocked_blocker" ON "CommunityBlockedUser" ("blockerId")'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_blocked_blocked" ON "CommunityBlockedUser" ("blockedId")'
    )

    # ── CommunityMessageReport ──────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityMessageReport" (
          "id"         TEXT PRIMARY KEY,
          "messageId"  TEXT NOT NULL REFERENCES "CommunityChatMessage"("id") ON DELETE CASCADE,
          "reporterId" TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "reason"     TEXT NOT NULL,
          "status"     TEXT NOT NULL DEFAULT 'pending',
          "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
          "resolvedAt" TIMESTAMP,
          UNIQUE ("messageId", "reporterId")
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_report_message" ON "CommunityMessageReport" ("messageId")'
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "idx_report_pending"
        ON "CommunityMessageReport" ("status", "createdAt" DESC)
        WHERE "status" = 'pending'
        """
    )

    # ── CommunityChatMuted ──────────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityChatMuted" (
          "chatId"   TEXT NOT NULL REFERENCES "CommunityChat"("id") ON DELETE CASCADE,
          "userId"   TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "mutedUntil" TIMESTAMP,
          "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("chatId", "userId")
        )
        """
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "CommunityChatMuted"')
    op.execute('DROP TABLE IF EXISTS "CommunityMessageReport"')
    op.execute('DROP TABLE IF EXISTS "CommunityBlockedUser"')
