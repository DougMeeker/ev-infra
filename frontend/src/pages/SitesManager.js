import React, { useEffect, useState } from 'react';
import { getSites } from '../api';
import { Link, useSearchParams } from 'react-router-dom';

const SitesManager = () => {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('q') || '';
  const sortKey = searchParams.get('sort') || 'name';
  const sortDir = searchParams.get('dir') || 'asc';

  const setSearch = (value) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set('q', value); else next.delete('q');
      return next;
    }, { replace: true });
  };

  const handleSort = (key) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const currentDir = prev.get('dir') || 'asc';
      const newDir = prev.get('sort') === key ? (currentDir === 'asc' ? 'desc' : 'asc') : 'asc';
      next.set('sort', key);
      next.set('dir', newDir);
      return next;
    });
  };

  const sortIndicator = (key) => {
    if (sortKey !== key) return ' ↕';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSites();
      setSites(res.data || []);
    } catch (e) {
      console.error('Failed to load sites', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = sites.filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const deptStr = (s.departments || []).map(d => `${d.code} ${d.unit_name}`).join(' ').toLowerCase();
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      deptStr.includes(q)
    );
  }).sort((a, b) => {
    let aVal, bVal;
    if (sortKey === 'departments') {
      aVal = (a.departments || []).map(d => d.code).join(',');
      bVal = (b.departments || []).map(d => d.code).join(',');
    } else {
      aVal = (a[sortKey] || '').toString().toLowerCase();
      bVal = (b[sortKey] || '').toString().toLowerCase();
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h2 className="page-header">Sites</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Search</h4>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" placeholder="Search by name, address, city, or department" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 320 }} />
        </div>
      </div>

      {loading ? <p>Loading...</p> : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>Name{sortIndicator('name')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('address')}>Address{sortIndicator('address')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('city')}>City{sortIndicator('city')}</th>
              <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('departments')}>Departments{sortIndicator('departments')}</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td><Link to={`/site/${s.id}`}>{s.name}</Link></td>
                <td>{s.address || '—'}</td>
                <td>{s.city || '—'}</td>
                <td>
                  {(s.departments || []).length === 0 ? '—' : (() => {
                    const depts = s.departments || [];
                    const visible = depts.slice(0, 4);
                    const overflow = depts.length - visible.length;
                    return (
                      <>
                        {visible.map((d, i) => (
                          <span key={i} title={d.unit_name} style={{ display: 'inline-block', marginRight: 6, padding: '2px 6px', background: '#f0f0f0', borderRadius: 4, fontSize: 13 }}>
                            {d.code}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span title={depts.slice(4).map(d => `${d.code} – ${d.unit_name}`).join('\n')} style={{ display: 'inline-block', padding: '2px 6px', background: '#e0e7ff', borderRadius: 4, fontSize: 13, cursor: 'default' }}>
                            +{overflow} more
                          </span>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td style={{ display:'flex', gap: 6 }}>
                  <Link className="btn btn-secondary" to={`/site/${s.id}`}>Details</Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="table-empty">No matching sites</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default SitesManager;
