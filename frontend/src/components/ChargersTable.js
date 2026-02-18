import React from 'react';

export default function ChargersTable({ chargers = [], onEdit, onDelete, showSite = false }) {
  const formatDate = (d) => {
    if (!d) return '';
    try {
      const s = typeof d === 'object' ? d : new Date(d).toISOString().split('T')[0];
      return s;
    } catch {
      return String(d);
    }
  };
  return (
    <table className="table">
      <thead>
        <tr>
          {showSite && <th>Site</th>}
          <th>Power/Voltage/Amps</th>
          <th>Ports</th>
          <th>Handle</th>
          <th>Manufacturer</th>
          <th>Model #</th>
          <th>Serial #</th>
          <th>Installed</th>
          <th>Project</th>
          <th>Fleet</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {chargers.map(c => (
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
            <td style={{ display: 'flex', gap: '8px' }}>
              <button className="btn" onClick={() => onEdit?.(c)}>Edit</button>
              <button className="btn btn-danger" onClick={() => onDelete?.(c.id)} style={{marginLeft: 8}}>Delete</button>
            </td>
          </tr>
        ))}
        {chargers.length === 0 && (
          <tr><td colSpan={showSite ? 12 : 11} style={{textAlign:'center'}}>No chargers found</td></tr>
        )}
      </tbody>
    </table>
  );
}
