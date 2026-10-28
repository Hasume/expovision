"""rewrite all homework templates with real tasks matching lesson materials

Revision ID: 20260404_08
Revises: 20260404_07
Create Date: 2026-04-04
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

revision = "20260404_08"
down_revision = "20260404_07"
branch_labels = None
depends_on = None

# Public showcase build: only programme days 1-2 ship with full course content.
# Days 3-14 keep their structure and titles, with short placeholders instead of content.
LESSON_PLACEHOLDER_RU = "Полный материал урока доступен в курсе Expovision."
LESSON_PLACEHOLDER_EN = "The full lesson content is available in the Expovision course."
HOMEWORK_PLACEHOLDER_RU = "Полное задание доступно в курсе Expovision."
HOMEWORK_PLACEHOLDER_EN = "Full assignment is available in the Expovision course."


# (hw_id, instruction_ru, instruction_en, sample_ru, sample_en, min_length)
HOMEWORK: list[tuple[str, str, str, str, str, int]] = [
    # ── Day 1 (core) ──────────────────────────────────────────────────────
    (
        "227d63cd-16f3-4677-ae9d-6830a6273925",
        # instruction_ru
        "Изучи материал урока «IT1. Карта IT без мифов» и выполни задание.\n\n"
        "**Часть 1. Исследование (10 мин)**\n"
        "Открой любой сайт вакансий (hh.ru, LinkedIn Jobs, Indeed). Найди 3 вакансии из разных IT-направлений "
        "(например: frontend-разработчик, QA-инженер, продуктовый дизайнер). Для каждой вакансии выпиши:\n"
        "- Название роли\n"
        "- 3 ключевых требования\n"
        "- Нужно ли писать код\n\n"
        "**Часть 2. Рефлексия (5 мин)**\n"
        "Ответь на вопросы:\n"
        "1. Какое из 3 направлений тебе ближе всего и почему?\n"
        "2. Какой из мифов об IT (из материала урока) ты раньше считал правдой?\n"
        "3. Запиши свою цель: «Через 3 месяца я хочу уметь ____».\n\n"
        "**Формат ответа:** Свободный текст с ответами на все вопросы. Минимум 150 слов.",
        # instruction_en
        "Study the lesson material «IT1. IT Map Without Myths» and complete the assignment.\n\n"
        "**Part 1. Research (10 min)**\n"
        "Open any job board (LinkedIn Jobs, Indeed, Glassdoor). Find 3 job listings from different IT directions "
        "(e.g., frontend developer, QA engineer, product designer). For each listing write:\n"
        "- Role name\n"
        "- 3 key requirements\n"
        "- Whether coding is required\n\n"
        "**Part 2. Reflection (5 min)**\n"
        "Answer the questions:\n"
        "1. Which of the 3 directions is closest to you and why?\n"
        "2. Which IT myth (from the lesson material) did you previously believe?\n"
        "3. Write your goal: «In 3 months I want to be able to ____».\n\n"
        "**Format:** Free text with answers to all questions. Minimum 150 words.",
        # sample_ru
        "Вакансия 1: Junior Frontend-разработчик\n"
        "Требования: HTML/CSS, JavaScript, React\n"
        "Код: Да\n\n"
        "Вакансия 2: QA-инженер (ручное тестирование)\n"
        "Требования: Внимание к деталям, тест-кейсы, Jira\n"
        "Код: Нет\n\n"
        "Вакансия 3: UX-дизайнер\n"
        "Требования: Figma, пользовательские исследования, прототипирование\n"
        "Код: Нет\n\n"
        "Мне ближе frontend — нравится видеть результат визуально. "
        "Раньше думал, что нужен технический вуз, но из материала узнал, что портфолио важнее диплома.\n"
        "Моя цель: через 3 месяца я хочу уметь создавать простые веб-страницы на React.",
        # sample_en
        "Job 1: Junior Frontend Developer\nRequirements: HTML/CSS, JavaScript, React\nCoding: Yes\n\n"
        "Job 2: QA Engineer (manual testing)\nRequirements: Attention to detail, test cases, Jira\nCoding: No\n\n"
        "I'm drawn to frontend — I like seeing visual results. "
        "My goal: in 3 months I want to build simple React web pages.",
        150,
    ),

    # ── Day 2 (core) ──────────────────────────────────────────────────────
    (
        "e74584af-9ea7-4338-8a6e-5db451f6ff36",
        "Изучи материалы уроков «IT2. Компьютер и софт» и «IT3. Навыки для старта».\n\n"
        "**Задание: Настрой рабочее место**\n\n"
        "1. Установи VS Code или Cursor (если ещё не установлен).\n"
        "2. Открой терминал и выполни по порядку:\n"
        "   - `mkdir expovision-hw`\n"
        "   - `cd expovision-hw`\n"
        "   - `code .` (или `cursor .`)\n"
        "3. Создай файл `hello.txt` с текстом «Привет, IT!».\n"
        "4. Сделай скриншот или опиши, что ты увидел.\n\n"
        "**Дополнительно:**\n"
        "- Попробуй задать ChatGPT вопрос двумя способами (плохой промпт и хороший промпт, как в материале).\n"
        "- Запиши оба промпта и сравни ответы.\n\n"
        "**Формат:** Описание шагов + скриншот (или текстовое описание результата) + 2 промпта с ответами. Минимум 100 слов.",
        "Study lessons «IT2. Computer and Software» and «IT3. Skills to Start».\n\n"
        "**Task: Set Up Your Workspace**\n\n"
        "1. Install VS Code or Cursor.\n"
        "2. Open terminal and run:\n"
        "   - `mkdir expovision-hw`\n"
        "   - `cd expovision-hw`\n"
        "   - `code .`\n"
        "3. Create `hello.txt` with text «Hello, IT!».\n"
        "4. Take a screenshot or describe what you saw.\n\n"
        "**Additionally:** Try asking ChatGPT a question in two ways (bad prompt vs good prompt). Compare the answers.\n\n"
        "**Format:** Steps description + screenshot + 2 prompts with answers. Minimum 100 words.",
        "1. Установил Cursor.\n2. Открыл терминал, создал папку expovision-hw, зашёл в неё, открыл в Cursor.\n"
        "3. Создал файл hello.txt.\n\n"
        "Плохой промпт: «Как сделать сайт?» — ChatGPT дал длинный общий ответ на 3 страницы.\n"
        "Хороший промпт: «Я новичок. Покажи пошагово, как создать HTML-файл с заголовком и абзацем в VS Code.» "
        "— Получил чёткую инструкцию из 5 шагов.",
        "1. Installed Cursor.\n2. Opened terminal, created folder, opened in Cursor.\n3. Created hello.txt.\n\n"
        "Bad prompt: \"How to make a website?\" — got a 3-page generic answer.\n"
        "Good prompt: \"Show me step by step how to create an HTML file with heading in VS Code.\" — got 5 clear steps.",
        100,
    ),

    # ── Day 3 (core) ──────────────────────────────────────────────────────
    ("93a35780-244f-4a25-9b3b-8678e3db2180", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 80),

    # ── Day 4 (core) ──────────────────────────────────────────────────────
    ("45f7170c-cb02-4f05-a74e-9b6d25ee2edd", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),

    # ── Day 5 (core) ──────────────────────────────────────────────────────
    ("fdaebbb7-2b53-43ff-bb13-6f1a5675c349", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),

    # ── Day 6 (core) ──────────────────────────────────────────────────────
    ("630d14d8-aa16-4e90-a886-7707f95de914", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),

    # ── Day 7 (core) ──────────────────────────────────────────────────────
    ("15d8d458-e02e-4301-833d-5911d7f1b1bd", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),

    # ── Day 8A ─────────────────────────────────────────────────────────────
    ("7f42c483-3bba-4add-93c2-37a0c21373b2", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),

    # ── Day 8B ─────────────────────────────────────────────────────────────
    ("e5cefcc0-8eb8-40ef-a5da-b9e5ac371767", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),

    # ── Day 8C ─────────────────────────────────────────────────────────────
    ("ab0d12f4-21d8-4fc5-84d7-2c34e99ddbff", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 50),

    # ── Day 9A ─────────────────────────────────────────────────────────────
    ("f13779cc-2bc2-4edd-90ec-e746dec9ded6", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),

    # ── Day 9B ─────────────────────────────────────────────────────────────
    ("562b2741-7966-4792-b09b-07c7a15a694a", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),

    # ── Day 9C ─────────────────────────────────────────────────────────────
    ("56f32160-d93f-4554-be6e-437739138b8a", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),

    # ── Day 10A ────────────────────────────────────────────────────────────
    ("bb25fdb9-d409-4e8a-87bb-d1c2069490ba", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 80),

    # ── Day 10B ────────────────────────────────────────────────────────────
    ("8aa409b8-b52e-4430-9044-52b1594bb0f5", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),

    # ── Day 10C ────────────────────────────────────────────────────────────
    ("ce691e34-c59f-4246-a2c2-e1c6174e703d", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 50),

    # ── Day 11A ────────────────────────────────────────────────────────────
    ("24b2c596-b82e-442c-84b2-d54174edc37f", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),

    # ── Day 11B ────────────────────────────────────────────────────────────
    ("bbb5ad65-dd02-45ff-84e1-682460549202", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),

    # ── Day 11C ────────────────────────────────────────────────────────────
    ("eeb09231-9e39-4ea2-a45f-1d7ce7b3a916", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 50),

    # ── Day 12A ────────────────────────────────────────────────────────────
    ("4b6ac795-fb20-461f-a104-ab5e7501734e", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),

    # ── Day 12B ────────────────────────────────────────────────────────────
    ("c59535a8-047a-417d-bddf-016d3de2a511", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 120),

    # ── Day 12C ────────────────────────────────────────────────────────────
    ("33e7fa90-fe78-4eda-af9b-4a26a51e804d", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 50),

    # ── Day 13A ────────────────────────────────────────────────────────────
    ("d36dc8d5-28fa-47cf-84ec-096ad6e67752", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),

    # ── Day 13B ────────────────────────────────────────────────────────────
    ("108852d5-2e19-4957-a603-ce00465bcd80", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),

    # ── Day 13C ────────────────────────────────────────────────────────────
    ("16e94be2-2770-4afd-ba6b-09c9773d49b7", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),

    # ── Day 14A ────────────────────────────────────────────────────────────
    ("b858cedf-6735-4615-bf70-57665969141f", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),

    # ── Day 14B ────────────────────────────────────────────────────────────
    ("5be5cfa3-e189-4676-b956-b2b7def5fb7f", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 150),

    # ── Day 14C ────────────────────────────────────────────────────────────
    ("34ec8835-4b9f-4c1d-bc23-7d4e6f1717d8", HOMEWORK_PLACEHOLDER_RU, HOMEWORK_PLACEHOLDER_EN, "", "", 100),
]


def upgrade() -> None:
    conn = op.get_bind()
    for hw_id, instr_ru, instr_en, sample_ru, sample_en, min_len in HOMEWORK:
        conn.execute(
            text(
                """
                UPDATE "HomeworkTemplate"
                SET "instructionRu" = :instr_ru,
                    "instructionEn" = :instr_en,
                    "sampleRu" = :sample_ru,
                    "sampleEn" = :sample_en,
                    "minLength" = :min_len
                WHERE "id" = :id
                """
            ),
            {
                "id": hw_id,
                "instr_ru": instr_ru,
                "instr_en": instr_en,
                "sample_ru": sample_ru,
                "sample_en": sample_en,
                "min_len": min_len,
                },
        )


def downgrade() -> None:
    pass
