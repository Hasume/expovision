"""Clear placeholder lesson video URLs left by the curriculum seed.

The seed migration (20260404_02) filled ``Lesson.videoUrl`` with placeholder links to a
host that does not exist, so every lesson rendered a broken video frame. With an empty
``videoUrl`` the lesson page shows its "video will appear here" placeholder until an
administrator attaches a real video (direct URL or Kinescope).

Revision ID: 20261028_55
Revises: 20260509_54
Create Date: 2026-10-28
"""

from alembic import op

revision = "20261028_55"
down_revision = "20260509_54"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE "Lesson"
        SET "videoUrl" = ''
        WHERE "videoUrl" LIKE 'https://videos.expovision.local/%'
        """
    )


def downgrade() -> None:
    # The placeholders pointed nowhere; there is nothing useful to restore.
    pass
