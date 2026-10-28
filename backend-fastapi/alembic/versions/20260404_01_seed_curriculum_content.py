"""seed curriculum lessons and homework content

Revision ID: 20260404_02
Revises: 20260404_01
Create Date: 2026-04-04
"""

from __future__ import annotations

from typing import Optional

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "20260404_02"
down_revision = "20260404_01"
branch_labels = None
depends_on = None

# Public showcase build: only programme days 1-2 ship with full course content.
# Days 3-14 keep their structure and titles, with short placeholders instead of content.
LESSON_PLACEHOLDER_RU = "Полный материал урока доступен в курсе Expovision."
LESSON_PLACEHOLDER_EN = "The full lesson content is available in the Expovision course."
HOMEWORK_PLACEHOLDER_RU = "Полное задание доступно в курсе Expovision."
HOMEWORK_PLACEHOLDER_EN = "Full assignment is available in the Expovision course."


def _build_content_ru(goal: str, fact: str, material_url: str, links: list[str]) -> str:
    links_md = "\n".join([f"- {url}" for url in links])
    return (
        f"## Цель\n{goal}\n\n"
        f"## Практика\nВыполни задание блока и зафиксируй результат в 3-5 шагах.\n\n"
        f"## Интересный факт\n{fact}\n\n"
        f"## Материалы\n- {material_url}\n\n"
        f"## Полезные ссылки\n{links_md}"
    )


def _build_content_en(goal: str, fact: str, material_url: str, links: list[str]) -> str:
    links_md = "\n".join([f"- {url}" for url in links])
    return (
        f"## Goal\n{goal}\n\n"
        f"## Practice\nComplete the block assignment and record the result in 3-5 steps.\n\n"
        f"## Interesting fact\n{fact}\n\n"
        f"## Materials\n- {material_url}\n\n"
        f"## Useful links\n{links_md}"
    )


def _track_sql(track: Optional[str]) -> tuple[str, dict[str, Optional[str]]]:
    if track is None:
        return '"track" IS NULL', {}
    return '"track" = :track', {"track": track}


def _upsert_day(
    *,
    day_number: int,
    track: Optional[str],
    phase: str,
    focus_ru: str,
    focus_en: str,
    message_ru: str,
    message_en: str,
) -> str:
    conn = op.get_bind()
    where_sql, where_args = _track_sql(track)
    row = conn.execute(
        text(
            f"""
            SELECT "id"
            FROM "CurriculumDay"
            WHERE "dayNumber" = :day_number
              AND {where_sql}
            LIMIT 1
            """
        ),
        {"day_number": day_number, **where_args},
    ).mappings().first()

    if row:
        day_id = row["id"]
        conn.execute(
            text(
                """
                UPDATE "CurriculumDay"
                SET "phase" = :phase,
                    "focusRu" = :focus_ru,
                    "focusEn" = :focus_en,
                    "messageRu" = :message_ru,
                    "messageEn" = :message_en,
                    "contentStatus" = 'published'
                WHERE "id" = :id
                """
            ),
            {
                "id": day_id,
                "phase": phase,
                "focus_ru": focus_ru,
                "focus_en": focus_en,
                "message_ru": message_ru,
                "message_en": message_en,
            },
        )
        return day_id

    day_id = f"day-{day_number}-{track.lower() if track else 'core'}"
    conn.execute(
        text(
            """
            INSERT INTO "CurriculumDay" (
                "id", "dayNumber", "track", "phase", "focusRu", "focusEn", "messageRu", "messageEn", "contentStatus"
            )
            VALUES (:id, :day_number, :track, :phase, :focus_ru, :focus_en, :message_ru, :message_en, 'published')
            ON CONFLICT ("id") DO UPDATE
            SET "dayNumber" = EXCLUDED."dayNumber",
                "track" = EXCLUDED."track",
                "phase" = EXCLUDED."phase",
                "focusRu" = EXCLUDED."focusRu",
                "focusEn" = EXCLUDED."focusEn",
                "messageRu" = EXCLUDED."messageRu",
                "messageEn" = EXCLUDED."messageEn",
                "contentStatus" = 'published'
            """
        ),
        {
            "id": day_id,
            "day_number": day_number,
            "track": track,
            "phase": phase,
            "focus_ru": focus_ru,
            "focus_en": focus_en,
            "message_ru": message_ru,
            "message_en": message_en,
        },
    )
    return day_id


