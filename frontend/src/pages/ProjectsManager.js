import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { ratioFrom } from '../utils/statusShading';
import { reloadStatusData } from '../utils/statusHelpers';
import { useDebounce, useResponsiveGrid } from '../hooks';
import StatusEditor from '../components/StatusEditor';
import ProjectsSection from '../components/ProjectsSection';
import SitesSection from '../components/SitesSection';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getSites,
  getProjectSites,
  addSiteToProject,
  removeSiteFromProject,
  getLatestProjectStatuses,
  getProjectSteps,
  createProjectStep,
  updateProjectStep,
  deleteProjectStep,
  createProjectSiteStatus,
  updateProjectSiteStatus,
  deleteProjectSiteStatus,
  getAggregateMetrics,
} from '../api';

export default function ProjectsManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [editProject, setEditProject] = useState({ name: '', description: '' });
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [assignment, setAssignment] = useState({ siteId: '', siteName: '' });
  const [siteSearch, setSiteSearch] = useState(() => searchParams.get('q') || '');
  const debouncedSearch = useDebounce(siteSearch, 300);
  const [departmentIdSearch, setDepartmentIdSearch] = useState(() => searchParams.get('department_id') || '');
  const debouncedDepartmentId = useDebounce(departmentIdSearch, 300);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [latestStatuses, setLatestStatuses] = useState([]);
  const [sortMode, setSortMode] = useState(() => {
    const s = searchParams.get('sort');
    return (s === 'name' || s === 'status') ? s : 'name';
  }); // 'name' | 'status'
  const [projectSites, setProjectSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState(() => searchParams.get('siteId') || '');
  const [sitesPage, setSitesPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1));
  const [sitesPageSize, setSitesPageSize] = useState(() => Math.max(1, Number(searchParams.get('per_page')) || 25));
  const [sitesTotal, setSitesTotal] = useState(0);
  const [steps, setSteps] = useState([]);
  const [newStep, setNewStep] = useState({ title: '', step_order: '', description: '' });
  const [showSitesSection, setShowSitesSection] = useState(true);
  const [statusHistory, setStatusHistory] = useState([]);
  const [editingStatusId, setEditingStatusId] = useState(null);
  const [editForm, setEditForm] = useState({ current_step: '', status_message: '', status_date: '', estimated_cost: '', actual_cost: '' });
  const [statusError, setStatusError] = useState(null);
  const { gridRef, gridCols } = useResponsiveGrid(320, [showSitesSection, selectedProjectId]);
  const pageSizeOptions = useMemo(() => {
    const base = [2, 6, 12];
    return base.map(n => Math.max(1, gridCols * n));
  }, [gridCols]);
  const [statusForm, setStatusForm] = useState({ current_step: '', status_message: '', status_date: new Date().toISOString().slice(0,10), estimated_cost: '', actual_cost: '' });
  const [showStatusEditor, setShowStatusEditor] = useState(true);
  const [projectAverages, setProjectAverages] = useState({});

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data } = await getProjects();
      setProjects(data);
    } finally {
      setLoadingProjects(false);
    }
  };
  // Initial load of projects and sites
  useEffect(() => {
    loadProjects();
  }, []);

  // Compute average progress per project for project cards
  useEffect(() => {
    (async () => {
      if (!projects || projects.length === 0) { setProjectAverages({}); return; }
      try {
        const entries = await Promise.all(projects.map(async (p) => {
          const stepsCount = (typeof p.steps_count === 'number' && p.steps_count > 0) ? p.steps_count : null;
          if (!stepsCount) return [p.id, { avg: null, count: 0 }];
          try {
            const { data: latest } = await getLatestProjectStatuses(p.id);
            const ratios = (latest || [])
              .map(ls => ratioFrom(ls?.current_step, stepsCount))
              .filter(r => r != null);
            const avg = ratios.length ? (ratios.reduce((a,b)=>a+b,0) / ratios.length) : null;
            return [p.id, { avg, count: ratios.length }];
          } catch {
            return [p.id, { avg: null, count: 0 }];
          }
        }));
        const map = Object.fromEntries(entries);
        setProjectAverages(map);
      } catch {
        // ignore
      }
    })();
  }, [projects]);

  // Initialize selected project from route
  const prevProjectIdRef = useRef(null);
  useEffect(() => {
    if (params.projectId) {
      setSelectedProjectId(Number(params.projectId));
    } else {
      // Clear selection if no project ID in URL
      setSelectedProjectId(null);
    }
  }, [params.projectId]);

  // Reset to first page when switching projects (not when re-rendering same project)
  useEffect(() => {
    if (selectedProjectId && prevProjectIdRef.current !== null && prevProjectIdRef.current !== selectedProjectId) {
      setSitesPage(1);
    }
    prevProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  // State is initialized directly from URL search params via lazy useState initializers above.

  // When search or sort changes, reset to first page to avoid empty pages
  const isFirstRenderRef = useRef(true);
  const prevSearchRef = useRef(debouncedSearch);
  const prevDeptIdRef = useRef(debouncedDepartmentId);
  const prevSortModeRef = useRef(sortMode);
  useEffect(() => {
    // Skip on initial render to preserve URL page
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    // Only reset if values actually changed
    if (
      prevSearchRef.current !== debouncedSearch ||
      prevDeptIdRef.current !== debouncedDepartmentId ||
      prevSortModeRef.current !== sortMode
    ) {
      setSitesPage(1);
    }
    prevSearchRef.current = debouncedSearch;
    prevDeptIdRef.current = debouncedDepartmentId;
    prevSortModeRef.current = sortMode;
  }, [debouncedSearch, debouncedDepartmentId, sortMode]);

  // Persist filters to URL
  useEffect(() => {
    const paramsObj = {};
    if (debouncedSearch) paramsObj.q = debouncedSearch;
    if (debouncedDepartmentId) paramsObj.department_id = debouncedDepartmentId;
    if (sortMode) paramsObj.sort = sortMode;
    if (sitesPage) paramsObj.page = String(sitesPage);
    if (sitesPageSize) paramsObj.per_page = String(sitesPageSize);
    if (selectedSiteId) paramsObj.siteId = String(selectedSiteId);
    setSearchParams(paramsObj);
  }, [debouncedSearch, debouncedDepartmentId, sortMode, sitesPage, sitesPageSize, selectedSiteId, setSearchParams]);

  // Auto-adjust page size to nearest responsive option when columns change
  // Skip on initial mount to preserve URL page size
  const pageSizeInitRef = useRef(true);
  useEffect(() => {
    if (pageSizeInitRef.current) {
      pageSizeInitRef.current = false;
      return;
    }
    if (pageSizeOptions.length > 0 && !pageSizeOptions.includes(sitesPageSize)) {
      const nearest =  pageSizeOptions.reduce((prev, curr) => (
        Math.abs(curr - sitesPageSize) < Math.abs(prev - sitesPageSize) ? curr : prev
      ), pageSizeOptions[0]);
      setSitesPageSize(nearest);
      // Only reset to page 1 if the adjustment significantly changed the page size
      if (Math.abs(nearest - sitesPageSize) > 6) {
        setSitesPage(1);
      }
    }
  }, [pageSizeOptions, sitesPageSize]);

  const loadProjectSites = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      // When sorting by status, fetch all items so client-side sort+paging covers the full set.
      // When sorting by name, use normal server-side pagination.
      const fetchAll = sortMode === 'status';
      const { data } = await getProjectSites(selectedProjectId, {
        q: debouncedSearch,
        department_id: debouncedDepartmentId,
        page: fetchAll ? 1 : sitesPage,
        page_size: fetchAll ? 99999 : sitesPageSize,
      });
      const items = data?.items || [];
      setProjectSites(items);
      setSitesTotal(data?.meta?.total ?? items.length);
      // Latest statuses for badge shading
      const { data: latest } = await getLatestProjectStatuses(selectedProjectId);
      setLatestStatuses(latest || []);
      // Steps for this project
      const { data: stepData } = await getProjectSteps(selectedProjectId);
      setSteps(stepData || []);
      // Seed edit form values if available
      const proj = projects.find(p => String(p.id) === String(selectedProjectId));
      if (proj) setEditProject({ name: proj.name || '', description: proj.description || '' });
    } finally {
    }
  }, [selectedProjectId, debouncedSearch, debouncedDepartmentId, sitesPage, sitesPageSize, sortMode, projects]);

  // Reload project data when selection or filters change
  useEffect(() => {
    loadProjectSites();
  }, [loadProjectSites]);

  // Keep selected project's average up to date when its statuses or steps change
  useEffect(() => {
    (async () => {
      const selId = selectedProjectId;
      if (!selId) return;
      const proj = projects.find(p => String(p.id) === String(selId));
      const stepsCount = (proj && typeof proj.steps_count === 'number') ? proj.steps_count : steps.length;
      const ratios = (latestStatuses || [])
        .map(ls => ratioFrom(ls?.current_step, stepsCount))
        .filter(r => r != null);
      const avg = ratios.length ? (ratios.reduce((a,b)=>a+b,0) / ratios.length) : null;
      setProjectAverages(prev => ({ ...prev, [selId]: { avg, count: ratios.length } }));
    })();
  }, [selectedProjectId, latestStatuses, steps.length, projects]);

  // Load status history when a site is selected
  useEffect(() => {
    if (!selectedProjectId || !selectedSiteId) {
      setStatusHistory([]);
      return;
    }
    reloadStatusData(selectedProjectId, selectedSiteId, { setStatusHistory });
  }, [selectedProjectId, selectedSiteId]);

  // Create project handler is not currently used by the UI; remove to satisfy lint

  const handleDelete = async (id) => {
    if (!window.confirm('Delete project?')) return;
    await deleteProject(id);
    await loadProjects();
    if (String(id) === String(selectedProjectId)) {
      setSelectedProjectId(null);
      setProjectSites([]);
      setLatestStatuses([]);
      setSteps([]);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      alert('Project name is required');
      return;
    }
    try {
      const payload = {
        name: newProject.name.trim(),
        description: newProject.description?.trim() || undefined,
      };
      const { data } = await createProject(payload);
      await loadProjects();
      setNewProject({ name: '', description: '' });
      setShowCreateForm(false);
      // Auto-select the newly created project
      setSelectedProjectId(data.id);
      navigate(`/project/${data.id}`);
    } catch (err) {
      console.error('Error creating project:', err);
      alert('Failed to create project: ' + (err.response?.data?.error || err.message));
    }
  };

  // Sites available for assignment (filters search and excludes already assigned)
  const assignedIds = useMemo(() => new Set(projectSites.map(s => String(s.id))), [projectSites]);
  // Async loader for combobox options (server-side search)
  const allSitesCacheRef = useRef(null);
  const loadSiteOptions = useCallback(async (q) => {
    const query = (q || '').trim();
    if (!query || query.length < 2) return [];
    // Primary: server-side aggregate metrics search (fast)
    const { data } = await getAggregateMetrics({ search: query, limit: 50 });
    const items = Array.isArray(data?.data) ? data.data : [];
    let opts = items
      .filter(s => !assignedIds.has(String(s.id)))
      .map(s => ({ id: s.site_id ?? s.id, name: s.name, address: s.address, city: s.city }));
    // If no results (likely searching by address), fallback to local address filter over all sites
    if (opts.length === 0) {
      let allSites = allSitesCacheRef.current;
      if (!Array.isArray(allSites)) {
        try {
          const { data: all } = await getSites();
          allSites = Array.isArray(all) ? all : [];
          allSitesCacheRef.current = allSites;
        } catch {
          allSites = [];
        }
      }
      const qLower = query.toLowerCase();
      opts = allSites
        .filter(s => !assignedIds.has(String(s.id)))
        .filter(s => (
          (s.name && String(s.name).toLowerCase().includes(qLower)) ||
          (s.address && String(s.address).toLowerCase().includes(qLower)) ||
          (s.city && String(s.city).toLowerCase().includes(qLower)) ||
          (s.department_id && String(s.department_id).toLowerCase().includes(qLower))
        ))
        .slice(0, 50)
        .map(s => ({ id: s.id, name: s.name, address: s.address, city: s.city }));
    }
    opts.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    return opts;
  }, [assignedIds]);

  const sortedProjectSites = useMemo(() => {
    const arr = [...projectSites];
    if (sortMode === 'status') {
      return arr.sort((a,b) => {
        const sa = latestStatuses.find(ls => String(ls.site_id) === String(a.id));
        const sb = latestStatuses.find(ls => String(ls.site_id) === String(b.id));
        const ra = ratioFrom(sa?.current_step, steps.length);
        const rb = ratioFrom(sb?.current_step, steps.length);
        const av = ra === null ? -1 : ra;
        const bv = rb === null ? -1 : rb;
        if (av !== bv) return bv - av; // descending by progress
        return (a.name||'').localeCompare(b.name||'');
      });
    }
    return arr.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  }, [projectSites, latestStatuses, steps.length, sortMode]);

  // Sync selectedSiteId from URL params
  useEffect(() => {
    const siteIdParam = searchParams.get('siteId');
    if (siteIdParam && siteIdParam !== selectedSiteId) {
      setSelectedSiteId(siteIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const totalPages = useMemo(() => {
    const total = sitesTotal || projectSites.length;
    return Math.max(1, Math.ceil(total / sitesPageSize));
  }, [sitesTotal, projectSites.length, sitesPageSize]);

  const handleAssignSite = async (e) => {
    e.preventDefault();
    if (!assignment.siteId || !selectedProjectId) return;
    const addedSiteId = assignment.siteId;
    // optimistic add
    const site = assignment.siteName ? { id: assignment.siteId, name: assignment.siteName } : null;
    if (site) {
      setProjectSites(prev => [...prev, site].sort((a,b) => (a.name||'').localeCompare(b.name||'')));
    }
    try {
      await addSiteToProject(selectedProjectId, assignment.siteId);
      await loadProjectSites();
      // Select the newly added site and preserve current filters in URL
      setSelectedSiteId(String(addedSiteId));
      const params = new URLSearchParams();
      params.set('siteId', String(addedSiteId));
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (debouncedDepartmentId) params.set('department_id', debouncedDepartmentId);
      if (sortMode) params.set('sort', sortMode);
      if (sitesPage) params.set('page', String(sitesPage));
      if (sitesPageSize) params.set('per_page', String(sitesPageSize));
      navigate(`/project/${selectedProjectId}?${params.toString()}`);
    } finally {
      setAssignment({ siteId: '', siteName: '' });
    }
  };
  // Status history is no longer rendered here; skipping its fetch to reduce unused state

  const submitStatus = async (e) => {
    e.preventDefault();
    if (!selectedProjectId || !selectedSiteId || !statusForm.current_step) return;
    setStatusError(null); // Clear previous errors
    try {
      const payload = {
        current_step: Number(statusForm.current_step),
        status_message: statusForm.status_message || undefined,
        status_date: statusForm.status_date || undefined,
        estimated_cost: statusForm.estimated_cost ? Number(statusForm.estimated_cost) : undefined,
        actual_cost: statusForm.actual_cost ? Number(statusForm.actual_cost) : undefined,
      };
      await createProjectSiteStatus(selectedProjectId, selectedSiteId, payload);
      setStatusForm({ current_step: '', status_message: '', status_date: new Date().toISOString().slice(0,10), estimated_cost: '', actual_cost: '' });
      // Reload status data
      await reloadStatusData(selectedProjectId, selectedSiteId, { setStatusHistory, setLatestStatuses });
    } catch (err) {
      console.error('Error creating status:', err);
      const errorMsg = err.response?.data?.error || 'Failed to add status. Please try again.';
      setStatusError(errorMsg);
    }
  };

  const handleUpdateStatus = async (statusId, data) => {
    if (!selectedProjectId || !selectedSiteId) return;
    setStatusError(null); // Clear previous errors
    try {
      const payload = {
        current_step: Number(data.current_step),
        status_message: data.status_message || undefined,
        status_date: data.status_date || undefined,
        estimated_cost: data.estimated_cost ? Number(data.estimated_cost) : undefined,
        actual_cost: data.actual_cost ? Number(data.actual_cost) : undefined,
      };
      await updateProjectSiteStatus(selectedProjectId, selectedSiteId, statusId, payload);
      // Reload status data
      await reloadStatusData(selectedProjectId, selectedSiteId, { setStatusHistory, setLatestStatuses });
      setEditingStatusId(null);
    } catch (err) {
      console.error('Error updating status:', err);
      const errorMsg = err.response?.data?.error || 'Failed to update status. Please try again.';
      setStatusError(errorMsg);
    }
  };

  const handleDeleteStatus = async (statusId) => {
    if (!selectedProjectId || !selectedSiteId) return;
    try {
      await deleteProjectSiteStatus(selectedProjectId, selectedSiteId, statusId);
      // Reload status data
      await reloadStatusData(selectedProjectId, selectedSiteId, { setStatusHistory, setLatestStatuses });
    } catch (err) {
      console.error('Error deleting status:', err);
      alert('Failed to delete status');
    }
  };

  const handleRemoveSite = async (siteId) => {
    if (!window.confirm('Remove this site from the project?')) return;
    // optimistic remove
    const prev = projectSites;
    setProjectSites(p => p.filter(s => String(s.id) !== String(siteId)));
    try {
      await removeSiteFromProject(selectedProjectId, siteId);
      await loadProjectSites();
    } catch (e) {
      setProjectSites(prev);
    }
  };

  const handleCreateStep = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!selectedProjectId) return;
    const payload = {
      title: (newStep.title || '').trim(),
      description: newStep.description ? newStep.description.trim() : undefined,
      step_order: newStep.step_order ? Number(newStep.step_order) : undefined,
    };
    if (!payload.title) return;
    // optimistic add: assign next order locally
    const nextOrder = (steps[steps.length - 1]?.step_order || 0) + 1;
    const tempStep = { id: `tmp-${Date.now()}`, project_id: selectedProjectId, title: payload.title, description: payload.description, step_order: payload.step_order || nextOrder };
    setSteps(prev => [...prev, tempStep]);
    setNewStep({ title: '', step_order: '', description: '' });
    try {
      const { data: created } = await createProjectStep(selectedProjectId, payload);
      // replace temp with created
      setSteps(prev => prev.map(s => (String(s.id).startsWith('tmp-') && s.title === tempStep.title ? created : s)).sort((a,b)=>a.step_order-b.step_order));
    } catch (e) {
      // rollback
      const { data: stepData } = await getProjectSteps(selectedProjectId);
      setSteps(stepData);
    }
  };

  const handleUpdateStep = async (stepId, changes) => {
    // optimistic update
    setSteps(prev => prev.map(s => (s.id === stepId ? { ...s, ...changes } : s)));
    try {
      await updateProjectStep(selectedProjectId, stepId, changes);
    } catch (e) {
      const { data: stepData } = await getProjectSteps(selectedProjectId);
      setSteps(stepData);
    }
  };

  const handleDeleteStep = async (stepId) => {
    if (!window.confirm('Delete step?')) return;
    // optimistic remove
    const prevSteps = steps;
    setSteps(prev => prev.filter(s => s.id !== stepId));
    try {
      await deleteProjectStep(selectedProjectId, stepId);
    } catch (e) {
      // rollback
      setSteps(prevSteps);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Projects Manager</h2>

      <ProjectsSection
        projects={projects}
        selectedProjectId={selectedProjectId}
        latestStatuses={latestStatuses}
        stepsCount={steps.length}
        projectAverages={projectAverages}
        loadingProjects={loadingProjects}
        onSelectProject={(id) => { 
          if (String(id) === String(selectedProjectId)) {
            // Deselect if clicking same project
            setSelectedProjectId(null);
            navigate('/project');
          } else {
            // Select new project
            setSelectedProjectId(id);
            navigate(`/project/${id}`);
          }
        }}
        onDeleteProject={handleDelete}
        editProject={editProject}
        setEditProject={setEditProject}
        onSaveEdit={async (projectId, payload) => {
          const data = { name: payload.name, description: payload.description || undefined };
          await updateProject(projectId, data);
          await loadProjects();
        }}
        editingProjectId={editingProjectId}
        setEditingProjectId={setEditingProjectId}
        steps={steps}
        newStep={newStep}
        setNewStep={setNewStep}
        handleCreateStep={handleCreateStep}
        handleUpdateStep={handleUpdateStep}
        handleDeleteStep={handleDeleteStep}
        showCreateForm={showCreateForm}
        setShowCreateForm={setShowCreateForm}
        newProject={newProject}
        setNewProject={setNewProject}
        onCreateProject={handleCreateProject}
      />
      
      <SitesSection
        selectedProjectId={selectedProjectId}
        assignment={assignment}
        setAssignment={setAssignment}
        loadSiteOptions={loadSiteOptions}
        onAssign={handleAssignSite}
        sortMode={sortMode}
        setSortMode={setSortMode}
        siteSearch={siteSearch}
        setSiteSearch={setSiteSearch}
        departmentIdSearch={departmentIdSearch}
        setDepartmentIdSearch={setDepartmentIdSearch}
        sortedProjectSites={sortedProjectSites}
        sitesPage={sitesPage}
        setSitesPage={setSitesPage}
        sitesPageSize={sitesPageSize}
        setSitesPageSize={setSitesPageSize}
        totalPages={totalPages}
        pageSizeOptions={pageSizeOptions}
        latestStatuses={latestStatuses}
        stepsCount={steps.length}
        selectedSiteId={selectedSiteId}
        setSelectedSiteId={setSelectedSiteId}
        onOpenSite={(siteId, currentStep) => {
          const id = String(siteId);
          setSelectedSiteId(id);
          const next = currentStep != null ? Number(currentStep) + 1 : '';
          setStatusForm(f => ({ ...f, current_step: next }));
          // Preserve current filters in URL
          const params = new URLSearchParams();
          params.set('siteId', id);
          if (debouncedSearch) params.set('q', debouncedSearch);
          if (debouncedDepartmentId) params.set('department_id', debouncedDepartmentId);
          if (sortMode) params.set('sort', sortMode);
          if (sitesPage) params.set('page', String(sitesPage));
          if (sitesPageSize) params.set('per_page', String(sitesPageSize));
          navigate(`/project/${selectedProjectId}?${params.toString()}`);
        }}
        onOpenDetails={(siteId) => navigate(`/site/${siteId}`)}
        onRemove={handleRemoveSite}
        sitesTotal={sitesTotal || projectSites.length}
        gridRef={gridRef}
        showSitesSection={showSitesSection}
        setShowSitesSection={setShowSitesSection}
      />

      <StatusEditor
        steps={steps}
        statusForm={statusForm}
        setStatusForm={setStatusForm}
        showStatusEditor={showStatusEditor}
        setShowStatusEditor={setShowStatusEditor}
        selectedProjectId={selectedProjectId}
        selectedSiteId={selectedSiteId}
        selectedSiteName={projectSites.find(s => String(s.id) === String(selectedSiteId))?.name}
        onSubmitStatus={submitStatus}
        statusHistory={statusHistory}
        editingStatusId={editingStatusId}
        setEditingStatusId={setEditingStatusId}
        editForm={editForm}
        setEditForm={setEditForm}
        onUpdateStatus={handleUpdateStatus}
        onDeleteStatus={handleDeleteStatus}
        error={statusError}
        setError={setStatusError}
      />
    </div>
  );
}
