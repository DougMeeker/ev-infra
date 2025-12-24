import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEquipmentDetails, updateEquipmentDetails, getEquipmentUsage, upsertEquipmentUsage, deleteEquipmentItem, getSites, getCatalog } from '../api';

const lastYear = new Date().getFullYear() - 1;

const VehicleDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [sites, setSites] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [editing, setEditing] = useState({ equipment_id: '', site_id: '', mc_code: '', department_id: '', annual_miles: '', downtime_hours: '' });
  const [usage, setUsage] = useState([]);
  const [newUsage, setNewUsage] = useState({ year: String(lastYear), miles: '' });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [vehRes, usageRes, sitesRes, catRes] = await Promise.all([
        getEquipmentDetails(id),
        getEquipmentUsage(id),
        getSites(),
        getCatalog(),
      ]);
      setVehicle(vehRes.data);
      setUsage(usageRes.data || []);
      setSites(sitesRes.data || []);
      setCatalog(catRes.data || []);
      setEditing({
        equipment_id: vehRes.data.equipment_id ?? '',
        site_id: vehRes.data.site_id ?? '',
        mc_code: vehRes.data.mc_code ?? '',
        department_id: vehRes.data.department_id ?? '',
        annual_miles: vehRes.data.annual_miles ?? '',
        downtime_hours: vehRes.data.downtime_hours ?? '',
      });
    } catch (e) {
      console.error('Load vehicle failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const saveMeta = async () => {
    const payload = {
      equipment_id: editing.equipment_id !== '' ? Number(editing.equipment_id) : null,
      site_id: editing.site_id ? Number(editing.site_id) : undefined,
      mc_code: editing.mc_code || undefined,
      department_id: editing.department_id !== '' ? editing.department_id : null,
      annual_miles: editing.annual_miles !== '' ? Number(editing.annual_miles) : null,
      downtime_hours: editing.downtime_hours !== '' ? Number(editing.downtime_hours) : null,
    };
    try {
      await updateEquipmentDetails(Number(id), payload);
      await load();
    } catch (e) {
      alert('Save failed');
    }
  };

  const addUsage = async () => {
    if (!newUsage.year || newUsage.miles === '') { alert('Year and miles required'); return; }
    const yearNum = Number(newUsage.year);
    const milesNum = Number(newUsage.miles);
    if (Number.isNaN(yearNum) || Number.isNaN(milesNum)) { alert('Enter valid numbers'); return; }
    try {
      await upsertEquipmentUsage(Number(id), { year: yearNum, miles: milesNum });
      setNewUsage({ year: String(lastYear), miles: '' });
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
        <button className="btn btn-danger" onClick={deleteVehicle}>Delete Vehicle</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Metadata</h4>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 200 }} placeholder="Identifier" value={editing.equipment_id} onChange={e=>setEditing(prev=>({ ...prev, equipment_id: e.target.value }))} />
          <select className="input" value={editing.site_id} onChange={e=>setEditing(prev=>({ ...prev, site_id: e.target.value }))}>
            {sites.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
          <select className="input" value={editing.mc_code} onChange={e=>setEditing(prev=>({ ...prev, mc_code: e.target.value }))}>
            {catalog.map(c => (<option key={c.mc_code} value={c.mc_code}>{c.mc_code} - {c.description || ''}</option>))}
          </select>
          <input className="input" style={{ width: 140 }} placeholder="Dept ID" value={editing.department_id} onChange={e=>setEditing(prev=>({ ...prev, department_id: e.target.value }))} />
          <input className="input" style={{ width: 140 }} placeholder="Annual Miles" value={editing.annual_miles} onChange={e=>setEditing(prev=>({ ...prev, annual_miles: e.target.value }))} />
          <input className="input" style={{ width: 140 }} placeholder="Downtime Hrs" value={editing.downtime_hours} onChange={e=>setEditing(prev=>({ ...prev, downtime_hours: e.target.value }))} />
          <button className="btn" onClick={saveMeta}>Save</button>
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginTop: 0 }}>Usage History</h4>
        <table className="table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Miles</th>
            </tr>
          </thead>
          <tbody>
            {usage.map(u => (
              <tr key={u.id}>
                <td>{u.year}</td>
                <td>{u.miles ?? '—'}</td>
              </tr>
            ))}
            {usage.length === 0 && (
              <tr><td colSpan={2} className="table-empty">No usage yet</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 90 }} placeholder="Year" value={newUsage.year} onChange={e=>setNewUsage(prev=>({ ...prev, year: e.target.value }))} />
          <input className="input" style={{ width: 140 }} placeholder="Miles" value={newUsage.miles} onChange={e=>setNewUsage(prev=>({ ...prev, miles: e.target.value }))} />
          <button className="btn" onClick={addUsage}>Add/Update Usage</button>
        </div>
      </div>
    </div>
  );
};

export default VehicleDetails;
