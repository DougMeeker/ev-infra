import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api";

// Site endpoints
export const getSites = () => axios.get(`${API_BASE_URL}/sites`);
// Whitelist and normalize site payloads before sending to backend
const sanitizeSitePayload = (site) => {
	if (!site || typeof site !== 'object') return {};
	const fields = [
		'name', 'latitude', 'longitude', 'utility', 'utility_account', 'utility_name', 'meter_number',
		'address', 'city', 'contact_name', 'contact_phone', 'main_breaker_amps', 'voltage', 'phase_count', 'power_factor'
	];
	const out = {};
	for (const key of fields) {
		if (site[key] === undefined) continue;
		let val = site[key];
		if (val === '') continue; // drop empty strings
		if (['latitude','longitude','power_factor'].includes(key)) {
			const n = Number(val);
			if (!Number.isNaN(n)) out[key] = n;
			continue;
		}
		if (['main_breaker_amps','voltage','phase_count'].includes(key)) {
			const n = parseInt(val, 10);
			if (!Number.isNaN(n)) out[key] = n;
			continue;
		}
		out[key] = val;
	}
	return out;
};

export const createSite = (site) => axios.post(`${API_BASE_URL}/sites/`, sanitizeSitePayload(site));
export const updateSite = (id, site) => axios.put(`${API_BASE_URL}/sites/${id}`, sanitizeSitePayload(site));
export const deleteSite = (id) => axios.delete(`${API_BASE_URL}/sites/${id}`);

// Utility bill endpoints
export const getBills = (siteId) => axios.get(`${API_BASE_URL}/sites/${siteId}/bills`);
export const createBill = (siteId, bill) => axios.post(`${API_BASE_URL}/sites/${siteId}/bills`, bill);
export const updateBill = (billId, bill) => axios.put(`${API_BASE_URL}/sites/bills/${billId}`, bill);
export const deleteBill = (billId) => axios.delete(`${API_BASE_URL}/sites/bills/${billId}`);

// Site metrics
export const getSiteMetrics = (siteId) => axios.get(`${API_BASE_URL}/sites/${siteId}/metrics`);

// Aggregate metrics with pagination
export const getAggregateMetrics = ({ page = 1, perPage = 25, order = 'desc', sort = 'available_capacity_kw', search = '' } = {}) => {
	const params = new URLSearchParams({ page: String(page), per_page: String(perPage), order, sort });
	if (search) params.append('search', search);
	return axios.get(`${API_BASE_URL}/sites/metrics/aggregate?${params.toString()}`);
};

// Equipment endpoints
export const getEquipment = (siteId, { year } = {}) => {
	const params = year ? `?year=${year}` : '';
	return axios.get(`${API_BASE_URL}/sites/${siteId}/equipment${params}`);
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
export const upsertEquipmentUsage = (equipmentId, { year, miles }) => axios.post(`${API_BASE_URL}/sites/equipment/${equipmentId}/usage`, { year, miles });

// Charger endpoints
export const getChargers = (siteId) => axios.get(`${API_BASE_URL}/sites/${siteId}/chargers`);
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

// GeoJSON site import
export const uploadSitesGeoJSON = (file) => {
	const formData = new FormData();
	formData.append('file', file);
	return axios.post(`${API_BASE_URL}/sites/upload-geojson`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// Project endpoints
export const getProjects = () => axios.get(`${API_BASE_URL}/projects`);
export const createProject = ({ name, total_steps, description }) => axios.post(`${API_BASE_URL}/projects`, { name, total_steps, description });
export const updateProject = (projectId, payload) => axios.put(`${API_BASE_URL}/projects/${projectId}`, payload);
export const deleteProject = (projectId) => axios.delete(`${API_BASE_URL}/projects/${projectId}`);
export const getProjectSites = (projectId, { q = '', page = 1, page_size = 25 } = {}) => {
	const params = new URLSearchParams();
	if (q) params.append('q', q);
	params.append('page', String(page));
	params.append('page_size', String(page_size));
	return axios.get(`${API_BASE_URL}/projects/${projectId}/sites?${params.toString()}`);
};
export const addSiteToProject = (projectId, siteId) => axios.post(`${API_BASE_URL}/projects/${projectId}/sites`, { site_id: siteId });
export const removeSiteFromProject = (projectId, siteId) => axios.delete(`${API_BASE_URL}/projects/${projectId}/sites/${siteId}`);

// Project status endpoints
export const getProjectSiteStatuses = (projectId, siteId) => axios.get(`${API_BASE_URL}/projects/${projectId}/sites/${siteId}/status`);
export const createProjectSiteStatus = (projectId, siteId, payload) => axios.post(`${API_BASE_URL}/projects/${projectId}/sites/${siteId}/status`, payload);
export const getLatestProjectStatuses = (projectId) => axios.get(`${API_BASE_URL}/projects/${projectId}/status/latest`);

// Project steps endpoints
export const getProjectSteps = (projectId) => axios.get(`${API_BASE_URL}/projects/${projectId}/steps`);
export const createProjectStep = (projectId, payload) => axios.post(`${API_BASE_URL}/projects/${projectId}/steps`, payload);
export const updateProjectStep = (projectId, stepId, payload) => axios.put(`${API_BASE_URL}/projects/${projectId}/steps/${stepId}`, payload);
export const deleteProjectStep = (projectId, stepId) => axios.delete(`${API_BASE_URL}/projects/${projectId}/steps/${stepId}`);