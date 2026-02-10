import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listVehicles, createVehicle, updateVehicle, deleteVehicle, getSites, getCatalog } from '../api';

const VehiclesManager = () => {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [order, setOrder] = useState('asc');
  const [sort, setSort] = useState('equipment_id');
  const [search, setSearch] = useState('');
  const [siteId, setSiteId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [mcCode, setMcCode] = useState('');
  const [sites, setSites] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    listVehicles({ page, perPage, order, sort, search, siteId, departmentId, mcCode })
      .then(res => {
        setItems(res.data.items);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .catch(err => console.error('Vehicles load error', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getSites().then(res => setSites(res.data || [])).catch(()=>{});
    getCatalog().then(res => setCatalog(res.data || [])).catch(()=>{});
  }, []);
  useEffect(() => { load(); }, [page, perPage, order, sort, search, siteId, departmentId, mcCode, load]);

  const toggleSort = (field) => {
    if (sort === field) {
      setOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field); setOrder('asc');
    }
  };

  const resetFilters = () => {
    setSearch(''); setSiteId(''); setDepartmentId(''); setMcCode(''); setPage(1);
  };

  const doCreate = () => {
    const payload = {
      site_id: siteId ? Number(siteId) : undefined,
      mc_code: mcCode || undefined,
      equipment_id: undefined,
      department_id: departmentId || undefined,
    };
    if (!payload.site_id || !payload.mc_code) {
      alert('Select Site and MC Code to create'); return;
    }
    setCreating(true);
    createVehicle(payload)
      .then(() => { load(); })
      .catch(err => { console.error('Create failed', err); alert(err.response?.data?.error || 'Create failed'); })
      .finally(() => setCreating(false));
  };

  return (
    <div className="container" style={{ paddingTop: '24px' }}>
      <h2 className="page-header">Vehicles</h2>

      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop:0 }}>Filters</h4>
        <div className="flex-row gap-sm" style={{ flexWrap:'wrap' }}>
          <input className="input" style={{ width:'220px' }} placeholder="Search identifier" value={search} onChange={e=>{ setSearch(e.target.value); setPage(1);} } />
          <select className="input" value={siteId} onChange={e=>{ setSiteId(e.target.value); setPage(1);} }>
            <option value="">All Sites</option>
            {sites.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
          <input className="input" style={{ width:'140px' }} placeholder="Department ID" value={departmentId} onChange={e=>{ setDepartmentId(e.target.value); setPage(1);} } />
          <select className="input" value={mcCode} onChange={e=>{ setMcCode(e.target.value); setPage(1);} }>
            <option value="">All MCs</option>
            {catalog.map(c => (<option key={c.mc_code} value={c.mc_code}>{c.mc_code} - {c.description || ''}</option>))}
          </select>
          <button className="btn btn-secondary" onClick={resetFilters}>Reset</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop:0 }}>Create Vehicle</h4>
        <div className="flex-row gap-sm" style={{ flexWrap:'wrap' }}>
          <select className="input" value={siteId} onChange={e=>setSiteId(e.target.value)}>
            <option value="">Select Site</option>
            {sites.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
          <select className="input" value={mcCode} onChange={e=>setMcCode(e.target.value)}>
            <option value="">Select MC Code</option>
            {catalog.map(c => (<option key={c.mc_code} value={c.mc_code}>{c.mc_code} - {c.description || ''}</option>))}
          </select>
          <button className="btn" disabled={creating || !siteId || !mcCode} onClick={doCreate}>{creating ? 'Creating...' : 'Create'}</button>
        </div>
      </div>

      {loading ? <p>Loading...</p> : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th onClick={()=>toggleSort('equipment_id')} style={{ cursor:'pointer' }}>Identifier {sort==='equipment_id' ? (order==='asc'?'▲':'▼') : ''}</th>
                <th onClick={()=>toggleSort('mc_code')} style={{ cursor:'pointer' }}>MC {sort==='mc_code' ? (order==='asc'?'▲':'▼') : ''}</th>
                <th>Category</th>
                <th onClick={()=>toggleSort('site_id')} style={{ cursor:'pointer' }}>Site {sort==='site_id' ? (order==='asc'?'▲':'▼') : ''}</th>
                <th onClick={()=>toggleSort('department_id')} style={{ cursor:'pointer' }}>Dept {sort==='department_id' ? (order==='asc'?'▲':'▼') : ''}</th>
                <th onClick={()=>toggleSort('annual_miles')} style={{ cursor:'pointer' }}>Annual Miles {sort==='annual_miles' ? (order==='asc'?'▲':'▼') : ''}</th>
                <th style={{ width:'220px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(e => (
                <tr key={e.id}>
                  <td>
                    <input className="input" value={e.equipment_id ?? ''} onChange={ev=>{
                      const v = ev.target.value;
                      setItems(prev => prev.map(x => x.id===e.id ? { ...x, equipment_id: v } : x));
                    }} />
                  </td>
                  <td>
                    <select className="input" value={e.mc_code || ''} onChange={ev=>{
                      const v = ev.target.value;
                      setItems(prev => prev.map(x => x.id===e.id ? { ...x, mc_code: v } : x));
                    }}>
                      {catalog.map(c => (<option key={c.mc_code} value={c.mc_code}>{c.mc_code}</option>))}
                    </select>
                  </td>
                  <td>{e.catalog && e.catalog.category ? e.catalog.category.code : '—'}</td>
                  <td>
                    <select className="input" value={e.site_id || ''} onChange={ev=>{
                      const v = ev.target.value;
                      setItems(prev => prev.map(x => x.id===e.id ? { ...x, site_id: Number(v) } : x));
                    }}>
                      {sites.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                    </select>
                  </td>
                  <td>
                    <input className="input" style={{ width:'100px' }} value={e.department_id ?? ''} onChange={ev=>{
                      const v = ev.target.value;
                      setItems(prev => prev.map(x => x.id===e.id ? { ...x, department_id: v } : x));
                    }} />
                  </td>
                  <td>
                    <input className="input" style={{ width:'120px' }} value={e.annual_miles ?? ''} onChange={ev=>{
                      const v = ev.target.value;
                      setItems(prev => prev.map(x => x.id===e.id ? { ...x, annual_miles: v } : x));
                    }} />
                  </td>
                  <td style={{ display:'flex', gap:'4px' }}>
                    <button className="btn" onClick={()=>{
                      const payload = {
                        equipment_id: e.equipment_id !== '' ? Number(e.equipment_id) : null,
                        mc_code: e.mc_code,
                        site_id: e.site_id,
                        department_id: e.department_id,
                        annual_miles: e.annual_miles,
                      };
                      updateVehicle(e.id, payload)
                        .then(() => load())
                        .catch(err => { console.error('Update failed', err); alert(err.response?.data?.error || 'Update failed'); });
                    }}>Save</button>
                    <Link className="btn btn-secondary" to={`/vehicle/${e.id}`}>Details</Link>
                    <button className="btn btn-danger" onClick={()=>{
                      if (!window.confirm('Delete vehicle?')) return;
                      deleteVehicle(e.id)
                        .then(() => load())
                        .catch(err => { console.error('Delete failed', err); alert(err.response?.data?.error || 'Delete failed'); });
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex-row gap-sm" style={{ alignItems:'center' }}>
            <span>Rows per page</span>
            <select className="input" value={perPage} onChange={e=>{ setPerPage(Number(e.target.value)); setPage(1);} }>
              {[10,25,50,100].map(n => (<option key={n} value={n}>{n}</option>))}
            </select>
            <span style={{ marginLeft:'auto' }}>Page {page} / {pages} (Total {total})</span>
            <button className="btn btn-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Prev</button>
            <button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
};

export default VehiclesManager;
