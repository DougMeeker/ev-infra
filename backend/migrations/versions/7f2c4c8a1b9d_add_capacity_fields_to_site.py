"""add capacity fields to site

Revision ID: 7f2c4c8a1b9d
Revises: 3c9d1f4b2e3a
Create Date: 2025-11-21
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '7f2c4c8a1b9d'
down_revision = '3c9d1f4b2e3a'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('sites', sa.Column('main_breaker_amps', sa.Integer()))
    op.add_column('sites', sa.Column('voltage', sa.Integer()))
    op.add_column('sites', sa.Column('phase_count', sa.Integer()))


def downgrade():
    op.drop_column('sites', 'phase_count')
    op.drop_column('sites', 'voltage')
    op.drop_column('sites', 'main_breaker_amps')
