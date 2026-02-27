import axios from "axios";

// Determine API base:
// - In production (served by nginx) use same-origin "/api" to avoid CORS
// - In CRA dev (port 3000) use http://localhost:5000/api
// - Allow override via REACT_APP_API_BASE
function resolveApiBase() {
	const envOverride = process.env.REACT_APP_API_BASE;
	if (envOverride && typeof envOverride === 'string') return envOverride.replace(/\/$/, "");
	if (typeof window !== 'undefined') {
		if (window.location && window.location.port === '3000') {
			return 'http://localhost:5000/api';
		}
		return `${window.location.origin}/api`;
	}
	return 'http://localhost:5000/api';
}

const API_BASE_URL = resolveApiBase();

// Site endpoints
export const getSites = () => axios.get(`${API_BASE_URL}/sites`);
// Whitelist and normalize site payloads before sending to backend
const sanitizeSitePayload = (site) => {
	if (!site || typeof site !== 'object') return {};
	const fields = [
		'name', 'latitude', 'longitude', 'utility', 'utility_account', 'utility_name', 'meter_number',
		'address', 'city', 'contact_name', 'contact_phone', 'main_breaker_amps', 'voltage', 'phase_count', 'power_factor', 'leased'
	];
	const out = {};
	for (const key of fields) {
		if (site[key] === undefined) continue;
		let val = site[key];
		if (key === 'leased') {
			out[key] = Boolean(val);
			continue;
		}
		if (['latitude','longitude','power_factor'].includes(key)) {
			if (val === '') continue; // blank numeric field — omit rather than send NaN
			const n = Number(val);
			if (!Number.isNaN(n)) out[key] = n;
			continue;
		}
		if (['main_breaker_amps','voltage','phase_count'].includes(key)) {
			if (val === '') continue; // blank integer field — omit rather than send NaN
			const n = parseInt(val, 10);
			if (!Number.isNaN(n)) out[key] = n;
			continue;
		}
		// String fields: send null for empty string so the backend clears the column
		out[key] = val === '' ? null : val;
	}
	return out;
};

export const createSite = (site) => axios.post(`${API_BASE_URL}/sites/`, sanitizeSitePayload(site));
export const updateSite = (id, site) => axios.put(`${API_BASE_URL}/sites/${id}`, sanitizeSitePayload(site));
export const deleteSite = (id) => axios.delete(`${API_BASE_URL}/sites/${id}`);
// Single site by id
export const getSite = (siteId) => axios.get(`${API_BASE_URL}/sites/${siteId}`);

// Utility bill endpoints
export const getBills = (siteId) => axios.get(`${API_BASE_URL}/sites/${siteId}/bills`);
export const getBillsByService = (serviceId) => axios.get(`${API_BASE_URL}/sites/services/${serviceId}/bills`);
export const createBill = (serviceId, bill) => axios.post(`${API_BASE_URL}/sites/services/${serviceId}/bills`, bill);
export const updateBill = (billId, bill) => axios.put(`${API_BASE_URL}/sites/bills/${billId}`, bill);
export const deleteBill = (billId) => axios.delete(`${API_BASE_URL}/sites/bills/${billId}`);

// Service (meter) endpoints
export const getServices = (siteId) => axios.get(`${API_BASE_URL}/services/site/${siteId}`);
export const getService = (serviceId) => axios.get(`${API_BASE_URL}/services/${serviceId}`);
export const createService = (siteId, service) => axios.post(`${API_BASE_URL}/services/site/${siteId}`, service);
export const updateService = (serviceId, service) => axios.put(`${API_BASE_URL}/services/${serviceId}`, service);
export const deleteService = (serviceId) => axios.delete(`${API_BASE_URL}/services/${serviceId}`);
export const getServiceCapacity = (serviceId) => axios.get(`${API_BASE_URL}/services/${serviceId}/capacity`);
export const getSiteMetrics = (siteId) => axios.get(`${API_BASE_URL}/sites/${siteId}/metrics`);
export const getSiteProjects = (siteId) => axios.get(`${API_BASE_URL}/sites/${siteId}/projects`);

