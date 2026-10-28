"""apply rich lesson and homework content by dayNumber+track+sortOrder

Previous migrations (05, 08) updated by lesson/homework IDs that did not
match the IDs created by the seed migration.  This migration finds the
correct rows via CurriculumDay."dayNumber" + "track" + Lesson."sortOrder"
and applies the full content for BOTH mandatory (sortOrder=1) and
optional (sortOrder=2) lessons.

Revision ID: 20260404_10
Revises: 20260404_09
Create Date: 2026-04-04
"""

from __future__ import annotations

from typing import Optional

from alembic import op
from sqlalchemy import text

revision = "20260404_10"
down_revision = "20260404_09"
branch_labels = None
depends_on = None

# Public showcase build: only programme days 1-2 ship with full course content.
# Days 3-14 keep their structure and titles, with short placeholders instead of content.
LESSON_PLACEHOLDER_RU = "Полный материал урока доступен в курсе Expovision."
LESSON_PLACEHOLDER_EN = "The full lesson content is available in the Expovision course."
HOMEWORK_PLACEHOLDER_RU = "Полное задание доступно в курсе Expovision."
HOMEWORK_PLACEHOLDER_EN = "Full assignment is available in the Expovision course."


# ── Lesson content: (dayNumber, track, sortOrder, contentRu, contentEn) ──

