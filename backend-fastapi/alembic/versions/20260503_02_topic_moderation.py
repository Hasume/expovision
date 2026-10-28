"""Community topics: moderation workflow.

Adds status (pending/active/closed), approvedAt and closesAt to CommunityTopic.
New topics arrive as 'pending', admin approves → 'active' with 24h timer,
auto-closes to 'closed' after closesAt passes.

Also seeds default discussion categories if the table is empty.
"""

from alembic import op

revision = "20260503_02"
down_revision = "20260503_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Add moderation columns to CommunityTopic ───────────────────
    op.execute(
        """
        ALTER TABLE "CommunityTopic"
          ADD COLUMN IF NOT EXISTS "status"      TEXT        NOT NULL DEFAULT 'active',
          ADD COLUMN IF NOT EXISTS "approvedAt"  TIMESTAMP,
          ADD COLUMN IF NOT EXISTS "closesAt"    TIMESTAMP
        """
    )

    # ── Indexes for efficient filtering ───────────────────────────
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "idx_community_topic_status"
        ON "CommunityTopic" ("status")
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "idx_community_topic_closes_at"
        ON "CommunityTopic" ("closesAt")
        WHERE "closesAt" IS NOT NULL
        """
    )

    # ── Existing active topics keep status='active' (default) ─────
    # Mark pinned or previously isClosed topics accordingly
    op.execute(
        """
        UPDATE "CommunityTopic"
        SET "status" = 'closed'
        WHERE "isClosed" = true AND "status" = 'active'
        """
    )

    # ── Seed default categories if table is empty ──────────────────
    op.execute(
        """
        INSERT INTO "CommunityCategory" ("id", "slug", "nameRu", "nameEn", "description", "color", "sortOrder")
        SELECT * FROM (VALUES
          ('cat-lesson',     'lesson-questions', 'Вопросы по урокам',    'Lesson Questions',  'Вопросы по содержанию уроков и программе', '#3b82f6', 1),
          ('cat-homework',   'homework-help',    'Помощь с ДЗ',          'Homework Help',     'Помощь с выполнением домашних заданий',    '#10b981', 2),
          ('cat-ai',         'ai-tools',         'AI-инструменты',       'AI Tools',          'Обсуждение нейросетей и AI-сервисов',      '#8b5cf6', 3),
          ('cat-cases',      'student-cases',    'Кейсы учеников',       'Student Cases',     'Делитесь своими проектами и результатами', '#f59e0b', 4),
          ('cat-ideas',      'ideas',            'Идеи',                 'Ideas',             'Предложения по улучшению интенсива',       '#ec4899', 5),
          ('cat-feedback',   'feedback',         'Обратная связь',       'Feedback',          'Отзывы и предложения',                     '#6366f1', 6)
        ) AS v(id, slug, "nameRu", "nameEn", description, color, "sortOrder")
        WHERE NOT EXISTS (SELECT 1 FROM "CommunityCategory" LIMIT 1)
        """
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_community_topic_closes_at"')
    op.execute('DROP INDEX IF EXISTS "idx_community_topic_status"')
    op.execute('ALTER TABLE "CommunityTopic" DROP COLUMN IF EXISTS "closesAt"')
    op.execute('ALTER TABLE "CommunityTopic" DROP COLUMN IF EXISTS "approvedAt"')
    op.execute('ALTER TABLE "CommunityTopic" DROP COLUMN IF EXISTS "status"')
