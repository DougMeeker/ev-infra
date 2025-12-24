import React, { useEffect, useState } from 'react';
import { getChargers, getProjects, createCharger, updateCharger, deleteCharger } from '../api';
import { Link, NavLink } from "react-router-dom";

const formatDate = (d) => {
  if (!d) return '';
  try {
    const s = typeof d === 'date' ? d : new Date(d).toISOString().split('T')[0];
    return s;
  } catch {
    return String(d);
  }
};

export default function ChargersSection({ siteId }) {
  const [chargers, setChargers] = useState([]);
  const [chargersLoading, setChargersLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [editingChargerId, setEditingChargerId] = useState(null);
  const [chargerEdit, setChargerEdit] = useState({});
  const [adding, setAdding] = useState(false);
  const [chargerNew, setChargerNew] = useState({ kw: '', manufacturer: '', project_id: '', date_installed: '' });

  const load = async () => {
    setChargersLoading(true);
    try {
      const [chRes, prRes] = await Promise.all([
        getChargers(siteId),
        getProjects(),
      ]);
      setChargers(chRes.data || []);
      setProjects(prRes.data || []);
    } finally {
      setChargersLoading(false);
    }
  };

  useEffect(() => { load(); }, [siteId]);

  return (
    <div className="card">
      {chargersLoading ? (
        <div>
          <div className="skeleton sk-line" style={{ width: '40%', marginBottom: 8 }} />
          <div className="skeleton sk-line" style={{ width: '60%', marginBottom: 8 }} />
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:'16px', flexWrap:'wrap', marginBottom:12 }}>
            {(() => {
              const total = chargers.reduce((sum, c) => sum + (typeof c.kw === 'number' ? c.kw : 0), 0);
              const installed = chargers.reduce((sum, c) => sum + (c.date_installed ? (typeof c.kw === 'number' ? c.kw : 0) : 0), 0);
              return (
                <>
                  <div><strong>Total Charger kW (planned):</strong> {Math.round(total * 1000) / 1000}</div>
                  <div><strong>Installed Charger kW:</strong> {Math.round(installed * 1000) / 1000}</div>
                </>
              )
            })()}
          </div>
          <div style={{marginBottom:12}}>
            {adding ? (
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                <input className="input" style={{width:90}} placeholder="kW" value={chargerNew.kw} onChange={e=>setChargerNew(prev=>({ ...prev, kw: e.target.value }))} />
                <select className="input" value={chargerNew.manufacturer} onChange={e=>setChargerNew(prev=>({ ...prev, manufacturer: e.target.value }))}>
                  <option value="">Manufacturer</option>
                  {['KemPower','ABB','ChargePoint','Enphase/Clipper Creek','XOS','ChargePodX','BTC','Other'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select className="input" value={chargerNew.project_id} onChange={e=>setChargerNew(prev=>({ ...prev, project_id: e.target.value }))}>
                  <option value="">Project</option>
                  {projects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
                <input className="input" type="date" value={chargerNew.date_installed} onChange={e=>setChargerNew(prev=>({ ...prev, date_installed: e.target.value }))} />
                <button className="btn" onClick={async ()=>{
                  const payload = { ...chargerNew };
                  if (payload.kw === '') payload.kw = null; else { const n = parseFloat(payload.kw); if (!Number.isNaN(n)) payload.kw = n; }
                  if (payload.project_id === '') payload.project_id = null; else { const n = parseInt(payload.project_id,10); if (!Number.isNaN(n)) payload.project_id = n; }
                  await createCharger(siteId, payload);
                  setAdding(false); setChargerNew({ kw: '', manufacturer: '', project_id: '', date_installed: '' });
                  const res = await getChargers(siteId);
                  setChargers(res.data || []);
                }}>Add Charger</button>
                <button className="btn btn-secondary" onClick={()=>{ setAdding(false); setChargerNew({ kw: '', manufacturer: '', project_id: '', date_installed: '' }); }}>Cancel</button>
              </div>
            ) : (
              <button className="btn" onClick={()=>setAdding(true)}>Add Charger</button>
            )}
          </div>
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
                <th>Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              {chargers.map(c => (
                <tr key={c.id}>
                  <td><Link to={`/chargers/?siteId=${c.site_id}`}>{[c.kw ? `${c.kw} kW` : null, c.input_voltage ? `${c.input_voltage} V` : null, c.breaker_size ? `${c.breaker_size} A` : null].filter(Boolean).join(' / ')}</Link></td>
                  <td>{c.port_count ?? ''}</td>
                  <td>{c.handle_type ?? ''}</td>
                  <td>{c.manufacturer ?? ''}</td>
                  <td>{c.model_number ?? ''}</td>
                  <td>{c.serial_number ?? ''}</td>
                  <td>{formatDate(c.date_installed)}</td>
                  <td>{c.project_name ?? ''}</td>
                  <td>
                    {editingChargerId === c.id ? (
                      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                        <input className="input" style={{width:90}} placeholder="kW" value={chargerEdit.kw ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, kw: e.target.value }))} />
                        <select className="input" value={chargerEdit.manufacturer ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, manufacturer: e.target.value }))}>
                          <option value="">Manufacturer</option>
                          {['KemPower','ABB','ChargePoint','Enphase/Clipper Creek','XOS','ChargePodX','BTC','Other'].map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select className="input" value={chargerEdit.project_id ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, project_id: e.target.value }))}>
                          <option value="">Project</option>
                          {projects.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                        <input className="input" type="date" value={chargerEdit.date_installed ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, date_installed: e.target.value }))} />
                        <button className="btn" onClick={async ()=>{
                          const payload = { ...chargerEdit };
                          if (payload.kw === '') payload.kw = null; else if (payload.kw != null) { const n = parseFloat(payload.kw); if (!Number.isNaN(n)) payload.kw = n; }
                          if (payload.project_id === '') payload.project_id = null; else if (payload.project_id != null) { const n = parseInt(payload.project_id,10); if (!Number.isNaN(n)) payload.project_id = n; }
                          await updateCharger(c.id, payload);
                          setEditingChargerId(null);
                          const res = await getChargers(siteId);
                          setChargers(res.data || []);
                        }}>Save</button>
                        <button className="btn" onClick={async ()=>{
                          // Save current edits and prefill add form for quick duplication
                          const payload = { ...chargerEdit };
                          if (payload.kw === '') payload.kw = null; else if (payload.kw != null) { const n = parseFloat(payload.kw); if (!Number.isNaN(n)) payload.kw = n; }
                          if (payload.project_id === '') payload.project_id = null; else if (payload.project_id != null) { const n = parseInt(payload.project_id,10); if (!Number.isNaN(n)) payload.project_id = n; }
                          await updateCharger(c.id, payload);
                          // Prefill add form with the edited values to enter several chargers quickly
                          setAdding(true);
                          setChargerNew({
                            kw: payload.kw ?? '',
                            manufacturer: payload.manufacturer ?? '',
                            project_id: payload.project_id ?? '',
                            date_installed: formatDate(payload.date_installed)
                          });
                          setEditingChargerId(null);
                        }}>Duplicate</button>
                        <button className="btn btn-secondary" onClick={()=>{ setEditingChargerId(null); setChargerEdit({}); }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{display:'flex', gap:8}}>
                        <button className="btn btn-secondary" onClick={()=>{ setEditingChargerId(c.id); setChargerEdit({ kw: c.kw ?? '', manufacturer: c.manufacturer ?? '', project_id: c.project_id ?? '', date_installed: formatDate(c.date_installed) }); }}>Edit</button>
                        <button className="btn btn-danger" onClick={async ()=>{ if (!window.confirm('Delete this charger?')) return; await deleteCharger(c.id); const res = await getChargers(siteId); setChargers(res.data || []); }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {chargers.length === 0 && (
                <tr><td colSpan={9} className="table-empty">No chargers</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
