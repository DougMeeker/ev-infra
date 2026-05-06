import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { listVehicles, createVehicle, updateVehicle, deleteVehicle, getSites, getCatalog } from '../api';
import { useDebounce } from '../hooks';
import SiteSelector from '../components/SiteSelector';
import { useAuth } from '../AuthProvider';

const padMC = (code) => code ? String(code).padStart(5, '0') : '';

const VehiclesManager = () => {
  const { isAuthenticated, role } = useAuth();
  const canEdit = useMemo(() => isAuthenticated && (role === 'admin' || role === 'hq'), [isAuthenticated, role]);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [order, setOrder] = useState('asc');
  const [sort, setSort] = useState('equipment_id');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [siteId, setSiteId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [mcCode, setMcCode] = useState('');
  const [sites, setSites] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = () => {
    setLoading(true);
    listVehicles({ page, perPage, order, sort, search: debouncedSearch, siteId, departmentId, mcCode })
      .then(res => {
        setItems(res.data.items);
        setTotal(res.data.total);
        setPages(res.data.pages);
      })
      .catch(err => console.error('Vehicles load error', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getSites().then(res => setSites(res.data || [])).catch(() => { });
    getCatalog().then(res => {
      const sorted = (res.data || []).slice().sort((a, b) => padMC(a.mc_code).localeCompare(padMC(b.mc_code)));
      setCatalog(sorted);
    }).catch(() => { });
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page, perPage, order, sort, debouncedSearch, siteId, departmentId, mcCode]);

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
        <h4 style={{ marginTop: 0 }}>Filters</h4>
        <div className="flex-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          <div className="form-group" >
            <label>Search</label>
            <input className="input" placeholder="Vehicle Id" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="form-group" >
            <label>Site</label>
            <SiteSelector
              value={siteId}
              onChange={v => { setSiteId(v || ''); setPage(1); }}
              variant="searchable"
              placeholder="All Sites"
            />
          </div>
          <div className="form-group" >
            <label>Department ID</label>
            <input className="input" placeholder="e.g. 07-0123" value={departmentId} onChange={e => { setDepartmentId(e.target.value); setPage(1); }} />
          </div>
          <div className="form-group" >
            <label>MC Code</label>
            <select className="input" value={mcCode} onChange={e => { setMcCode(e.target.value); setPage(1); }}>
              <option value="">All MCs</option>
              {catalog.map(c => (<option key={c.mc_code} value={c.mc_code}>{padMC(c.mc_code)} - {c.description || ''}</option>))}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={resetFilters}>Reset</button>
        </div>
      </div>

      {canEdit && (
      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop: 0 }}>Create Vehicle</h4>
        <div className="flex-row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: '500' }}>Site</label>
            <SiteSelector
              value={siteId}
              onChange={setSiteId}
              variant="searchable"
              placeholder="Search and select site..."
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: '500' }}>MC Code</label>
            <select className="input" value={mcCode} onChange={e => setMcCode(e.target.value)}>
              <option value="">Select MC Code</option>
              {catalog.map(c => (<option key={c.mc_code} value={c.mc_code}>{padMC(c.mc_code)} - {c.description || ''}</option>))}
            </select>
          </div>
          <button className="btn" disabled={creating || !siteId || !mcCode} onClick={doCreate}>{creating ? 'Creating...' : 'Create'}</button>
        </div>
      </div>
      )}

      {loading ? <p>Loading...</p> : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th onClick={() => toggleSort('equipment_id')} style={{ cursor: 'pointer' }}>Identifier {sort === 'equipment_id' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => toggleSort('mc_code')} style={{ cursor: 'pointer' }}>MC {sort === 'mc_code' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
                <th>Category</th>
                <th onClick={() => toggleSort('site_id')} style={{ cursor: 'pointer' }}>Site {sort === 'site_id' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => toggleSort('department_id')} style={{ cursor: 'pointer' }}>Dept {sort === 'department_id' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
                <th onClick={() => toggleSort('annual_miles')} style={{ cursor: 'pointer' }}>Annual Miles {sort === 'annual_miles' ? (order === 'asc' ? '▲' : '▼') : ''}</th>
                <th style={{ width: '220px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(e => {
                const editing = editingId === e.id;
                const siteName = sites.find(s => s.id === e.site_id)?.name || e.site_id || '—';
                return (
                  <tr key={e.id}>
                    <td>
                      {editing ? (
                        <input className="input" value={e.equipment_id ?? ''} onChange={ev => {
                          const v = ev.target.value;
                          setItems(prev => prev.map(x => x.id === e.id ? { ...x, equipment_id: v } : x));
                        }} />
                      ) : (e.equipment_id ?? '—')}
                    </td>
                    <td>
                      {editing ? (
                        <select className="input" value={e.mc_code || ''} onChange={ev => {
                          const v = ev.target.value;
                          setItems(prev => prev.map(x => x.id === e.id ? { ...x, mc_code: v } : x));
                        }}>
                          {catalog.map(c => (<option key={c.mc_code} value={c.mc_code}>{padMC(c.mc_code)}</option>))}
                        </select>
                      ) : (padMC(e.mc_code) || '—')}
                    </td>
                    <td>{e.catalog && e.catalog.category ? e.catalog.category.code : '—'}</td>
                    <td>
                      {editing ? (
                        <SiteSelector
                          value={e.site_id}
                          onChange={v => setItems(prev => prev.map(x => x.id === e.id ? { ...x, site_id: v } : x))}
                          variant="searchable"
                          placeholder="Select site..."
                          style={{ minWidth: 200 }}
                        />
                      ) : siteName}
                    </td>
                    <td>
                      {editing ? (
                        <input className="input" style={{ width: '100px' }} value={e.department_id ?? ''} onChange={ev => {
                          const v = ev.target.value;
                          setItems(prev => prev.map(x => x.id === e.id ? { ...x, department_id: v } : x));
                        }} />
                      ) : (e.department_id || '—')}
                    </td>
                    <td>
                      {editing ? (
                        <input className="input" style={{ width: '120px' }} value={e.annual_miles ?? ''} onChange={ev => {
                          const v = ev.target.value;
                          setItems(prev => prev.map(x => x.id === e.id ? { ...x, annual_miles: v } : x));
                        }} />
                      ) : (e.annual_miles ?? '—')}
                    </td>
                    <td style={{ display: 'flex', gap: '4px' }}>
                      {editing ? (
                        <>
                          <button className="btn" onClick={() => {
                            const payload = {
                              equipment_id: e.equipment_id !== '' ? Number(e.equipment_id) : null,
                              mc_code: e.mc_code,
                              site_id: e.site_id,
                              department_id: e.department_id,
                              annual_miles: e.annual_miles,
                            };
                            updateVehicle(e.id, payload)
                              .then(() => { setEditingId(null); load(); })
                              .catch(err => { console.error('Update failed', err); alert(err.response?.data?.error || 'Update failed'); });
                          }}>Save</button>
                          <button className="btn btn-secondary" onClick={() => { setEditingId(null); load(); }}>Cancel</button>
                        </>
                      ) : canEdit ? (
                        <button className="btn" onClick={() => setEditingId(e.id)}>Edit</button>
                      ) : null}
                      <Link className="btn btn-secondary" to={`/vehicle/${e.id}`}>Details</Link>
                      {canEdit && (
                      <button className="btn btn-danger" onClick={() => {
                        if (!window.confirm('Delete vehicle?')) return;
                        deleteVehicle(e.id)
                          .then(() => load())
                          .catch(err => { console.error('Delete failed', err); alert(err.response?.data?.error || 'Delete failed'); });
                      }}>Delete</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex-row gap-sm" style={{ alignItems: 'center' }}>
            <span>Rows per page</span>
            <select className="input" value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map(n => (<option key={n} value={n}>{n}</option>))}
            </select>
            <span style={{ marginLeft: 'auto' }}>Page {page} / {pages} (Total {total})</span>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <button className="btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
};

export default VehiclesManager;
