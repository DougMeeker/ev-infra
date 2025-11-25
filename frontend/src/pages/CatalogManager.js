import React, { useEffect, useState, useRef } from 'react';
import { getCatalog, updateCatalogEntry, uploadCatalogFile, refreshCatalog, deleteCatalogEntry } from '../api';

const CatalogManager = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [savingMC, setSavingMC] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const [sortField, setSortField] = useState('mc_code');
  const [sortDir, setSortDir] = useState('asc');

  const load = () => {
    setLoading(true);
    getCatalog()
      .then(res => setRows(res.data))
      .catch(err => console.error('Catalog load error', err))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleEnergyChange = (mc, value) => {
    setRows(prev => prev.map(r => r.mc_code === mc ? { ...r, energy_per_mile: value } : r));
  };
  const handleDescChange = (mc, value) => {
    setRows(prev => prev.map(r => r.mc_code === mc ? { ...r, description: value } : r));
  };
  const handleStatusChange = (mc, value) => {
    setRows(prev => prev.map(r => r.mc_code === mc ? { ...r, status: value } : r));
  };

  const saveEntry = (row) => {
    setSavingMC(row.mc_code);
    const payload = {};
    if (row.energy_per_mile !== '' && row.energy_per_mile != null) {
      const num = parseFloat(row.energy_per_mile);
      if (!Number.isNaN(num)) payload.energy_per_mile = num; else alert('Energy per mile must be numeric');
    } else {
      payload.energy_per_mile = null;
    }
    payload.description = row.description;
    payload.status = row.status;
    updateCatalogEntry(row.mc_code, payload)
      .then(() => load())
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

  const filtered = rows.filter(r => !filter || r.mc_code.includes(filter) || (r.description || '').toLowerCase().includes(filter.toLowerCase()));

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
        <h4 style={{ marginTop:0 }}>Import / Refresh</h4>
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
        </div>
        <small style={{ display:'block', marginTop:'8px' }}>Upload replaces description/status/revised_date; if CSV includes an Energy Use column, energy_per_mile is updated as well (kWh/mile).</small>
      </div>
      {loading ? <p>Loading...</p> : (
        <table className="table">
          <thead>
            <tr>
              <th onClick={()=>toggleSort('mc_code')} style={{ cursor:'pointer' }}>MC {sortField==='mc_code' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th onClick={()=>toggleSort('description')} style={{ cursor:'pointer' }}>Description {sortField==='description' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th>Status</th>
              <th onClick={()=>toggleSort('revised_date')} style={{ cursor:'pointer' }}>Revised {sortField==='revised_date' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th onClick={()=>toggleSort('energy_per_mile')} style={{ width:'130px', cursor:'pointer' }}>Energy / Mile (kWh) {sortField==='energy_per_mile' ? (sortDir==='asc'?'▲':'▼') : ''}</th>
              <th style={{ width:'110px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.mc_code}>
                <td>{r.mc_code}</td>
                <td>
                  <input className="input" value={r.description || ''} onChange={e=>handleDescChange(r.mc_code, e.target.value)} />
                </td>
                <td>
                  <input className="input" value={r.status || ''} onChange={e=>handleStatusChange(r.mc_code, e.target.value)} />
                </td>
                <td>{r.revised_date || '—'}</td>
                <td>
                  <input className="input" style={{ width:'120px' }} value={r.energy_per_mile ?? ''} onChange={e=>handleEnergyChange(r.mc_code, e.target.value)} />
                </td>
                <td style={{ display:'flex', gap:'4px' }}>
                  <button className="btn" disabled={savingMC===r.mc_code} onClick={()=>saveEntry(r)}>{savingMC===r.mc_code?'Saving...':'Save'}</button>
                  <button className="btn btn-danger" onClick={() => {
                    if (!window.confirm(`Delete MC ${r.mc_code}? (Must not be in use)`)) return;
                    deleteCatalogEntry(r.mc_code)
                      .then(res => { alert(res.data.message || 'Deleted'); load(); })
                      .catch(err => { console.error('Delete failed', err); alert(err.response?.data?.error || 'Delete failed'); });
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default CatalogManager;
