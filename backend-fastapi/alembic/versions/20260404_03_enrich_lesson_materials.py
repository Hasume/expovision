"""enrich lesson materials with facts terms and links

Revision ID: 20260404_03
Revises: 20260404_02
Create Date: 2026-04-04
"""

from __future__ import annotations

from typing import Optional

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "20260404_03"
down_revision = "20260404_02"
branch_labels = None
depends_on = None


def _key(day_number: int, track: Optional[str]) -> str:
    return f"{day_number}:{track or 'core'}"


def _resource_map() -> dict[str, dict[str, object]]:
    # Public showcase build: only days 1-2 are enriched; days 3-14 keep the
    # placeholder lesson content written by the curriculum seed.
    return {
        "1:core": {
            "fact_ru": "Рынок ценит не ширину знаний, а доказуемый результат в выбранной роли.",
            "fact_en": "The market rewards proven outcomes in a role, not broad but shallow knowledge.",
            "terms_ru": ["Roadmap — пошаговый план развития навыков", "Role fit — соответствие навыков роли", "Portfolio proof — доказательство навыка артефактом"],
            "terms_en": ["Roadmap — a phased skill development plan", "Role fit — alignment of your skills to role needs", "Portfolio proof — artifact-based evidence of skill"],
            "links": ["https://roadmap.sh/", "https://github.com/kamranahmedse/developer-roadmap", "https://www.linkedin.com/jobs/"],
        },
        "2:core": {
            "fact_ru": "Хорошо настроенное окружение экономит часы каждую неделю.",
            "fact_en": "A well-configured environment saves hours every week.",
            "terms_ru": ["IDE — среда разработки", "Terminal — интерфейс командной строки", "Version control — система контроля версий"],
            "terms_en": ["IDE — integrated development environment", "Terminal — command line interface", "Version control — system to track changes"],
            "links": ["https://developer.mozilla.org/", "https://docs.github.com/en/get-started/using-git/about-git", "https://code.visualstudio.com/docs"],
        },
    }


def _build_content_ru(
    *,
    title: str,
    focus: str,
    fact: str,
    terms: list[str],
    links: list[str],
) -> str:
    terms_md = "\n".join([f"- {term}" for term in terms])
    links_md = "\n".join([f"- {link}" for link in links])
    return (
        f"## О чем урок\n"
        f"{title}. Этот блок помогает закрепить тему: {focus}.\n\n"
        f"## После видео: что важно понять\n"
        "1) Как тема применяется в реальном проекте.\n"
        "2) Какие ошибки чаще всего совершают новички.\n"
        "3) Какие критерии качества использовать для самопроверки.\n\n"
        f"## Интересный факт\n{fact}\n\n"
        f"## Словарь терминов\n{terms_md}\n\n"
        "## Что прочитать дополнительно\n"
        "Пройди материалы ниже, законспектируй 3 вывода и 1 вопрос, который остался открытым.\n\n"
        f"## Полезные ссылки\n{links_md}\n\n"
        "## Мини-практика\n"
        "Сделай короткий разбор: что из урока ты уже можешь применить сегодня, и какой один шаг сделаешь в течение 24 часов."
    )


def _build_content_en(
    *,
    title: str,
    focus: str,
    fact: str,
    terms: list[str],
    links: list[str],
) -> str:
    terms_md = "\n".join([f"- {term}" for term in terms])
    links_md = "\n".join([f"- {link}" for link in links])
    return (
        f"## Lesson overview\n"
        f"{title}. This block reinforces the theme: {focus}.\n\n"
        f"## After the video: key takeaways\n"
        "1) How this topic is applied in real projects.\n"
        "2) Most common beginner mistakes.\n"
        "3) Quality criteria for self-check.\n\n"
        f"## Interesting fact\n{fact}\n\n"
        f"## Terms glossary\n{terms_md}\n\n"
        "## Additional reading\n"
        "Review the materials below and capture 3 takeaways and 1 open question.\n\n"
        f"## Useful links\n{links_md}\n\n"
        "## Mini practice\n"
        "Write a short note on what you can apply today and one concrete step you will take within 24 hours."
    )


def upgrade() -> None:
    conn = op.get_bind()
    resources = _resource_map()
    lessons = conn.execute(
        text(
            """
            SELECT l."id", l."titleRu", l."titleEn", d."dayNumber", d."track", d."focusRu", d."focusEn"
            FROM "Lesson" l
            JOIN "CurriculumDay" d ON d."id" = l."curriculumDayId"
            ORDER BY d."dayNumber" ASC, d."track" ASC NULLS FIRST, l."sortOrder" ASC
            """
        )
    ).mappings().all()

    for row in lessons:
        key = _key(int(row["dayNumber"]), row["track"])
        cfg = resources.get(key) or resources.get(f"{row['dayNumber']}:core")
        if not cfg:
            continue
        content_ru = _build_content_ru(
            title=str(row["titleRu"]),
            focus=str(row["focusRu"]),
            fact=str(cfg["fact_ru"]),
            terms=[str(x) for x in cfg["terms_ru"]],
            links=[str(x) for x in cfg["links"]],
        )
        content_en = _build_content_en(
            title=str(row["titleEn"]),
            focus=str(row["focusEn"]),
            fact=str(cfg["fact_en"]),
            terms=[str(x) for x in cfg["terms_en"]],
            links=[str(x) for x in cfg["links"]],
        )
        conn.execute(
            text(
                """
                UPDATE "Lesson"
                SET "contentRu" = :content_ru,
                    "contentEn" = :content_en,
                    "contentStatus" = 'published'
                WHERE "id" = :id
                """
            ),
            {"id": row["id"], "content_ru": content_ru, "content_en": content_en},
        )


def downgrade() -> None:
    # Content enrichment migration is intentionally irreversible.
    pass
