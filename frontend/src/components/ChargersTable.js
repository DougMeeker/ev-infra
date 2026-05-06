import React, { useState } from 'react';

const thStyle = (active) => ({
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  color: active ? 'var(--primary, #2563eb)' : undefined,
});

const indicator = (col, sortCol, sortDir) => {
  if (sortCol !== col) return ' ↕';
  return sortDir === 'asc' ? ' ↑' : ' ↓';
};

export default function ChargersTable({ chargers = [], onEdit, onDelete, showSite = false, canEdit = false }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const formatDate = (d) => {
    if (!d) return '';
    try {
      const s = typeof d === 'object' ? d : new Date(d).toISOString().split('T')[0];
      return s;
    } catch {
      return String(d);
    }
  };

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const getSortValue = (c, col) => {
    switch (col) {
      case 'kw':          return c.kw ?? -Infinity;
      case 'port_count':  return c.port_count ?? -Infinity;
      case 'handle_type': return (c.handle_type ?? '').toLowerCase();
      case 'manufacturer':return (c.manufacturer ?? '').toLowerCase();
      case 'model_number':return (c.model_number ?? '').toLowerCase();
      case 'serial_number': return (c.serial_number ?? '').toLowerCase();
      case 'date_installed': return c.date_installed ?? '';
      case 'project_name': return (c.project_name ?? '').toLowerCase();
      case 'fleet':       return c.fleet ? 1 : 0;
      case 'description': return (c.description ?? '').toLowerCase();
      case 'site_name':   return (c.site_name ?? '').toLowerCase();
      default:            return '';
    }
  };

  const sorted = sortCol
    ? [...chargers].sort((a, b) => {
        const av = getSortValue(a, sortCol);
        const bv = getSortValue(b, sortCol);
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      })
    : chargers;

  const Th = ({ col, children }) => (
    <th style={thStyle(sortCol === col)} onClick={() => handleSort(col)}>
      {children}{indicator(col, sortCol, sortDir)}
    </th>
  );

  return (
    <table className="table">
      <thead>
        <tr>
          {showSite && <Th col="site_name">Site</Th>}
          <Th col="kw">Power/Voltage/CP</Th>
          <Th col="port_count">Ports</Th>
          <Th col="handle_type">Handle</Th>
          <Th col="manufacturer">Manufacturer</Th>
          <Th col="model_number">Model #</Th>
          <Th col="serial_number">Serial #</Th>
          <Th col="date_installed">Installed</Th>
          <Th col="project_name">Project</Th>
          <Th col="fleet">Fleet</Th>
          <Th col="description">Description</Th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(c => (
          <tr key={c.id}>
            {showSite && <td>{c.site_name ?? ''}</td>}
            <td>{[c.kw ? `${c.kw} kW` : null, c.input_voltage ? `${c.input_voltage} V` : null, c.breaker_size ? `${c.breaker_size} A` : null].filter(Boolean).join(' / ')}</td>
            <td>{c.port_count ?? ''}</td>
            <td>{c.handle_type ?? ''}</td>
            <td>{c.manufacturer ?? ''}</td>
            <td>{c.model_number ?? ''}</td>
            <td>{c.serial_number ?? ''}</td>
            <td>{formatDate(c.date_installed)}</td>
            <td>{c.project_name ?? ''}</td>
            <td>{c.fleet ? '✓' : ''}</td>
            <td>{c.description ?? ''}</td>
            <td style={{ display: 'flex', gap: '8px' }}>
              {canEdit && <button className="btn" onClick={() => onEdit?.(c)}>Edit</button>}
              {canEdit && <button className="btn btn-danger" onClick={() => onDelete?.(c.id)} style={{marginLeft: 8}}>Delete</button>}
            </td>
          </tr>
        ))}
        {chargers.length === 0 && (
          <tr><td colSpan={showSite ? 13 : 12} style={{textAlign:'center'}}>No chargers found</td></tr>
        )}
      </tbody>
    </table>
  );
}
