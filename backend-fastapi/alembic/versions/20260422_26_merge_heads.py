"""Merge parallel migration branches (20260421_25 and 20260422_24)."""

revision = "20260422_26"
down_revision = ("20260421_25", "20260422_24")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Both branches are independent; no extra DDL — single linear head for Alembic.
    pass


def downgrade() -> None:
    pass
