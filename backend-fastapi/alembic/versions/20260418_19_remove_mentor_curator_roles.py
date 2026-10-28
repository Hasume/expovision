"""Remove mentor and curator roles — convert any remaining users to admin.

Revision ID: 20260418_19
Revises: 20260418_18
Create Date: 2026-04-18
"""

from alembic import op

revision = "20260418_19"
down_revision = "20260418_18"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE \"User\" SET role = 'admin' WHERE role IN ('mentor', 'curator')")


def downgrade() -> None:
    # Roles cannot be restored without original data.
    pass
