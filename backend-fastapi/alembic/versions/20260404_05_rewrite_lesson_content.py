"""rewrite lesson content with clean markdown summaries

Revision ID: 20260404_05
Revises: 20260404_04
Create Date: 2026-04-04
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20260404_05"
down_revision = "20260404_04"
branch_labels = None
depends_on = None

# Public showcase build: only programme days 1-2 ship with full course content.
# Days 3-14 keep their structure and titles, with short placeholders instead of content.
LESSON_PLACEHOLDER_RU = "Полный материал урока доступен в курсе Expovision."
LESSON_PLACEHOLDER_EN = "The full lesson content is available in the Expovision course."
HOMEWORK_PLACEHOLDER_RU = "Полное задание доступно в курсе Expovision."
HOMEWORK_PLACEHOLDER_EN = "Full assignment is available in the Expovision course."

SUMMARIES: dict[str, tuple[str, str]] = {
    "d1-m": (
        "IT-индустрия — это не только код. Здесь много ролей: от дизайна и тестирования до управления проектами.\n\n"
        "Что важно:\n"
        "- Не нужно быть гением математики — достаточно школьной базы\n"
        "- Работодатели смотрят на портфолио, не на диплом\n"
        "- Любой старт лучше бесконечного выбора\n\n"
        "Открой материал урока — там таблица ролей, разбор мифов и пошаговый план.",
        "The IT industry is not just about coding. There are many roles: from design and testing to project management.\n\n"
        "Key takeaways:\n"
        "- You don't need to be a math genius\n"
        "- Employers look at portfolios, not diplomas\n"
        "- Any start is better than endless deliberation\n\n"
        "Open the lesson material for the roles table, myth-busting, and a step-by-step plan.",
    ),
    "d1-o": (
        "Искусственный интеллект — набор алгоритмов, которые учатся на данных. AI уже распознает речь, генерирует тексты и анализирует данные.\n\n"
        "Что важно:\n"
        "- AI не понимает смысл — он работает с паттернами\n"
        "- AI может «галлюцинировать» — уверенно выдавать неправду\n"
        "- AI усиливает человека, но не заменяет критическое мышление\n\n"
        "В материале: как AI работает простыми словами, полезные ресурсы для старта.",
        "Artificial intelligence is a set of algorithms that learn from data. AI already recognizes speech, generates text, and analyzes data.\n\n"
        "Key takeaways:\n"
        "- AI doesn't understand meaning — it works with patterns\n"
        "- AI can hallucinate — confidently output incorrect facts\n"
        "- AI amplifies humans but doesn't replace critical thinking\n\n"
        "In the material: how AI works in simple terms, useful resources to start.",
    ),
    "d2-m": (
        "Прежде чем кодить, разберись в устройстве компьютера: процессор, память, накопитель. Установи редактор кода (VS Code / Cursor) и освой терминал.\n\n"
        "Базовые команды: ls, cd, mkdir, code .\n\n"
        "В материале: таблица сравнения ОС, список обязательных программ, практическое задание.",
        "Before coding, understand computer basics: CPU, RAM, storage. Install a code editor (VS Code / Cursor) and learn the terminal.\n\n"
        "Basic commands: ls, cd, mkdir, code .\n\n"
        "In the material: OS comparison, essential software list, practical task.",
    ),
    "d2-o": (
        "Три навыка для входа в IT: поиск информации (Google-операторы), работа с AI-ассистентами (точные промпты) и привычка пробовать.\n\n"
        "В материале: примеры хороших и плохих запросов к AI, ссылки на freeCodeCamp и MDN.",
        "Three skills to enter IT: information search (Google operators), working with AI assistants (precise prompts), and the habit of trying.\n\n"
        "In the material: examples of good and bad AI prompts, links to freeCodeCamp and MDN.",
    ),
    "d3-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d3-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d4-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d4-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d5-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d5-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d6-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d6-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d7-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d7-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d8-a-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d8-a-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d9-a-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d9-a-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d10-a-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d10-a-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "lesson-11-a": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "lesson-12-a": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "lesson-13-a": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "lesson-14-a": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d8-b-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d8-b-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d9-b-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d9-b-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d10-b-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "lesson-11-b": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "lesson-12-b": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "lesson-13-b": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "lesson-14-b": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d8-c-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d8-c-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d9-c-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d9-c-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d10-c-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d10-c-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d11-c-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d11-c-o": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d12-c-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d13-c-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    "d14-c-m": (LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
}


def upgrade() -> None:
    conn = op.get_bind()
    for lesson_id, (content_ru, content_en) in SUMMARIES.items():
        conn.execute(
            text(
                'UPDATE "Lesson" SET "contentRu" = :ru, "contentEn" = :en WHERE "id" = :id'
            ),
            {"ru": content_ru, "en": content_en, "id": lesson_id},
        )

    conn.execute(text('DELETE FROM "LessonImage"'))

    lessons = conn.execute(
        text('SELECT "id" FROM "Lesson" ORDER BY "id"')
    ).fetchall()

    for row in lessons:
        lid = row[0]
        conn.execute(
            text(
                """
                INSERT INTO "LessonImage" (
                    "id", "lessonId", "url", "captionRu", "captionEn",
                    "sortOrder", "mediaStatus", "deletedAt", "deletedBy"
                )
                VALUES (
                    :id, :lid, :url, :cap_ru, :cap_en,
                    1, 'ready', NULL, NULL
                )
                """
            ),
            {
                "id": f"mat-{lid}",
                "lid": lid,
                "url": f"/materials/lessons/{lid}.html",
                "cap_ru": "Материал урока",
                "cap_en": "Lesson material",
            },
        )


def downgrade() -> None:
    pass
