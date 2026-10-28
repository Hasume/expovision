"""Community: separate CommunityUser table, decouple from student User table.

Drops and recreates community forum tables with FK to CommunityUser instead of User.
UserProfile (which referenced User) is replaced by CommunityProfile (references CommunityUser).
"""

from alembic import op

revision = "20260503_01"
down_revision = "20260503_00"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old community tables in dependency order
    op.execute('DROP TABLE IF EXISTS "CommunityVote"')
    op.execute('DROP TABLE IF EXISTS "CommunityReply"')
    op.execute('DROP TABLE IF EXISTS "CommunityTopic"')
    op.execute('DROP TABLE IF EXISTS "UserProfile"')

    # ── CommunityUser ─────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityUser" (
          "id"                    TEXT PRIMARY KEY,
          "firstName"             TEXT NOT NULL,
          "lastName"              TEXT NOT NULL DEFAULT '',
          "email"                 TEXT NOT NULL UNIQUE,
          "passwordHash"          TEXT NOT NULL,
          "avatarUrl"             TEXT NULL,
          "hashedRefreshToken"    TEXT NULL,
          "refreshTokenExpiresAt" TIMESTAMP NULL,
          "currentSessionId"      TEXT NULL,
          "createdAt"             TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt"             TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_user_email" ON "CommunityUser" ("email")')

    # ── CommunityProfile (extended profile, 1:1 with CommunityUser) ──
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityProfile" (
          "userId"      TEXT PRIMARY KEY REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "bio"         TEXT,
          "position"    TEXT,
          "company"     TEXT,
          "location"    TEXT,
          "website"     TEXT,
          "linkedinUrl" TEXT,
          "githubUrl"   TEXT,
          "skills"      TEXT NOT NULL DEFAULT '[]',
          "communityXp" INTEGER NOT NULL DEFAULT 0,
          "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )

    # ── CommunityTopic (FK → CommunityUser) ───────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityTopic" (
          "id"         TEXT PRIMARY KEY,
          "categoryId" TEXT REFERENCES "CommunityCategory"("id") ON DELETE SET NULL,
          "authorId"   TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "title"      TEXT NOT NULL,
          "body"       TEXT NOT NULL DEFAULT '',
          "isPinned"   BOOLEAN NOT NULL DEFAULT false,
          "isClosed"   BOOLEAN NOT NULL DEFAULT false,
          "viewCount"  INTEGER NOT NULL DEFAULT 0,
          "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt"  TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_topic_author" ON "CommunityTopic" ("authorId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_topic_category" ON "CommunityTopic" ("categoryId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_topic_created" ON "CommunityTopic" ("createdAt" DESC)')

    # ── CommunityReply (FK → CommunityUser) ──────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityReply" (
          "id"         TEXT PRIMARY KEY,
          "topicId"    TEXT NOT NULL REFERENCES "CommunityTopic"("id") ON DELETE CASCADE,
          "authorId"   TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "parentId"   TEXT REFERENCES "CommunityReply"("id") ON DELETE SET NULL,
          "body"       TEXT NOT NULL,
          "isAccepted" BOOLEAN NOT NULL DEFAULT false,
          "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt"  TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_reply_topic" ON "CommunityReply" ("topicId")')
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_reply_author" ON "CommunityReply" ("authorId")')

    # ── CommunityVote (FK → CommunityUser) ───────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityVote" (
          "userId"     TEXT NOT NULL REFERENCES "CommunityUser"("id") ON DELETE CASCADE,
          "targetType" TEXT NOT NULL,
          "targetId"   TEXT NOT NULL,
          "value"      SMALLINT NOT NULL,
          "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("userId", "targetType", "targetId"),
          CONSTRAINT "chk_vote_value2" CHECK ("value" IN (1, -1)),
          CONSTRAINT "chk_vote_target_type2" CHECK ("targetType" IN ('topic', 'reply'))
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_vote_target" ON "CommunityVote" ("targetType", "targetId")')


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "CommunityVote"')
    op.execute('DROP TABLE IF EXISTS "CommunityReply"')
    op.execute('DROP TABLE IF EXISTS "CommunityTopic"')
    op.execute('DROP TABLE IF EXISTS "CommunityProfile"')
    op.execute('DROP TABLE IF EXISTS "CommunityUser"')
