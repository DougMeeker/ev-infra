import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getEquipment, createEquipment, getEquipmentEnergy } from '../api';

// Display year is dynamic based on backend energy summary/items

const EquipmentSection = ({ siteId }) => {
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [displayYear, setDisplayYear] = useState(null);
  const [newEq, setNewEq] = useState({ mc_code: '', equipment_id: '', department_id: '', annual_miles: '', driving_hours: '' });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [total, setTotal] = useState(0);
  const [returned, setReturned] = useState(0);
  // Streamlined: usage and annual/downtime edits moved to Vehicle Details page

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      getEquipment(siteId, { page, perPage }),
      getEquipmentEnergy(siteId)
    ])
      .then(([eqRes, energyRes]) => {
        const data = eqRes.data || { items: [], meta: { total: 0, page: 1, per_page: perPage, returned: 0 } };
        setEquipment(Array.isArray(data.items) ? data.items : []);
        const meta = data.meta || {};
        setTotal(meta.total || 0);
        setReturned(meta.returned || (Array.isArray(data.items) ? data.items.length : 0));
        setPage(meta.page || page);
        setPerPage(meta.per_page || perPage);
        const yr = (energyRes.data && energyRes.data.year) || (Array.isArray(data.items) && data.items.length > 0 && data.items[0].year) || null;
        setDisplayYear(yr);
      })
      .catch(err => console.error('Error loading equipment', err))
      .finally(() => setLoading(false));
  }, [siteId, page, perPage]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleNewEqChange = (e) => setNewEq({ ...newEq, [e.target.name]: e.target.value });

  const handleCreateEquipment = () => {
    if (!newEq.mc_code) { alert('MC code required'); return; }
    const payload = {
      mc_code: newEq.mc_code.trim(),
      equipment_id: newEq.equipment_id ? parseInt(newEq.equipment_id, 10) : undefined,
      department_id: newEq.department_id || undefined,
      annual_miles: newEq.annual_miles ? parseFloat(newEq.annual_miles) : undefined,
      driving_hours: newEq.driving_hours ? parseFloat(newEq.driving_hours) : undefined
    };
    createEquipment(siteId, payload)
      .then(() => { setNewEq({ mc_code: '', equipment_id: '', department_id: '', annual_miles: '', driving_hours: '' }); fetchAll(); })
      .catch(err => { console.error('Failed to create equipment', err); alert('Create failed'); });
  };

  // Streamlined: usage edits handled in Vehicle Details

  return (
    <div style={{ marginTop: '32px' }}>
      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop: 0 }}>Add Equipment</h4>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ width: '120px' }} name="mc_code" placeholder="MC Code" value={newEq.mc_code} onChange={handleNewEqChange} />
          <input className="input" style={{ width: '180px' }} name="equipment_id" placeholder="Identifier" value={newEq.equipment_id} onChange={handleNewEqChange} />
          <input className="input" style={{ width: '140px' }} name="department_id" placeholder="Dept ID" value={newEq.department_id} onChange={handleNewEqChange} />
          <input className="input" style={{ width: '140px' }} name="annual_miles" placeholder="Annual Miles" value={newEq.annual_miles} onChange={handleNewEqChange} />
          <input className="input" style={{ width: '140px' }} name="driving_hours" placeholder="Driving Hrs (annual)" value={newEq.driving_hours} onChange={handleNewEqChange} />
          <button className="btn" onClick={handleCreateEquipment}>Add</button>
        </div>
      </div>

      {/* Pagination controls */}
      <div className="flex-row gap-sm" style={{ alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span>Showing {total === 0 ? 0 : ((page - 1) * perPage + 1)}–{(page - 1) * perPage + returned} of {total}</span>
        <div className="flex-row gap-sm">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
          <button className="btn" disabled={(page * perPage) >= total} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
        <div className="flex-row gap-sm">
          <label>Per page</label>
          <select className="input" value={perPage} onChange={e => { setPage(1); setPerPage(parseInt(e.target.value, 10)); }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
          </select>
        </div>
      </div>

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
              <th style={{ borderBottom: '1px solid #ddd' }}>Miles ({displayYear ?? '—'})</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Energy/mi</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Miles Source</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Daily Avg kWh</th>
              <th style={{ borderBottom: '1px solid #ddd' }} title="Max daily energy in any month (sum across vehicles)">Daily Max kWh <span className="badge">Max</span></th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Avg kW</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map(eq => {
              const milesVal = eq.last_year_miles;
              const editMiles = (milesVal != null && !Number.isNaN(milesVal)) ? Number(milesVal).toLocaleString(undefined) : '';
              return (
                <tr key={eq.id}>
                  <td>{eq.equipment_id ?? '—'}</td>
                  <td>{eq.mc_code}</td>
                  <td>{eq.catalog?.description || '—'}</td>
                  <td>{eq.department_id ?? '—'}</td>
                  <td>{editMiles}</td>
                  <td>{(() => {
                    const cat = eq.catalog?.category;
                    if (!cat) return '—';
                    const epm = cat.energy_per_mile;
                    const mpk = cat.miles_per_kwh;
                    const val = (epm != null && epm > 0) ? epm : (mpk != null && mpk > 0 ? (1/mpk) : null);
                    return val != null ? Number(val).toFixed(3) : '—';
                  })()}</td>
                  <td>{eq.miles_source || '—'}</td>
                  <td>{eq.daily_avg_kwh != null ? eq.daily_avg_kwh.toFixed(2) : '—'}</td>
                  <td title="Maximum daily energy observed across months">{eq.daily_max_kwh != null ? eq.daily_max_kwh.toFixed(2) : '—'}</td>
                  <td>{eq.avg_power_kw != null ? eq.avg_power_kw.toFixed(2) : '—'}</td>
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
