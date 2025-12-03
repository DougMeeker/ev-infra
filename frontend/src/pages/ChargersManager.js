import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getSites, getChargers, createCharger, updateCharger, deleteCharger, getProjects } from '../api';
import ChargersTable from '../components/ChargersTable';
import ChargerForm from '../components/ChargerForm';

export default function ChargersManager() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(null);
  const [chargers, setChargers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    getSites()
      .then(res => {
        const list = res.data || [];
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setSites(list);
      })
      .catch(() => setSites([]));
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

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    getChargers(siteId).then(res => setChargers(res.data || [])).catch(() => setChargers([])).finally(()=>setLoading(false));
  }, [siteId]);

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
    <div style={{padding:16}}>
      <h2>Chargers</h2>
      <div style={{marginBottom:12}}>
        <label>Select Site: </label>
        <select value={siteId || ''} onChange={e=>setSiteId(e.target.value ? parseInt(e.target.value,10) : null)}>
          <option value="">Pick a site</option>
          {sites.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
        <button onClick={()=>setEditing({})} disabled={!siteId} style={{marginLeft:8}}>Add Charger</button>
      </div>
      {editing && (
        <ChargerForm initial={editing} onCancel={()=>setEditing(null)} onSubmit={onSubmit} projects={projects} />
      )}
      {loading ? <div>Loading…</div> : <ChargersTable chargers={chargers} onEdit={setEditing} onDelete={onDelete} />}
    </div>
  );
}
