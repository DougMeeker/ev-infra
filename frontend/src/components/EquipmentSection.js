import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEquipment, createEquipment, getEquipmentEnergy } from '../api';

const lastYear = new Date().getFullYear() - 1;

const EquipmentSection = ({ siteId }) => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [energySummary, setEnergySummary] = useState(null);
  const [newEq, setNewEq] = useState({ mc_code: '', equipment_identifier: '', department_id: '', annual_miles: '', downtime_hours: '' });
  // Streamlined: usage and annual/downtime edits moved to Vehicle Details page

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      getEquipment(siteId),
      getEquipmentEnergy(siteId)
    ])
      .then(([eqRes, energyRes]) => {
        setEquipment(eqRes.data);
        setEnergySummary(energyRes.data);
      })
      .catch(err => console.error('Error loading equipment', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, [siteId]);

  const handleNewEqChange = (e) => setNewEq({ ...newEq, [e.target.name]: e.target.value });

  const handleCreateEquipment = () => {
    if (!newEq.mc_code) { alert('MC code required'); return; }
    const payload = {
      mc_code: newEq.mc_code.trim(),
      equipment_identifier: newEq.equipment_identifier || undefined,
      department_id: newEq.department_id ? parseInt(newEq.department_id, 10) : undefined,
      annual_miles: newEq.annual_miles ? parseFloat(newEq.annual_miles) : undefined,
      downtime_hours: newEq.downtime_hours ? parseFloat(newEq.downtime_hours) : undefined
    };
    createEquipment(siteId, payload)
      .then(() => { setNewEq({ mc_code: '', equipment_identifier: '', department_id: '', annual_miles: '', downtime_hours: '' }); fetchAll(); })
      .catch(err => { console.error('Failed to create equipment', err); alert('Create failed'); });
  };

  // Streamlined: usage edits handled in Vehicle Details

  return (
    <div style={{ marginTop: '32px' }}>
      <h3>Equipment</h3>
      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop: 0 }}>Add Equipment</h4>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ width: '120px' }} name="mc_code" placeholder="MC Code" value={newEq.mc_code} onChange={handleNewEqChange} />
          <input className="input" style={{ width: '180px' }} name="equipment_identifier" placeholder="Identifier" value={newEq.equipment_identifier} onChange={handleNewEqChange} />
          <input className="input" style={{ width: '140px' }} name="department_id" placeholder="Dept ID" value={newEq.department_id} onChange={handleNewEqChange} />
          <input className="input" style={{ width: '140px' }} name="annual_miles" placeholder="Annual Miles" value={newEq.annual_miles} onChange={handleNewEqChange} />
          <input className="input" style={{ width: '140px' }} name="downtime_hours" placeholder="Downtime Hrs" value={newEq.downtime_hours} onChange={handleNewEqChange} />
          <button className="btn" onClick={handleCreateEquipment}>Add</button>
        </div>
      </div>

      {energySummary && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h4 style={{ marginTop: 0 }}>Last Year Energy Summary ({energySummary.year})</h4>
          <p><strong>Total Miles:</strong> {energySummary.total_miles}</p>
          <p><strong>Total Energy (kWh):</strong> {energySummary.total_energy_kwh}</p>
        </div>
      )}

      {loading ? (
        <p>Loading equipment...</p>
      ) : equipment.length === 0 ? (
        <p>No equipment yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ddd' }}>Identifier</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>MC Code</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Description</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Department</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Miles ({lastYear})</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Energy/mi</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Energy kWh</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Avg kW</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Miles Source</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map(eq => {
              const editMiles = eq.last_year_miles ?? '';
              return (
                <tr key={eq.id}>
                  <td>{eq.equipment_identifier || '—'}</td>
                  <td>{eq.mc_code}</td>
                  <td>{eq.catalog?.description || '—'}</td>
                  <td>{eq.department_id ?? '—'}</td>
                  <td>{editMiles}</td>
                  <td>{eq.catalog?.category?.energy_per_mile != null ? eq.catalog.category.energy_per_mile : '—'}</td>
                  <td>{eq.miles_source || '—'}</td>
                  <td>{eq.last_year_energy_kwh != null ? eq.last_year_energy_kwh.toFixed(2) : '—'}</td>
                  <td>{eq.avg_power_kw != null ? eq.avg_power_kw.toFixed(2) : '—'}</td>
                  <td>{eq.miles_source || '—'}</td>
                  <td>
                    <Link className="btn btn-secondary" to={`/vehicle/${eq.id}`}>Details</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )
      }
    </div>
  )
}
export default EquipmentSection;
