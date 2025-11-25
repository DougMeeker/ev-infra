from datetime import datetime
from sqlalchemy.orm import relationship
from .extensions import db

class Site(db.Model):
    __tablename__ = 'sites'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
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

    def to_dict(self):
        data = {c.name: getattr(self, c.name) for c in self.__table__.columns}
        # Include bills summary (without heavy details) for convenience
        data['bills'] = [bill.to_dict() for bill in self.bills]
        return data


class UtilityBill(db.Model):
    __tablename__ = 'utility_bills'

    id = db.Column(db.Integer, primary_key=True)
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
    energy_per_mile = db.Column(db.Float)  # kWh per mile (nullable until set)

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


class Equipment(db.Model):
    __tablename__ = 'equipment'

    id = db.Column(db.Integer, primary_key=True)
    site_id = db.Column(db.Integer, db.ForeignKey('sites.id'), nullable=False, index=True)
    equipment_identifier = db.Column(db.String(64))  # external or fleet ID
    mc_code = db.Column(db.String(16), db.ForeignKey('equipment_catalog.mc_code'), nullable=False, index=True)
    department_id = db.Column(db.Integer)  # optional owning department
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

    id = db.Column(db.Integer, primary_key=True)
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
