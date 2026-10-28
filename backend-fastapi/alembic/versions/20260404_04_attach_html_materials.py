"""attach html materials to lessons and cleanup notes

Revision ID: 20260404_04
Revises: 20260404_03
Create Date: 2026-04-04
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "20260404_04"
down_revision = "20260404_03"
branch_labels = None
depends_on = None


def _compact_ru(title: str, focus: str, day_number: int, track: str | None) -> str:
    track_text = track if track else "core"
    return (
        f"## Краткий конспект\n"
        f"{title}. Фокус дня: {focus}.\n\n"
        f"## Что сделать после видео\n"
        f"1) Открой раздел «Материалы» и изучи HTML-файл урока.\n"
        f"2) Выпиши 3 ключевых вывода и 1 вопрос.\n"
        f"3) Сделай мини-практику и переходи к домашнему заданию.\n\n"
        f"## Навигация\n"
        f"День: {day_number}, трек: {track_text}."
    )


def _compact_en(title: str, focus: str, day_number: int, track: str | None) -> str:
    track_text = track if track else "core"
    return (
        f"## Compact notes\n"
        f"{title}. Day focus: {focus}.\n\n"
        f"## What to do after video\n"
        f"1) Open the Materials section and read the lesson HTML file.\n"
        f"2) Capture 3 key takeaways and 1 open question.\n"
        f"3) Complete mini-practice and continue to homework.\n\n"
        f"## Navigation\n"
        f"Day: {day_number}, track: {track_text}."
    )


def upgrade() -> None:
    conn = op.get_bind()
    lessons = conn.execute(
        text(
            """
            SELECT l."id", l."titleRu", l."titleEn", d."dayNumber", d."track", d."focusRu", d."focusEn"
            FROM "Lesson" l
            JOIN "CurriculumDay" d ON d."id" = l."curriculumDayId"
            ORDER BY d."dayNumber", d."track" NULLS FIRST, l."sortOrder"
            """
        )
    ).mappings().all()

    for row in lessons:
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
            {
                "id": row["id"],
                "content_ru": _compact_ru(
                    title=str(row["titleRu"]),
                    focus=str(row["focusRu"]),
                    day_number=int(row["dayNumber"]),
                    track=row["track"],
                ),
                "content_en": _compact_en(
                    title=str(row["titleEn"]),
                    focus=str(row["focusEn"]),
                    day_number=int(row["dayNumber"]),
                    track=row["track"],
                ),
            },
        )

    conn.execute(text('DELETE FROM "LessonImage"'))
    for row in lessons:
        lesson_id = str(row["id"])
        conn.execute(
            text(
                """
                INSERT INTO "LessonImage" (
                    "id", "lessonId", "url", "captionRu", "captionEn", "sortOrder", "mediaStatus", "deletedAt", "deletedBy"
                )
                VALUES (
                    :id, :lesson_id, :url, :caption_ru, :caption_en, 1, 'ready', NULL, NULL
                )
                """
            ),
            {
                "id": f"mat-{lesson_id}",
                "lesson_id": lesson_id,
                "url": f"/materials/lessons/{lesson_id}.html",
                "caption_ru": "Материал урока (HTML, 2-3 страницы)",
                "caption_en": "Lesson material (HTML, 2-3 pages)",
            },
        )


def downgrade() -> None:
    # Data cleanup migration is intentionally irreversible.
    pass
