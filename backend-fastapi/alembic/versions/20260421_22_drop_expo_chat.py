"""Remove ExpoChat tables (feature removed)."""

from alembic import op

revision = "20260421_22"
down_revision = "20260420_21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_expo_message_session_created"')
    op.execute('DROP INDEX IF EXISTS "idx_expo_session_user_updated"')
    op.execute('DROP TABLE IF EXISTS "ExpoChatMessage"')
    op.execute('DROP TABLE IF EXISTS "ExpoChatSession"')


def downgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ExpoChatSession" (
            "id" TEXT PRIMARY KEY,
            "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
            "title" TEXT NOT NULL DEFAULT '',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ExpoChatMessage" (
            "id" TEXT PRIMARY KEY,
            "sessionId" TEXT NOT NULL REFERENCES "ExpoChatSession"("id") ON DELETE CASCADE,
            "role" TEXT NOT NULL,
            "body" TEXT NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT "expo_chat_message_role_check" CHECK ("role" IN ('user', 'assistant'))
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_expo_session_user_updated" ON "ExpoChatSession" ("userId", "updatedAt" DESC)')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_expo_message_session_created" ON "ExpoChatMessage" ("sessionId", "createdAt" ASC)')
