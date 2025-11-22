"""add indexes to utility_bills

Revision ID: a4d5e6f7c8b9
Revises: 7f2c4c8a1b9d
Create Date: 2025-11-21
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a4d5e6f7c8b9'
down_revision = '7f2c4c8a1b9d'
branch_labels = None
depends_on = None

def upgrade():
    # Index to speed up year/month filtering across sites
    op.create_index('ix_utility_bills_year_month', 'utility_bills', ['year', 'month'])
    # Optional index for peak power queries (if large table); create only if not heavy
    op.create_index('ix_utility_bills_max_power', 'utility_bills', ['max_power'])


def downgrade():
    op.drop_index('ix_utility_bills_max_power', table_name='utility_bills')
    op.drop_index('ix_utility_bills_year_month', table_name='utility_bills')