def _upsert_lesson(
    *,
    day_id: str,
    lesson_id: str,
    title_ru: str,
    title_en: str,
    content_ru: str,
    content_en: str,
    video_url: str,
) -> None:
    conn = op.get_bind()
    existing = conn.execute(
        text(
            """
            SELECT "id"
            FROM "Lesson"
            WHERE "curriculumDayId" = :day_id
              AND "sortOrder" = 1
            LIMIT 1
            """
        ),
        {"day_id": day_id},
    ).mappings().first()
    target_id = existing["id"] if existing else lesson_id
    has_id = conn.execute(text('SELECT 1 FROM "Lesson" WHERE "id" = :id'), {"id": target_id}).first()
    if has_id:
        conn.execute(
            text(
                """
                UPDATE "Lesson"
                SET "curriculumDayId" = :day_id,
                    "kind" = 'mandatory',
                    "titleRu" = :title_ru,
                    "titleEn" = :title_en,
                    "contentRu" = :content_ru,
                    "contentEn" = :content_en,
                    "videoUrl" = :video_url,
                    "sortOrder" = 1,
                    "contentStatus" = 'published'
                WHERE "id" = :id
                """
            ),
            {
                "id": target_id,
                "day_id": day_id,
                "title_ru": title_ru,
                "title_en": title_en,
                "content_ru": content_ru,
                "content_en": content_en,
                "video_url": video_url,
            },
        )
        return

    conn.execute(
        text(
            """
            INSERT INTO "Lesson" (
                "id", "curriculumDayId", "kind", "titleRu", "titleEn", "contentRu", "contentEn", "videoUrl", "sortOrder", "contentStatus"
            )
            VALUES (
                :id, :day_id, 'mandatory', :title_ru, :title_en, :content_ru, :content_en, :video_url, 1, 'published'
            )
            """
        ),
        {
            "id": target_id,
            "day_id": day_id,
            "title_ru": title_ru,
            "title_en": title_en,
            "content_ru": content_ru,
            "content_en": content_en,
            "video_url": video_url,
        },
    )


def _upsert_homework(
    *,
    day_id: str,
    template_id: str,
    instruction_ru: str,
    instruction_en: str,
    sample_ru: str,
    sample_en: str,
    min_length: int,
) -> None:
    conn = op.get_bind()
    existing = conn.execute(
        text(
            """
            SELECT "id"
            FROM "HomeworkTemplate"
            WHERE "curriculumDayId" = :day_id
            LIMIT 1
            """
        ),
        {"day_id": day_id},
    ).mappings().first()
    target_id = existing["id"] if existing else template_id
    has_id = conn.execute(text('SELECT 1 FROM "HomeworkTemplate" WHERE "id" = :id'), {"id": target_id}).first()
    if has_id:
        conn.execute(
            text(
                """
                UPDATE "HomeworkTemplate"
                SET "curriculumDayId" = :day_id,
                    "instructionRu" = :instruction_ru,
                    "instructionEn" = :instruction_en,
                    "sampleRu" = :sample_ru,
                    "sampleEn" = :sample_en,
                    "minLength" = :min_length,
                    "dueHourOffset" = 24,
                    "lessonId" = NULL,
                    "contentStatus" = 'published'
                WHERE "id" = :id
                """
            ),
            {
                "id": target_id,
                "day_id": day_id,
                "instruction_ru": instruction_ru,
                "instruction_en": instruction_en,
                "sample_ru": sample_ru,
                "sample_en": sample_en,
                "min_length": min_length,
            },
        )
        return

    conn.execute(
        text(
            """
            INSERT INTO "HomeworkTemplate" (
                "id", "curriculumDayId", "instructionRu", "instructionEn", "sampleRu", "sampleEn",
                "minLength", "dueHourOffset", "lessonId", "contentStatus"
            )
            VALUES (
                :id, :day_id, :instruction_ru, :instruction_en, :sample_ru, :sample_en,
                :min_length, 24, NULL, 'published'
            )
            """
        ),
        {
            "id": target_id,
            "day_id": day_id,
            "instruction_ru": instruction_ru,
            "instruction_en": instruction_en,
            "sample_ru": sample_ru,
            "sample_en": sample_en,
            "min_length": min_length,
        },
    )


