"""HomeworkAttachment — per-submission file attachments."""

from alembic import op

revision = "20260422_23"
down_revision = "20260421_22"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS "HomeworkAttachment" (
            "id"           TEXT PRIMARY KEY,
            "submissionId" TEXT NOT NULL REFERENCES "HomeworkSubmission"("id") ON DELETE CASCADE,
            "fileUrl"      TEXT NOT NULL,
            "fileName"     TEXT NOT NULL,
            "fileSize"     INTEGER NOT NULL DEFAULT 0,
            "mimeType"     TEXT NOT NULL DEFAULT '',
            "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute('CREATE INDEX IF NOT EXISTS "idx_hw_attachment_submission" ON "HomeworkAttachment" ("submissionId")')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "idx_hw_attachment_submission"')
    op.execute('DROP TABLE IF EXISTS "HomeworkAttachment"')
