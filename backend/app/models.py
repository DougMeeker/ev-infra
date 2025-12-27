from datetime import datetime
from sqlalchemy.orm import relationship
from .extensions import db

# Association table for many-to-many relation between sites and projects
project_sites = db.Table(
    'project_sites',
    db.Column('project_id', db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True),
    db.Column('site_id', db.Integer, db.ForeignKey('sites.id', ondelete='CASCADE'), primary_key=True),
    db.UniqueConstraint('project_id', 'site_id', name='uq_project_site')
)

class Site(db.Model):
    __tablename__ = 'sites'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(128))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    department_id = db.Column(db.String(32))
    utility = db.Column(db.String(64))
    utility_account = db.Column(db.String(64))
    utility_name = db.Column(db.String(64))
    meter_number = db.Column(db.String(64))
    address = db.Column(db.String(256))
    city = db.Column(db.String(128))
    contact_name = db.Column(db.String(128))
    contact_phone = db.Column(db.String(64))
    is_deleted = db.Column(db.Boolean, default=False)
    main_breaker_amps = db.Column(db.Integer)  # Amps rating of main breaker
    voltage = db.Column(db.Integer)            # Line voltage (e.g., 240, 480)
    phase_count = db.Column(db.Integer)        # 1 or 3
    power_factor = db.Column(db.Float, default=0.95)  # Configurable PF used in capacity calcs

    # Relationship to utility bills
    bills = relationship('UtilityBill', back_populates='site', cascade='all, delete-orphan')
    # Relationship to equipment
    equipment = relationship('Equipment', back_populates='site', cascade='all, delete-orphan')
    # Many-to-many relationship to overarching projects
    projects = relationship('Project', secondary='project_sites', back_populates='sites')
    # Relationship to per-site project status updates
    project_statuses = relationship('ProjectStatus', back_populates='site', cascade='all, delete-orphan')

    def to_dict(self, include_bills: bool = False):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        # Optionally include bills (can be large; disabled by default for performance)
        if include_bills:
            data['bills'] = [bill.to_dict() for bill in self.bills]
        # Include project ids for convenience (small payload)
        if hasattr(self, 'projects'):
            data['project_ids'] = [p.id for p in self.projects]
        return data


class UtilityBill(db.Model):
    __tablename__ = 'utility_bills'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    site_id = db.Column(db.Integer, db.ForeignKey('sites.id'), nullable=False, index=True)
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)  # 1-12
    energy_usage = db.Column(db.Float)  # kWh for the period
    max_power = db.Column(db.Float)     # kW peak demand
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Soft delete flag (optional)
    is_deleted = db.Column(db.Boolean, default=False)

    site = relationship('Site', back_populates='bills')

    __table_args__ = (
        db.UniqueConstraint('site_id', 'year', 'month', name='uq_site_year_month'),
    )

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def __repr__(self):
        return f"<UtilityBill site_id={self.site_id} {self.year}-{self.month:02d} usage={self.energy_usage} max_power={self.max_power}>"


class EquipmentCatalog(db.Model):
    __tablename__ = 'equipment_catalog'

    mc_code = db.Column(db.String(16), primary_key=True)
    description = db.Column(db.String(256))
    status = db.Column(db.String(64))
    revised_date = db.Column(db.Date)
    # Link to standardized equipment category (e.g., PV, LDU, etc.)
    equipment_category_code = db.Column(db.String(8), db.ForeignKey('equipment_categories.code'), index=True)
    category = relationship('EquipmentCategory')

    def to_dict(self):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        if self.category:
            data['category'] = self.category.to_dict()
        return data


class EquipmentCategory(db.Model):
    __tablename__ = 'equipment_categories'

    # Example codes: PV, LDU, LC, LDT, HD, MD, SN, OT, TR, LM, IN, CO, RM
    code = db.Column(db.String(8), primary_key=True)
    description = db.Column(db.String(128), nullable=False)
    # Moved from EquipmentCatalog: energy factor per category
    energy_per_mile = db.Column(db.Float)  # kWh per mile (nullable until set)

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Equipment(db.Model):
    __tablename__ = 'equipment'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    site_id = db.Column(db.Integer, db.ForeignKey('sites.id'), nullable=False, index=True)
    equipment_id = db.Column(db.Integer)  # external or fleet ID
    mc_code = db.Column(db.String(16), db.ForeignKey('equipment_catalog.mc_code'), nullable=False, index=True)
    department_id = db.Column(db.String(32))  # optional owning department
    annual_miles = db.Column(db.Float)  # projected annual miles (overrides usage for energy calcs if set)
    downtime_hours = db.Column(db.Float)  # annual downtime hours (reduces operating hours for kW calc)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    site = relationship('Site', back_populates='equipment')
    catalog = relationship('EquipmentCatalog')
    usage_entries = relationship('EquipmentUsage', back_populates='equipment', cascade='all, delete-orphan')

    def to_dict(self):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        # Include catalog energy info for convenience
        if self.catalog:
            data['catalog'] = self.catalog.to_dict()
        return data


