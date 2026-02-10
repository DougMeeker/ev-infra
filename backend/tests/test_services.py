"""
Tests for Service (Meter) API endpoints.
"""
import pytest
import json


class TestServicesAPI:
    """Test suite for /api/sites/{site_id}/services endpoints."""

    def test_get_services_empty(self, client, sample_site):
        """Test getting services for a site with no services."""
        response = client.get(f'/api/sites/{sample_site.id}/services')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) == 0

    def test_get_services_with_data(self, client, sample_service):
        """Test getting services with existing data."""
        response = client.get(f'/api/sites/{sample_service.site_id}/services')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) == 1
        assert data[0]['utility'] == 'PG&E'
        assert data[0]['meter_number'] == 'MTR-001'

    def test_create_service(self, client, sample_site):
        """Test creating a new service."""
        service_data = {
            'utility': 'SCE',
            'meter_number': 'MTR-002',
            'main_breaker_amps': 400,
            'voltage': 480,
            'phase_count': 3,
            'power_factor': 0.90
        }
        response = client.post(
            f'/api/sites/{sample_site.id}/services',
            data=json.dumps(service_data),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['utility'] == 'SCE'
        assert data['meter_number'] == 'MTR-002'
        assert data['main_breaker_amps'] == 400

    def test_update_service(self, client, sample_service):
        """Test updating a service."""
        update_data = {
            'utility': 'SDG&E',
            'main_breaker_amps': 300
        }
        response = client.put(
            f'/api/sites/{sample_service.site_id}/services/{sample_service.id}',
            data=json.dumps(update_data),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['utility'] == 'SDG&E'
        assert data['main_breaker_amps'] == 300
        # Unchanged field should remain
        assert data['meter_number'] == 'MTR-001'

    def test_delete_service(self, client, sample_service):
        """Test deleting a service."""
        response = client.delete(
            f'/api/sites/{sample_service.site_id}/services/{sample_service.id}'
        )
        assert response.status_code == 200
        
        # Verify service is deleted
        response = client.get(f'/api/sites/{sample_service.site_id}/services')
        data = json.loads(response.data)
        assert len(data) == 0


class TestUtilityBillsAPI:
    """Test suite for /api/services/{service_id}/bills endpoints."""

    def test_get_bills_empty(self, client, sample_service):
        """Test getting bills for a service with no bills."""
        response = client.get(f'/api/sites/{sample_service.site_id}/bills')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) == 0

    def test_get_bills_with_data(self, client, sample_bill):
        """Test getting bills with existing data."""
        response = client.get(f'/api/sites/{sample_bill.service.site_id}/bills')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) == 1
        assert data[0]['year'] == 2025
        assert data[0]['month'] == 1
        assert data[0]['energy_usage'] == 15000.0

    def test_create_bill(self, client, sample_service):
        """Test creating a new utility bill."""
        bill_data = {
            'year': 2025,
            'month': 2,
            'energy_usage': 18000.0,
            'max_power': 85.0
        }
        response = client.post(
            f'/api/services/{sample_service.id}/bills',
            data=json.dumps(bill_data),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['year'] == 2025
        assert data['month'] == 2
        assert data['energy_usage'] == 18000.0

    def test_create_bill_invalid_month(self, client, sample_service):
        """Test creating a bill with invalid month."""
        bill_data = {
            'year': 2025,
            'month': 13,  # Invalid month
            'energy_usage': 18000.0
        }
        response = client.post(
            f'/api/services/{sample_service.id}/bills',
            data=json.dumps(bill_data),
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_create_duplicate_bill(self, client, sample_bill, sample_service):
        """Test creating a duplicate bill for same year/month."""
        bill_data = {
            'year': 2025,
            'month': 1,  # Same as sample_bill
            'energy_usage': 20000.0
        }
        response = client.post(
            f'/api/services/{sample_service.id}/bills',
            data=json.dumps(bill_data),
            content_type='application/json'
        )
        # Should either fail or update existing - depending on implementation
        assert response.status_code in [400, 409, 200]

    def test_update_bill(self, client, sample_bill):
        """Test updating a utility bill."""
        update_data = {
            'energy_usage': 16000.0,
            'max_power': 80.0
        }
        response = client.put(
            f'/api/bills/{sample_bill.id}',
            data=json.dumps(update_data),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['energy_usage'] == 16000.0
        assert data['max_power'] == 80.0

    def test_delete_bill(self, client, sample_bill, sample_service):
        """Test deleting a utility bill."""
        response = client.delete(f'/api/bills/{sample_bill.id}')
        assert response.status_code == 200
        
        # Verify bill is deleted
        response = client.get(f'/api/sites/{sample_service.site_id}/bills')
        data = json.loads(response.data)
        assert len(data) == 0
