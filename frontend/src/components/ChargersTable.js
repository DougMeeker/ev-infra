import React from 'react';

export default function ChargersTable({ chargers = [], onEdit, onDelete }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Power/Voltage/Amps</th>
          <th>Ports</th>
          <th>Handle</th>
          <th>Manufacturer</th>
          <th>Model #</th>
          <th>Serial #</th>
          <th>Installed</th>
          <th>Project</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {chargers.map(c => (
          <tr key={c.id}>
            <td>{[c.kw ? `${c.kw} kW` : null, c.input_voltage ? `${c.input_voltage} V` : null, c.breaker_size ? `${c.breaker_size} A` : null].filter(Boolean).join(' / ')}</td>
            <td>{c.port_count ?? ''}</td>
            <td>{c.handle_type ?? ''}</td>
            <td>{c.manufacturer ?? ''}</td>
            <td>{c.model_number ?? ''}</td>
            <td>{c.serial_number ?? ''}</td>
            <td>{c.date_installed ?? ''}</td>
            <td>{c.project_name ?? ''}</td>
            <td>
              <button onClick={() => onEdit?.(c)}>Edit</button>
              <button onClick={() => onDelete?.(c.id)} style={{marginLeft: 8}}>Delete</button>
            </td>
          </tr>
        ))}
        {chargers.length === 0 && (
          <tr><td colSpan={12} style={{textAlign:'center'}}>No chargers added</td></tr>
        )}
      </tbody>
    </table>
  );
}
