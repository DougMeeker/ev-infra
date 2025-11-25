"""Add address and city fields to Site.

Revision ID: f3a1c2b4d5e6
Revises: e22b765a2a1a
Create Date: 2025-11-21 15:05:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f3a1c2b4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e22b765a2a1a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sites', sa.Column('address', sa.String(length=256), nullable=True))
    op.add_column('sites', sa.Column('city', sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column('sites', 'city')
    op.drop_column('sites', 'address')
