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

# Association table for many-to-many relation between sites and files
site_files = db.Table(
    'site_files',
    db.Column('site_id', db.Integer, db.ForeignKey('sites.id', ondelete='CASCADE'), primary_key=True),
    db.Column('file_id', db.Integer, db.ForeignKey('files.id', ondelete='CASCADE'), primary_key=True),
    db.UniqueConstraint('site_id', 'file_id', name='uq_site_file')
)

class Site(db.Model):
    __tablename__ = 'sites'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(128))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    department_id = db.Column(db.Text)
    address = db.Column(db.String(256))
    city = db.Column(db.String(128))
    contact_name = db.Column(db.String(128))
    contact_phone = db.Column(db.String(64))
    leased = db.Column(db.Boolean, default=False)
    is_deleted = db.Column(db.Boolean, default=False)

    # Relationship to services (meters)
    services = relationship('Service', back_populates='site', cascade='all, delete-orphan')
    # Relationship to equipment
    equipment = relationship('Equipment', back_populates='site', cascade='all, delete-orphan')
    # Many-to-many relationship to overarching projects
    projects = relationship('Project', secondary='project_sites', back_populates='sites')
    # Relationship to per-site project status updates
    project_statuses = relationship('ProjectStatus', back_populates='site', cascade='all, delete-orphan')
    # Many-to-many relationship to files/documents
    files = relationship('File', secondary='site_files', back_populates='sites')
    # Departments associated with this site
    departments = relationship('Department', back_populates='site')

    def to_dict(self, include_services: bool = False, include_project_ids: bool = True):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        # Optionally include services
        if include_services:
            data['services'] = [service.to_dict() for service in self.services]
        # Include project ids for convenience (small payload) - but only if explicitly requested or already loaded
        if include_project_ids and 'projects' in self.__dict__:
            data['project_ids'] = [p.id for p in self.projects]
        elif include_project_ids:
            # If not loaded and requested, query it separately to avoid lazy loading during iteration
            from sqlalchemy import select
            project_ids = db.session.execute(
                select(project_sites.c.project_id).where(project_sites.c.site_id == self.id)
            ).scalars().all()
            data['project_ids'] = list(project_ids)
        return data


class Service(db.Model):
    __tablename__ = 'services'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    site_id = db.Column(db.Integer, db.ForeignKey('sites.id'), nullable=False, index=True)
    
    # Utility information
    utility = db.Column(db.String(64))
    utility_account = db.Column(db.String(64))
    utility_name = db.Column(db.String(64))
    meter_number = db.Column(db.String(64))
    
    # Electrical capacity information
    main_breaker_amps = db.Column(db.Integer)  # Amps rating of main breaker
    voltage = db.Column(db.Integer)            # Line voltage (e.g., 240, 480)
    phase_count = db.Column(db.Integer)        # 1 or 3
    power_factor = db.Column(db.Float, default=0.95)  # Configurable PF used in capacity calcs
    
    # Optional notes for differentiating services
    notes = db.Column(db.Text)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_deleted = db.Column(db.Boolean, default=False)

    # Relationships
    site = relationship('Site', back_populates='services')
    bills = relationship('UtilityBill', back_populates='service', cascade='all, delete-orphan')

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class UtilityBill(db.Model):
    __tablename__ = 'utility_bills'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    service_id = db.Column(db.Integer, db.ForeignKey('services.id'), nullable=False, index=True)
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)  # 1-12
    energy_usage = db.Column(db.Float)  # kWh for the period
    max_power = db.Column(db.Float)     # kW peak demand
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Soft delete flag (optional)
    is_deleted = db.Column(db.Boolean, default=False)

    service = relationship('Service', back_populates='bills')

    __table_args__ = (
        db.UniqueConstraint('service_id', 'year', 'month', name='uq_service_year_month'),
    )

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def __repr__(self):
        return f"<UtilityBill service_id={self.service_id} {self.year}-{self.month:02d} usage={self.energy_usage} max_power={self.max_power}>"


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
    miles_per_kwh = db.Column(db.Float)    # miles per kWh (optional; if set, overrides energy_per_mile via inversion)

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
    driving_hours = db.Column(db.Float)  # annual driving hours used for average power calc
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
    month = db.Column(db.Integer, nullable=False)  # 1-12, monthly usage
    miles = db.Column(db.Float)  # miles driven in the month
    driving_hours = db.Column(db.Float)  # hours driven in the month
    days_utilized = db.Column(db.Integer)  # number of days the vehicle was utilized in the month
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('equipment_id', 'year', 'month', name='uq_equipment_year_month'),
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
    fleet = db.Column(db.Boolean, default=False)
    description = db.Column(db.Text)

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


