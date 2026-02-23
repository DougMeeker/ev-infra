import React, { useEffect, useMemo, useState } from 'react';
import { getSites } from '../api';

/**
 * Searchable, sortable multi-select list of sites.
 * Props:
 *  - initialSelectedIds: number[]
 *  - onChange: (ids: number[]) => void
 */
const SiteMultiSelect = ({ initialSelectedIds = [], onChange }) => {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name:asc');
  const [selected, setSelected] = useState(new Set(initialSelectedIds.map(Number)));

  useEffect(() => {
    setLoading(true);
    getSites()
      .then(res => setSites(res.data || []))
      .catch(err => console.error('Error loading sites', err))
      .finally(() => setLoading(false));
  }, []);

  // Update selected sites when initialSelectedIds changes
  useEffect(() => {
    setSelected(new Set(initialSelectedIds.map(Number)));
  }, [initialSelectedIds]);

  useEffect(() => {
    if (onChange) onChange(Array.from(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let rows = sites;
    if (term) {
      rows = rows.filter(s => {
        const parts = [s.id, s.name, s.city, s.department_id].map(x => String(x || '').toLowerCase());
        return parts.some(p => p.includes(term));
      });
    }
    const [field, dir] = sort.split(':');
    rows = [...rows].sort((a, b) => {
      const av = (a[field] ?? '').toString().toLowerCase();
      const bv = (b[field] ?? '').toString().toLowerCase();
      if (field === 'id') {
        return (dir === 'asc' ? a.id - b.id : b.id - a.id);
      }
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [sites, q, sort]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(s => next.add(Number(s.id)));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  return (
    <div>
      <div className="flex-row gap-sm" style={{ marginBottom:'8px' }}>
        <input className="input" placeholder="Search id/name/city/department" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="name:asc">Name ↑</option>
          <option value="name:desc">Name ↓</option>
          <option value="city:asc">City ↑</option>
          <option value="city:desc">City ↓</option>
          <option value="id:asc">ID ↑</option>
          <option value="id:desc">ID ↓</option>
        </select>
        <button className="btn" onClick={selectFiltered} disabled={filtered.length === 0}>Select filtered</button>
        <button className="btn btn-secondary" onClick={clearSelection} disabled={selected.size === 0}>Clear</button>
      </div>
      {loading ? (
        <p>Loading sites…</p>
      ) : (
        <div style={{ maxHeight: '260px', overflow: 'auto', border: '1px solid var(--card-border)', borderRadius:'6px' }}>
          <table className="table" style={{ margin:0 }}>
            <thead>
              <tr>
                <th></th>
                <th>ID</th>
                <th  style={{ width:'50%' }}>Name</th>
                <th>City</th>
                <th>Dept</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(Number(s.id))} onChange={() => toggle(Number(s.id))} />
                  </td>
                  <td>{s.id}</td>
                  <td>{s.name}</td>
                  <td>{s.city || ''}</td>
                  <td>{s.department_id || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop:'8px' }}>
        <small>Selected: {selected.size} / {sites.length}</small>
      </div>
    </div>
  );
};

export default SiteMultiSelect;
