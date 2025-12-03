import React, { useEffect, useState } from 'react';
import StatusLegend from '../components/StatusLegend';
import { ratioFrom, getStatusShade } from '../utils/statusShading';
import { useParams } from 'react-router-dom';
import { getProjects, getProjectSites, getProjectSiteStatuses, createProjectSiteStatus, getLatestProjectStatuses, getProjectSteps } from '../api';

export default function ProjectStatusForm() {
  const params = useParams();
  const [projects, setProjects] = useState([]);
  const [projectSites, setProjectSites] = useState([]);
  const [selected, setSelected] = useState({ projectId: params.projectId || '', siteId: params.siteId || '' });
  const [statuses, setStatuses] = useState([]);
  const [form, setForm] = useState({ current_step: '', status_message: '', status_date: new Date().toISOString().slice(0,10), estimated_cost: '', actual_cost: '' });
  const [latestStatuses, setLatestStatuses] = useState([]);
  const [steps, setSteps] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingProjects(true);
      try {
        const { data: p } = await getProjects();
        setProjects(p);
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  // Load sites for selected project
  useEffect(() => {
    (async () => {
      if (!selected.projectId) { setProjectSites([]); return; }
      setLoadingSites(true);
      try {
        // Request a larger page size so the dropdown includes all sites in large projects
        const { data: ps } = await getProjectSites(selected.projectId, { page: 1, page_size: 500 });
        const items = Array.isArray(ps) ? ps : (ps.items || []);
        items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setProjectSites(items);
        const { data: stepData } = await getProjectSteps(selected.projectId);
        setSteps(stepData || []);
      } finally {
        setLoadingSites(false);
      }
    })();
  }, [selected.projectId]);

  // Load statuses for selected site
  useEffect(() => {
    (async () => {
      if (!selected.projectId || !selected.siteId) { setStatuses([]); return; }
      setLoadingStatuses(true);
      try {
        const { data } = await getProjectSiteStatuses(selected.projectId, selected.siteId);
        setStatuses(data);
      } finally {
        setLoadingStatuses(false);
      }
    })();
  }, [selected.projectId, selected.siteId]);

  // Load latest statuses across all sites in project
  useEffect(() => {
    (async () => {
      if (!selected.projectId) { setLatestStatuses([]); return; }
      setLoadingLatest(true);
      try {
        const { data } = await getLatestProjectStatuses(selected.projectId);
        setLatestStatuses(data);
      } finally {
        setLoadingLatest(false);
      }
    })();
  }, [selected.projectId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!selected.projectId || !selected.siteId || !form.current_step) return;
    const payload = {
      current_step: Number(form.current_step),
      status_message: form.status_message || undefined,
      status_date: form.status_date || undefined,
      estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : undefined,
      actual_cost: form.actual_cost ? Number(form.actual_cost) : undefined,
    };
    await createProjectSiteStatus(selected.projectId, selected.siteId, payload);
    setForm({ current_step: '', status_message: '', status_date: '', estimated_cost: '', actual_cost: '' });
    setLoadingStatuses(true);
    try {
      const { data } = await getProjectSiteStatuses(selected.projectId, selected.siteId);
      setStatuses(data);
    } finally {
      setLoadingStatuses(false);
    }
    setLoadingLatest(true);
    try {
      const { data: latest } = await getLatestProjectStatuses(selected.projectId);
      setLatestStatuses(latest);
    } finally {
      setLoadingLatest(false);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Project Status</h2>
      <form onSubmit={submit}>
        <select
          value={selected.projectId}
          onChange={(e) => setSelected({ ...selected, projectId: e.target.value })}
          style={{ marginRight: 8 }}
        >
          <option value="">Select Project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={selected.siteId}
          onChange={(e) => setSelected({ ...selected, siteId: e.target.value })}
          style={{ marginRight: 8 }}
          disabled={!selected.projectId}
        >
          <option value="">Select Site</option>
          {projectSites.map(s => <option key={s.id} value={s.id}>{s.name || `Site ${s.id}`}</option>)}
        </select>
        <select
          value={form.current_step}
          onChange={(e) => setForm({ ...form, current_step: e.target.value })}
          style={{ marginRight: 8 }}
          disabled={!selected.projectId}
        >
          <option value="">Select Step</option>
          {steps.map(st => (
            <option key={st.id} value={st.step_order}>{`${st.step_order} - ${st.title}`}</option>
          ))}
        </select>
        <input
          placeholder="Status Message"
          value={form.status_message}
          onChange={(e) => setForm({ ...form, status_message: e.target.value })}
          style={{ marginRight: 8, width: 300 }}
        />
        <input
          type="date"
          value={form.status_date}
          onChange={(e) => setForm({ ...form, status_date: e.target.value })}
          style={{ marginRight: 8 }}
        />
        <input
          placeholder="Estimated Cost"
          type="number"
          value={form.estimated_cost}
          onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
          style={{ marginRight: 8 }}
        />
        <input
          placeholder="Actual Cost"
          type="number"
          value={form.actual_cost}
          onChange={(e) => setForm({ ...form, actual_cost: e.target.value })}
          style={{ marginRight: 8 }}
        />
        <button type="submit">Add Status</button>
      </form>

      <h3>Latest Status Per Site {loadingLatest && <small style={{ fontWeight:'normal' }}>Loading...</small>}</h3>
      <StatusLegend />
      <ul style={{ listStyle:'none', padding:0 }}>
        {latestStatuses.map(ls => {
          const project = projects.find(p => String(p.id) === String(selected.projectId));
          const stepsCount = project && typeof project.steps_count === 'number' ? project.steps_count : undefined;
          const ratio = ratioFrom(ls.current_step, stepsCount);
          const col = getStatusShade(ratio);
          const baseStyle = {
            padding:'6px 8px',
            marginBottom:4,
            borderRadius:4,
            background: col.bg,
            border: '1px solid ' + col.border,
            color: '#0f172a'
          };
          return (
            <li key={ls.site_id} style={baseStyle}>
              <strong>{ls.site_name || `Site ${ls.site_id}`}</strong>: {ls.current_step !== null ? `step ${ls.current_step}` : 'no status'}
              {ls.status_date ? ` @ ${new Date(ls.status_date).toLocaleDateString()}` : ''}
              {ls.status_message ? ` - ${ls.status_message}` : ''}
              {typeof ls.estimated_cost === 'number' ? ` | est: $${ls.estimated_cost.toLocaleString()}` : ''}
              {typeof ls.actual_cost === 'number' ? ` | actual: $${ls.actual_cost.toLocaleString()}` : ''}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Using shared StatusLegend component
