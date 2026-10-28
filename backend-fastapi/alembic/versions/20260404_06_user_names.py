"""add first and last name to users

Revision ID: 20260404_06
Revises: 20260404_05
Create Date: 2026-04-04
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260404_06"
down_revision = "20260404_05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT')
    op.execute('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT')

    op.execute(
        """
        UPDATE "User"
        SET "firstName" = COALESCE(NULLIF(TRIM(SPLIT_PART("email", '@', 1)), ''), 'Student'),
            "lastName" = COALESCE(NULLIF("lastName", ''), '')
        WHERE "firstName" IS NULL OR TRIM("firstName") = ''
        """
    )
    op.execute(
        """
        UPDATE "User"
        SET "lastName" = ''
        WHERE "lastName" IS NULL
        """
    )

    op.execute('ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL')
    op.execute('ALTER TABLE "User" ALTER COLUMN "lastName" SET NOT NULL')
    op.execute('ALTER TABLE "User" ALTER COLUMN "firstName" SET DEFAULT \'Student\'')
    op.execute('ALTER TABLE "User" ALTER COLUMN "lastName" SET DEFAULT \'\'')


def downgrade() -> None:
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "lastName"')
    op.execute('ALTER TABLE "User" DROP COLUMN IF EXISTS "firstName"')
