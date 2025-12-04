import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ratioFrom, getStatusShade } from '../utils/statusShading';
import StatusLegend from '../components/StatusLegend';
import { Link } from 'react-router-dom';
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
} from '../api';

export default function ProjectsManager() {
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [newProject, setNewProject] = useState({ name: '', description: '' });
  const [assignment, setAssignment] = useState({ siteId: '' });
  const [siteSearch, setSiteSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingProjectSites, setLoadingProjectSites] = useState(false);
  const [latestStatuses, setLatestStatuses] = useState([]);
  const [sortMode, setSortMode] = useState('name'); // 'name' | 'status'
  const [projectSites, setProjectSites] = useState([]);
  const [sitesPage, setSitesPage] = useState(1);
  const [sitesPageSize, setSitesPageSize] = useState(25);
  const [sitesTotal, setSitesTotal] = useState(0);
  const [steps, setSteps] = useState([]);
  const [newStep, setNewStep] = useState({ title: '', step_order: '', description: '' });

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const { data } = await getProjects();
      setProjects(data);
    } finally {
      setLoadingProjects(false);
    }
  };
  const loadSites = async () => {
    setLoadingSites(true);
    try {
      const { data } = await getSites();
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setSites(data);
    } finally {
      setLoadingSites(false);
    }
  };
  const loadProjectSites = useCallback(async (projectId) => {
    if (!projectId) return;
    setLoadingProjectSites(true);
    try {
      const effectivePageSize = sortMode === 'status' ? 500 : sitesPageSize;
      const effectivePage = sortMode === 'status' ? 1 : sitesPage;
      const { data } = await getProjectSites(projectId, { q: debouncedSearch, page: effectivePage, page_size: effectivePageSize });
      const items = Array.isArray(data) ? data : (data.items || []);
      setProjectSites(items);
      const total = Array.isArray(data) ? items.length : ((data.meta && typeof data.meta.total === 'number') ? data.meta.total : (data.total || items.length || 0));
      setSitesTotal(total);
      // Fetch latest statuses for badges
      const { data: latest } = await getLatestProjectStatuses(projectId);
      setLatestStatuses(latest);
      const { data: stepData } = await getProjectSteps(projectId);
      setSteps(stepData);
    } finally {
      setLoadingProjectSites(false);
    }
  }, [debouncedSearch, sitesPage, sitesPageSize, sortMode]);
  // Derived sorted list for Sites in Project section
  const sortedProjectSites = useMemo(() => {
    const arr = [...projectSites];
    if (sortMode === 'name') {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return arr;
    }
    // status mode: order complete -> in progress -> no status, each group by name
    const project = projects.find(p => String(p.id) === String(selectedProjectId));
    const stepsCount = (project && typeof project.steps_count === 'number') ? project.steps_count : steps.length;
    const getRatio = (siteId) => {
      const status = latestStatuses.find(ls => String(ls.site_id) === String(siteId));
      if (!project || !status || status.current_step == null || !stepsCount) return null;
      return ratioFrom(status.current_step, stepsCount);
    };
    const getBucket = (r) => {
      if (r === null) return 2; // no status
      return r >= 1 ? 0 : 1;    // 0 complete, 1 in progress
    };
    arr.sort((a, b) => {
      const ra = getRatio(a.id);
      const rb = getRatio(b.id);
      const ba = getBucket(ra);
      const bb = getBucket(rb);
      if (ba !== bb) return ba - bb;
      // Within same bucket, sort by ratio desc (further along first), then by name
      if (ra !== null && rb !== null && ra !== rb) return rb - ra;
      return (a.name || '').localeCompare(b.name || '');
    });
    return arr;
  }, [projectSites, sortMode, latestStatuses, projects, selectedProjectId, steps.length]);


  useEffect(() => {
    loadProjects();
    loadSites();
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(siteSearch), 250);
    return () => clearTimeout(t);
  }, [siteSearch]);

  useEffect(() => {
    loadProjectSites(selectedProjectId);
  }, [selectedProjectId, loadProjectSites]);

  // When switching to status sort, reset to page 1 because we fetch all items
  useEffect(() => {
    if (sortMode === 'status') setSitesPage(1);
  }, [sortMode]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newProject.name) return;
    await createProject({
      name: newProject.name,
      description: newProject.description || undefined,
    });
    setNewProject({ name: '', description: '' });
    await loadProjects();
  };

  const handleDelete = async (projectId) => {
    if (!window.confirm('Delete project?')) return;
    await deleteProject(projectId);
    if (selectedProjectId === projectId) setSelectedProjectId(null);
    await loadProjects();
  };

  const handleAssignSite = async (e) => {
    e.preventDefault();
    if (!selectedProjectId || !assignment.siteId) return;
    await addSiteToProject(selectedProjectId, Number(assignment.siteId));
    setAssignment({ siteId: '' });
    await loadProjectSites(selectedProjectId);
  };

  const handleRemoveSite = async (siteId) => {
    if (!selectedProjectId) return;
    await removeSiteFromProject(selectedProjectId, siteId);
    await loadProjectSites(selectedProjectId);
  };

  const filteredSites = useMemo(() => {
    if (!debouncedSearch) return sites;
    const term = debouncedSearch.toLowerCase();
    return sites.filter(s => (s.name || '').toLowerCase().includes(term) || String(s.id).includes(term));
  }, [debouncedSearch, sites]);

  const totalPages = Math.max(1, Math.ceil(sitesTotal / sitesPageSize));

  const handleCreateStep = async (e) => {
    e.preventDefault();
    if (!selectedProjectId || !newStep.title) return;
    const payload = {
      title: newStep.title,
      description: newStep.description || undefined,
      step_order: newStep.step_order ? Number(newStep.step_order) : undefined,
    };
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

      <section style={{ marginBottom: 24 }}>
        <h3>Create Project</h3>
        <form onSubmit={handleCreate}>
          <input
            placeholder="Name"
            value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
            style={{ marginRight: 8 }}
          />
          <input
            placeholder="Description"
            value={newProject.description}
            onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
            style={{ marginRight: 8, width: 300 }}
          />
          <button type="submit">Create</button>
        </form>
      </section>

      <section style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <h3>Projects {loadingProjects && <small style={{ fontWeight:'normal' }}>Loading...</small>}</h3>
          <ul>
            {projects.map((p) => (
              <li key={p.id} style={{ marginBottom: 8 }}>
                <button onClick={() => setSelectedProjectId(p.id)} style={{ marginRight: 8 }}>
                  Select
                </button>
                <strong>{p.name}</strong> (steps: {typeof p.steps_count === 'number' ? p.steps_count : '—'})
                <button onClick={() => handleDelete(p.id)} style={{ marginLeft: 8 }}>Delete</button>
              </li>
            ))}
          </ul>
          {selectedProjectId && (
            <div className="card" style={{ marginTop: 12 }}>
              <h4>Project Steps</h4>
              <ul style={{ listStyle:'none', padding:0 }}>
                {steps.map((st, idx) => (
                  <li key={st.id} style={{ padding:'6px 8px', borderBottom:'1px solid var(--card-border)', display:'flex', alignItems:'center', gap:8 }}>
                    <strong>#{st.step_order}</strong> {st.title}
                    {st.due_date && <span style={{ marginLeft:8, color:'var(--muted)' }}>Due: {st.due_date}</span>}
                    <div style={{ marginTop:6 }}>
                      <input placeholder="Title" defaultValue={st.title} onBlur={(e)=>handleUpdateStep(st.id, { title: e.target.value })} style={{ marginRight:8 }} />
                      <input type="number" placeholder="Order" defaultValue={st.step_order} onBlur={(e)=>handleUpdateStep(st.id, { step_order: Number(e.target.value) })} style={{ width:90, marginRight:8 }} />
                      {/* Due date removed; per-site status dates will be used */}
                      <button className="btn-danger" onClick={()=>handleDeleteStep(st.id)}>Delete</button>
                    </div>
                    {st.description && <div style={{ marginTop:4, fontSize:'0.85rem', color:'var(--muted)' }}>{st.description}</div>}
                  </li>
                ))}
              </ul>
              <form onSubmit={handleCreateStep} style={{ marginTop:12 }}>
                <input placeholder="Step Title" value={newStep.title} onChange={(e)=>setNewStep({ ...newStep, title: e.target.value })} style={{ marginRight:8 }} />
                <input type="number" placeholder="Order" value={newStep.step_order} onChange={(e)=>setNewStep({ ...newStep, step_order: e.target.value })} style={{ width:90, marginRight:8 }} />
                {/* Due date input removed */}
                <input placeholder="Description" value={newStep.description} onChange={(e)=>setNewStep({ ...newStep, description: e.target.value })} style={{ width:240, marginRight:8 }} />
                <button type="submit" className="btn">Add Step</button>
              </form>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h3>Assign Sites to Project {loadingSites && <small style={{ fontWeight:'normal' }}>Loading sites...</small>} {loadingProjectSites && <small style={{ fontWeight:'normal' }}>Refreshing project sites...</small>}</h3>
          {selectedProjectId ? (
            <>
              <form onSubmit={handleAssignSite} style={{ marginBottom: 12 }}>
                <input
                  placeholder="Search sites..."
                  value={siteSearch}
                  onChange={(e) => setSiteSearch(e.target.value)}
                  style={{ marginRight: 8 }}
                />
                <select
                  value={assignment.siteId}
                  onChange={(e) => setAssignment({ siteId: e.target.value })}
                  style={{ marginRight: 8, minWidth: 200 }}
                >
                  <option value="">Select a site</option>
                  {filteredSites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name || `Site ${s.id}`}</option>
                  ))}
                </select>
                <button type="submit">Add to Project</button>
              </form>

              <h4>
                Sites in Project {loadingProjectSites && <small style={{ fontWeight:'normal' }}>Loading...</small>}
                <span style={{ marginLeft:12, fontWeight:'normal' }}>
                  Sort:
                  <label style={{ marginLeft:8 }}>
                    <input type="radio" name="sortMode" value="name" checked={sortMode==='name'} onChange={() => setSortMode('name')} /> Name
                  </label>
                  <label style={{ marginLeft:8 }}>
                    <input type="radio" name="sortMode" value="status" checked={sortMode==='status'} onChange={() => setSortMode('status')} /> Status
                  </label>
                </span>
              </h4>
              {/* Top pagination controls placed near sort options */}
              {(() => {
                const effectiveTotalPages = sortMode==='status' ? Math.max(1, Math.ceil(sortedProjectSites.length / sitesPageSize)) : totalPages;
                return (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <span>Page:</span>
                    <button className="btn" disabled={sitesPage<=1} onClick={()=>setSitesPage(1)}>First</button>
                    <button className="btn" disabled={sitesPage<=1} onClick={()=>setSitesPage(p=>Math.max(1,p-1))}>Prev</button>
                    <span>{sitesPage} / {effectiveTotalPages}</span>
                    <button className="btn" disabled={sitesPage>=effectiveTotalPages} onClick={()=>setSitesPage(p=>p+1)}>Next</button>
                    <button className="btn" disabled={sitesPage>=effectiveTotalPages} onClick={()=>setSitesPage(effectiveTotalPages)}>Last</button>
                    <span style={{ marginLeft:12 }}>Per page:</span>
                    <select className="input" value={sitesPageSize} onChange={(e)=>{ setSitesPageSize(Number(e.target.value)); setSitesPage(1); }}>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                );
              })()}
              <ul style={{ listStyle:'none', padding:0 }}>
                {(sortMode === 'status' ? sortedProjectSites.slice((sitesPage-1)*sitesPageSize, (sitesPage-1)*sitesPageSize + sitesPageSize) : sortedProjectSites).map((s) => {
                  const status = latestStatuses.find(ls => String(ls.site_id) === String(s.id));
                  const project = projects.find(p => String(p.id) === String(selectedProjectId));
                  const stepsCount = steps.length;
                  const ratio = ratioFrom(status?.current_step, stepsCount);
                  const col = getStatusShade(ratio);
                  const badgeStyle = {
                    display:'inline-block',
                    marginLeft:8,
                    padding:'2px 6px',
                    borderRadius:999,
                    fontSize:'0.75rem',
                    background: col.bg,
                    border: '1px solid ' + col.border,
                    color: '#0f172a'
                  };
                  const badgeText = ratio === null ? 'No Status' : `Step ${status.current_step}`;
                  return (
                    <li key={s.id} style={{ padding:'6px 8px', borderBottom:'1px solid #eee' }}>
                      {s.name || `Site ${s.id}`}
                      <Link to={`/projects/${selectedProjectId}/status/${s.id}`} style={{ textDecoration:'none' }}>
                        <span style={badgeStyle} title={status && status.status_date ? `As of ${new Date(status.status_date).toLocaleDateString()}` : ''}>{badgeText}</span>
                      </Link>
                      <button onClick={() => handleRemoveSite(s.id)} style={{ marginLeft: 8 }}>Remove</button>
                    </li>
                  );
                })}
              </ul>
              {/* Bottom controls removed; controls are now at the top */}
            </>
          ) : (
            <p>Select a project to manage site assignments.</p>
          )}
        </div>
      </section>
    </div>
  );
}
