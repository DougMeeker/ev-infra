import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from "react-router-dom";
import { getChargers, getProjects, createCharger, updateCharger, deleteCharger } from '../api';
import { Link } from "react-router-dom";

const formatDate = (d) => {
  if (!d) return '';
  try {
    const s = typeof d === 'object' ? d : new Date(d).toISOString().split('T')[0];
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
  const [chargerNew, setChargerNew] = useState({ kw: '', port_count: '', handle_type: '', manufacturer: '', model_number: '', project_id: '', date_installed: '', description: '' });
  const navigate = useNavigate();

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <input className="input" style={{width:70}} placeholder="Ports" value={chargerNew.port_count} onChange={e=>setChargerNew(prev=>({ ...prev, port_count: e.target.value }))} />
                <select className="input" value={chargerNew.handle_type} onChange={e=>setChargerNew(prev=>({ ...prev, handle_type: e.target.value }))}>
                  <option value="">Handle Type</option>
                  {['J1772','NACS','CCS1','Both DC'].map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <select className="input" value={chargerNew.manufacturer} onChange={e=>setChargerNew(prev=>({ ...prev, manufacturer: e.target.value }))}>
                  <option value="">Manufacturer</option>
                  {['KemPower','ABB','ChargePoint','Enphase/Clipper Creek','XOS','ChargePodX','BTC','Other'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select className="input" value={chargerNew.project_id} onChange={e=>setChargerNew(prev=>({ ...prev, project_id: e.target.value }))}>
                  <option value="">Project</option>
                  {(Array.isArray(projects) ? projects : []).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
                <input className="input" placeholder="Model #" value={chargerNew.model_number} onChange={e=>setChargerNew(prev=>({ ...prev, model_number: e.target.value }))} />
                <input className="input" type="date" value={chargerNew.date_installed} onChange={e=>setChargerNew(prev=>({ ...prev, date_installed: e.target.value }))} />
                <input className="input" placeholder="Description" value={chargerNew.description} onChange={e=>setChargerNew(prev=>({ ...prev, description: e.target.value }))} />
                <button className="btn" onClick={async ()=>{
                  const payload = { ...chargerNew };
                  if (payload.kw === '') payload.kw = null; else { const n = parseFloat(payload.kw); if (!Number.isNaN(n)) payload.kw = n; }
                  if (payload.port_count === '') payload.port_count = null; else { const n = parseInt(payload.port_count,10); if (!Number.isNaN(n)) payload.port_count = n; }
                  if (payload.handle_type === '') payload.handle_type = null;
                  if (payload.model_number === '') payload.model_number = null;
                  if (payload.project_id === '') payload.project_id = null; else { const n = parseInt(payload.project_id,10); if (!Number.isNaN(n)) payload.project_id = n; }
                  await createCharger(siteId, payload);
                  setAdding(false); setChargerNew({ kw: '', port_count: '', handle_type: '', manufacturer: '', model_number: '', project_id: '', date_installed: '', description: '' });
                  const res = await getChargers(siteId);
                  setChargers(res.data || []);
                }}>Add Charger</button>
                <button className="btn btn-secondary" onClick={()=>{ setAdding(false); setChargerNew({ kw: '', port_count: '', handle_type: '', manufacturer: '', model_number: '', project_id: '', date_installed: '', description: '' }); }}>Cancel</button>
              </div>
            ) : (
            <div className="flex-row gap-sm" style={{ marginBottom: '12px' }}>
                <button className="btn" onClick={()=>setAdding(true)}>Add Charger</button>
                <button className="btn" onClick={() => navigate(`/chargers?siteId=${siteId}`)}>Manage Chargers</button>
            </div>
)}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Power/Voltage/CB</th>
                <th>Ports</th>
                <th>Handle</th>
                <th>Manufacturer</th>
                <th>Model #</th>
                <th>Serial #</th>
                <th>Installed</th>
                <th>Project</th>
                <th>Fleet</th>
                <th>Description</th>
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
                  <td>{c.fleet ? '✓' : ''}</td>
                  <td>{c.description ?? ''}</td>
                  <td>
                    {editingChargerId === c.id ? (
                      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                        <input className="input" style={{width:90}} placeholder="kW" value={chargerEdit.kw ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, kw: e.target.value }))} />
                        <input className="input" style={{width:70}} placeholder="Ports" value={chargerEdit.port_count ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, port_count: e.target.value }))} />
                        <select className="input" value={chargerEdit.handle_type ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, handle_type: e.target.value }))}>
                          <option value="">Handle Type</option>
                          {['J1772','NACS','CCS1','Both DC'].map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <select className="input" value={chargerEdit.manufacturer ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, manufacturer: e.target.value }))}>
                          <option value="">Manufacturer</option>
                          {['KemPower','ABB','ChargePoint','Enphase/Clipper Creek','XOS','ChargePodX','BTC','Other'].map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select className="input" value={chargerEdit.project_id ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, project_id: e.target.value }))}>
                          <option value="">Project</option>
                          {(Array.isArray(projects) ? projects : []).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                        <input className="input" placeholder="Model #" value={chargerEdit.model_number ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, model_number: e.target.value }))} />
                        <input className="input" type="date" value={chargerEdit.date_installed ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, date_installed: e.target.value }))} />
                        <input className="input" placeholder="Description" value={chargerEdit.description ?? ''} onChange={e=>setChargerEdit(prev=>({ ...prev, description: e.target.value }))} />
                        <button className="btn" onClick={async ()=>{
                          const payload = { ...chargerEdit };
                          if (payload.kw === '') payload.kw = null; else if (payload.kw != null) { const n = parseFloat(payload.kw); if (!Number.isNaN(n)) payload.kw = n; }
                          if (payload.port_count === '' || payload.port_count == null) payload.port_count = null; else { const n = parseInt(payload.port_count,10); if (!Number.isNaN(n)) payload.port_count = n; }
                          if (payload.handle_type === '') payload.handle_type = null;
                          if (payload.model_number === '') payload.model_number = null;
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
                          if (payload.port_count === '' || payload.port_count == null) payload.port_count = null; else { const n = parseInt(payload.port_count,10); if (!Number.isNaN(n)) payload.port_count = n; }
                          if (payload.handle_type === '') payload.handle_type = null;
                          if (payload.model_number === '') payload.model_number = null;
                          if (payload.project_id === '') payload.project_id = null; else if (payload.project_id != null) { const n = parseInt(payload.project_id,10); if (!Number.isNaN(n)) payload.project_id = n; }
                          await updateCharger(c.id, payload);
                          // Prefill add form with the edited values to enter several chargers quickly
                          setAdding(true);
                          setChargerNew({
                            kw: payload.kw ?? '',
                            port_count: payload.port_count ?? '',
                            handle_type: payload.handle_type ?? '',
                            manufacturer: payload.manufacturer ?? '',
                            model_number: payload.model_number ?? '',
                            project_id: payload.project_id ?? '',
                            date_installed: formatDate(payload.date_installed),
                            description: payload.description ?? ''
                          });
                          setEditingChargerId(null);
                        }}>Duplicate</button>
                        <button className="btn btn-secondary" onClick={()=>{ setEditingChargerId(null); setChargerEdit({}); }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{display:'flex', gap:8}}>
                        <button className="btn btn-secondary" onClick={()=>{ setEditingChargerId(c.id); setChargerEdit({ kw: c.kw ?? '', port_count: c.port_count ?? '', handle_type: c.handle_type ?? '', manufacturer: c.manufacturer ?? '', model_number: c.model_number ?? '', project_id: c.project_id ?? '', date_installed: formatDate(c.date_installed), description: c.description ?? '' }); }}>Edit</button>
                        <button className="btn btn-danger" onClick={async ()=>{ if (!window.confirm('Delete this charger?')) return; await deleteCharger(c.id); const res = await getChargers(siteId); setChargers(res.data || []); }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {chargers.length === 0 && (
                <tr><td colSpan={10} className="table-empty">No chargers</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
