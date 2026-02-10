"""
Tests for Project API endpoints.
"""
import pytest
import json


class TestProjectsAPI:
    """Test suite for /api/projects endpoints."""

    def test_get_projects_empty(self, client, db_session):
        """Test getting projects when database is empty."""
        response = client.get('/api/projects')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) == 0

    def test_get_projects_with_data(self, client, sample_project):
        """Test getting projects with existing data."""
        response = client.get('/api/projects')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) == 1
        assert data[0]['name'] == 'Test Project'

    def test_create_project(self, client, db_session):
        """Test creating a new project."""
        project_data = {
            'name': 'New Project',
            'description': 'A new test project'
        }
        response = client.post(
            '/api/projects',
            data=json.dumps(project_data),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'New Project'
        assert data['description'] == 'A new test project'
        assert 'id' in data

    def test_create_project_missing_name(self, client, db_session):
        """Test creating a project without required name field."""
        project_data = {
            'description': 'A project without name'
        }
        response = client.post(
            '/api/projects',
            data=json.dumps(project_data),
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_create_project_duplicate_name(self, client, sample_project):
        """Test creating a project with duplicate name."""
        project_data = {
            'name': 'Test Project',
            'description': 'Duplicate name'
        }
        response = client.post(
            '/api/projects',
            data=json.dumps(project_data),
            content_type='application/json'
        )
        assert response.status_code == 409

    def test_get_project_by_id(self, client, sample_project):
        """Test getting a specific project by ID."""
        response = client.get(f'/api/projects/{sample_project.id}')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Test Project'
        assert data['id'] == sample_project.id

    def test_get_project_not_found(self, client, db_session):
        """Test getting a non-existent project."""
        response = client.get('/api/projects/99999')
        assert response.status_code == 404

    def test_update_project(self, client, sample_project):
        """Test updating a project."""
        update_data = {
            'name': 'Updated Project Name',
            'description': 'Updated description'
        }
        response = client.put(
            f'/api/projects/{sample_project.id}',
            data=json.dumps(update_data),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Project Name'
        assert data['description'] == 'Updated description'

    def test_delete_project(self, client, sample_project):
        """Test soft deleting a project."""
        response = client.delete(f'/api/projects/{sample_project.id}')
        assert response.status_code == 200
        
        # Verify project is soft-deleted (not returned in list)
        response = client.get('/api/projects')
        data = json.loads(response.data)
        assert len(data) == 0


class TestProjectSteps:
    """Test suite for project steps endpoints."""

    def test_get_project_steps_empty(self, client, sample_project):
        """Test getting steps for a project with no steps."""
        response = client.get(f'/api/projects/{sample_project.id}/steps')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) == 0

    def test_get_project_steps_with_data(self, client, sample_project_with_steps):
        """Test getting steps for a project with steps."""
        response = client.get(f'/api/projects/{sample_project_with_steps.id}/steps')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) == 5
        # Verify ordering
        assert data[0]['title'] == 'Planning'
        assert data[0]['step_order'] == 1

    def test_create_project_step(self, client, sample_project):
        """Test creating a project step."""
        step_data = {
            'title': 'New Step',
            'step_order': 1,
            'description': 'A new step'
        }
        response = client.post(
            f'/api/projects/{sample_project.id}/steps',
            data=json.dumps(step_data),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['title'] == 'New Step'
        assert data['step_order'] == 1

    def test_create_project_step_missing_title(self, client, sample_project):
        """Test creating a step without required title."""
        step_data = {
            'step_order': 1
        }
        response = client.post(
            f'/api/projects/{sample_project.id}/steps',
            data=json.dumps(step_data),
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_update_project_step(self, client, sample_project_with_steps, db_session):
        """Test updating a project step."""
        # Get the first step
        from app.models import ProjectStep
        step = ProjectStep.query.filter_by(project_id=sample_project_with_steps.id).first()
        
        update_data = {
            'title': 'Updated Planning',
            'description': 'Updated description'
        }
        response = client.put(
            f'/api/projects/{sample_project_with_steps.id}/steps/{step.id}',
            data=json.dumps(update_data),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['title'] == 'Updated Planning'

    def test_delete_project_step(self, client, sample_project_with_steps, db_session):
        """Test deleting a project step."""
        from app.models import ProjectStep
        step = ProjectStep.query.filter_by(project_id=sample_project_with_steps.id).first()
        
        response = client.delete(f'/api/projects/{sample_project_with_steps.id}/steps/{step.id}')
        assert response.status_code == 200
        
        # Verify step is deleted
        response = client.get(f'/api/projects/{sample_project_with_steps.id}/steps')
        data = json.loads(response.data)
        assert len(data) == 4


class TestProjectSites:
    """Test suite for project-site association endpoints."""

    def test_add_site_to_project(self, client, sample_project, sample_site):
        """Test adding a site to a project."""
        data = {'site_id': sample_site.id}
        response = client.post(
            f'/api/projects/{sample_project.id}/sites',
            data=json.dumps(data),
            content_type='application/json'
        )
        assert response.status_code == 200
        result = json.loads(response.data)
        assert result['project_id'] == sample_project.id
        assert result['site_id'] == sample_site.id

    def test_get_project_sites(self, client, sample_project, sample_site):
        """Test getting sites assigned to a project."""
        # First add the site
        data = {'site_id': sample_site.id}
        client.post(
            f'/api/projects/{sample_project.id}/sites',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        # Then get the sites
        response = client.get(f'/api/projects/{sample_project.id}/sites')
        assert response.status_code == 200
        result = json.loads(response.data)
        assert 'items' in result
        assert len(result['items']) == 1
        assert result['items'][0]['name'] == 'Test Site'

    def test_remove_site_from_project(self, client, sample_project, sample_site):
        """Test removing a site from a project."""
        # First add the site
        data = {'site_id': sample_site.id}
        client.post(
            f'/api/projects/{sample_project.id}/sites',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        # Then remove it
        response = client.delete(f'/api/projects/{sample_project.id}/sites/{sample_site.id}')
        assert response.status_code == 200
        
        # Verify it's removed
        response = client.get(f'/api/projects/{sample_project.id}/sites')
        result = json.loads(response.data)
        assert len(result['items']) == 0


class TestProjectStatus:
    """Test suite for project status endpoints."""

    def test_create_project_site_status(self, client, sample_project_with_steps, sample_site, db_session):
        """Test creating a status for a site in a project."""
        # First add site to project
        data = {'site_id': sample_site.id}
        client.post(
            f'/api/projects/{sample_project_with_steps.id}/sites',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        # Create status
        status_data = {
            'current_step': 2,
            'status_message': 'In progress',
            'status_date': '2026-02-06'
        }
        response = client.post(
            f'/api/projects/{sample_project_with_steps.id}/sites/{sample_site.id}/status',
            data=json.dumps(status_data),
            content_type='application/json'
        )
        assert response.status_code == 201
        result = json.loads(response.data)
        assert result['current_step'] == 2
        assert result['status_message'] == 'In progress'

    def test_get_latest_project_statuses(self, client, sample_project_with_steps, sample_site, db_session):
        """Test getting latest statuses for all sites in a project."""
        # Add site and create status
        data = {'site_id': sample_site.id}
        client.post(
            f'/api/projects/{sample_project_with_steps.id}/sites',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        status_data = {
            'current_step': 3,
            'status_message': 'Completed design',
            'status_date': '2026-02-06'
        }
        client.post(
            f'/api/projects/{sample_project_with_steps.id}/sites/{sample_site.id}/status',
            data=json.dumps(status_data),
            content_type='application/json'
        )
        
        # Get latest statuses
        response = client.get(f'/api/projects/{sample_project_with_steps.id}/latest-statuses')
        assert response.status_code == 200
        result = json.loads(response.data)
        assert len(result) == 1
        assert result[0]['current_step'] == 3
