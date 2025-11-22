import React, { useEffect, useState } from "react";
import { getSites, getAggregateMetrics } from "../api";
import { Link } from "react-router-dom";
import MapView from "../components/MapView";

const Home = () => {
  const [sites, setSites] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [meta, setMeta] = useState(null);
  const [focusSiteId, setFocusSiteId] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [order, setOrder] = useState('desc');
  const [sort, setSort] = useState('available_capacity_kw');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [errorMetrics, setErrorMetrics] = useState(null);

  useEffect(() => {
    getSites()
      .then((res) => setSites(res.data))
      .catch((err) => console.error("Error fetching sites:", err));
  }, []);

  useEffect(() => {
    setLoadingMetrics(true);
    setErrorMetrics(null);
    getAggregateMetrics({ page, perPage, order, sort, search })
      .then(res => {
        setMetrics(res.data.data);
        setMeta(res.data.meta);
      })
      .catch(err => {
        console.error('Error fetching metrics:', err);
        setErrorMetrics('Failed to load metrics');
      })
      .finally(() => setLoadingMetrics(false));
  }, [page, perPage, order, sort, search]);

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

  return (
    <div className="container">
      <h1 className="page-header">EV Infrastructure Sites</h1>
      <div className="card">
        <MapView sites={sites} focusSiteId={focusSiteId} />
      </div>

      <div className="card">
        <div className="flex-row gap-md align-center justify-between" style={{marginBottom:'10px'}}>
          <h2 style={{margin:0}}>Sites (Capacity & Demand)</h2>
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
                <th className="table-sortable" style={{textAlign:'right'}} onClick={() => handleSort('power_factor')}>PF {sort==='power_factor' ? (order==='desc'?'▼':'▲') : ''}</th>
                <th>Map</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(row => (
                <tr key={row.site_id}>
                  <td><Link to={`/site/${row.site_id}`}>{row.name}</Link></td>
                  <td style={{textAlign:'right'}}>{row.available_capacity_kw ?? '—'}</td>
                  <td style={{textAlign:'right'}}>{row.last_year_peak_kw}</td>
                  <td style={{textAlign:'right'}}>{row.theoretical_capacity_kw ?? '—'}</td>
                  <td style={{textAlign:'right'}}>{row.power_factor ?? '0.95'}</td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      title="Focus on map"
                      onClick={() => setFocusSiteId(row.site_id)}
                    >🔍</button>
                  </td>
                </tr>
              ))}
              {metrics.length === 0 && (
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
