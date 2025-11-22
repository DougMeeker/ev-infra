"""add utility bill table

Revision ID: 3c9d1f4b2e3a
Revises: e22b765a2a1a
Create Date: 2025-11-21
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '3c9d1f4b2e3a'
down_revision = 'e22b765a2a1a'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'utility_bills',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('site_id', sa.Integer(), sa.ForeignKey('sites.id'), nullable=False, index=True),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('energy_usage', sa.Float()),
        sa.Column('max_power', sa.Float()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.text('false')),
        sa.UniqueConstraint('site_id', 'year', 'month', name='uq_site_year_month')
    )


def downgrade():
    op.drop_table('utility_bills')