// Aggregate metrics with pagination
export const getAggregateMetrics = ({ page = 1, perPage = 25, order = 'desc', sort = 'available_capacity_kw', search = '', projectId = '', limit } = {}) => {
	const params = new URLSearchParams({ order, sort });
	if (limit != null) {
		params.append('limit', String(limit));
		// when using limit, align to first page for consistency
		params.append('page', '1');
	} else {
		params.append('page', String(page));
		params.append('per_page', String(perPage));
	}
	if (search) params.append('search', search);
	if (projectId) params.append('project_id', String(projectId));
	return axios.get(`${API_BASE_URL}/sites/metrics/aggregate?${params.toString()}`);
};

// Get lightweight data for all sites for map display
export const getSitesForMap = (projectId = null, includeCapacity = false) => {
	const params = new URLSearchParams();
	if (projectId) params.append('project_id', String(projectId));
	if (includeCapacity) params.append('include_capacity', '1');
	return axios.get(`${API_BASE_URL}/sites/map-data?${params.toString()}`);
};

// Equipment endpoints
export const getEquipment = (siteId, { year, page = 1, perPage = 25 } = {}) => {
	const params = new URLSearchParams();
	if (year) params.append('year', String(year));
	if (page != null) params.append('page', String(page));
	if (perPage != null) params.append('per_page', String(perPage));
	return axios.get(`${API_BASE_URL}/sites/${siteId}/equipment?${params.toString()}`);
};
export const createEquipment = (siteId, payload) => axios.post(`${API_BASE_URL}/sites/${siteId}/equipment`, payload);
export const getEquipmentEnergy = (siteId, { year } = {}) => {
	const params = year ? `?year=${year}` : '';
	return axios.get(`${API_BASE_URL}/sites/${siteId}/equipment/energy${params}`);
};
export const getEquipmentDetails = (equipmentId) => axios.get(`${API_BASE_URL}/sites/equipment/${equipmentId}`);
export const updateEquipmentDetails = (equipmentId, payload) => axios.put(`${API_BASE_URL}/sites/equipment/${equipmentId}`, payload);
export const deleteEquipmentItem = (equipmentId) => axios.delete(`${API_BASE_URL}/sites/equipment/${equipmentId}`);
export const getEquipmentUsage = (equipmentId) => axios.get(`${API_BASE_URL}/sites/equipment/${equipmentId}/usage`);
export const upsertEquipmentUsage = (equipmentId, { year, month, miles, driving_hours, days_utilized }) => axios.post(`${API_BASE_URL}/sites/equipment/${equipmentId}/usage`, { year, month, miles, driving_hours, days_utilized });

// Charger endpoints
export const getChargers = (siteId = null) => {
    if (siteId) {
        return axios.get(`${API_BASE_URL}/sites/${siteId}/chargers`);
    }
    return axios.get(`${API_BASE_URL}/sites/chargers`);
};
export const createCharger = (siteId, payload) => axios.post(`${API_BASE_URL}/sites/${siteId}/chargers`, payload);
export const getCharger = (chargerId) => axios.get(`${API_BASE_URL}/sites/chargers/${chargerId}`);
export const updateCharger = (chargerId, payload) => axios.put(`${API_BASE_URL}/sites/chargers/${chargerId}`, payload);
export const deleteCharger = (chargerId) => axios.delete(`${API_BASE_URL}/sites/chargers/${chargerId}`);

