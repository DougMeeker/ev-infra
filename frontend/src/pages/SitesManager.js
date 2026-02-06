import React, { useEffect, useState } from 'react';
import { getSites, updateSite } from '../api';
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
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.department_id || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h2 className="page-header">Sites</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Search</h4>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" placeholder="Search by name, address, city, or department id" value={search} onChange={e=>setSearch(e.target.value)} style={{ width: 320 }} />
        </div>
      </div>

      {loading ? <p>Loading...</p> : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>City</th>
              <th>Department ID</th>
              <th style={{ width: 220 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td><Link to={`/site/${s.id}`}>{s.name}</Link></td>
                <td>{s.address || '—'}</td>
                <td>{s.city || '—'}</td>
                <td>
                  <input className="input" style={{ width: 160 }} value={s.department_id || ''} onChange={e=>{
                    const v = e.target.value;
                    setSites(prev => prev.map(x => x.id===s.id ? { ...x, department_id: v } : x));
                  }} />
                </td>
                <td style={{ display:'flex', gap: 6 }}>
                  <button className="btn" onClick={async ()=>{
                    const payload = { department_id: s.department_id || '' };
                    try {
                      await updateSite(s.id, payload);
                      await load();
                    } catch (e) {
                      alert('Update failed');
                    }
                  }}>Save</button>
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