def _upsert_artifact(
    *,
    day_id: str,
    artifact_id: str,
    title_ru: str,
    title_en: str,
    resource_url: str,
) -> None:
    conn = op.get_bind()
    existing = conn.execute(
        text(
            """
            SELECT "id"
            FROM "Artifact"
            WHERE "curriculumDayId" = :day_id
            LIMIT 1
            """
        ),
        {"day_id": day_id},
    ).mappings().first()
    target_id = existing["id"] if existing else artifact_id
    has_id = conn.execute(text('SELECT 1 FROM "Artifact" WHERE "id" = :id'), {"id": target_id}).first()
    if has_id:
        conn.execute(
            text(
                """
                UPDATE "Artifact"
                SET "curriculumDayId" = :day_id,
                    "titleRu" = :title_ru,
                    "titleEn" = :title_en,
                    "resourceUrl" = :resource_url,
                    "contentStatus" = 'published'
                WHERE "id" = :id
                """
            ),
            {
                "id": target_id,
                "day_id": day_id,
                "title_ru": title_ru,
                "title_en": title_en,
                "resource_url": resource_url,
            },
        )
        return

    conn.execute(
        text(
            """
            INSERT INTO "Artifact" ("id", "curriculumDayId", "titleRu", "titleEn", "resourceUrl", "contentStatus")
            VALUES (:id, :day_id, :title_ru, :title_en, :resource_url, 'published')
            """
        ),
        {
            "id": target_id,
            "day_id": day_id,
            "title_ru": title_ru,
            "title_en": title_en,
            "resource_url": resource_url,
        },
    )


