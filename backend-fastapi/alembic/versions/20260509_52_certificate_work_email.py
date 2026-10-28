"""StudentCertificate: workEmail — recipient address for certificate delivery.

Revision ID: 20260509_52
Revises: 20260506_04
Branch Labels: None
Depends on: None
"""

from alembic import op

revision = "20260509_52"
down_revision = "20260506_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "StudentCertificate" ADD COLUMN IF NOT EXISTS "workEmail" TEXT'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "StudentCertificate" DROP COLUMN IF EXISTS "workEmail"')
