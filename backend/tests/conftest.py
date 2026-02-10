"""
Pytest configuration and fixtures for backend tests.
"""
import pytest
import os
import sys

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.extensions import db
from app.models import Site, Project, ProjectStep, ProjectStatus, Service, UtilityBill, Equipment, Charger, File


@pytest.fixture(scope='session')
def app():
    """Create application for the tests."""
    _app = create_app('testing')
    
    with _app.app_context():
        db.create_all()
        yield _app
        db.drop_all()


@pytest.fixture(scope='function')
def client(app):
    """Create a test client for the app."""
    return app.test_client()


@pytest.fixture(scope='function')
def db_session(app):
    """Create a new database session for a test."""
    with app.app_context():
        # Clear all tables before each test
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(table.delete())
        db.session.commit()
        yield db.session
        db.session.rollback()


@pytest.fixture
def sample_site(db_session):
    """Create a sample site for testing."""
    site = Site(
        name='Test Site',
        latitude=34.0522,
        longitude=-118.2437,
        address='123 Test St',
        city='Los Angeles',
        department_id='DEPT001',
        contact_name='John Doe',
        contact_phone='555-1234'
    )
    db_session.add(site)
    db_session.commit()
    return site


@pytest.fixture
def sample_project(db_session):
    """Create a sample project for testing."""
    project = Project(
        name='Test Project',
        description='A test project for unit testing'
    )
    db_session.add(project)
    db_session.commit()
    return project


@pytest.fixture
def sample_project_with_steps(db_session, sample_project):
    """Create a sample project with steps for testing."""
    steps = [
        ProjectStep(project_id=sample_project.id, title='Planning', step_order=1, description='Initial planning phase'),
        ProjectStep(project_id=sample_project.id, title='Design', step_order=2, description='Design phase'),
        ProjectStep(project_id=sample_project.id, title='Implementation', step_order=3, description='Implementation phase'),
        ProjectStep(project_id=sample_project.id, title='Testing', step_order=4, description='Testing phase'),
        ProjectStep(project_id=sample_project.id, title='Deployment', step_order=5, description='Deployment phase'),
    ]
    for step in steps:
        db_session.add(step)
    db_session.commit()
    return sample_project


@pytest.fixture
def sample_service(db_session, sample_site):
    """Create a sample service/meter for testing."""
    service = Service(
        site_id=sample_site.id,
        utility='PG&E',
        meter_number='MTR-001',
        main_breaker_amps=200,
        voltage=480,
        phase_count=3,
        power_factor=0.95
    )
    db_session.add(service)
    db_session.commit()
    return service


@pytest.fixture
def sample_bill(db_session, sample_service):
    """Create a sample utility bill for testing."""
    bill = UtilityBill(
        service_id=sample_service.id,
        year=2025,
        month=1,
        energy_usage=15000.0,
        max_power=75.5
    )
    db_session.add(bill)
    db_session.commit()
    return bill