def _content_blocks() -> list[dict]:
    return [
        {"day": 1, "track": None, "phase": "core", "focus_ru": "Понять карту IT", "focus_en": "Understand the IT map", "lesson_ru": "IT1. Карта IT без мифов", "lesson_en": "IT1. IT map without myths", "hw_ru": "Определи свой фокус.", "hw_en": "Define your focus.", "min_len": 20, "fact_ru": "Для первого оффера важнее базовые навыки и портфолио, чем идеальный стек.", "fact_en": "For a first offer, fundamentals and portfolio matter more than a perfect stack.", "material": "https://assets.example.com/it-roles-map.pdf", "links": ["https://roadmap.sh/", "https://github.com/kamranahmedse/developer-roadmap"]},
        {"day": 2, "track": None, "phase": "core", "focus_ru": "Компьютер и софт", "focus_en": "Computer and software", "lesson_ru": "IT2. Компьютер и софт на пальцах", "lesson_en": "IT2. Computer and software basics", "hw_ru": "Собери рабочий стол.", "hw_en": "Assemble your workspace.", "min_len": 20, "fact_ru": "Скорость старта растет, когда окружение настроено до автоматизма.", "fact_en": "Setup speed increases when your environment is standardized.", "material": "https://assets.example.com/tools-checklist.pdf", "links": ["https://developer.mozilla.org/", "https://guides.github.com/introduction/git-handbook/"]},
        {"day": 3, "track": None, "phase": "core", "focus_ru": "Инструменты IT", "focus_en": "IT tools", "lesson_ru": "IT3. Инструменты IT-специалиста", "lesson_en": "IT3. IT specialist toolkit", "min_len": 20, "placeholder": True},
        {"day": 4, "track": None, "phase": "core", "focus_ru": "Поиск и безопасность", "focus_en": "Search and security", "lesson_ru": "IT4. Поиск и цифровая безопасность", "lesson_en": "IT4. Search and digital security", "min_len": 20, "placeholder": True},
        {"day": 5, "track": None, "phase": "core", "focus_ru": "Принципы нейросетей", "focus_en": "Neural network principles", "lesson_ru": "AI1. Принципы нейросетей", "lesson_en": "AI1. Neural network principles", "min_len": 25, "placeholder": True},
        {"day": 6, "track": None, "phase": "core", "focus_ru": "Ошибки нейросетей", "focus_en": "Neural network errors", "lesson_ru": "AI2. Ошибки и ограничения ИИ", "lesson_en": "AI2. AI errors and limits", "min_len": 25, "placeholder": True},
        {"day": 7, "track": None, "phase": "core", "focus_ru": "Развилка и выбор трека", "focus_en": "Split and track choice", "lesson_ru": "IT5. Выбор трека развития", "lesson_en": "IT5. Choosing your development track", "min_len": 25, "placeholder": True},
        {"day": 8, "track": "A", "phase": "track", "focus_ru": "Как рождается продукт", "focus_en": "How products are born", "lesson_ru": "A1. Product lifecycle", "lesson_en": "A1. Product lifecycle", "min_len": 25, "placeholder": True},
        {"day": 8, "track": "B", "phase": "track", "focus_ru": "Глубокое обучение", "focus_en": "Deep learning", "lesson_ru": "B1. Эволюция AI-моделей", "lesson_en": "B1. Evolution of AI models", "min_len": 25, "placeholder": True},
        {"day": 8, "track": "C", "phase": "track", "focus_ru": "Сайт-визитка", "focus_en": "Landing page MVP", "lesson_ru": "C1. Сайт-визитка", "lesson_en": "C1. Landing page", "min_len": 20, "placeholder": True},
        {"day": 9, "track": "A", "phase": "track", "focus_ru": "Языки в IT", "focus_en": "Languages in IT", "lesson_ru": "A2. Языки и стек", "lesson_en": "A2. Languages and stack", "min_len": 25, "placeholder": True},
        {"day": 9, "track": "B", "phase": "track", "focus_ru": "Данные как основа ИИ", "focus_en": "Data as AI foundation", "lesson_ru": "B2. Data workflow", "lesson_en": "B2. Data workflow", "min_len": 25, "placeholder": True},
        {"day": 9, "track": "C", "phase": "track", "focus_ru": "AI-ассистент в Telegram", "focus_en": "Telegram AI assistant", "lesson_ru": "C2. Telegram AI assistant", "lesson_en": "C2. Telegram AI assistant", "min_len": 20, "placeholder": True},
        {"day": 10, "track": "A", "phase": "track", "focus_ru": "Интернет и сети", "focus_en": "Internet and networks", "lesson_ru": "A3. Интернет и сети", "lesson_en": "A3. Internet and networks", "min_len": 25, "placeholder": True},
        {"day": 10, "track": "B", "phase": "track", "focus_ru": "Нейросеть Manus", "focus_en": "AI agent design", "lesson_ru": "B3. Проектирование AI-агента", "lesson_en": "B3. Designing an AI agent", "min_len": 25, "placeholder": True},
        {"day": 10, "track": "C", "phase": "track", "focus_ru": "Интернет-магазин Golden Bakery", "focus_en": "Golden Bakery store", "lesson_ru": "C3. Интернет-магазин MVP", "lesson_en": "C3. E-commerce MVP", "min_len": 20, "placeholder": True},
        {"day": 11, "track": "A", "phase": "track", "focus_ru": "Финальная сборка roadmap", "focus_en": "Final roadmap assembly", "lesson_ru": "A4. Roadmap draft", "lesson_en": "A4. Roadmap draft", "min_len": 30, "placeholder": True},
        {"day": 11, "track": "B", "phase": "track", "focus_ru": "Сборка AI-системы", "focus_en": "Building AI system", "lesson_ru": "B4. Архитектура AI-системы", "lesson_en": "B4. AI system architecture", "min_len": 30, "placeholder": True},
        {"day": 11, "track": "C", "phase": "track", "focus_ru": "Email-уведомления", "focus_en": "Email notifications", "lesson_ru": "C4. Email notifications", "lesson_en": "C4. Email notifications", "min_len": 20, "placeholder": True},
        {"day": 12, "track": "A", "phase": "track", "focus_ru": "Финальная сборка roadmap", "focus_en": "Final roadmap assembly", "lesson_ru": "A5. Skill-gap анализ", "lesson_en": "A5. Skill-gap analysis", "min_len": 30, "placeholder": True},
        {"day": 12, "track": "B", "phase": "track", "focus_ru": "Сборка AI-системы", "focus_en": "Building AI system", "lesson_ru": "B5. Адаптация под use case", "lesson_en": "B5. Use-case adaptation", "min_len": 30, "placeholder": True},
        {"day": 12, "track": "C", "phase": "track", "focus_ru": "Публикация и упаковка проекта", "focus_en": "Release and packaging", "lesson_ru": "C5. Публикация проекта", "lesson_en": "C5. Project deployment", "min_len": 25, "placeholder": True},
        {"day": 13, "track": "A", "phase": "track", "focus_ru": "Финальная сборка roadmap", "focus_en": "Final roadmap assembly", "lesson_ru": "A6. Резюме и позиционирование", "lesson_en": "A6. CV and positioning", "min_len": 30, "placeholder": True},
        {"day": 13, "track": "B", "phase": "track", "focus_ru": "Сборка AI-системы", "focus_en": "Building AI system", "lesson_ru": "B6. Тестирование автоматизаций", "lesson_en": "B6. Automation testing", "min_len": 30, "placeholder": True},
        {"day": 13, "track": "C", "phase": "track", "focus_ru": "Публикация и упаковка проекта", "focus_en": "Release and packaging", "lesson_ru": "C6. Упаковка кейса", "lesson_en": "C6. Case study packaging", "min_len": 25, "placeholder": True},
        {"day": 14, "track": "A", "phase": "track", "focus_ru": "Финальная сборка roadmap", "focus_en": "Final roadmap assembly", "lesson_ru": "A7. План входа в IT", "lesson_en": "A7. IT entry plan", "min_len": 40, "placeholder": True},
        {"day": 14, "track": "B", "phase": "track", "focus_ru": "Сборка AI-системы", "focus_en": "Building AI system", "lesson_ru": "B7. Финальная AI-система", "lesson_en": "B7. Final AI system", "min_len": 40, "placeholder": True},
        {"day": 14, "track": "C", "phase": "track", "focus_ru": "Публикация и упаковка проекта", "focus_en": "Release and packaging", "lesson_ru": "C7. Готовый MVP + кейс", "lesson_en": "C7. Final MVP + case study", "min_len": 40, "placeholder": True},
    ]


