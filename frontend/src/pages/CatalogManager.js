import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getCatalog, createCatalogEntry, updateCatalogEntry, uploadCatalogFile, refreshCatalog, deleteCatalogEntry } from '../api';
import { useAuth } from '../AuthProvider';

const CatalogManager = () => {
  const { isAuthenticated, role } = useAuth();
  const canEdit = useMemo(() => isAuthenticated && (role === 'admin' || role === 'hq'), [isAuthenticated, role]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [savingMC, setSavingMC] = useState(null);
  const [editingMC, setEditingMC] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [sortField, setSortField] = useState('mc_code');
  const [sortDir, setSortDir] = useState('asc');
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRecord, setNewRecord] = useState({ mc_code: '', description: '', status: 'A', equipment_category_code: '' });
  const [creating, setCreating] = useState(false);

  const handleCreate = () => {
    if (!newRecord.mc_code.trim()) { alert('MC code is required'); return; }
    setCreating(true);
    const payload = {
      mc_code: newRecord.mc_code.trim(),
      description: newRecord.description.trim() || null,
      status: newRecord.status.trim() || null,
      equipment_category_code: newRecord.equipment_category_code || null,
    };
    createCatalogEntry(payload)
      .then(() => {
        setNewRecord({ mc_code: '', description: '', status: 'A', equipment_category_code: '' });
        setShowCreateForm(false);
        load();
      })
      .catch(err => {
        const msg = err.response?.data?.error || 'Create failed';
        alert(msg);
      })
      .finally(() => setCreating(false));
  };

  const load = () => {
    setLoading(true);
    getCatalog()
      .then(res => setRows(res.data))
      .catch(err => console.error('Catalog load error', err))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    // Build category options from loaded rows (category.code or equipment_category_code)
    const map = new Map();
    rows.forEach(r => {
      if (r.category && r.category.code) {
        const code = String(r.category.code).trim();
        if (!map.has(code)) map.set(code, r.category.description || code);
      }
      if (r.equipment_category_code) {
        const code = String(r.equipment_category_code).trim();
        if (!map.has(code)) map.set(code, code);
      }
    });
    // Provide common defaults if none yet
    if (map.size === 0) {
      ['PV','LC','LDU','LDT','MD','HD','SN','OT','TR','LM','IN','CO','RM'].forEach(c => map.set(c, c));
    }
    setCategoryOptions(Array.from(map.entries()).map(([code, description]) => ({ code, description })).sort((a, b) => a.code.localeCompare(b.code)));
  }, [rows]);

  const startEdit = (row) => {
    setEditingMC(row.mc_code);
    setEditDraft({
      description: row.description || '',
      status: row.status || '',
      equipment_category_code: row.equipment_category_code || '',
      energy_per_mile: row.energy_per_mile ?? '',
    });
  };

  const cancelEdit = () => { setEditingMC(null); setEditDraft({}); };

  const saveEntry = (mc_code) => {
    setSavingMC(mc_code);
    const payload = { description: editDraft.description, status: editDraft.status, equipment_category_code: editDraft.equipment_category_code || null };
    if (editDraft.energy_per_mile !== '' && editDraft.energy_per_mile != null) {
      const num = parseFloat(editDraft.energy_per_mile);
      if (!Number.isNaN(num)) payload.energy_per_mile = num;
      else { alert('Energy per mile must be numeric'); setSavingMC(null); return; }
    } else {
      payload.energy_per_mile = null;
    }
    updateCatalogEntry(mc_code, payload)
      .then(() => { setEditingMC(null); setEditDraft({}); load(); })
      .catch(err => { console.error('Save failed', err); alert('Save failed'); })
      .finally(() => setSavingMC(null));
  };

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
  };
  const upload = () => {
    if (!file) { alert('Select CSV file first'); return; }
    setUploading(true);
    uploadCatalogFile(file)
      .then(res => { alert(`Upload complete: added ${res.data.added}, updated ${res.data.updated}`); load(); })
      .catch(err => { console.error('Upload failed', err); alert('Upload failed'); })
      .finally(() => {
        setUploading(false);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  const doRefreshFromServerFile = () => {
    if (!window.confirm('Refresh using server-side ActiveCatalog.csv?')) return;
    refreshCatalog()
      .then(res => { alert(`Server refresh: added ${res.data.added}, updated ${res.data.updated}`); load(); })
      .catch(err => { console.error('Refresh failed', err); alert('Refresh failed'); });
  };

  const filtered = rows.filter(r => {
    const textMatch = !filter || r.mc_code.includes(filter) || (r.description || '').toLowerCase().includes(filter.toLowerCase());
    const catCode = r.equipment_category_code || (r.category && r.category.code) || '';
    const catMatch = !categoryFilter || String(catCode) === String(categoryFilter);
    return textMatch && catMatch;
  });

  const sorted = [...filtered].sort((a,b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'energy_per_mile') {
      const an = parseFloat(a.energy_per_mile);
      const bn = parseFloat(b.energy_per_mile);
      const aValid = Number.isFinite(an);
      const bValid = Number.isFinite(bn);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;   // push null/NaN to end regardless of sort direction
      if (!bValid) return -1;  // push null/NaN to end regardless of sort direction
      if (an < bn) return -1 * dir;
      if (an > bn) return 1 * dir;
      return 0;
    }
    if (sortField === 'mc_code') {
      const an = parseInt(String(a.mc_code || '').trim(), 10);
      const bn = parseInt(String(b.mc_code || '').trim(), 10);
      const aValid = Number.isFinite(an);
      const bValid = Number.isFinite(bn);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;   // push non-numeric to end
      if (!bValid) return -1;
      if (an < bn) return -1 * dir;
      if (an > bn) return 1 * dir;
      return 0;
    }
    let av = a[sortField];
    let bv = b[sortField];
    if (av == null) av = ''; if (bv == null) bv = '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field); setSortDir('asc');
    }
  };

  return (
    <div className="container" style={{ paddingTop: '24px' }}>
      <h2 className="page-header">Catalog Manager</h2>
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ marginTop: 0, marginBottom: 0 }}>Import / Refresh</h4>
          {canEdit && (
          <button className="btn" onClick={() => setShowCreateForm(f => !f)}>
            {showCreateForm ? 'Cancel' : '+ New MC Record'}
          </button>
          )}
        </div>
        {showCreateForm && (
          <div style={{ marginTop: 16, padding: 16, background: '#f8f9fa', borderRadius: 6, border: '1px solid #dee2e6' }}>
            <h5 style={{ marginTop: 0 }}>Create New MC Record</h5>
            <div className="flex-row gap-sm" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>MC Code *</label>
                <input className="input" style={{ width: 120 }} placeholder="e.g. 12345" value={newRecord.mc_code} onChange={e => setNewRecord(r => ({ ...r, mc_code: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Description</label>
                <input className="input" style={{ width: 260 }} placeholder="Equipment description" value={newRecord.description} onChange={e => setNewRecord(r => ({ ...r, description: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Status</label>
                <input className="input" style={{ width: 80 }} placeholder="A" value={newRecord.status} onChange={e => setNewRecord(r => ({ ...r, status: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Equipment Category</label>
                <select className="input" style={{ width: 160 }} value={newRecord.equipment_category_code} onChange={e => setNewRecord(r => ({ ...r, equipment_category_code: e.target.value }))}>
                  <option value="">(none)</option>
                  {categoryOptions.map(({ code, description }) => (
                    <option key={code} value={code}>{description && description !== code ? `${code} - ${description}` : code}</option>
                  ))}
                </select>
              </div>
              <button className="btn" disabled={creating} onClick={handleCreate}>
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
        {canEdit && (
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onClick={(e) => { e.target.value = ''; }}
            onChange={handleFileChange}
          />
          <button className="btn" disabled={uploading || !file} onClick={upload}>{uploading ? 'Uploading...' : (file ? `Upload ${file.name}` : 'Upload CSV')}</button>
          <button className="btn btn-secondary" onClick={doRefreshFromServerFile}>Refresh From Server File</button>
          <input className="input" style={{ width:'220px' }} placeholder="Filter MC / description" value={filter} onChange={e=>setFilter(e.target.value)} />
          <select className="input" style={{ width:'180px' }} value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
            <option value="">Filter by category</option>
            {categoryOptions.map(({ code, description }) => (
              <option key={code} value={code}>{description && description !== code ? `${code} - ${description}` : code}</option>
            ))}
          </select>
        </div>
        )}
        {!canEdit && (
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ width:'220px' }} placeholder="Filter MC / description" value={filter} onChange={e=>setFilter(e.target.value)} />
          <select className="input" style={{ width:'180px' }} value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
            <option value="">Filter by category</option>
            {categoryOptions.map(({ code, description }) => (
              <option key={code} value={code}>{description && description !== code ? `${code} - ${description}` : code}</option>
            ))}
          </select>
        </div>
        )}
        <small style={{ display:'block', marginTop:'8px' }}>Upload replaces description/status/revised_date; if CSV includes an Energy Use column, energy_per_mile is updated as well (kWh/mile).</small>
        </div>
      </div>
      {loading ? <p>Loading...</p> : (
        <table className="table">
          <thead>
            <tr>
              <th onClick={()=>toggleSort('mc_code')} style={{ cursor:'pointer' }}>MC {sortField==='mc_code' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th onClick={()=>toggleSort('description')} style={{ cursor:'pointer' }}>Description {sortField==='description' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th>Status</th>
              <th onClick={()=>toggleSort('equipment_category_code')} style={{ cursor:'pointer' }}>Equipment Category {sortField==='equipment_category_code' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th onClick={()=>toggleSort('revised_date')} style={{ cursor:'pointer' }}>Revised {sortField==='revised_date' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th>Category Description</th>
              <th onClick={()=>toggleSort('energy_per_mile')} style={{ width:'130px', cursor:'pointer' }}>Energy / Mile (kWh) {sortField==='energy_per_mile' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th style={{ width:'140px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const isEditing = editingMC === r.mc_code;
              return (
                <tr key={r.mc_code}>
                  <td>{r.mc_code}</td>
                  <td>
                    {isEditing
                      ? <input className="input" value={editDraft.description} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} />
                      : (r.description || '—')}
                  </td>
                  <td>
                    {isEditing
                      ? <input className="input" style={{ width: 60 }} value={editDraft.status} onChange={e => setEditDraft(d => ({ ...d, status: e.target.value }))} />
                      : (r.status || '—')}
                  </td>
                  <td>
                    {isEditing
                      ? (
                        <select className="input" value={editDraft.equipment_category_code} onChange={e => setEditDraft(d => ({ ...d, equipment_category_code: e.target.value }))}>
                          <option value="">(none)</option>
                          {categoryOptions.map(({ code, description }) => (
                            <option key={code} value={code}>{description && description !== code ? `${code} - ${description}` : code}</option>
                          ))}
                        </select>
                      )
                      : (r.equipment_category_code || '—')}
                  </td>
                  <td>{r.revised_date || '—'}</td>
                  <td>{(r.category && r.category.description) || '—'}</td>
                  <td>
                    {isEditing
                      ? <input className="input" style={{ width: 110 }} value={editDraft.energy_per_mile} onChange={e => setEditDraft(d => ({ ...d, energy_per_mile: e.target.value }))} />
                      : (r.energy_per_mile != null ? r.energy_per_mile : '—')}
                  </td>
                  <td style={{ display: 'flex', gap: '4px' }}>
                    {isEditing ? (
                      <>
                        <button className="btn" disabled={savingMC === r.mc_code} onClick={() => saveEntry(r.mc_code)}>{savingMC === r.mc_code ? 'Saving...' : 'Save'}</button>
                        <button className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
                      </>
                    ) : canEdit ? (
                      <>
                        <button className="btn btn-secondary" onClick={() => startEdit(r)}>Edit</button>
                        <button className="btn btn-danger" onClick={() => {
                          if (!window.confirm(`Delete MC ${r.mc_code}? (Must not be in use)`)) return;
                          deleteCatalogEntry(r.mc_code)
                            .then(res => { alert(res.data.message || 'Deleted'); load(); })
                            .catch(err => { console.error('Delete failed', err); alert(err.response?.data?.error || 'Delete failed'); });
                        }}>Delete</button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CatalogManager;
