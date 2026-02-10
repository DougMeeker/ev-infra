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
    const [editing, setEditing] = useState({ equipment_id: '', site_id: '', mc_code: '', department_id: '', annual_miles: '', driving_hours: '' });
  const [usage, setUsage] = useState([]);
  const [newUsage, setNewUsage] = useState({ year: String(lastYear), month: '12', miles: '', driving_hours: '', days_utilized: '' });
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [siteFilter, setSiteFilter] = useState('');
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);

  const load = async () => {
    try {
      // Load metadata and reference data immediately
      const [vehRes, sitesRes, catRes] = await Promise.all([
        getEquipmentDetails(id),
        getSites(),
        getCatalog(),
      ]);
      setVehicle(vehRes.data);
      setSites(sitesRes.data || []);
      setCatalog(catRes.data || []);
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

  useEffect(() => { load(); }, [id, load]);

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
      await load();
    } catch (e) {
      alert('Save failed');
    }
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

  // Sort sites alphabetically by name
  const sortedSites = [...sites].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  
  // Filter sites based on search
  const filteredSites = sortedSites.filter(s => 
    (s.name || '').toLowerCase().includes(siteFilter.toLowerCase()) ||
    String(s.id).includes(siteFilter)
  );
  
  const selectedSite = sites.find(s => s.id === Number(editing.site_id));
  const selectedSiteName = selectedSite ? selectedSite.name : '';

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div className="form-group">
            <label>Equipment ID</label>
            <input className="input" placeholder="Identifier" value={editing.equipment_id} onChange={e=>setEditing(prev=>({ ...prev, equipment_id: e.target.value }))} />
          </div>
          
          {/* Searchable Site Dropdown */}
          <div className="form-group">
            <label>Site Assignment</label>
            <div style={{ position: 'relative' }}>
            <input 
              className="input" 
              placeholder="Search and select site..." 
              value={showSiteDropdown ? siteFilter : selectedSiteName}
              onChange={e => {
                setSiteFilter(e.target.value);
                setShowSiteDropdown(true);
              }}
              onFocus={() => {
                setSiteFilter('');
                setShowSiteDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowSiteDropdown(false), 200)}
            />
            {showSiteDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                maxHeight: 300,
                overflowY: 'auto',
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                zIndex: 1000
              }}>
                {filteredSites.length === 0 ? (
                  <div style={{ padding: '8px 12px', color: '#999' }}>No sites found</div>
                ) : (
                  filteredSites.map(s => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setEditing(prev => ({ ...prev, site_id: s.id }));
                        setSiteFilter('');
                        setShowSiteDropdown(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        backgroundColor: Number(editing.site_id) === s.id ? '#e3f2fd' : 'white',
                        borderBottom: '1px solid #f0f0f0'
                      }}
                      onMouseEnter={e => e.target.style.backgroundColor = '#f5f5f5'}
                      onMouseLeave={e => e.target.style.backgroundColor = Number(editing.site_id) === s.id ? '#e3f2fd' : 'white'}
                    >
                      {s.name}
                    </div>
                  ))
                )}
              </div>
            )}
            </div>
          </div>
          
          <div className="form-group">
            <label>MC Code</label>
            <select className="input" value={editing.mc_code} onChange={e=>setEditing(prev=>({ ...prev, mc_code: e.target.value }))}>
              {catalog.map(c => (<option key={c.mc_code} value={c.mc_code}>{c.mc_code} - {c.description || ''}</option>))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Department ID</label>
            <input className="input" placeholder="Dept ID" value={editing.department_id} onChange={e=>setEditing(prev=>({ ...prev, department_id: e.target.value }))} />
          </div>
          
          <div className="form-group">
            <label>Annual Miles</label>
            <input className="input" type="number" placeholder="Annual Miles" value={editing.annual_miles} onChange={e=>setEditing(prev=>({ ...prev, annual_miles: e.target.value }))} />
          </div>
          
          <div className="form-group">
            <label>Annual Driving Hours</label>
            <input className="input" type="number" placeholder="Driving Hours" value={editing.driving_hours} onChange={e=>setEditing(prev=>({ ...prev, driving_hours: e.target.value }))} />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={saveMeta}>Save Metadata</button>
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
              <tr><td colSpan={4} className="table-empty">No usage yet</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 90 }} placeholder="Year" value={newUsage.year} onChange={e=>setNewUsage(prev=>({ ...prev, year: e.target.value }))} />
          <input className="input" style={{ width: 70 }} placeholder="Month" value={newUsage.month} onChange={e=>setNewUsage(prev=>({ ...prev, month: e.target.value }))} />
          <input className="input" style={{ width: 120 }} placeholder="Miles" value={newUsage.miles} onChange={e=>setNewUsage(prev=>({ ...prev, miles: e.target.value }))} />
          <input className="input" style={{ width: 160 }} placeholder="Driving Hours" value={newUsage.driving_hours} onChange={e=>setNewUsage(prev=>({ ...prev, driving_hours: e.target.value }))} />
          <input className="input" style={{ width: 140 }} placeholder="Days Utilized" value={newUsage.days_utilized} onChange={e=>setNewUsage(prev=>({ ...prev, days_utilized: e.target.value }))} />
          <button className="btn" onClick={addUsage}>Add/Update Usage</button>
        </div>        </>
        )}      </div>
    </div>
  );
};

export default VehicleDetails;