def upgrade() -> None:
    for block in _content_blocks():
        day = int(block["day"])
        track = block["track"]
        day_id = _upsert_day(
            day_number=day,
            track=track,
            phase=str(block["phase"]),
            focus_ru=str(block["focus_ru"]),
            focus_en=str(block["focus_en"]),
            message_ru=f"День {day}: {block['focus_ru']}",
            message_en=f"Day {day}: {block['focus_en']}",
        )
        placeholder = bool(block.get("placeholder"))
        if placeholder:
            content_ru, content_en = LESSON_PLACEHOLDER_RU, LESSON_PLACEHOLDER_EN
        else:
            content_ru = _build_content_ru(
                goal=str(block["focus_ru"]),
                fact=str(block["fact_ru"]),
                material_url=str(block["material"]),
                links=[str(x) for x in block["links"]],
            )
            content_en = _build_content_en(
                goal=str(block["focus_en"]),
                fact=str(block["fact_en"]),
                material_url=str(block["material"]),
                links=[str(x) for x in block["links"]],
            )
        suffix = track.lower() if isinstance(track, str) else "core"
        _upsert_lesson(
            day_id=day_id,
            lesson_id=f"lesson-{day}-{suffix}",
            title_ru=str(block["lesson_ru"]),
            title_en=str(block["lesson_en"]),
            content_ru=content_ru,
            content_en=content_en,
            video_url=f"https://videos.expovision.local/{day}-{suffix}",
        )
        if placeholder:
            _upsert_homework(
                day_id=day_id,
                template_id=f"hw-{day}-{suffix}",
                instruction_ru=HOMEWORK_PLACEHOLDER_RU,
                instruction_en=HOMEWORK_PLACEHOLDER_EN,
                sample_ru="",
                sample_en="",
                min_length=int(block["min_len"]),
            )
            # Placeholder days have no day artifact (reading list).
            continue
        _upsert_homework(
            day_id=day_id,
            template_id=f"hw-{day}-{suffix}",
            instruction_ru=str(block["hw_ru"]),
            instruction_en=str(block["hw_en"]),
            sample_ru=(
                f"Что сделал: ...\nПочему так: ...\nИнтересный факт: {block['fact_ru']}\n"
                f"Материалы: {block['material']}\nСсылки: {', '.join([str(x) for x in block['links']])}"
            ),
            sample_en=(
                f"What I did: ...\nWhy this approach: ...\nInteresting fact: {block['fact_en']}\n"
                f"Materials: {block['material']}\nLinks: {', '.join([str(x) for x in block['links']])}"
            ),
            min_length=int(block["min_len"]),
        )
        _upsert_artifact(
            day_id=day_id,
            artifact_id=f"artifact-{day}-{suffix}",
            title_ru=f"Материалы D{day}{'-' + track if track else ''}",
            title_en=f"Materials D{day}{'-' + track if track else ''}",
            resource_url=str(block["material"]),
        )


def downgrade() -> None:
    # Data migration is intentionally not reversed automatically.
    pass
