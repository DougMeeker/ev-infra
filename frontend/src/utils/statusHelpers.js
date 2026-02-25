import { getProjectSiteStatuses, getLatestProjectStatuses } from '../api';

/**
 * Fetches and sorts status history for a site, and reloads latest statuses.
 * @param {number|string} projectId - Project ID
 * @param {number|string} siteId - Site ID
 * @param {Object} setters - State setter functions
 * @param {Function} setters.setStatusHistory - Setter for status history
 * @param {Function} setters.setLatestStatuses - Setter for latest statuses (optional)
 * @returns {Promise<void>}
 */
export async function reloadStatusData(projectId, siteId, { setStatusHistory, setLatestStatuses }) {
  try {
    const { data: history } = await getProjectSiteStatuses(projectId, siteId);
    const sorted = (history || []).sort((a, b) => new Date(b.status_date) - new Date(a.status_date));
    setStatusHistory(sorted);
    
    if (setLatestStatuses) {
      const { data: latest } = await getLatestProjectStatuses(projectId);
      setLatestStatuses(latest || []);
    }
  } catch (err) {
    console.error('Error reloading status data:', err);
    setStatusHistory([]);
  }
}

/**
 * Reloads only the latest statuses for a project (for badge shading).
 * @param {number|string} projectId - Project ID
 * @param {Function} setLatestStatuses - Setter for latest statuses
 * @returns {Promise<void>}
 */
export async function reloadLatestStatuses(projectId, setLatestStatuses) {
  try {
    const { data: latest } = await getLatestProjectStatuses(projectId);
    setLatestStatuses(latest || []);
  } catch (err) {
    console.error('Error reloading latest statuses:', err);
  }
}
