import React, { useEffect, useState } from 'react';
import { getSites } from '../api';
import { Link } from 'react-router-dom';

const SitesManager = () => {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

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
  });

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h2 className="page-header">Sites</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Search</h4>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" placeholder="Search by name, address, city, or department" value={search} onChange={e=>setSearch(e.target.value)} style={{ width: 320 }} />
        </div>
      </div>

      {loading ? <p>Loading...</p> : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>City</th>
              <th>Departments</th>
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
                  {(s.departments || []).length === 0 ? '—' : (s.departments || []).map((d, i) => (
                    <span key={i} title={d.unit_name} style={{ display: 'inline-block', marginRight: 6, padding: '2px 6px', background: '#f0f0f0', borderRadius: 4, fontSize: 13 }}>
                      {d.code}
                    </span>
                  ))}
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
