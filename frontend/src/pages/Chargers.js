import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getChargers, createCharger, updateCharger, deleteCharger, getProjects } from '../api';
import ChargersTable from '../components/ChargersTable';
import ChargerForm from '../components/ChargerForm';
import SiteSelector from '../components/SiteSelector';

const formatDate = (d) => {
    if (!d) return '';
    try {
      const s = typeof d === 'object' ? d : new Date(d).toISOString().split('T')[0];
      return s;
    } catch {
      return String(d);
    }
  };

export default function Chargers() {
  const navigate = useNavigate();
  const [siteId, setSiteId] = useState(null);
  const [chargers, setChargers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    getProjects()
      .then(res => setProjects(res.data || []))
      .catch(() => setProjects([]));
  }, []);

  // Initialize site from query param, e.g., /chargers?siteId=123
  useEffect(() => {
    const sid = searchParams.get('siteId');
    if (sid) {
      const num = parseInt(sid, 10);
      if (!Number.isNaN(num)) setSiteId(num);
    }
  }, [searchParams]);

  // Load chargers (all or filtered by site)
  useEffect(() => {
    setLoading(true);
    getChargers(siteId)
      .then(res => setChargers(res.data || []))
      .catch(() => setChargers([]))
      .finally(() => setLoading(false));
  }, [siteId]);

  const handleSiteChange = (newSiteId) => {
    setSiteId(newSiteId);
    if (newSiteId) {
      navigate(`/chargers?siteId=${newSiteId}`);
    } else {
      navigate('/chargers');
    }
  };

  const onSubmit = async (payload) => {
    if (!siteId) return;
    if (editing && editing.id) {
      await updateCharger(editing.id, payload);
    } else {
      await createCharger(siteId, payload);
    }
    setEditing(null);
    const res = await getChargers(siteId);
    setChargers(res.data || []);
  };

  const onDelete = async (id) => {
    await deleteCharger(id);
    const res = await getChargers(siteId);
    setChargers(res.data || []);
  };

  return (
    <div className="container">
      <h2 className="page-header">Chargers</h2>
      
      <div className="flex-row gap-sm" style={{ marginBottom: '16px' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Home</button>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', minWidth: '250px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '0.9rem' }}>
              Filter by Site:
            </label>
            <SiteSelector 
              value={siteId} 
              onChange={handleSiteChange}
              variant="searchable"
              placeholder="All sites (or search to filter)..."
            />
          </div>
          <button 
            className="btn" 
            onClick={() => setEditing({})} 
            disabled={!siteId}
            style={{ marginBottom: '2px' }}
          >
            Add Charger
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginBottom: '16px' }}>
          <ChargerForm 
            initial={editing} 
            onCancel={() => setEditing(null)} 
            onSubmit={onSubmit} 
            projects={projects} 
          />
        </div>
      )}
      
      {loading ? (
        <div className="card">
          <p>Loading chargers...</p>
        </div>
      ) : (
        <ChargersTable
          chargers={chargers}
          onEdit={(c) => setEditing({ ...c, date_installed: formatDate(c.date_installed) })}
          onDelete={onDelete}
          showSite={!siteId}
        />
      )}
    </div>
  );
}
