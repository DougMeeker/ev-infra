import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getBudgetSummary,
  updateProjectBudget,
  getCostEstimates,
  createCostEstimate,
  updateCostEstimate,
  deleteCostEstimate,
  getMilestones,
  initializeMilestones,
  updateMilestone,
  deleteMilestone,
  getProjects,
} from '../api';
import SiteSelector from '../components/SiteSelector';

const fmt$ = (v) =>
  v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const COST_FIELDS = [
  { key: 'charger_hardware', label: 'Charger Hardware' },
  { key: 'electrical_upgrade', label: 'Electrical Upgrade' },
  { key: 'construction_civil', label: 'Construction / Civil' },
  { key: 'utility_interconnection', label: 'Utility Interconnection' },
  { key: 'design_engineering', label: 'Design & Engineering' },
  { key: 'contingency', label: 'Contingency' },
];

const MILESTONE_TYPES = [
  'Site Assessment Complete',
  'Design Complete',
  'Permit Submitted',
  'Permit Approved',
  'Construction Start',
  'Inspection Passed',
  'Utility Interconnection',
  'Energization Date',
];

const MILESTONE_ORDER = Object.fromEntries(MILESTONE_TYPES.map((t, i) => [t, i]));

function completionBadge(complete, total) {
  if (total === 0) return null;
  const pct = Math.round((complete / total) * 100);
  const color = pct === 100 ? '#16a34a' : pct > 50 ? '#ca8a04' : '#6b7280';
  return (
    <span style={{ fontSize: '0.75rem', background: color + '22', color, borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>
      {complete}/{total}
    </span>
  );
}

// ── Budget Overview Tab ───────────────────────────────────────────────

function BudgetTab() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ budget_allocated: '', budget_committed: '', budget_spent: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getBudgetSummary();
      setProjects(data);
    } catch (e) {
      setError('Failed to load budget data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (p) => {
    setEditId(p.id);
    setEditForm({
      budget_allocated: p.budget_allocated ?? '',
      budget_committed: p.budget_committed ?? '',
      budget_spent: p.budget_spent ?? '',
    });
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await updateProjectBudget(editId, {
        budget_allocated: editForm.budget_allocated !== '' ? parseFloat(editForm.budget_allocated) : null,
        budget_committed: editForm.budget_committed !== '' ? parseFloat(editForm.budget_committed) : null,
        budget_spent: editForm.budget_spent !== '' ? parseFloat(editForm.budget_spent) : null,
      });
      setEditId(null);
      load();
    } catch {
      setError('Failed to save budget.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  const totalAllocated = projects.reduce((s, p) => s + (p.budget_allocated || 0), 0);
  const totalSpent = projects.reduce((s, p) => s + (p.rollup_actual_cost || p.budget_spent || 0), 0);
  const totalEstimated = projects.reduce((s, p) => s + (p.rollup_estimated_cost || p.budget_committed || 0), 0);

  return (
    <div>
      {error && <p style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>}

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Allocated', value: fmt$(totalAllocated) },
          { label: 'Total Committed / Est.', value: fmt$(totalEstimated) },
          { label: 'Total Spent / Actual', value: fmt$(totalSpent) },
          { label: 'Projects', value: projects.length },
        ].map((c) => (
          <div key={c.label} className="card" style={{ flex: '1 1 140px', minWidth: 140, textAlign: 'center', padding: '14px 18px' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary)' }}>{c.value}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div className="table-responsive">
        <table className="data-table" style={{ minWidth: 750 }}>
          <thead>
            <tr>
              <th>Project</th>
              <th>Sites</th>
              <th style={{ textAlign: 'right' }}>Allocated</th>
              <th style={{ textAlign: 'right' }}>Committed</th>
              <th style={{ textAlign: 'right' }}>Spent</th>
              <th style={{ textAlign: 'right' }}>Est. (rollup)</th>
              <th style={{ textAlign: 'right' }}>Actual (rollup)</th>
              <th style={{ textAlign: 'right' }}>Site Cost Est.</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/project/${p.id}`} style={{ color: 'var(--link)' }}>{p.name}</Link>
                </td>
                <td>{p.site_count}</td>
                {editId === p.id ? (
                  <>
                    <td><input type="number" value={editForm.budget_allocated} onChange={(e) => setEditForm(f => ({ ...f, budget_allocated: e.target.value }))} style={{ width: 100 }} /></td>
                    <td><input type="number" value={editForm.budget_committed} onChange={(e) => setEditForm(f => ({ ...f, budget_committed: e.target.value }))} style={{ width: 100 }} /></td>
                    <td><input type="number" value={editForm.budget_spent} onChange={(e) => setEditForm(f => ({ ...f, budget_spent: e.target.value }))} style={{ width: 100 }} /></td>
                  </>
                ) : (
                  <>
                    <td style={{ textAlign: 'right' }}>{fmt$(p.budget_allocated)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt$(p.budget_committed)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt$(p.budget_spent)}</td>
                  </>
                )}
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{fmt$(p.rollup_estimated_cost)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{fmt$(p.rollup_actual_cost)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{fmt$(p.rollup_cost_estimates)}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {editId === p.id ? (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={saving} style={{ marginRight: 6 }}>{saving ? '…' : 'Save'}</button>
                      <button className="btn btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                    </>
                  ) : (
                    <button className="btn btn-sm" onClick={() => startEdit(p)}>Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 12 }}>
        <em>Allocated / Committed / Spent</em> are manually tracked budget fields.
        &nbsp;<em>Est. (rollup)</em> and <em>Actual (rollup)</em> are aggregated from project status records.
        &nbsp;<em>Site Cost Est.</em> is the sum of detailed site-level cost breakdowns.
      </p>
    </div>
  );
}

// ── Cost Estimates Tab ────────────────────────────────────────────────

const emptyCost = () => ({ charger_hardware: '', electrical_upgrade: '', construction_civil: '', utility_interconnection: '', design_engineering: '', contingency: '', notes: '' });

function CostEstimatesTab() {
  const [estimates, setEstimates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyCost());
  const [formSiteId, setFormSiteId] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(emptyCost());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterProject) params.projectId = parseInt(filterProject, 10);
      const [estRes, projRes] = await Promise.all([getCostEstimates(params), getProjects()]);
      setEstimates(estRes.data);
      setProjects(projRes.data.filter(p => !p.is_deleted));
    } catch {
      setError('Failed to load cost estimates.');
    } finally {
      setLoading(false);
    }
  }, [filterProject]);

  useEffect(() => { load(); }, [load]);

  const totalOf = (e) =>
    COST_FIELDS.reduce((s, f) => s + (parseFloat(e[f.key]) || 0), 0);

  const handleCreate = async () => {
    if (!formSiteId) { setError('Please select a site.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createCostEstimate({
        site_id: parseInt(formSiteId, 10),
        project_id: formProjectId ? parseInt(formProjectId, 10) : null,
        ...Object.fromEntries(COST_FIELDS.map(f => [f.key, parseFloat(form[f.key]) || 0])),
        notes: form.notes || null,
      });
      setShowForm(false);
      setForm(emptyCost());
      setFormSiteId('');
      setFormProjectId('');
      load();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to create estimate.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (est) => {
    setEditId(est.id);
    setEditForm(Object.fromEntries([...COST_FIELDS.map(f => [f.key, est[f.key] ?? '']), ['notes', est.notes ?? '']]));
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await updateCostEstimate(id, {
        ...Object.fromEntries(COST_FIELDS.map(f => [f.key, parseFloat(editForm[f.key]) || 0])),
        notes: editForm.notes || null,
      });
      setEditId(null);
      load();
    } catch {
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this cost estimate?')) return;
    try {
      await deleteCostEstimate(id);
      load();
    } catch {
      setError('Failed to delete.');
    }
  };

  return (
    <div>
      {error && <p style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={{ padding: '6px 10px' }}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setError(null); }}>+ Add Estimate</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <h4 style={{ marginTop: 0 }}>New Cost Estimate</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Site *</label>
              <SiteSelector
                value={formSiteId}
                onChange={(id) => setFormSiteId(id)}
                variant="searchable"
                placeholder="Search site…"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Project (optional)</label>
              <select value={formProjectId} onChange={(e) => setFormProjectId(e.target.value)} style={{ width: '100%' }}>
                <option value="">None</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
            {COST_FIELDS.map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 2 }}>{f.label}</label>
                <input type="number" min="0" step="100" value={form[f.key]} onChange={(e) => setForm(frm => ({ ...frm, [f.key]: e.target.value }))} style={{ width: '100%' }} placeholder="0" />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', marginBottom: 2 }}>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm(frm => ({ ...frm, notes: e.target.value }))} rows={2} style={{ width: '100%' }} />
          </div>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            Total: {fmt$(COST_FIELDS.reduce((s, f) => s + (parseFloat(form[f.key]) || 0), 0))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>
      ) : estimates.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>No cost estimates recorded yet.</p>
      ) : (
        <div className="table-responsive">
          <table className="data-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Site</th>
                <th>Project</th>
                {COST_FIELDS.map(f => <th key={f.key} style={{ textAlign: 'right', fontSize: '0.78rem' }}>{f.label}</th>)}
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((e) => (
                <tr key={e.id}>
                  <td><Link to={`/site/${e.site_id}`} style={{ color: 'var(--link)' }}>{e.site_name || e.site_id}</Link></td>
                  <td>{e.project_name || '—'}</td>
                  {editId === e.id ? (
                    COST_FIELDS.map(f => (
                      <td key={f.key}>
                        <input type="number" min="0" step="100" value={editForm[f.key]} onChange={(ev) => setEditForm(ef => ({ ...ef, [f.key]: ev.target.value }))} style={{ width: 80 }} />
                      </td>
                    ))
                  ) : (
                    COST_FIELDS.map(f => (
                      <td key={f.key} style={{ textAlign: 'right', fontSize: '0.85rem' }}>{fmt$(e[f.key])}</td>
                    ))
                  )}
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt$(editId === e.id ? totalOf(editForm) : e.total)}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {editId === e.id ? (
                      <>
                        <button className="btn btn-sm btn-primary" onClick={() => saveEdit(e.id)} disabled={saving} style={{ marginRight: 4 }}>{saving ? '…' : 'Save'}</button>
                        <button className="btn btn-sm" onClick={() => setEditId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm" onClick={() => startEdit(e)} style={{ marginRight: 4 }}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(e.id)}>Del</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ fontWeight: 700 }}>Total</td>
                {COST_FIELDS.map(f => (
                  <td key={f.key} style={{ textAlign: 'right', fontWeight: 700 }}>
                    {fmt$(estimates.reduce((s, e) => s + (e[f.key] || 0), 0))}
                  </td>
                ))}
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {fmt$(estimates.reduce((s, e) => s + (e.total || 0), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Milestones Tab ────────────────────────────────────────────────────

function MilestonesTab() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initSiteId, setInitSiteId] = useState('');
  const [initializing, setInitializing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ target_date: '', actual_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    getProjects().then(r => setProjects(r.data.filter(p => !p.is_deleted))).catch(console.error);
  }, []);

  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const { data } = await getMilestones({ projectId: parseInt(selectedProjectId, 10) });
      setMilestones(data);
    } catch {
      setError('Failed to load milestones.');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => { load(); }, [load]);

  const handleInit = async () => {
    if (!selectedProjectId || !initSiteId) { setError('Select a project and site first.'); return; }
    setInitializing(true);
    setError(null);
    try {
      await initializeMilestones(parseInt(selectedProjectId, 10), parseInt(initSiteId, 10));
      setInitSiteId('');
      load();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to initialize milestones.');
    } finally {
      setInitializing(false);
    }
  };

  const startEdit = (m) => {
    setEditId(m.id);
    setEditForm({ target_date: m.target_date || '', actual_date: m.actual_date || '', notes: m.notes || '' });
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await updateMilestone(id, {
        target_date: editForm.target_date || null,
        actual_date: editForm.actual_date || null,
        notes: editForm.notes || null,
      });
      setEditId(null);
      load();
    } catch {
      setError('Failed to save milestone.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this milestone?')) return;
    try {
      await deleteMilestone(id);
      load();
    } catch { setError('Failed to delete.'); }
  };

  // Group milestones by site
  const bySite = milestones.reduce((acc, m) => {
    const key = m.site_id;
    if (!acc[key]) acc[key] = { site_name: m.site_name || `Site ${m.site_id}`, items: [] };
    acc[key].items.push(m);
    return acc;
  }, {});

  // Sort each site's milestones by canonical order
  Object.values(bySite).forEach(g => {
    g.items.sort((a, b) => (MILESTONE_ORDER[a.milestone_type] ?? 99) - (MILESTONE_ORDER[b.milestone_type] ?? 99));
  });

  const dateCell = (d) => d ? <span style={{ color: '#16a34a', fontWeight: 500 }}>{d}</span> : <span style={{ color: 'var(--text-secondary)' }}>—</span>;
  const pastDue = (m) => m.target_date && !m.actual_date && new Date(m.target_date) < new Date();

  return (
    <div>
      {error && <p style={{ color: 'var(--danger, #dc2626)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Project</label>
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} style={{ padding: '6px 10px', minWidth: 200 }}>
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {selectedProjectId && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Initialize milestones for site</label>
              <SiteSelector
                value={initSiteId}
                onChange={(id) => setInitSiteId(id)}
                variant="searchable"
                placeholder="Search site…"
                style={{ width: 260 }}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleInit} disabled={!initSiteId || initializing} style={{ height: 34 }}>
              {initializing ? '…' : 'Initialize'}
            </button>
          </div>
        )}
      </div>

      {!selectedProjectId && (
        <p style={{ color: 'var(--text-secondary)' }}>Select a project to view or manage milestones.</p>
      )}

      {loading && <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>}

      {selectedProjectId && !loading && Object.keys(bySite).length === 0 && (
        <p style={{ color: 'var(--text-secondary)' }}>
          No milestones recorded for this project yet. Search for a site above and click "Initialize" to add the standard milestone set.
        </p>
      )}

      {Object.entries(bySite).map(([siteId, group]) => {
        const complete = group.items.filter(m => m.actual_date).length;
        return (
          <div key={siteId} className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'var(--card-header, #f9fafb)', borderBottom: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Link to={`/site/${siteId}`} style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{group.site_name}</Link>
              {completionBadge(complete, group.items.length)}
            </div>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Milestone</th>
                  <th>Target Date</th>
                  <th>Actual Date</th>
                  <th>Notes</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((m) => (
                  <tr key={m.id} style={pastDue(m) ? { background: '#fef2f2' } : {}}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {m.actual_date
                          ? <span title="Complete" style={{ color: '#16a34a' }}>✓</span>
                          : pastDue(m)
                            ? <span title="Past due" style={{ color: '#dc2626' }}>!</span>
                            : <span style={{ color: 'var(--text-secondary)' }}>○</span>
                        }
                        {m.milestone_type}
                      </span>
                    </td>
                    {editId === m.id ? (
                      <>
                        <td><input type="date" value={editForm.target_date} onChange={(e) => setEditForm(f => ({ ...f, target_date: e.target.value }))} /></td>
                        <td><input type="date" value={editForm.actual_date} onChange={(e) => setEditForm(f => ({ ...f, actual_date: e.target.value }))} /></td>
                        <td><input type="text" value={editForm.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} style={{ width: '100%' }} /></td>
                      </>
                    ) : (
                      <>
                        <td>{dateCell(m.target_date)}</td>
                        <td>{dateCell(m.actual_date)}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{m.notes || ''}</td>
                      </>
                    )}
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {editId === m.id ? (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => saveEdit(m.id)} disabled={saving} style={{ marginRight: 4 }}>{saving ? '…' : 'Save'}</button>
                          <button className="btn btn-sm" onClick={() => setEditId(null)}>✕</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-sm" onClick={() => startEdit(m)} style={{ marginRight: 4 }}>Edit</button>
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}>Del</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Financial Tracker page ───────────────────────────────────────

const TABS = [
  { key: 'budget', label: 'Budget Overview' },
  { key: 'estimates', label: 'Site Cost Estimates' },
  { key: 'milestones', label: 'Construction Milestones' },
];

export default function FinancialTracker() {
  const [tab, setTab] = useState('budget');

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 48 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px' }}>Financial & Milestone Tracking</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Budget allocations, per-site cost breakdowns, and construction milestone tracking.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--card-border)', marginBottom: 24, gap: 4 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -2,
              background: 'transparent',
              color: tab === t.key ? 'var(--primary)' : 'var(--text)',
              fontWeight: tab === t.key ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'budget' && <BudgetTab />}
      {tab === 'estimates' && <CostEstimatesTab />}
      {tab === 'milestones' && <MilestonesTab />}
    </div>
  );
}