class Department(db.Model):
    __tablename__ = 'departments'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    district = db.Column(db.Integer, nullable=False)
    unit = db.Column(db.Integer, nullable=False)
    unit_name = db.Column(db.String(256), nullable=False)
    site_id = db.Column(db.Integer, db.ForeignKey('sites.id', ondelete='SET NULL'), nullable=True, index=True)

    site = relationship('Site', back_populates='departments')

    __table_args__ = (
        db.UniqueConstraint('district', 'unit', name='uq_department_district_unit'),
    )

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

    def __repr__(self):
        return f"<Department district={self.district} unit={self.unit} name={self.unit_name!r}>"


class File(db.Model):
    __tablename__ = 'files'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    original_name = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False, unique=True)
    content_type = db.Column(db.String(128))
    size_bytes = db.Column(db.Integer)
    description = db.Column(db.Text)
    file_created_at = db.Column(db.DateTime)  # Original file creation date from metadata (e.g., EXIF date taken)
    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Optional user field; not implemented yet
    # uploaded_by = db.Column(db.String(128))

    # Reverse relationship to sites via association
    sites = relationship('Site', secondary='site_files', back_populates='files')

    def to_dict(self, include_sites: bool = False):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        if include_sites:
            data['site_ids'] = [s.id for s in self.sites]
            data['sites'] = [{'id': s.id, 'name': s.name} for s in self.sites]
        return data


class SitePriorityWeight(db.Model):
    __tablename__ = 'site_priority_weights'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(64), nullable=False, unique=True)
    vehicle_count_w = db.Column(db.Float, nullable=False, default=0.20)
    annual_miles_w = db.Column(db.Float, nullable=False, default=0.15)
    electrical_headroom_w = db.Column(db.Float, nullable=False, default=0.15)
    charger_gap_w = db.Column(db.Float, nullable=False, default=0.20)
    project_readiness_w = db.Column(db.Float, nullable=False, default=0.10)
    energy_demand_w = db.Column(db.Float, nullable=False, default=0.10)
    data_completeness_w = db.Column(db.Float, nullable=False, default=0.10)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class SitePriorityScore(db.Model):
    __tablename__ = 'site_priority_scores'

    site_id = db.Column(db.Integer, db.ForeignKey('sites.id', ondelete='CASCADE'), primary_key=True)
    weight_profile_id = db.Column(db.Integer, db.ForeignKey('site_priority_weights.id'), nullable=False)
    composite_score = db.Column(db.Float)
    vehicle_count_score = db.Column(db.Float)
    annual_miles_score = db.Column(db.Float)
    electrical_headroom_score = db.Column(db.Float)  # null if service data missing
    charger_gap_score = db.Column(db.Float)
    project_readiness_score = db.Column(db.Float)
    energy_demand_score = db.Column(db.Float)
    data_completeness_score = db.Column(db.Float)
    investigation_urgency = db.Column(db.Float)
    needs_survey = db.Column(db.Boolean, default=False)
    calculated_at = db.Column(db.DateTime, default=datetime.utcnow)

    site = relationship('Site', backref='priority_score')
    weight_profile = relationship('SitePriorityWeight')

    def to_dict(self):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        if self.site:
            data['site_name'] = self.site.name
            data['district'] = None
            if self.site.departments:
                data['district'] = self.site.departments[0].district
        return data


class McpSyncLog(db.Model):
    __tablename__ = 'mcp_sync_log'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    sync_type = db.Column(db.String(32), nullable=False)  # full, site, project, priorities
    status = db.Column(db.String(16), nullable=False, default='pending')  # pending, success, error
    document_count = db.Column(db.Integer, default=0)
    error_message = db.Column(db.Text)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    finished_at = db.Column(db.DateTime)

    def to_dict(self):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        for k in ('started_at', 'finished_at'):
            if data.get(k):
                data[k] = data[k].isoformat()
        return data
