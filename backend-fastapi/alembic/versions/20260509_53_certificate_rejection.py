"""StudentCertificate: rejection fields for admin decline with comment.

Revision ID: 20260509_53
Revises: 20260509_52
Branch Labels: None
Depends on: None
"""

from alembic import op

revision = "20260509_53"
down_revision = "20260509_52"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "StudentCertificate" ADD COLUMN IF NOT EXISTS "certificateRejectedAt" TIMESTAMP'
    )
    op.execute(
        'ALTER TABLE "StudentCertificate" ADD COLUMN IF NOT EXISTS "certificateRejectionComment" TEXT'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "StudentCertificate" DROP COLUMN IF EXISTS "certificateRejectionComment"')
    op.execute('ALTER TABLE "StudentCertificate" DROP COLUMN IF EXISTS "certificateRejectedAt"')
