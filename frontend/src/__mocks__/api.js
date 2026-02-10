/**
 * Mock API module for testing.
 * Mocks all API calls with jest mock functions.
 */

export const mockSites = [
  {
    id: 1,
    name: 'Test Site 1',
    address: '123 Test St',
    city: 'Los Angeles',
    latitude: 34.0522,
    longitude: -118.2437,
    department_id: 'DEPT001',
  },
  {
    id: 2,
    name: 'Test Site 2',
    address: '456 Demo Ave',
    city: 'San Francisco',
    latitude: 37.7749,
    longitude: -122.4194,
    department_id: 'DEPT002',
  },
];

export const mockProjects = [
  {
    id: 1,
    name: 'Test Project 1',
    description: 'First test project',
    steps_count: 5,
  },
  {
    id: 2,
    name: 'Test Project 2',
    description: 'Second test project',
    steps_count: 3,
  },
];

export const mockSteps = [
  { id: 1, project_id: 1, title: 'Planning', step_order: 1 },
  { id: 2, project_id: 1, title: 'Design', step_order: 2 },
  { id: 3, project_id: 1, title: 'Implementation', step_order: 3 },
  { id: 4, project_id: 1, title: 'Testing', step_order: 4 },
  { id: 5, project_id: 1, title: 'Deployment', step_order: 5 },
];

export const mockServices = [
  {
    id: 1,
    site_id: 1,
    utility: 'PG&E',
    meter_number: 'MTR-001',
    main_breaker_amps: 200,
    voltage: 480,
    phase_count: 3,
  },
];

export const mockBills = [
  {
    id: 1,
    service_id: 1,
    year: 2025,
    month: 1,
    energy_usage: 15000,
    max_power: 75.5,
  },
];

// Default mock implementations
const createMockResponse = (data) => Promise.resolve({ data });

export const getSites = jest.fn(() => createMockResponse(mockSites));
export const getSite = jest.fn((id) => createMockResponse(mockSites.find(s => s.id === parseInt(id))));
export const createSite = jest.fn((data) => createMockResponse({ id: Date.now(), ...data }));
export const updateSite = jest.fn((id, data) => createMockResponse({ ...mockSites.find(s => s.id === parseInt(id)), ...data }));
export const deleteSite = jest.fn(() => createMockResponse({ status: 'deleted' }));
export const getSiteMetrics = jest.fn(() => createMockResponse({ theoretical_capacity_kw: 150, power_factor: 0.95 }));

export const getProjects = jest.fn(() => createMockResponse(mockProjects));
export const createProject = jest.fn((data) => createMockResponse({ id: Date.now(), steps_count: 0, ...data }));
export const updateProject = jest.fn((id, data) => createMockResponse({ ...mockProjects.find(p => p.id === parseInt(id)), ...data }));
export const deleteProject = jest.fn(() => createMockResponse({ status: 'deleted' }));

export const getProjectSteps = jest.fn((projectId) => createMockResponse(mockSteps.filter(s => s.project_id === parseInt(projectId))));
export const createProjectStep = jest.fn((projectId, data) => createMockResponse({ id: Date.now(), project_id: projectId, ...data }));
export const updateProjectStep = jest.fn((projectId, stepId, data) => createMockResponse({ ...mockSteps.find(s => s.id === parseInt(stepId)), ...data }));
export const deleteProjectStep = jest.fn(() => createMockResponse({ status: 'deleted' }));

export const getProjectSites = jest.fn(() => createMockResponse({ items: mockSites, meta: { total: mockSites.length } }));
export const addSiteToProject = jest.fn((projectId, siteId) => createMockResponse({ project_id: projectId, site_id: siteId }));
export const removeSiteFromProject = jest.fn(() => createMockResponse({ status: 'removed' }));

export const getLatestProjectStatuses = jest.fn(() => createMockResponse([]));
export const getProjectSiteStatuses = jest.fn(() => createMockResponse([]));
export const createProjectSiteStatus = jest.fn((projectId, siteId, data) => createMockResponse({ id: Date.now(), project_id: projectId, site_id: siteId, ...data }));
export const updateProjectSiteStatus = jest.fn((projectId, siteId, statusId, data) => createMockResponse({ id: statusId, ...data }));
export const deleteProjectSiteStatus = jest.fn(() => createMockResponse({ status: 'deleted' }));

export const getServices = jest.fn((siteId) => createMockResponse(mockServices.filter(s => s.site_id === parseInt(siteId))));
export const createService = jest.fn((siteId, data) => createMockResponse({ id: Date.now(), site_id: siteId, ...data }));
export const updateService = jest.fn((siteId, serviceId, data) => createMockResponse({ ...mockServices.find(s => s.id === parseInt(serviceId)), ...data }));
export const deleteService = jest.fn(() => createMockResponse({ status: 'deleted' }));

export const getBills = jest.fn((siteId) => createMockResponse(mockBills));
export const createBill = jest.fn((serviceId, data) => createMockResponse({ id: Date.now(), service_id: serviceId, ...data }));
export const updateBill = jest.fn((billId, data) => createMockResponse({ ...mockBills.find(b => b.id === parseInt(billId)), ...data }));
export const deleteBill = jest.fn(() => createMockResponse({ status: 'deleted' }));

export const getAggregateMetrics = jest.fn(() => createMockResponse({ data: mockSites }));
export const getSitesForMap = jest.fn(() => createMockResponse(mockSites));
export const getSiteProjects = jest.fn(() => createMockResponse([]));
export const getEquipmentEnergy = jest.fn(() => createMockResponse({}));
export const reassignProjectSite = jest.fn(() => createMockResponse({ statuses_copied: 0 }));

// Reset all mocks helper
export const resetAllMocks = () => {
  getSites.mockClear();
  getSite.mockClear();
  createSite.mockClear();
  updateSite.mockClear();
  deleteSite.mockClear();
  getProjects.mockClear();
  createProject.mockClear();
  updateProject.mockClear();
  deleteProject.mockClear();
  getProjectSteps.mockClear();
  createProjectStep.mockClear();
  updateProjectStep.mockClear();
  deleteProjectStep.mockClear();
  getProjectSites.mockClear();
  addSiteToProject.mockClear();
  removeSiteFromProject.mockClear();
  getServices.mockClear();
  createService.mockClear();
  updateService.mockClear();
  deleteService.mockClear();
  getBills.mockClear();
  createBill.mockClear();
  updateBill.mockClear();
  deleteBill.mockClear();
};