// Catalog endpoints
export const getCatalog = () => axios.get(`${API_BASE_URL}/catalog/`);
export const refreshCatalog = () => axios.post(`${API_BASE_URL}/catalog/refresh`);
export const updateCatalogEntry = (mcCode, payload) => axios.put(`${API_BASE_URL}/catalog/${mcCode}`, payload);
export const uploadCatalogFile = (file) => {
	const formData = new FormData();
	formData.append('file', file);
	return axios.post(`${API_BASE_URL}/catalog/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const deleteCatalogEntry = (mcCode) => axios.delete(`${API_BASE_URL}/catalog/${mcCode}`);
export const mapMcCategories = () => axios.post(`${API_BASE_URL}/catalog/map-mc-categories`);

// GeoJSON site import
export const uploadSitesGeoJSON = (file) => {
	const formData = new FormData();
	formData.append('file', file);
	return axios.post(`${API_BASE_URL}/sites/upload-geojson`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// Server-side DGS properties import (add-only)
export const importDgsProperties = () => axios.post(`${API_BASE_URL}/sites/import-dgs-properties`);

// Fleet import tools
export const previewFleetMatches = (minConfidence = 0) => {
	const params = new URLSearchParams();
	if (minConfidence != null) params.append('min_confidence', String(minConfidence));
	return axios.get(`${API_BASE_URL}/fleet/match-preview?${params.toString()}`);
};
export const importFleet = (minConfidence = 0) => {
	const params = new URLSearchParams();
	if (minConfidence != null) params.append('min_confidence', String(minConfidence));
	return axios.post(`${API_BASE_URL}/fleet/import?${params.toString()}`);
};

// Department mapping tools
export const getSiteDepartments = (siteId) =>
	axios.get(`${API_BASE_URL}/departments/?site_id=${siteId}`);

export const getDepartments = ({ q = '', page = 1, perPage = 50, unassigned = false, district = '' } = {}) => {
	const params = new URLSearchParams();
	if (q)          params.append('q', q);
	if (page > 1)   params.append('page', String(page));
	if (perPage !== 50) params.append('per_page', String(perPage));
	if (unassigned) params.append('unassigned', '1');
	if (district)   params.append('district', String(district));
	return axios.get(`${API_BASE_URL}/departments/?${params.toString()}`);
};

export const createDepartment = (payload) =>
	axios.post(`${API_BASE_URL}/departments/`, payload);

export const updateDepartment = (id, payload) =>
	axios.put(`${API_BASE_URL}/departments/${id}`, payload);

export const deleteDepartment = (id) =>
	axios.delete(`${API_BASE_URL}/departments/${id}`);

export const assignDepartmentSite = (id, siteId) =>
	axios.patch(`${API_BASE_URL}/departments/${id}/site`, { site_id: siteId ?? null });

export const searchSites = (q = '') => {
	const params = new URLSearchParams({ search: q, per_page: '15', page: '1', sort: 'name', order: 'asc' });
	return axios.get(`${API_BASE_URL}/sites/metrics/aggregate?${params.toString()}`);
};

export const previewDepartmentMapping = (minConfidence = 0) => {
	const params = new URLSearchParams();
	if (minConfidence != null) params.append('min_confidence', String(minConfidence));
	return axios.get(`${API_BASE_URL}/departments/site-mapping/preview?${params.toString()}`);
};

export const importDepartmentMapping = (minConfidence = 0) => {
	const params = new URLSearchParams();
	if (minConfidence != null) params.append('min_confidence', String(minConfidence));
	return axios.post(`${API_BASE_URL}/departments/site-mapping/import?${params.toString()}`);
};

// Project endpoints
export const getProjects = () => axios.get(`${API_BASE_URL}/projects`);
export const createProject = ({ name, total_steps, description }) => axios.post(`${API_BASE_URL}/projects`, { name, total_steps, description });
export const updateProject = (projectId, payload) => axios.put(`${API_BASE_URL}/projects/${projectId}`, payload);
export const deleteProject = (projectId) => axios.delete(`${API_BASE_URL}/projects/${projectId}`);
export const getProjectSites = (projectId, { q = '', department_id = '', page = 1, page_size = 25 } = {}) => {
	const params = new URLSearchParams();
	if (q) params.append('q', q);
	if (department_id) params.append('department_id', department_id);
	params.append('page', String(page));
	params.append('page_size', String(page_size));
	return axios.get(`${API_BASE_URL}/projects/${projectId}/sites?${params.toString()}`);
};
export const addSiteToProject = (projectId, siteId) => axios.post(`${API_BASE_URL}/projects/${projectId}/sites`, { site_id: siteId });
export const removeSiteFromProject = (projectId, siteId) => axios.delete(`${API_BASE_URL}/projects/${projectId}/sites/${siteId}`);
export const reassignProjectSite = (projectId, oldSiteId, newSiteId) => axios.post(`${API_BASE_URL}/projects/${projectId}/sites/${oldSiteId}/reassign/${newSiteId}`);

// Project status endpoints
export const getProjectSiteStatuses = (projectId, siteId) => axios.get(`${API_BASE_URL}/projects/${projectId}/sites/${siteId}/status`);
export const createProjectSiteStatus = (projectId, siteId, payload) => axios.post(`${API_BASE_URL}/projects/${projectId}/sites/${siteId}/status`, payload);
export const updateProjectSiteStatus = (projectId, siteId, statusId, payload) => axios.put(`${API_BASE_URL}/projects/${projectId}/sites/${siteId}/status/${statusId}`, payload);
export const deleteProjectSiteStatus = (projectId, siteId, statusId) => axios.delete(`${API_BASE_URL}/projects/${projectId}/sites/${siteId}/status/${statusId}`);
export const getLatestProjectStatuses = (projectId) => axios.get(`${API_BASE_URL}/projects/${projectId}/status/latest`);

// Project steps endpoints
export const getProjectSteps = (projectId) => axios.get(`${API_BASE_URL}/projects/${projectId}/steps`);
export const createProjectStep = (projectId, payload) => axios.post(`${API_BASE_URL}/projects/${projectId}/steps`, payload);
export const updateProjectStep = (projectId, stepId, payload) => axios.put(`${API_BASE_URL}/projects/${projectId}/steps/${stepId}`, payload);
export const deleteProjectStep = (projectId, stepId) => axios.delete(`${API_BASE_URL}/projects/${projectId}/steps/${stepId}`);

// Vehicles endpoints
export const listVehicles = ({ page = 1, perPage = 25, order = 'asc', sort = 'equipment_id', search = '', siteId = '', departmentId = '', mcCode = '' } = {}) => {
	const params = new URLSearchParams({ page: String(page), per_page: String(perPage), order, sort });
	if (search) params.append('search', search);
	if (siteId) params.append('site_id', String(siteId));
	if (departmentId) params.append('department_id', String(departmentId));
	if (mcCode) params.append('mc_code', mcCode);
	return axios.get(`${API_BASE_URL}/vehicles/?${params.toString()}`);
};
export const createVehicle = (payload) => axios.post(`${API_BASE_URL}/vehicles/`, payload);
export const updateVehicle = (vehicleId, payload) => axios.put(`${API_BASE_URL}/vehicles/${vehicleId}`, payload);
export const deleteVehicle = (vehicleId) => axios.delete(`${API_BASE_URL}/vehicles/${vehicleId}`);
export const getVehicleCountsBySite = () => axios.get(`${API_BASE_URL}/vehicles/counts-by-site`);

// Caltrans Project Tracker import
export const importCaltransProjectCsv = (projectId, file) => {
	const formData = new FormData();
	formData.append('file', file);
	return axios.post(`${API_BASE_URL}/projects/${projectId}/import-caltrans`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	});
};

// Vehicle utilization import (monthly)
export const importVehicleUtilization = (file) => {
	const formData = new FormData();
	formData.append('file', file);
	return axios.post(`${API_BASE_URL}/fleet/usage/import`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// Files endpoints
export const listFiles = ({ q = '', siteId = '' } = {}) => {
	const params = new URLSearchParams();
	if (q) params.append('q', q);
	if (siteId) params.append('site_id', String(siteId));
	return axios.get(`${API_BASE_URL}/files/?${params.toString()}`);
};

export const uploadFile = ({ file, description = '', siteIds = [] }) => {
	const formData = new FormData();
	formData.append('file', file);
	if (description) formData.append('description', description);
	if (siteIds && siteIds.length) formData.append('site_ids', siteIds.join(','));
	return axios.post(`${API_BASE_URL}/files/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const getSiteFiles = (siteId) => axios.get(`${API_BASE_URL}/files/by-site/${siteId}`);
export const assignFileSites = (fileId, siteIds) => axios.post(`${API_BASE_URL}/files/${fileId}/sites`, { site_ids: siteIds });
export const unassignFileSite = (fileId, siteId) => axios.delete(`${API_BASE_URL}/files/${fileId}/sites/${siteId}`);
export const deleteFile = (fileId) => axios.delete(`${API_BASE_URL}/files/${fileId}`);
export const updateFile = (fileId, payload) => axios.put(`${API_BASE_URL}/files/${fileId}`, payload);
export const fileDownloadUrl = (fileId) => `${API_BASE_URL}/files/${fileId}/download`;
export const fileViewUrl = (fileId) => `${API_BASE_URL}/files/${fileId}/view`;