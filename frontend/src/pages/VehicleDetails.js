import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEquipmentDetails, updateEquipmentDetails, getEquipmentUsage, upsertEquipmentUsage, deleteEquipmentItem } from '../api';
import SiteSelector from '../components/SiteSelector';
import { useAuth } from '../AuthProvider';

const lastYear = new Date().getFullYear() - 1;

const VehicleDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, role, district } = useAuth();
  const [vehicle, setVehicle] = useState(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editing, setEditing] = useState({ equipment_id: '', site_id: '', mc_code: '', department_id: '', annual_miles: '', driving_hours: '' });
  const [usage, setUsage] = useState([]);
  const [newUsage, setNewUsage] = useState({ year: String(lastYear), month: '12', miles: '', driving_hours: '', days_utilized: '' });
  const [loadingUsage, setLoadingUsage] = useState(false);

  // admin/hq → always; fom → if vehicle's department district matches their district
  const canEdit = useMemo(() => {
    if (!isAuthenticated || !role) return false;
    if (role === 'admin' || role === 'hq') return true;
    if (role === 'fom') return vehicle?.department_district === district;
    return false;
  }, [isAuthenticated, role, district, vehicle]);

  const load = async () => {
    try {
      const vehRes = await getEquipmentDetails(id);
      setVehicle(vehRes.data);
      setEditing({
        equipment_id: vehRes.data.equipment_id ?? '',
        site_id: vehRes.data.site_id ?? '',
        mc_code: vehRes.data.mc_code ?? '',
        department_id: vehRes.data.department_id ?? '',
        annual_miles: vehRes.data.annual_miles ?? '',
        driving_hours: vehRes.data.driving_hours ?? '',
      });

      // Load usage history separately
      setLoadingUsage(true);
      try {
        const usageRes = await getEquipmentUsage(id);
        setUsage(usageRes.data || []);
      } catch (e) {
        console.error('Load usage failed', e);
      } finally {
        setLoadingUsage(false);
      }
    } catch (e) {
      console.error('Load vehicle failed', e);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const saveMeta = async () => {
    const payload = {
      equipment_id: editing.equipment_id !== '' ? Number(editing.equipment_id) : null,
      site_id: editing.site_id ? Number(editing.site_id) : undefined,
      mc_code: editing.mc_code || undefined,
      department_id: editing.department_id !== '' ? editing.department_id : null,
      annual_miles: editing.annual_miles !== '' ? Number(editing.annual_miles) : null,
      driving_hours: editing.driving_hours !== '' ? Number(editing.driving_hours) : null,
    };
    try {
      await updateEquipmentDetails(Number(id), payload);
      setEditingMeta(false);
      await load();
    } catch (e) {
      alert('Save failed');
    }
  };

  const cancelMeta = () => {
    setEditing({
      equipment_id: vehicle.equipment_id ?? '',
      site_id: vehicle.site_id ?? '',
      mc_code: vehicle.mc_code ?? '',
      department_id: vehicle.department_id ?? '',
      annual_miles: vehicle.annual_miles ?? '',
      driving_hours: vehicle.driving_hours ?? '',
    });
    setEditingMeta(false);
  };

  const addUsage = async () => {
    if (!newUsage.year || !newUsage.month || newUsage.miles === '') { alert('Year, month, and miles required'); return; }
    const yearNum = Number(newUsage.year);
    const monthNum = Number(newUsage.month);
    const milesNum = Number(newUsage.miles);
    const hoursNum = newUsage.driving_hours !== '' ? Number(newUsage.driving_hours) : undefined;
    const daysNum = newUsage.days_utilized !== '' ? Number(newUsage.days_utilized) : undefined;
    if (Number.isNaN(yearNum) || Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12 || Number.isNaN(milesNum)) { alert('Enter valid numbers'); return; }
    try {
      await upsertEquipmentUsage(Number(id), { year: yearNum, month: monthNum, miles: milesNum, driving_hours: hoursNum, days_utilized: daysNum });
      setNewUsage({ year: String(lastYear), month: '12', miles: '', driving_hours: '', days_utilized: '' });
      await load();
    } catch (e) {
      alert('Usage save failed');
    }
  };

  const deleteVehicle = async () => {
    if (!window.confirm('Delete this vehicle?')) return;
    try {
      await deleteEquipmentItem(Number(id));
      navigate('/vehicles');
    } catch (e) {
      alert('Delete failed');
    }
  };

  if (!vehicle) return <div className="container"><p>Loading...</p></div>;

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h2 className="page-header">Vehicle Details</h2>
      <div className="flex-row gap-sm" style={{ marginBottom: 12 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/vehicles')}>Back to Vehicles</button>
        <button className="btn btn-secondary" onClick={() => navigate(`/site/${vehicle.site_id}`)}>Go to Site</button>
        {canEdit && <button className="btn btn-danger" onClick={deleteVehicle}>Delete Vehicle</button>}
      </div>

      {/* Details and Summary side by side */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Details — view/edit toggle */}
        <div className="card" style={{ flex: '1 1 320px', marginBottom: 0 }}>
          <h4 style={{ marginTop: 0 }}>Details</h4>
          {editingMeta ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="form-group">
                  <label>Equipment ID</label>
                  <input className="input" placeholder="Identifier" value={editing.equipment_id} onChange={e => setEditing(prev => ({ ...prev, equipment_id: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>MC Code</label>
                  <input className="input" placeholder="MC Code" value={editing.mc_code} onChange={e => setEditing(prev => ({ ...prev, mc_code: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Department ID</label>
                  <input className="input" placeholder="Department ID" value={editing.department_id} onChange={e => setEditing(prev => ({ ...prev, department_id: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Site Assignment</label>
                  <SiteSelector
                    value={editing.site_id}
                    onChange={(siteId) => setEditing(prev => ({ ...prev, site_id: siteId }))}
                    variant="searchable"
                    placeholder="Search and select site..."
                  />
                </div>
                <div className="form-group">
                  <label>Annual Miles</label>
                  <input className="input" type="number" placeholder="Annual Miles" value={editing.annual_miles} onChange={e => setEditing(prev => ({ ...prev, annual_miles: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Annual Driving Hours</label>
                  <input className="input" type="number" placeholder="Driving Hours" value={editing.driving_hours} onChange={e => setEditing(prev => ({ ...prev, driving_hours: e.target.value }))} />
                </div>
              </div>
              <div className="flex-row gap-sm" style={{ marginTop: 16 }}>
                <button className="btn" onClick={saveMeta}>Save</button>
                <button className="btn btn-secondary" onClick={cancelMeta}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="detail-pairs">
                <div><span>Equipment ID:</span><strong> {vehicle.equipment_id ?? '—'}</strong></div>
                <div><span>MC Code:</span><strong> {vehicle.mc_code || '—'}</strong></div>
                <div><span>Department ID:</span><strong> {vehicle.department_id || '—'}</strong></div>
                <div><span>Site ID:</span><strong> {vehicle.site_id ?? '—'}</strong></div>
                <div><span>Annual Miles (override):</span><strong> {vehicle.annual_miles != null ? Number(vehicle.annual_miles).toLocaleString() : '—'}</strong></div>
                <div><span>Annual Driving Hours:</span><strong> {vehicle.driving_hours != null ? Number(vehicle.driving_hours).toFixed(1) : '—'}</strong></div>
              </div>
              <div style={{ marginTop: 12 }}>
                {canEdit && <button className="btn" onClick={() => setEditingMeta(true)}>Edit</button>}
              </div>
            </>
          )}
        </div>

        {/* Summary — read-only computed metrics */}
        <div className="card" style={{ flex: '1 1 280px', marginBottom: 0 }}>
          <h4 style={{ marginTop: 0 }}>Summary</h4>
          <div className="detail-pairs">
            <div><span>Description:</span><strong> {vehicle.catalog?.description || '—'}</strong></div>
            <div><span>Department:</span><strong> {vehicle.department_id || '—'}</strong></div>
            <div><span>Miles ({vehicle.period_label || '—'}):</span><strong> {vehicle.last_year_miles != null ? Number(vehicle.last_year_miles).toLocaleString() : '—'}</strong></div>
            <div><span>Miles Source:</span><strong> {vehicle.miles_source || '—'}</strong></div>
            <div>
              <span>Energy/mi (kWh):</span>
              <strong> {(() => {
                const cat = vehicle.catalog?.category;
                if (!cat) return '—';
                const val = (cat.energy_per_mile != null && cat.energy_per_mile > 0)
                  ? cat.energy_per_mile
                  : (cat.miles_per_kwh != null && cat.miles_per_kwh > 0 ? 1 / cat.miles_per_kwh : null);
                return val != null ? Number(val).toFixed(3) : '—';
              })()}</strong>
            </div>
            <div><span>Daily Avg kWh:</span><strong> {vehicle.daily_avg_kwh != null ? Number(vehicle.daily_avg_kwh).toFixed(2) : '—'}</strong></div>
            <div><span title="Max daily energy observed in any single month">Daily Max kWh:</span><strong> {vehicle.daily_max_kwh != null ? Number(vehicle.daily_max_kwh).toFixed(2) : '—'}</strong></div>
            <div><span>Avg kW:</span><strong> {vehicle.avg_power_kw != null ? Number(vehicle.avg_power_kw).toFixed(2) : '—'}</strong></div>
          </div>
        </div>

      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Usage History</h4>
        {loadingUsage ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <p>Loading usage history...</p>
          </div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Month</th>
                  <th>Miles</th>
                  <th>Driving Hours</th>
                  <th>Days Utilized</th>
                </tr>
              </thead>
              <tbody>
                {usage.map(u => (
                  <tr key={u.id}>
                    <td>{u.year}</td>
                    <td>{u.month ?? '—'}</td>
                    <td>{u.miles ?? '—'}</td>
                    <td>{(u.driving_hours != null && !Number.isNaN(u.driving_hours)) ? Number(u.driving_hours).toFixed(1) : '—'}</td>
                    <td>{u.days_utilized ?? '—'}</td>
                  </tr>
                ))}
                {usage.length === 0 && (
                  <tr><td colSpan={5} className="table-empty">No usage yet</td></tr>
                )}
              </tbody>
            </table>
            <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
              <input className="input" style={{ width: 90 }} placeholder="Year" value={newUsage.year} onChange={e => setNewUsage(prev => ({ ...prev, year: e.target.value }))} />
              <input className="input" style={{ width: 70 }} placeholder="Month" value={newUsage.month} onChange={e => setNewUsage(prev => ({ ...prev, month: e.target.value }))} />
              <input className="input" style={{ width: 120 }} placeholder="Miles" value={newUsage.miles} onChange={e => setNewUsage(prev => ({ ...prev, miles: e.target.value }))} />
              <input className="input" style={{ width: 160 }} placeholder="Driving Hours" value={newUsage.driving_hours} onChange={e => setNewUsage(prev => ({ ...prev, driving_hours: e.target.value }))} />
              <input className="input" style={{ width: 140 }} placeholder="Days Utilized" value={newUsage.days_utilized} onChange={e => setNewUsage(prev => ({ ...prev, days_utilized: e.target.value }))} />
              <button className="btn" onClick={addUsage}>Add/Update Usage</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VehicleDetails;
