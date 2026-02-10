"""
Tests for Site API endpoints.
"""
import pytest
import json


class TestSitesAPI:
    """Test suite for /api/sites endpoints."""

    def test_get_sites_empty(self, client, db_session):
        """Test getting sites when database is empty."""
        response = client.get('/api/sites')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) == 0

    def test_get_sites_with_data(self, client, sample_site):
        """Test getting sites with existing data."""
        response = client.get('/api/sites')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) == 1
        assert data[0]['name'] == 'Test Site'
        assert data[0]['city'] == 'Los Angeles'

    def test_create_site(self, client, db_session):
        """Test creating a new site."""
        site_data = {
            'name': 'New Test Site',
            'latitude': 37.7749,
            'longitude': -122.4194,
            'address': '456 New St',
            'city': 'San Francisco',
            'department_id': 'DEPT002'
        }
        response = client.post(
            '/api/sites',
            data=json.dumps(site_data),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'New Test Site'
        assert data['city'] == 'San Francisco'
        assert 'id' in data

    def test_create_site_missing_name(self, client, db_session):
        """Test creating a site without required name field."""
        site_data = {
            'latitude': 37.7749,
            'longitude': -122.4194
        }
        response = client.post(
            '/api/sites',
            data=json.dumps(site_data),
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_get_site_by_id(self, client, sample_site):
        """Test getting a specific site by ID."""
        response = client.get(f'/api/sites/{sample_site.id}')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Test Site'
        assert data['id'] == sample_site.id

    def test_get_site_not_found(self, client, db_session):
        """Test getting a non-existent site."""
        response = client.get('/api/sites/99999')
        assert response.status_code == 404

    def test_update_site(self, client, sample_site):
        """Test updating a site."""
        update_data = {
            'name': 'Updated Site Name',
            'city': 'Sacramento'
        }
        response = client.put(
            f'/api/sites/{sample_site.id}',
            data=json.dumps(update_data),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Site Name'
        assert data['city'] == 'Sacramento'
        # Unchanged fields should remain
        assert data['address'] == '123 Test St'

    def test_delete_site(self, client, sample_site):
        """Test soft deleting a site."""
        response = client.delete(f'/api/sites/{sample_site.id}')
        assert response.status_code == 200
        
        # Verify site is soft-deleted (not returned in list)
        response = client.get('/api/sites')
        data = json.loads(response.data)
        assert len(data) == 0

    def test_search_sites(self, client, sample_site):
        """Test searching sites by query."""
        response = client.get('/api/sites?search=Test')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) >= 1
        assert any(s['name'] == 'Test Site' for s in data)

    def test_search_sites_by_address(self, client, sample_site):
        """Test searching sites by address."""
        response = client.get('/api/sites?search=123')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) >= 1


class TestSiteMetrics:
    """Test suite for site metrics endpoint."""

    def test_get_site_metrics(self, client, sample_site, sample_service):
        """Test getting metrics for a site."""
        response = client.get(f'/api/sites/{sample_site.id}/metrics')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'theoretical_capacity_kw' in data
        assert 'power_factor' in data

    def test_get_site_metrics_not_found(self, client, db_session):
        """Test getting metrics for non-existent site."""
        response = client.get('/api/sites/99999/metrics')
        assert response.status_code == 404
