"""StudentCertificate: certificateRequestedAt for student request flow."""

from alembic import op

revision = "20260421_24"
down_revision = "20260421_23"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        'ALTER TABLE "StudentCertificate" ADD COLUMN IF NOT EXISTS "certificateRequestedAt" TIMESTAMP'
    )


def downgrade() -> None:
    op.execute('ALTER TABLE "StudentCertificate" DROP COLUMN IF EXISTS "certificateRequestedAt"')