LESSON_CONTENT: list[tuple[int, Optional[str], int, str, str]] = [
    # ── Core days 1-7 mandatory (sortOrder=1) ──
    (1, None, 1,
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
     "Open the lesson material for the roles table, myth-busting, and a step-by-step plan."),
    (2, None, 1,
     "Прежде чем кодить, разберись в устройстве компьютера: процессор, память, накопитель. Установи редактор кода (VS Code / Cursor) и освой терминал.\n\n"
     "Базовые команды: ls, cd, mkdir, code .\n\n"
     "В материале: таблица сравнения ОС, список обязательных программ, практическое задание.",
     "Before coding, understand computer basics: CPU, RAM, storage. Install a code editor (VS Code / Cursor) and learn the terminal.\n\n"
     "Basic commands: ls, cd, mkdir, code .\n\n"
     "In the material: OS comparison, essential software list, practical task."),
    (3, None, 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (4, None, 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (5, None, 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (6, None, 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (7, None, 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),

    # ── Core days 1-7 optional (sortOrder=2) ──
    (1, None, 2,
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
     "In the material: how AI works in simple terms, useful resources to start."),
    (2, None, 2,
     "Три навыка для входа в IT: поиск информации (Google-операторы), работа с AI-ассистентами (точные промпты) и привычка пробовать.\n\n"
     "В материале: примеры хороших и плохих запросов к AI, ссылки на freeCodeCamp и MDN.",
     "Three skills to enter IT: information search (Google operators), working with AI assistants (precise prompts), and the habit of trying.\n\n"
     "In the material: examples of good and bad AI prompts, links to freeCodeCamp and MDN."),
    (3, None, 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (4, None, 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (5, None, 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (6, None, 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (7, None, 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),

    # ── Track A mandatory (sortOrder=1) ──
    (8, "A", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (9, "A", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (10, "A", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (11, "A", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (12, "A", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (13, "A", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (14, "A", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),

    # ── Track A optional (sortOrder=2) ──
    (8, "A", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (9, "A", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (10, "A", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),

    # ── Track B mandatory (sortOrder=1) ──
    (8, "B", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (9, "B", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (10, "B", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (11, "B", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (12, "B", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (13, "B", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (14, "B", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),

    # ── Track B optional (sortOrder=2) ──
    (8, "B", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (9, "B", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),

    # ── Track C mandatory (sortOrder=1) ──
    (8, "C", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (9, "C", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (10, "C", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (11, "C", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (12, "C", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (13, "C", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (14, "C", 1, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),

    # ── Track C optional (sortOrder=2) ──
    (8, "C", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (9, "C", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (10, "C", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
    (11, "C", 2, LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN),
]


# ── Homework content (instrRu, instrEn, sampleRu, sampleEn, minLen) keyed by (dayNumber, track) ──

HOMEWORK_CONTENT: list[tuple[int, Optional[str], str, str, str, str, int]] = [
    (1, None,
     "Изучи материал урока «IT1. Карта IT без мифов» и выполни задание.\n\n"
     "**Часть 1. Исследование (10 мин)**\n"
     "Открой любой сайт вакансий (hh.ru, LinkedIn Jobs, Indeed). Найди 3 вакансии из разных IT-направлений "
     "(например: frontend-разработчик, QA-инженер, продуктовый дизайнер). Для каждой вакансии выпиши:\n"
     "- Название роли\n- 3 ключевых требования\n- Нужно ли писать код\n\n"
     "**Часть 2. Рефлексия (5 мин)**\n"
     "Ответь на вопросы:\n"
     "1. Какое из 3 направлений тебе ближе всего и почему?\n"
     "2. Какой из мифов об IT (из материала урока) ты раньше считал правдой?\n"
     "3. Запиши свою цель: «Через 3 месяца я хочу уметь ____».\n\n"
     "**Формат ответа:** Свободный текст с ответами на все вопросы. Минимум 150 слов.",
     "Study the lesson material «IT1. IT Map Without Myths» and complete the assignment.\n\n"
     "**Part 1. Research (10 min)**\n"
     "Open any job board (LinkedIn Jobs, Indeed, Glassdoor). Find 3 job listings from different IT directions. For each listing write:\n"
     "- Role name\n- 3 key requirements\n- Whether coding is required\n\n"
     "**Part 2. Reflection (5 min)**\n"
     "1. Which of the 3 directions is closest to you and why?\n"
     "2. Which IT myth did you previously believe?\n"
     "3. Write your goal: «In 3 months I want to be able to ____».\n\n"
     "**Format:** Free text. Minimum 150 words.",
     "Вакансия 1: Junior Frontend-разработчик\nТребования: HTML/CSS, JavaScript, React\nКод: Да\n\n"
     "Вакансия 2: QA-инженер\nТребования: Внимание к деталям, тест-кейсы, Jira\nКод: Нет\n\n"
     "Вакансия 3: UX-дизайнер\nТребования: Figma, прототипирование\nКод: Нет\n\n"
     "Мне ближе frontend — нравится видеть результат визуально.\n"
     "Моя цель: через 3 месяца я хочу уметь создавать простые веб-страницы на React.",
     "Job 1: Junior Frontend Developer\nRequirements: HTML/CSS, JavaScript, React\n\n"
     "Job 2: QA Engineer\nRequirements: Attention to detail, test cases, Jira\n\n"
     "I'm drawn to frontend — I like seeing visual results.\n"
     "My goal: in 3 months I want to build simple React web pages.",
     150),
    (2, None,
     "Изучи материалы уроков «IT2. Компьютер и софт» и «IT3. Навыки для старта».\n\n"
     "**Задание: Настрой рабочее место**\n\n"
     "1. Установи VS Code или Cursor.\n"
     "2. Открой терминал и выполни: `mkdir expovision-hw && cd expovision-hw && code .`\n"
     "3. Создай файл `hello.txt` с текстом «Привет, IT!».\n"
     "4. Сделай скриншот или опиши, что ты увидел.\n\n"
     "**Дополнительно:** Попробуй задать ChatGPT вопрос двумя способами (плохой и хороший промпт). Запиши оба и сравни ответы.\n\n"
     "**Формат:** Описание шагов + 2 промпта с ответами. Минимум 100 слов.",
     "Study lessons «IT2. Computer and Software» and «IT3. Skills to Start».\n\n"
     "**Task: Set Up Your Workspace**\n\n"
     "1. Install VS Code or Cursor.\n2. Open terminal: `mkdir expovision-hw && cd expovision-hw && code .`\n"
     "3. Create `hello.txt`.\n4. Screenshot or describe.\n\n"
     "**Additionally:** Ask ChatGPT a question two ways (bad vs good prompt). Compare.\n\n"
     "**Format:** Steps + 2 prompts. Minimum 100 words.",
     "1. Установил Cursor.\n2. Создал папку, открыл в Cursor.\n3. Создал hello.txt.\n\n"
     "Плохой промпт: «Как сделать сайт?» — длинный общий ответ.\n"
     "Хороший промпт: «Покажи пошагово, как создать HTML-файл с заголовком в VS Code.» — чёткая инструкция из 5 шагов.",
     "1. Installed Cursor.\n2. Created folder, opened it.\n3. Created hello.txt.\n\n"
     "Bad prompt: \"How to make a website?\" — 3-page generic answer.\n"
     "Good prompt: \"Show me step by step how to create an HTML file in VS Code.\" — 5 clear steps.",
     100),
    (3, None, HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 80),
    (4, None, HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),
    (5, None, HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),
    (6, None, HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),
    (7, None, HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),
    # ── Day 8 ──
    (8, "A", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),
    (8, "B", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),
    (8, "C", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 50),
    # ── Day 9 ──
    (9, "A", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),
    (9, "B", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),
    (9, "C", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),
    # ── Day 10 ──
    (10, "A", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 80),
    (10, "B", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),
    (10, "C", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 50),
    # ── Day 11 ──
    (11, "A", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),
    (11, "B", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),
    (11, "C", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 50),
    # ── Day 12 ──
    (12, "A", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),
    (12, "B", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),
    (12, "C", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 50),
    # ── Day 13 ──
    (13, "A", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),
    (13, "B", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),
    (13, "C", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),
    # ── Day 14 ──
    (14, "A", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),
    (14, "B", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),
    (14, "C", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),
]


def upgrade() -> None:
    conn = op.get_bind()

    for day_number, track, sort_order, content_ru, content_en in LESSON_CONTENT:
        if track is None:
            conn.execute(
                text(
                    """
                    UPDATE "Lesson" l
                    SET "contentRu" = :ru, "contentEn" = :en
                    FROM "CurriculumDay" d
                    WHERE l."curriculumDayId" = d."id"
                      AND d."dayNumber" = :day
                      AND d."track" IS NULL
                      AND l."sortOrder" = :sort_order
                    """
                ),
                {"ru": content_ru, "en": content_en, "day": day_number, "sort_order": sort_order},
            )
        else:
            conn.execute(
                text(
                    """
                    UPDATE "Lesson" l
                    SET "contentRu" = :ru, "contentEn" = :en
                    FROM "CurriculumDay" d
                    WHERE l."curriculumDayId" = d."id"
                      AND d."dayNumber" = :day
                      AND d."track" = :track
                      AND l."sortOrder" = :sort_order
                    """
                ),
                {"ru": content_ru, "en": content_en, "day": day_number, "track": track, "sort_order": sort_order},
            )

    for day_number, track, instr_ru, instr_en, sample_ru, sample_en, min_len in HOMEWORK_CONTENT:
        if track is None:
            conn.execute(
                text(
                    """
                    UPDATE "HomeworkTemplate" h
                    SET "instructionRu" = :instr_ru,
                        "instructionEn" = :instr_en,
                        "sampleRu" = :sample_ru,
                        "sampleEn" = :sample_en,
                        "minLength" = :min_len
                    FROM "CurriculumDay" d
                    WHERE h."curriculumDayId" = d."id"
                      AND d."dayNumber" = :day
                      AND d."track" IS NULL
                    """
                ),
                {"instr_ru": instr_ru, "instr_en": instr_en, "sample_ru": sample_ru, "sample_en": sample_en, "min_len": min_len, "day": day_number},
            )
        else:
            conn.execute(
                text(
                    """
                    UPDATE "HomeworkTemplate" h
                    SET "instructionRu" = :instr_ru,
                        "instructionEn" = :instr_en,
                        "sampleRu" = :sample_ru,
                        "sampleEn" = :sample_en,
                        "minLength" = :min_len
                    FROM "CurriculumDay" d
                    WHERE h."curriculumDayId" = d."id"
                      AND d."dayNumber" = :day
                      AND d."track" = :track
                    """
                ),
                {"instr_ru": instr_ru, "instr_en": instr_en, "sample_ru": sample_ru, "sample_en": sample_en, "min_len": min_len, "day": day_number, "track": track},
            )


def downgrade() -> None:
    pass
