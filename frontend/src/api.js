import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api";

// Site endpoints
export const getSites = () => axios.get(`${API_BASE_URL}/sites`);
export const createSite = (site) => axios.post(`${API_BASE_URL}/sites/`, site);
export const updateSite = (id, site) => axios.put(`${API_BASE_URL}/sites/${id}`, site);
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