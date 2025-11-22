"""add power_factor to site

Revision ID: b6c7d8e9f0a1
Revises: a4d5e6f7c8b9
Create Date: 2025-11-21
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b6c7d8e9f0a1'
down_revision = 'a4d5e6f7c8b9'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('sites', sa.Column('power_factor', sa.Float(), server_default='0.95'))
    # Optionally adjust server_default to NULL and rely on application default if desired.


def downgrade():
    op.drop_column('sites', 'power_factor')
