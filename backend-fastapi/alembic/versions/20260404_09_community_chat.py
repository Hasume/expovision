"""community chat messages

Revision ID: 20260404_09
Revises: 20260404_08
Create Date: 2026-04-04
"""

from alembic import op

revision = "20260404_09"
down_revision = "20260404_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "ChatMessage" (
            "id"        TEXT PRIMARY KEY,
            "flowId"    TEXT NOT NULL,
            "userId"    TEXT REFERENCES "User"("id") ON DELETE SET NULL,
            "kind"      TEXT NOT NULL DEFAULT 'user',
            "eventType" TEXT,
            "body"      TEXT NOT NULL,
            "meta"      TEXT,
            "targetUserId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_chat_flow_created" ON "ChatMessage" ("flowId", "createdAt" DESC)'
    )
    op.execute(
        'CREATE INDEX IF NOT EXISTS "idx_chat_flow_after" ON "ChatMessage" ("flowId", "createdAt" ASC)'
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "ChatMessage"')
