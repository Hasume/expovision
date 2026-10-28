"""Unified community categories + topicKind for discussion vs short posts.

Consolidates overlapping seeds from earlier migrations into one taxonomy,
maps existing topics, removes obsolete category rows.
"""

from alembic import op

revision = "20260504_01"
down_revision = "20260504_00"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        '''
        ALTER TABLE "CommunityCategory"
          ADD COLUMN IF NOT EXISTS "kindScope" TEXT NOT NULL DEFAULT 'both'
        '''
    )
    op.execute(
        '''
        ALTER TABLE "CommunityTopic"
          ADD COLUMN IF NOT EXISTS "topicKind" TEXT NOT NULL DEFAULT 'discussion'
        '''
    )

    # Canonical categories (upsert)
    op.execute(
        """
        INSERT INTO "CommunityCategory"
          ("id", "slug", "nameRu", "nameEn", "description", "color", "sortOrder", "kindScope")
        VALUES
          ('cat-learning', 'learning-stack',
           'Программа и уроки',
           'Curriculum & lessons',
           'Вопросы по содержанию программы: модуль, урок, термин, методичка.',
           '#2563eb', 1, 'discussion'),
          ('cat-practice', 'practice-stack',
           'Практика и домашка',
           'Practice & homework',
           'Разбор заданий, сдача работы, ошибки в упражнениях.',
           '#059669', 2, 'discussion'),
          ('cat-ai', 'ai-stack',
           'ИИ в работе и учёбе',
           'AI workflow',
           'Нейросети, промпты, инструменты, автоматизация задач.',
           '#7c3aed', 3, 'both'),
          ('cat-project', 'portfolio-stack',
           'Проект и портфолио',
           'Project & portfolio',
           'Учебный проект, кейс, материалы для работодателя.',
           '#d97706', 4, 'both'),
          ('cat-community', 'peer-stack',
           'Сообщество и карьера',
           'Community & career',
           'Обмен опытом, методика, вопросы без привязки к конкретному уроку.',
           '#0ea5e9', 5, 'both'),
          ('cat-micro', 'feed-micro',
           'Заметка для ленты',
           'Feed micro-post',
           'Короткий пост: набросок, находка, ссылка — не полная тема для архива.',
           '#64748b', 6, 'short'),
          ('cat-platform', 'platform-stack',
           'Платформа Expovision',
           'Expovision platform',
           'Поддержка, идеи по продукту, качество сервиса.',
           '#dc2626', 7, 'both')
        ON CONFLICT ("id") DO UPDATE SET
          "slug" = EXCLUDED."slug",
          "nameRu" = EXCLUDED."nameRu",
          "nameEn" = EXCLUDED."nameEn",
          "description" = EXCLUDED."description",
          "color" = EXCLUDED."color",
          "sortOrder" = EXCLUDED."sortOrder",
          "kindScope" = EXCLUDED."kindScope"
        """
    )

    # Remap legacy ids → canonical
    op.execute(
        """
        UPDATE "CommunityTopic" SET "categoryId" = CASE "categoryId"
          WHEN 'cat-general' THEN 'cat-community'
          WHEN 'cat-edtech' THEN 'cat-community'
          WHEN 'cat-lesson' THEN 'cat-learning'
          WHEN 'cat-homework' THEN 'cat-practice'
          WHEN 'cat-cases' THEN 'cat-project'
          WHEN 'cat-student-cases' THEN 'cat-project'
          WHEN 'cat-ideas' THEN 'cat-platform'
          WHEN 'cat-feedback' THEN 'cat-platform'
          WHEN 'cat-ai-tools' THEN 'cat-ai'
          ELSE "categoryId"
        END
        WHERE "categoryId" IS NOT NULL
        """
    )

    op.execute(
        """
        UPDATE "CommunityTopic"
        SET "categoryId" = NULL
        WHERE "categoryId" IS NOT NULL
          AND "categoryId" NOT IN (
            'cat-learning', 'cat-practice', 'cat-ai', 'cat-project',
            'cat-community', 'cat-micro', 'cat-platform'
          )
        """
    )

    op.execute(
        """
        DELETE FROM "CommunityCategory"
        WHERE "id" NOT IN (
          'cat-learning', 'cat-practice', 'cat-ai', 'cat-project',
          'cat-community', 'cat-micro', 'cat-platform'
        )
        """
    )

    # Normalize legacy kindScope on remaining rows (if any manual edits)
    op.execute(
        '''
        UPDATE "CommunityCategory"
        SET "kindScope" = 'discussion'
        WHERE "id" IN ('cat-learning', 'cat-practice')
        '''
    )
    op.execute(
        '''
        UPDATE "CommunityCategory"
        SET "kindScope" = 'short'
        WHERE "id" = 'cat-micro'
        '''
    )
    op.execute(
        '''
        UPDATE "CommunityCategory"
        SET "kindScope" = 'both'
        WHERE "id" IN ('cat-ai', 'cat-project', 'cat-community', 'cat-platform')
        '''
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "CommunityTopic" DROP COLUMN IF EXISTS "topicKind"')
    op.execute('ALTER TABLE "CommunityCategory" DROP COLUMN IF EXISTS "kindScope"')