class EquipmentUsage(db.Model):
    __tablename__ = 'equipment_usage'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    equipment_id = db.Column(db.Integer, db.ForeignKey('equipment.id'), nullable=False, index=True)
    year = db.Column(db.Integer, nullable=False)
    miles = db.Column(db.Float)  # miles driven in the year
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('equipment_id', 'year', name='uq_equipment_year'),
    )

    equipment = relationship('Equipment', back_populates='usage_entries')

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Project(db.Model):
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(128), nullable=False, unique=True)
    description = db.Column(db.Text)
    is_deleted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sites = relationship('Site', secondary='project_sites', back_populates='projects')
    status_updates = relationship('ProjectStatus', back_populates='project', cascade='all, delete-orphan')
    steps = relationship('ProjectStep', back_populates='project', cascade='all, delete-orphan', order_by='ProjectStep.step_order')

    def to_dict(self):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        # Include site ids for lightweight reference
        data['site_ids'] = [s.id for s in self.sites]
        # Include derived steps_count for convenience
        data['steps_count'] = len(self.steps) if hasattr(self, 'steps') else None
        return data


class ProjectStatus(db.Model):
    __tablename__ = 'project_status'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True)
    site_id = db.Column(db.Integer, db.ForeignKey('sites.id', ondelete='CASCADE'), nullable=False, index=True)
    status_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    status_message = db.Column(db.Text)
    current_step = db.Column(db.Integer, nullable=False)
    estimated_cost = db.Column(db.Float)  # Optional latest estimated cost for this site at this step
    actual_cost = db.Column(db.Float)     # Optional actual cost incurred so far for this site
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship('Project', back_populates='status_updates')
    site = relationship('Site', back_populates='project_statuses')

    __table_args__ = (
        db.UniqueConstraint('project_id', 'site_id', 'status_date', name='uq_project_site_statusdate'),
    )

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class ProjectStep(db.Model):
    __tablename__ = 'project_steps'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True)
    step_order = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(128), nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship('Project', back_populates='steps')

    __table_args__ = (
        db.UniqueConstraint('project_id', 'step_order', name='uq_project_step_order'),
    )

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Charger(db.Model):
    __tablename__ = 'chargers'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    site_id = db.Column(db.Integer, db.ForeignKey('sites.id', ondelete='CASCADE'), nullable=False, index=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='SET NULL'), nullable=True, index=True)

    kw = db.Column(db.Float)  # charger rated power in kW
    breaker_size = db.Column(db.Integer)  # breaker rating in amps
    input_voltage = db.Column(db.Integer)  # e.g., 240, 480
    output_voltage = db.Column(db.Integer)  # DC output voltage, if applicable
    port_count = db.Column(db.Integer)  # number of connectors/ports
    handle_type = db.Column(db.String(32))  # J1772 | NACS | Both
    manufacturer = db.Column(db.String(128))
    model_number = db.Column(db.String(128))
    serial_number = db.Column(db.String(128))
    date_installed = db.Column(db.Date)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    site = relationship('Site')
    project = relationship('Project')

    __table_args__ = (
        db.Index('ix_chargers_site_project', 'site_id', 'project_id'),
    )

    def to_dict(self):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        # Normalize date/datetime fields for JSON serialization
        try:
            if data.get('date_installed') is not None:
                data['date_installed'] = data['date_installed'].isoformat()
        except Exception:
            pass
        try:
            if data.get('created_at') is not None:
                data['created_at'] = data['created_at'].isoformat()
        except Exception:
            pass
        try:
            if data.get('updated_at') is not None:
                data['updated_at'] = data['updated_at'].isoformat()
        except Exception:
            pass
        return data
