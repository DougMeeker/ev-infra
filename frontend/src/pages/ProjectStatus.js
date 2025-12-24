import React, { useEffect, useMemo, useRef, useState } from 'react';
import StatusLegend from '../components/StatusLegend';
import LatestStatusBox from '../components/LatestStatusBox';
import StatusHistoryRow from '../components/StatusHistoryRow';
import styles from './ProjectStatus.module.css';
import { useParams, useNavigate } from 'react-router-dom';
import { getProjects, getProjectSites, getProjectSiteStatuses, createProjectSiteStatus, getLatestProjectStatuses, getProjectSteps } from '../api';

export default function ProjectStatus() {
  const params = useParams();
  const navigate = useNavigate();
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
  const historyRef = useRef(null);

  const currentProject = useMemo(() => projects.find(p => String(p.id) === String(selected.projectId)), [projects, selected.projectId]);

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

  useEffect(() => {
    (async () => {
      if (!selected.projectId) { setProjectSites([]); return; }
      setLoadingSites(true);
      try {
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
    if (historyRef.current) {
      historyRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Project Status</h2>
      <div className={styles.headerBar}>
        {selected.projectId && (
          <div style={{ fontWeight: 600 }}>
            Project: {currentProject ? currentProject.name : `#${selected.projectId}`}
          </div>
        )}
        <select
          value={selected.projectId}
          onChange={(e) => {
            const newId = e.target.value;
            setSelected({ projectId: newId, siteId: '' });
            if (newId) navigate(`/project/${newId}`);
          }}
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
      </div>

      <form onSubmit={submit} className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Choose Step</div>
        <div className={styles.stepButtons}>
          {steps.map(st => {
            const active = Number(form.current_step) === Number(st.step_order);
            return (
              <button
                key={st.id}
                type="button"
                disabled={!selected.projectId}
                className={`btn ${styles.stepButton} ${active ? styles.stepButtonActive : ''}`}
                onClick={() => setForm({ ...form, current_step: st.step_order })}
              >
                {st.step_order}. {st.title}
              </button>
            );
          })}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
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
          <button type="submit" className="btn">Add Status</button>
        </div>
      </form>

      <h3>Latest Status Per Site {loadingLatest && <small style={{ fontWeight:'normal' }}>Loading...</small>}</h3>
      <StatusLegend />
      <div className={styles.latestGrid}>
        {latestStatuses.map(ls => (
          <LatestStatusBox
            key={ls.site_id}
            item={ls}
            stepsCount={currentProject && typeof currentProject.steps_count === 'number' ? currentProject.steps_count : undefined}
            isSelected={String(selected.siteId) === String(ls.site_id)}
            onUpdate={(siteId, currentStep) => {
              setSelected(prev => ({ ...prev, siteId }));
              if (currentStep != null) {
                const next = Number(currentStep) + 1;
                setForm(f => ({ ...f, current_step: next }));
              }
              if (selected.projectId) {
                navigate(`/project/${selected.projectId}/site/${siteId}`);
              }
            }}
          />
        ))}
      </div>

      <div ref={historyRef}>
        {selected.projectId && selected.siteId && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>
                Status History for {projectSites.find(s => String(s.id) === String(selected.siteId))?.name || `Site ${selected.siteId}`}
                {loadingStatuses && <small style={{ fontWeight:'normal' }}> Loading...</small>}
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(`/site/${selected.siteId}`)}
                title="Open Site Details"
              >
                Open Site Details
              </button>
            </div>
            {statuses.length === 0 ? (
              <p>No past updates for this site.</p>
            ) : (
              <table className={`table ${styles.historyTable}`}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Step</th>
                    <th>Message</th>
                    <th>Est. Cost</th>
                    <th>Actual Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {statuses.map(s => (
                    <StatusHistoryRow key={s.id} status={s} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
