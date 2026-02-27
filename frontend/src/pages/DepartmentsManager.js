import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  assignDepartmentSite,
  searchSites,
} from '../api';

// ─── Inline site-search combobox ─────────────────────────────────────────────
function SiteCombo({ onSelect, onCancel }) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = useCallback((val) => {
    clearTimeout(timerRef.current);
    if (!val.trim()) { setOptions([]); return; }
    timerRef.current = setTimeout(() => {
      setLoading(true);
      searchSites(val)
        .then(res => setOptions((res.data.data || []).slice(0, 12)))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 280);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setQ(v);
    search(v);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', minWidth: 220 }}>
      <input
        ref={inputRef}
        className="input"
        style={{ width: '100%' }}
        placeholder="Type site name…"
        value={q}
        onChange={handleChange}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
      />
      {loading && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 4, padding: '6px 10px', fontSize: '0.8rem', color: '#999', zIndex: 100 }}>
          Searching…
        </div>
      )}
      {!loading && options.length > 0 && (
        <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 4, margin: 0, padding: 0, listStyle: 'none', zIndex: 100, maxHeight: 220, overflowY: 'auto' }}>
          {options.map(s => (
            <li
              key={s.id}
              style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--card-border)' }}
              onMouseDown={e => { e.preventDefault(); onSelect(s); }}
            >
              <strong>{s.name}</strong>
              {s.city && <span style={{ color: '#999', marginLeft: 6 }}>{s.city}</span>}
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-secondary" style={{ marginLeft: 4 }} onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ─── Create form ─────────────────────────────────────────────────────────────
function CreateForm({ onCreate }) {
  const [form, setForm] = useState({ district: '', unit: '', unit_name: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const district = parseInt(form.district, 10);
    const unit     = parseInt(form.unit, 10);
    if (Number.isNaN(district) || Number.isNaN(unit)) { alert('District and Unit must be integers.'); return; }
    setSaving(true);
    createDepartment({ district, unit, unit_name: form.unit_name.trim() })
      .then(res => { onCreate(res.data); setForm({ district: '', unit: '', unit_name: '' }); })
      .catch(err => alert(err.response?.data?.error || 'Failed to create'))
      .finally(() => setSaving(false));
  };

  return (
    <form onSubmit={handleSubmit} className="flex-row gap-sm" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div className="form-group" style={{ margin: 0 }}>
        <label>District</label>
        <input className="input" style={{ width: 80 }} placeholder="e.g. 1" value={form.district} onChange={set('district')} required />
      </div>
      <div className="form-group" style={{ margin: 0 }}>
        <label>Unit</label>
        <input className="input" style={{ width: 80 }} placeholder="e.g. 22" value={form.unit} onChange={set('unit')} required />
      </div>
      <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
        <label>Unit Name</label>
        <input className="input" style={{ width: '100%' }} placeholder="Unit name" value={form.unit_name} onChange={set('unit_name')} required />
      </div>
      <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const PAGE_SIZES = [25, 50, 100];

const DepartmentsManager = () => {
  // Filter state
  const [q, setQ]               = useState('');
  const [district, setDistrict] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const [perPage, setPerPage]   = useState(50);
  const [page, setPage]         = useState(1);

  // Data
  const [rows, setRows]   = useState([]);
  const [meta, setMeta]   = useState({ total: 0, page: 1, per_page: 50, returned: 0 });
  const [loading, setLoading] = useState(false);

  // UI state
  const [editId, setEditId]       = useState(null);   // row being edited
  const [editForm, setEditForm]   = useState({});     // draft values
  const [savingId, setSavingId]   = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [assigningId, setAssigningId] = useState(null); // row open for site search
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback((opts = {}) => {
    setLoading(true);
    getDepartments({
      q:          opts.q          ?? q,
      page:       opts.page       ?? page,
      perPage:    opts.perPage    ?? perPage,
      unassigned: opts.unassigned ?? unassigned,
      district:   opts.district   ?? district,
    })
      .then(res => {
        setRows(res.data.items || []);
        setMeta(res.data.meta || {});
      })
      .catch(err => console.error('Load departments failed', err))
      .finally(() => setLoading(false));
  }, [q, page, perPage, unassigned, district]);

  useEffect(() => { load(); }, [load]);

  // ── filter handlers ──────────────────────────────────────────────────────
  const applyFilters = (overrides = {}) => {
    const newPage = 1;
    setPage(newPage);
    load({ page: newPage, ...overrides });
  };

  const handleSearch = (e) => {
    e.preventDefault();
    applyFilters({ q, district, unassigned });
  };

  const clearFilters = () => {
    setQ(''); setDistrict(''); setUnassigned(false); setPage(1);
    load({ q: '', district: '', unassigned: false, page: 1 });
  };

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const startEdit = (row) => {
    setEditId(row.id);
    setEditForm({ district: row.district, unit: row.unit, unit_name: row.unit_name });
    setAssigningId(null);
  };
  const cancelEdit = () => { setEditId(null); setEditForm({}); };

  const saveEdit = (id) => {
    const district_v = parseInt(editForm.district, 10);
    const unit_v     = parseInt(editForm.unit, 10);
    if (Number.isNaN(district_v) || Number.isNaN(unit_v)) { alert('District and Unit must be integers.'); return; }
    setSavingId(id);
    updateDepartment(id, { district: district_v, unit: unit_v, unit_name: editForm.unit_name })
      .then(res => {
        setRows(prev => prev.map(r => r.id === id ? res.data : r));
        setEditId(null);
      })
      .catch(err => alert(err.response?.data?.error || 'Update failed'))
      .finally(() => setSavingId(null));
  };

  const handleDelete = (id) => {
    if (!window.confirm('Delete this department? This cannot be undone.')) return;
    setDeletingId(id);
    deleteDepartment(id)
      .then(() => { setRows(prev => prev.filter(r => r.id !== id)); setMeta(m => ({ ...m, total: m.total - 1 })); })
      .catch(err => alert(err.response?.data?.error || 'Delete failed'))
      .finally(() => setDeletingId(null));
  };

  const handleSiteSelect = (deptId, site) => {
    assignDepartmentSite(deptId, site.id)
      .then(res => { setRows(prev => prev.map(r => r.id === deptId ? res.data : r)); setAssigningId(null); })
      .catch(err => alert(err.response?.data?.error || 'Assign failed'));
  };

  const handleClearSite = (deptId) => {
    assignDepartmentSite(deptId, null)
      .then(res => setRows(prev => prev.map(r => r.id === deptId ? res.data : r)))
      .catch(err => alert(err.response?.data?.error || 'Clear failed'));
  };

  const handleCreated = (newRow) => {
    setRows(prev => [newRow, ...prev]);
    setMeta(m => ({ ...m, total: m.total + 1 }));
  };

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.per_page));

  const goToPage = (p) => {
    const clamped = Math.max(1, Math.min(totalPages, p));
    setPage(clamped);
    load({ page: clamped });
  };

  // ── Edit form helpers ─────────────────────────────────────────────────────
  const setEF = (k) => (e) => setEditForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
      <div className="flex-row justify-between align-center" style={{ marginBottom: 16 }}>
        <h2 className="page-header" style={{ margin: 0 }}>Departments</h2>
        <button className="btn" onClick={() => setShowCreate(v => !v)}>
          {showCreate ? 'Cancel' : '+ New Department'}
        </button>
      </div>

      {/* ── Create card ── */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h4 style={{ marginTop: 0 }}>Create Department</h4>
          <CreateForm onCreate={(row) => { handleCreated(row); setShowCreate(false); }} />
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleSearch}>
          <div className="flex-row gap-sm" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <label>Search (code or name)</label>
              <input className="input" style={{ width: '100%' }} placeholder="e.g. 01-0022  or  TRAINING" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0, width: 100 }}>
              <label>District</label>
              <input className="input" style={{ width: '100%' }} placeholder="All" value={district} onChange={e => setDistrict(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
              <input type="checkbox" id="unassigned" checked={unassigned} onChange={e => setUnassigned(e.target.checked)} />
              <label htmlFor="unassigned" style={{ margin: 0, cursor: 'pointer' }}>Unassigned only</label>
            </div>
            <div className="form-group" style={{ margin: 0, width: 90 }}>
              <label>Per page</label>
              <select className="input" value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}>
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button className="btn" type="submit" disabled={loading}>Search</button>
            <button className="btn btn-secondary" type="button" onClick={clearFilters}>Clear</button>
          </div>
        </form>
      </div>

      {/* ── Pagination controls ── */}
      <div className="flex-row gap-sm align-center" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          {meta.total.toLocaleString()} departments &nbsp;·&nbsp; page {meta.page} of {totalPages}
        </span>
        <button className="btn btn-secondary" disabled={page <= 1}       onClick={() => goToPage(1)}>First</button>
        <button className="btn btn-secondary" disabled={page <= 1}       onClick={() => goToPage(page - 1)}>Prev</button>
        <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>Next</button>
        <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => goToPage(totalPages)}>Last</button>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Code</th>
                <th style={{ width: 70 }}>District</th>
                <th style={{ width: 70 }}>Unit</th>
                <th>Unit Name</th>
                <th style={{ minWidth: 220 }}>Site</th>
                <th style={{ width: 170 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="table-empty">No departments found.</td></tr>
              )}
              {rows.map(row => {
                const isEditing   = editId === row.id;
                const isSaving    = savingId === row.id;
                const isDeleting  = deletingId === row.id;
                const isAssigning = assigningId === row.id;

                return (
                  <tr key={row.id} style={{ background: isEditing ? 'var(--input-bg, #f9f9f9)' : undefined }}>
                    {/* Code */}
                    <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {isEditing
                        ? `${String(editForm.district || '').padStart(2, '0')}-${String(editForm.unit || '').padStart(4, '0')}`
                        : row.code}
                    </td>

                    {/* District */}
                    <td>
                      {isEditing
                        ? <input className="input" style={{ width: 60 }} value={editForm.district} onChange={setEF('district')} />
                        : row.district}
                    </td>

                    {/* Unit */}
                    <td>
                      {isEditing
                        ? <input className="input" style={{ width: 60 }} value={editForm.unit} onChange={setEF('unit')} />
                        : row.unit}
                    </td>

                    {/* Unit Name */}
                    <td>
                      {isEditing
                        ? <input className="input" style={{ width: '100%', minWidth: 180 }} value={editForm.unit_name} onChange={setEF('unit_name')} />
                        : row.unit_name}
                    </td>

                    {/* Site assignment */}
                    <td>
                      {isAssigning ? (
                        <SiteCombo
                          onSelect={(site) => handleSiteSelect(row.id, site)}
                          onCancel={() => setAssigningId(null)}
                        />
                      ) : row.site_id ? (
                        <span className="flex-row gap-sm align-center" style={{ flexWrap: 'nowrap' }}>
                          <Link to={`/site/${row.site_id}`} style={{ fontSize: '0.85rem' }}>
                            {row.site_name || `Site ${row.site_id}`}
                          </Link>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '1px 6px', fontSize: '0.75rem' }}
                            title="Change site"
                            onClick={() => { setAssigningId(row.id); setEditId(null); }}
                          >✎</button>
                          <button
                            className="btn btn-danger"
                            style={{ padding: '1px 6px', fontSize: '0.75rem' }}
                            title="Unassign site"
                            onClick={() => handleClearSite(row.id)}
                          >×</button>
                        </span>
                      ) : (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '0.8rem' }}
                          onClick={() => { setAssigningId(row.id); setEditId(null); }}
                        >Assign Site</button>
                      )}
                    </td>

                    {/* Actions */}
                    <td>
                      <span className="flex-row gap-sm">
                        {isEditing ? (
                          <>
                            <button className="btn" disabled={isSaving} onClick={() => saveEdit(row.id)}>
                              {isSaving ? '…' : 'Save'}
                            </button>
                            <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-secondary" onClick={() => startEdit(row)}>Edit</button>
                            <button
                              className="btn btn-danger"
                              disabled={isDeleting}
                              onClick={() => handleDelete(row.id)}
                            >{isDeleting ? '…' : 'Delete'}</button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom pagination */}
      {!loading && rows.length > 0 && (
        <div className="flex-row gap-sm align-center" style={{ marginTop: 10 }}>
          <button className="btn btn-secondary" disabled={page <= 1}       onClick={() => goToPage(1)}>First</button>
          <button className="btn btn-secondary" disabled={page <= 1}       onClick={() => goToPage(page - 1)}>Prev</button>
          <span style={{ fontSize: '0.85rem', color: '#666' }}>Page {page} / {totalPages}</span>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>Next</button>
          <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => goToPage(totalPages)}>Last</button>
        </div>
      )}
    </div>
  );
};

export default DepartmentsManager;
