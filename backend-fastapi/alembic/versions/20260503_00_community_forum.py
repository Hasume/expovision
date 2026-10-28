"""Community forum: UserProfile, CommunityCategory, CommunityTopic, CommunityReply, CommunityVote."""

from alembic import op

revision = "20260503_00"
down_revision = "20260422_27"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "UserProfile" (
          "userId"      TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
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

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityCategory" (
          "id"          TEXT PRIMARY KEY,
          "slug"        TEXT NOT NULL UNIQUE,
          "nameRu"      TEXT NOT NULL,
          "nameEn"      TEXT NOT NULL,
          "description" TEXT NOT NULL DEFAULT '',
          "color"       TEXT NOT NULL DEFAULT '#6366f1',
          "sortOrder"   INTEGER NOT NULL DEFAULT 0
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityTopic" (
          "id"         TEXT PRIMARY KEY,
          "categoryId" TEXT REFERENCES "CommunityCategory"("id") ON DELETE SET NULL,
          "authorId"   TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
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

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityReply" (
          "id"         TEXT PRIMARY KEY,
          "topicId"    TEXT NOT NULL REFERENCES "CommunityTopic"("id") ON DELETE CASCADE,
          "authorId"   TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
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

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "CommunityVote" (
          "userId"     TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "targetType" TEXT NOT NULL,
          "targetId"   TEXT NOT NULL,
          "value"      SMALLINT NOT NULL,
          "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY ("userId", "targetType", "targetId"),
          CONSTRAINT "chk_vote_value" CHECK ("value" IN (1, -1)),
          CONSTRAINT "chk_vote_target_type" CHECK ("targetType" IN ('topic', 'reply'))
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_community_vote_target" ON "CommunityVote" ("targetType", "targetId")')

    op.execute(
        """
        INSERT INTO "CommunityCategory" ("id", "slug", "nameRu", "nameEn", "description", "color", "sortOrder")
        VALUES
          ('cat-general',  'general',   'Общее',          'General',       'Обсуждения на любые темы',            '#6366f1', 0),
          ('cat-edtech',   'edtech',    'EdTech',         'EdTech',        'Технологии в образовании',            '#0ea5e9', 1),
          ('cat-ai',       'ai',        'ИИ и обучение',  'AI & Learning', 'Искусственный интеллект в EdTech',    '#10b981', 2),
          ('cat-cases',    'cases',     'Кейсы',          'Cases',         'Реальные истории и разборы',          '#f59e0b', 3),
          ('cat-feedback', 'feedback',  'Обратная связь', 'Feedback',      'Идеи и предложения для платформы',    '#ef4444', 4)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "CommunityVote"')
    op.execute('DROP TABLE IF EXISTS "CommunityReply"')
    op.execute('DROP TABLE IF EXISTS "CommunityTopic"')
    op.execute('DROP TABLE IF EXISTS "CommunityCategory"')
    op.execute('DROP TABLE IF EXISTS "UserProfile"')
