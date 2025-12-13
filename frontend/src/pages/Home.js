import React, { useEffect, useState, useMemo } from "react";
import { getSites, getAggregateMetrics, getProjects, getLatestProjectStatuses, getVehicleCountsBySite } from "../api";
import { Link, useSearchParams } from "react-router-dom";
import MapView from "../components/MapView";
import StatusLegend from "../components/StatusLegend";
import { ratioFrom, getStatusShade } from "../utils/statusShading";

const Home = () => {
  const [sites, setSites] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [meta, setMeta] = useState(null);
  const [focusSiteId, setFocusSiteId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [order, setOrder] = useState('desc');
  const [sort, setSort] = useState('available_capacity_kw');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [errorMetrics, setErrorMetrics] = useState(null);
  const [allowAdd, setAllowAdd] = useState(false); // controls map click-to-add
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [latestStatuses, setLatestStatuses] = useState([]);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [markerColorMode, setMarkerColorMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('markerColorMode');
      if (saved === 'capacity' || saved === 'status') return saved;
    }
    return 'capacity';
  }); // 'capacity' | 'status'
  const [vehicleCounts, setVehicleCounts] = useState({});
  useEffect(() => {
    try { window.localStorage.setItem('markerColorMode', markerColorMode); } catch(e) { /* ignore */ }
  }, [markerColorMode]);

  // Reset focused site whenever page or search changes
  useEffect(() => {
    setFocusSiteId(null);
  }, [page, search]);

  useEffect(() => {
    getSites()
      .then((res) => setSites(res.data))
      .catch((err) => console.error("Error fetching sites:", err));
    getProjects()
      .then((res) => setProjects(res.data))
      .catch((err) => console.error("Error fetching projects:", err));
    getVehicleCountsBySite()
      .then(res => setVehicleCounts(res.data.counts || {}))
      .catch(err => console.error('Error fetching vehicle counts:', err));
  }, []);

  // Initialize focus from query param ?focus=<id>
  useEffect(() => {
    const f = searchParams.get('focus');
    if (f) {
      const num = parseInt(f, 10);
      if (!Number.isNaN(num)) setFocusSiteId(num);
    }
    // Initialize controls from URL on first load
    const p = parseInt(searchParams.get('page') || '1', 10);
    const pp = parseInt(searchParams.get('perPage') || '25', 10);
    const ord = searchParams.get('order');
    const srt = searchParams.get('sort');
    const sch = searchParams.get('search');
    const pid = searchParams.get('projectId');
    if (!Number.isNaN(p) && p > 0) setPage(p);
    if (!Number.isNaN(pp) && [10,25,50].includes(pp)) setPerPage(pp);
    if (ord === 'asc' || ord === 'desc') setOrder(ord);
    if (srt) setSort(srt);
    if (typeof sch === 'string') { setSearch(sch); setSearchInput(sch); }
    if (pid) setSelectedProjectId(pid);
    setInitialized(true);
  }, [searchParams]);

  const clearFocus = () => {
    if (focusSiteId != null) setFocusSiteId(null);
    if (searchParams.get('focus')) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.delete('focus');
      setSearchParams(sp);
    }
  };

  useEffect(() => {
    if (!initialized) return;
    // Sync controls to URL for deep-linking and consistent back/forward behavior
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('page', String(page));
    sp.set('perPage', String(perPage));
    sp.set('order', order);
    sp.set('sort', sort);
    if (search) {
      sp.set('search', search);
    } else {
      sp.delete('search');
    }
    if (selectedProjectId) {
      sp.set('projectId', String(selectedProjectId));
    } else {
      sp.delete('projectId');
    }
    setSearchParams(sp, { replace: true });

    setLoadingMetrics(true);
    setErrorMetrics(null);
    getAggregateMetrics({ page, perPage, order, sort, search, projectId: selectedProjectId })
      .then(res => {
        setMetrics(res.data.data);
        setMeta(res.data.meta);
      })
      .catch(err => {
        console.error('Error fetching metrics:', err);
        setErrorMetrics('Failed to load metrics');
      })
      .finally(() => setLoadingMetrics(false));
  }, [page, perPage, order, sort, search, selectedProjectId, initialized, searchParams, setSearchParams]);

  // Load latest statuses when a project is selected
  useEffect(() => {
    (async () => {
      if (!selectedProjectId) { setLatestStatuses([]); return; }
      setLoadingLatest(true);
      try {
        const { data } = await getLatestProjectStatuses(selectedProjectId);
        setLatestStatuses(data);
      } finally {
        setLoadingLatest(false);
      }
    })();
  }, [selectedProjectId]);

  // Reset pagination when project filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedProjectId]);

  // If project is cleared while in status color mode, revert to capacity
  useEffect(() => {
    if (!selectedProjectId && markerColorMode === 'status') {
      setMarkerColorMode('capacity');
    }
  }, [selectedProjectId, markerColorMode]);

  const nextPage = () => {
    if (meta && page >= Math.ceil(meta.total / perPage)) return;
    setPage(p => p + 1);
  };
  const prevPage = () => setPage(p => (p > 1 ? p - 1 : p));
  const handlePerPageChange = (e) => {
    setPerPage(parseInt(e.target.value, 10) || 25);
    setPage(1);
  };
  const toggleOrder = () => setOrder(o => (o === 'desc' ? 'asc' : 'desc'));
  const handleSort = (field) => {
    // Reset any local sort when switching to backend fields
    if (sort === field) {
      toggleOrder();
    } else {
      setSort(field);
      setOrder('desc');
    }
    setPage(1);
  };
  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };
  const clearSearch = () => {
    setSearch('');
    setSearchInput('');
    setPage(1);
  };

  // Build quick lookup of metrics by site_id
  const metricsMap = useMemo(() => {
    const m = {};
    metrics.forEach(row => { m[row.site_id] = row; });
    return m;
  }, [metrics]);

  // Build quick lookup of sites by id (for address/contact details)
  const sitesMap = useMemo(() => {
    const sm = {};
    sites.forEach(s => { sm[s.id] = s; });
    return sm;
  }, [sites]);

  // Merge base site info with metrics (for map & table so missing detection works)
  const sitesWithMetrics = useMemo(() => {
    return sites.map(s => ({ ...s, ...metricsMap[s.id], vehicle_count: vehicleCounts[s.id] || 0 }));
  }, [sites, metricsMap, vehicleCounts]);

  // Metrics rows merged with site info (table uses backend ordering but enriched locally)
  const metricsWithSite = useMemo(() => {
    // Use server-side ordering; just enrich rows
    return metrics.map(row => ({ ...row, ...sitesMap[row.site_id], vehicle_count: vehicleCounts[row.site_id] || 0 }));
  }, [metrics, sitesMap, vehicleCounts]);

  // Determine missing info (capacity prerequisites or contact/location fields)
  const missingFieldsForRow = (row) => {
    const missing = [];
    if (!row.main_breaker_amps) missing.push('Amps');
    if (!row.voltage) missing.push('Voltage');
    if (!row.phase_count) missing.push('Phase');
    if (!row.address) missing.push('Address');
    if (!row.city) missing.push('City');
    if (!row.contact_name) missing.push('Contact');
    if (!row.contact_phone) missing.push('Phone');
    return missing;
  };

  return (
    <div className="container">
      <h1 className="page-header">EV Infrastructure Sites</h1>
      <div className="card">
        <div className="flex-row gap-sm" style={{ marginBottom:'6px' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'0.9em' }}>
            <input
              type="checkbox"
              checked={allowAdd}
              onChange={(e) => setAllowAdd(e.target.checked)}
              style={{ transform:'scale(1.1)' }}
            />
            Enable map click to add site
          </label>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px' }}>
            <label style={{ fontSize:'0.9em' }}>Project:</label>
            <select className="input" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
              <option value="">(none)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {selectedProjectId && (loadingLatest ? <span style={{ fontSize:'0.85em', color:'var(--muted)' }}>Loading status…</span> : <span style={{ fontSize:'0.85em', color:'var(--muted)' }}>Status ready</span>)}
            <label style={{ fontSize:'0.9em', marginLeft:'12px' }}>Marker Color:</label>
            <select className="input" value={markerColorMode} onChange={(e) => setMarkerColorMode(e.target.value)}>
              <option value="capacity">Capacity</option>
              {selectedProjectId && <option value="status">Status</option>}
            </select>
          </div>
        </div>
        <MarkerLegend mode={markerColorMode} hasProject={!!selectedProjectId} />
        <MapView
          sites={sitesWithMetrics}
          focusSiteId={focusSiteId}
          onClearFocus={clearFocus}
          enableAddSites={allowAdd}
          selectedProjectId={selectedProjectId}
          latestStatuses={latestStatuses}
          project={projects.find(p => String(p.id) === String(selectedProjectId)) || null}
          colorMode={markerColorMode}
        />
      </div>

      <div className="card">
        <div className="flex-row gap-md align-center justify-between" style={{marginBottom:'10px'}}>
          <h2 style={{margin:0}}>Sites (Capacity, Demand & Chargers)</h2>
          <div className="flex-row gap-sm align-center">
            <button className="btn" onClick={prevPage} disabled={page === 1}>Prev</button>
            <span>Page {page}</span>
            <button className="btn" onClick={nextPage} disabled={meta && page >= Math.ceil(meta.total / perPage)}>Next</button>
            <select className="input" value={perPage} onChange={handlePerPageChange}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <button className="btn btn-secondary" onClick={toggleOrder}>Order: {order.toUpperCase()}</button>
            <div className="flex-row gap-sm align-center">
              <input
                className="input"
                style={{minWidth:'140px'}}
                value={searchInput}
                placeholder="Search name"
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
              />
              <button className="btn" onClick={applySearch}>Go</button>
              {search && <button className="btn btn-secondary" onClick={clearSearch}>Clear</button>}
            </div>
          </div>
        </div>

        {loadingMetrics && (
          <table className="table">
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr className="sk-table-row" key={i}>
                  <td><div className="skeleton sk-line" style={{width:'60%'}} /></td>
                  <td><div className="skeleton sk-line" /></td>
                  <td><div className="skeleton sk-line" /></td>
                  <td><div className="skeleton sk-line" /></td>
                  <td><div className="skeleton sk-line short" /></td>
                  <td><div className="skeleton sk-line short" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {errorMetrics && <p style={{ color: 'var(--danger)' }}>{errorMetrics}</p>}
        {!loadingMetrics && !errorMetrics && (
          <table className="table">
            <thead>
              <tr>
                <th className="table-sortable" onClick={() => handleSort('name')}>Name {sort==='name' ? (order==='desc'?'▼':'▲') : ''}</th>
                <th className="table-sortable" style={{textAlign:'right'}} onClick={() => handleSort('available_capacity_kw')}>Available kW {sort==='available_capacity_kw' ? (order==='desc'?'▼':'▲') : ''}</th>
                <th className="table-sortable" style={{textAlign:'right'}} onClick={() => handleSort('last_year_peak_kw')}>Peak kW (Last Yr) {sort==='last_year_peak_kw' ? (order==='desc'?'▼':'▲') : ''}</th>
                <th className="table-sortable" style={{textAlign:'right'}} onClick={() => handleSort('theoretical_capacity_kw')}>Capacity kW {sort==='theoretical_capacity_kw' ? (order==='desc'?'▼':'▲') : ''}</th>
                <th className="table-sortable" style={{textAlign:'right'}} onClick={() => handleSort('total_charger_kw')}>Total Charger kW {sort==='total_charger_kw' ? (order==='desc'?'▼':'▲') : ''}</th>
                <th className="table-sortable" style={{textAlign:'right'}} onClick={() => handleSort('vehicle_count')}>Vehicles {sort==='vehicle_count' ? (order==='desc'?'▼':'▲') : ''}</th>
                <th className="table-sortable" style={{textAlign:'right'}} onClick={() => handleSort('installed_charger_kw')}>Installed Charger kW {sort==='installed_charger_kw' ? (order==='desc'?'▼':'▲') : ''}</th>
                <th style={{textAlign:'center'}}>Info</th>
                <th>Status</th>
                <th>Map</th>
              </tr>
            </thead>
            <tbody>
              {metricsWithSite.map(row => (
                <tr
                  key={row.site_id}
                  className={
                    (row.site_id === focusSiteId ? 'row-focused ' : '') +
                    (missingFieldsForRow(row).length ? 'row-missing' : '')
                  }
                  title={missingFieldsForRow(row).length ? `Missing: ${missingFieldsForRow(row).join(', ')}` : ''}
                >
                  <td><Link to={`/site/${row.site_id}`}>{row.name}</Link></td>
                  <td style={{textAlign:'right'}}>{row.available_capacity_kw ?? '—'}</td>
                  <td style={{textAlign:'right'}}>{row.last_year_peak_kw}</td>
                  <td style={{textAlign:'right'}}>{row.theoretical_capacity_kw ?? '—'}</td>
                  <td style={{textAlign:'right'}}>{row.total_charger_kw ?? 0}</td>
                  <td style={{textAlign:'right'}}>{row.vehicle_count ?? 0}</td>
                  <td style={{textAlign:'right'}}>{row.installed_charger_kw ?? 0}</td>
                  <td style={{textAlign:'center'}}>
                    {missingFieldsForRow(row).length ? <span className="missing-icon" aria-label="Missing info" role="img">⚠</span> : <span className="ok-icon" aria-label="Complete" role="img">✔</span>}
                  </td>
                  <td>
                    {selectedProjectId ? (() => {
                      const status = latestStatuses.find(ls => String(ls.site_id) === String(row.site_id));
                      const project = projects.find(p => String(p.id) === String(selectedProjectId));
                      const stepsCount = project && typeof project.steps_count === 'number' ? project.steps_count : undefined;
                      const ratio = ratioFrom(status?.current_step, stepsCount);
                      const col = getStatusShade(ratio);
                      const badgeStyle = {
                        display:'inline-block',
                        padding:'2px 6px',
                        borderRadius:999,
                        fontSize:'0.75rem',
                        background: col.bg,
                        border: '1px solid ' + col.border,
                        color: '#0f172a'
                      };
                      const badgeText = ratio === null ? 'No Status' : `Step ${status.current_step}`;
                      return (
                        <Link to={`/projects/${selectedProjectId}/status/${row.site_id}`} style={{ textDecoration:'none' }}>
                          <span style={badgeStyle} title={status && status.status_date ? `As of ${new Date(status.status_date).toLocaleDateString()}` : ''}>{badgeText}</span>
                        </Link>
                      );
                    })() : <span style={{ color:'var(--muted)' }}>Select a project</span>}
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-icon"
                      title="Focus on map"
                      onClick={() => setFocusSiteId(row.site_id)}
                    >🔍</button>
                  </td>
                </tr>
              ))}
              {metricsWithSite.length === 0 && (
                <tr><td className="table-empty" colSpan={6}>No data</td></tr>
              )}
            </tbody>
          </table>
        )}
        {meta && (
          <div style={{ marginTop: '6px', fontSize: '0.85em', color: 'var(--muted)' }}>
            Showing {metrics.length} of {meta.total} sites.
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;

function MarkerLegend({ mode, hasProject }) {
  const wrapStyle = { display:'flex', gap:'10px', flexWrap:'wrap', margin:'6px 0 10px', fontSize:'0.75rem' };
  const pill = (bg, border, text) => (
    <span style={{ background:bg, border:`1px solid ${border}`, padding:'2px 6px', borderRadius:999 }}>{text}</span>
  );
  if (mode === 'capacity') {
    return (
      <div style={wrapStyle}>
        {pill('#dc2626','#dc2626','Low Cap (<200 kW)')}
        {pill('#ca8a04','#ca8a04','Mid Cap (200-799 kW)')}
        {pill('#16a34a','#16a34a','High Cap (≥800 kW)')}
        {pill('#64748b','#64748b','Unknown')}
      </div>
    );
  }
  // status mode
  return (
    <div style={wrapStyle}>
      {!hasProject && <span style={{ color:'var(--muted)' }}>Select a project for status colors.</span>}
      {hasProject && (
        <StatusLegend />
      )}
    </div>
  );
}
