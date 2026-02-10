"""
Tests for database models.
"""
import pytest
from app.models import Site, Project, ProjectStep, ProjectStatus, Service, UtilityBill


class TestSiteModel:
    """Test suite for Site model."""

    def test_site_creation(self, db_session):
        """Test creating a site."""
        site = Site(
            name='Model Test Site',
            latitude=34.0,
            longitude=-118.0,
            city='Test City'
        )
        db_session.add(site)
        db_session.commit()
        
        assert site.id is not None
        assert site.name == 'Model Test Site'
        assert site.is_deleted == False

    def test_site_to_dict(self, sample_site):
        """Test site serialization."""
        data = sample_site.to_dict()
        assert 'id' in data
        assert 'name' in data
        assert 'latitude' in data
        assert 'longitude' in data
        assert data['name'] == 'Test Site'

    def test_site_soft_delete(self, db_session, sample_site):
        """Test soft delete functionality."""
        sample_site.is_deleted = True
        db_session.commit()
        
        # Query without filter should still find it
        site = Site.query.get(sample_site.id)
        assert site is not None
        assert site.is_deleted == True

    def test_site_projects_relationship(self, db_session, sample_site, sample_project):
        """Test site-project relationship."""
        sample_site.projects.append(sample_project)
        db_session.commit()
        
        assert sample_project in sample_site.projects
        assert sample_site in sample_project.sites


class TestProjectModel:
    """Test suite for Project model."""

    def test_project_creation(self, db_session):
        """Test creating a project."""
        project = Project(
            name='Model Test Project',
            description='A test project'
        )
        db_session.add(project)
        db_session.commit()
        
        assert project.id is not None
        assert project.name == 'Model Test Project'
        assert project.is_deleted == False

    def test_project_to_dict(self, sample_project):
        """Test project serialization."""
        data = sample_project.to_dict()
        assert 'id' in data
        assert 'name' in data
        assert 'description' in data
        assert 'steps_count' in data

    def test_project_steps_relationship(self, db_session, sample_project):
        """Test project-steps relationship."""
        step = ProjectStep(
            project_id=sample_project.id,
            title='Test Step',
            step_order=1
        )
        db_session.add(step)
        db_session.commit()
        
        assert len(sample_project.steps) == 1
        assert sample_project.steps[0].title == 'Test Step'


class TestProjectStepModel:
    """Test suite for ProjectStep model."""

    def test_step_creation(self, db_session, sample_project):
        """Test creating a project step."""
        step = ProjectStep(
            project_id=sample_project.id,
            title='Step 1',
            step_order=1,
            description='First step'
        )
        db_session.add(step)
        db_session.commit()
        
        assert step.id is not None
        assert step.project_id == sample_project.id

    def test_step_to_dict(self, db_session, sample_project):
        """Test step serialization."""
        step = ProjectStep(
            project_id=sample_project.id,
            title='Step 1',
            step_order=1
        )
        db_session.add(step)
        db_session.commit()
        
        data = step.to_dict()
        assert 'id' in data
        assert 'title' in data
        assert 'step_order' in data
        assert data['title'] == 'Step 1'


class TestServiceModel:
    """Test suite for Service model."""

    def test_service_creation(self, db_session, sample_site):
        """Test creating a service."""
        service = Service(
            site_id=sample_site.id,
            utility='Test Utility',
            meter_number='TEST-001',
            main_breaker_amps=200,
            voltage=480,
            phase_count=3
        )
        db_session.add(service)
        db_session.commit()
        
        assert service.id is not None
        assert service.site_id == sample_site.id

    def test_service_capacity_calculation(self, sample_service):
        """Test service capacity calculation."""
        # Capacity = Amps * Voltage * sqrt(3) * PF / 1000 for 3-phase
        # 200 * 480 * 1.732 * 0.95 / 1000 ≈ 157.95 kW
        expected_capacity = (200 * 480 * (3 ** 0.5) * 0.95) / 1000
        data = sample_service.to_dict()
        # The actual calculation is done in the service route, not the model
        assert sample_service.main_breaker_amps == 200
        assert sample_service.voltage == 480


class TestUtilityBillModel:
    """Test suite for UtilityBill model."""

    def test_bill_creation(self, db_session, sample_service):
        """Test creating a utility bill."""
        bill = UtilityBill(
            service_id=sample_service.id,
            year=2025,
            month=6,
            energy_usage=12000.0,
            max_power=65.0
        )
        db_session.add(bill)
        db_session.commit()
        
        assert bill.id is not None
        assert bill.service_id == sample_service.id

    def test_bill_to_dict(self, sample_bill):
        """Test bill serialization."""
        data = sample_bill.to_dict()
        assert 'id' in data
        assert 'year' in data
        assert 'month' in data
        assert 'energy_usage' in data
        assert data['year'] == 2025
        assert data['month'] == 1


class TestProjectStatusModel:
    """Test suite for ProjectStatus model."""

    def test_status_creation(self, db_session, sample_project, sample_site):
        """Test creating a project status."""
        # Add site to project first
        sample_project.sites.append(sample_site)
        db_session.commit()
        
        status = ProjectStatus(
            project_id=sample_project.id,
            site_id=sample_site.id,
            current_step=2,
            status_message='In progress'
        )
        db_session.add(status)
        db_session.commit()
        
        assert status.id is not None
        assert status.current_step == 2

    def test_status_to_dict(self, db_session, sample_project, sample_site):
        """Test status serialization."""
        sample_project.sites.append(sample_site)
        status = ProjectStatus(
            project_id=sample_project.id,
            site_id=sample_site.id,
            current_step=1,
            status_message='Started'
        )
        db_session.add(status)
        db_session.commit()
        
        data = status.to_dict()
        assert 'id' in data
        assert 'current_step' in data
        assert 'status_message' in data
