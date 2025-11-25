import React, { useEffect, useState } from 'react';
import { getEquipment, createEquipment, upsertEquipmentUsage, getEquipmentEnergy, updateEquipmentDetails } from '../api';

const lastYear = new Date().getFullYear() - 1;

const EquipmentSection = ({ siteId }) => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [energySummary, setEnergySummary] = useState(null);
  const [newEq, setNewEq] = useState({ mc_code: '', equipment_identifier: '', department_id: '', annual_miles: '', downtime_hours: '' });
  const [editingAnnual, setEditingAnnual] = useState({}); // equipmentId -> temp annual miles
  const [editingDowntime, setEditingDowntime] = useState({}); // equipmentId -> temp downtime hours
  const [usageEdits, setUsageEdits] = useState({}); // equipmentId -> { miles }
  const [savingUsageId, setSavingUsageId] = useState(null);

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

  const handleUsageChange = (equipmentId, value) => {
    setUsageEdits({ ...usageEdits, [equipmentId]: { miles: value } });
  };

  const saveUsage = (equipmentId) => {
    const milesVal = usageEdits[equipmentId]?.miles;
    if (milesVal === undefined || milesVal === '') { alert('Enter miles'); return; }
    const milesNum = parseFloat(milesVal);
    if (Number.isNaN(milesNum)) { alert('Miles must be numeric'); return; }
    setSavingUsageId(equipmentId);
    upsertEquipmentUsage(equipmentId, { year: lastYear, miles: milesNum })
      .then(() => { fetchAll(); setUsageEdits(prev => ({ ...prev, [equipmentId]: undefined })); })
      .catch(err => { console.error('Failed to save usage', err); alert('Save failed'); })
      .finally(() => setSavingUsageId(null));
  };

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
              <th style={{ borderBottom: '1px solid #ddd' }}>Dept</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Miles ({lastYear})</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Energy/mi</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Energy kWh</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Avg kW</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Annual Miles</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Downtime Hrs</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map(eq => {
              const editMiles = usageEdits[eq.id]?.miles ?? (eq.last_year_miles ?? '');
              const annualTemp = editingAnnual[eq.id] !== undefined ? editingAnnual[eq.id] : (eq.annual_miles ?? '');
              const downtimeTemp = editingDowntime[eq.id] !== undefined ? editingDowntime[eq.id] : (eq.downtime_hours ?? '');
              return (
                <tr key={eq.id}>
                  <td>{eq.equipment_identifier || '—'}</td>
                  <td>{eq.mc_code}</td>
                  <td>{eq.catalog?.description || '—'}</td>
                  <td>{eq.department_id ?? '—'}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: '90px' }}
                      value={editMiles}
                      onChange={(e) => handleUsageChange(eq.id, e.target.value)}
                    />
                  </td>
                  <td>{eq.catalog?.energy_per_mile != null ? eq.catalog.energy_per_mile : '—'}</td>
                  <td>{eq.last_year_energy_kwh != null ? eq.last_year_energy_kwh.toFixed(2) : '—'}</td>
                  <td>{eq.avg_power_kw != null ? eq.avg_power_kw.toFixed(2) : '—'}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: '110px' }}
                      value={annualTemp}
                      onChange={(e) => setEditingAnnual(prev => ({ ...prev, [eq.id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ width: '100px' }}
                      value={downtimeTemp}
                      onChange={(e) => setEditingDowntime(prev => ({ ...prev, [eq.id]: e.target.value }))}
                    />
                  </td>
                  <td>
                    <button
                      className="btn"
                      disabled={savingUsageId === eq.id}
                      onClick={() => saveUsage(eq.id)}
                    >{savingUsageId === eq.id ? 'Saving...' : 'Save Miles'}</button>
                    <button
                      className="btn btn-secondary"
                      style={{ marginLeft: '4px' }}
                      onClick={() => {
                        const annualMilesVal = editingAnnual[eq.id];
                        const downtimeVal = editingDowntime[eq.id];
                        const payload = {};
                        if (annualMilesVal !== undefined && annualMilesVal !== '') {
                          const num = parseFloat(annualMilesVal);
                          if (!Number.isNaN(num)) payload.annual_miles = num;
                        } else payload.annual_miles = null;
                        if (downtimeVal !== undefined && downtimeVal !== '') {
                          const num = parseFloat(downtimeVal);
                          if (!Number.isNaN(num)) payload.downtime_hours = num;
                        } else payload.downtime_hours = null;
                        updateEquipmentDetails(eq.id, payload)
                          .then(() => { fetchAll(); })
                          .catch(err => { console.error('Failed to save annual/downtime', err); alert('Save failed'); });
                      }}
                    >Save Annual/Downtime</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default EquipmentSection;
