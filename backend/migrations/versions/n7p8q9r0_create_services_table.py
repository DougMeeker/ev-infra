"""create services table and migrate utility data

Revision ID: n7p8q9r0
Revises: m3n4o5p6
Create Date: 2026-01-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'n7p8q9r0'
down_revision = 'm3n4o5p6'
branch_labels = None
depends_on = None


def upgrade():
    # Create services table
    op.create_table('services',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('site_id', sa.Integer(), nullable=False),
        sa.Column('utility', sa.String(length=64), nullable=True),
        sa.Column('utility_account', sa.String(length=64), nullable=True),
        sa.Column('utility_name', sa.String(length=64), nullable=True),
        sa.Column('meter_number', sa.String(length=64), nullable=True),
        sa.Column('main_breaker_amps', sa.Integer(), nullable=True),
        sa.Column('voltage', sa.Integer(), nullable=True),
        sa.Column('phase_count', sa.Integer(), nullable=True),
        sa.Column('power_factor', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['site_id'], ['sites.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_services_site_id'), 'services', ['site_id'], unique=False)
    
    # Migrate data from sites to services
    # For each site, create a service record with the utility and electrical capacity data
    op.execute("""
        INSERT INTO services (site_id, utility, utility_account, utility_name, meter_number, 
                             main_breaker_amps, voltage, phase_count, power_factor, 
                             created_at, updated_at, is_deleted)
        SELECT id, utility, utility_account, utility_name, meter_number,
               main_breaker_amps, voltage, phase_count, 
               COALESCE(power_factor, 0.95),
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false
        FROM sites
        WHERE utility IS NOT NULL 
           OR utility_account IS NOT NULL 
           OR meter_number IS NOT NULL
           OR main_breaker_amps IS NOT NULL
           OR voltage IS NOT NULL
    """)
    
    # Add temporary service_id column to utility_bills
    op.add_column('utility_bills', sa.Column('service_id', sa.Integer(), nullable=True))
    
    # Migrate utility_bills to reference services instead of sites
    # Match bills to the service created for each site
    op.execute("""
        UPDATE utility_bills ub
        SET service_id = (
            SELECT s.id 
            FROM services s 
            WHERE s.site_id = ub.site_id 
            LIMIT 1
        )
    """)
    
    # Make service_id not nullable and add foreign key
    op.alter_column('utility_bills', 'service_id', nullable=False)
    op.create_foreign_key('fk_utility_bills_service_id', 'utility_bills', 'services', ['service_id'], ['id'])
    op.create_index(op.f('ix_utility_bills_service_id'), 'utility_bills', ['service_id'], unique=False)
    
    # Drop old constraint and index
    op.drop_constraint('uq_site_year_month', 'utility_bills', type_='unique')
    op.drop_index('ix_utility_bills_site_id', table_name='utility_bills')
    
    # Drop the old site_id column and foreign key
    op.drop_constraint('utility_bills_site_id_fkey', 'utility_bills', type_='foreignkey')
    op.drop_column('utility_bills', 'site_id')
    
    # Add new unique constraint on service_id, year, month
    op.create_unique_constraint('uq_service_year_month', 'utility_bills', ['service_id', 'year', 'month'])
    
    # Drop utility and electrical capacity columns from sites table
    op.drop_column('sites', 'utility')
    op.drop_column('sites', 'utility_account')
    op.drop_column('sites', 'utility_name')
    op.drop_column('sites', 'meter_number')
    op.drop_column('sites', 'main_breaker_amps')
    op.drop_column('sites', 'voltage')
    op.drop_column('sites', 'phase_count')
    op.drop_column('sites', 'power_factor')


def downgrade():
    # Add back columns to sites table
    op.add_column('sites', sa.Column('power_factor', sa.Float(), nullable=True))
    op.add_column('sites', sa.Column('phase_count', sa.Integer(), nullable=True))
    op.add_column('sites', sa.Column('voltage', sa.Integer(), nullable=True))
    op.add_column('sites', sa.Column('main_breaker_amps', sa.Integer(), nullable=True))
    op.add_column('sites', sa.Column('meter_number', sa.String(length=64), nullable=True))
    op.add_column('sites', sa.Column('utility_name', sa.String(length=64), nullable=True))
    op.add_column('sites', sa.Column('utility_account', sa.String(length=64), nullable=True))
    op.add_column('sites', sa.Column('utility', sa.String(length=64), nullable=True))
    
    # Migrate data back from services to sites (take the first service for each site)
    op.execute("""
        UPDATE sites st
        SET utility = s.utility,
            utility_account = s.utility_account,
            utility_name = s.utility_name,
            meter_number = s.meter_number,
            main_breaker_amps = s.main_breaker_amps,
            voltage = s.voltage,
            phase_count = s.phase_count,
            power_factor = s.power_factor
        FROM (
            SELECT DISTINCT ON (site_id) *
            FROM services
            ORDER BY site_id, id
        ) s
        WHERE st.id = s.site_id
    """)
    
    # Add site_id back to utility_bills
    op.add_column('utility_bills', sa.Column('site_id', sa.Integer(), nullable=True))
    
    # Populate site_id from service
    op.execute("""
        UPDATE utility_bills ub
        SET site_id = (
            SELECT s.site_id 
            FROM services s 
            WHERE s.id = ub.service_id
        )
    """)
    
    # Make site_id not nullable
    op.alter_column('utility_bills', 'site_id', nullable=False)
    op.create_foreign_key('utility_bills_site_id_fkey', 'utility_bills', 'sites', ['site_id'], ['id'])
    op.create_index('ix_utility_bills_site_id', 'utility_bills', ['site_id'], unique=False)
    
    # Drop new constraint
    op.drop_constraint('uq_service_year_month', 'utility_bills', type_='unique')
    
    # Drop service_id column and constraint
    op.drop_index(op.f('ix_utility_bills_service_id'), table_name='utility_bills')
    op.drop_constraint('fk_utility_bills_service_id', 'utility_bills', type_='foreignkey')
    op.drop_column('utility_bills', 'service_id')
    
    # Recreate old constraint
    op.create_unique_constraint('uq_site_year_month', 'utility_bills', ['site_id', 'year', 'month'])
    
    # Drop services table
    op.drop_index(op.f('ix_services_site_id'), table_name='services')
    op.drop_table('services')
