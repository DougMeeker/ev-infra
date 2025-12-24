import React, { useEffect, useMemo, useState } from 'react';
import { getProjects } from '../api';
import { useNavigate } from 'react-router-dom';
import ProjectRow from './ProjectRow';

export default function ProjectsSection({ siteId }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getProjects()
      .then(res => { if (mounted) setProjects(res.data || []); })
      .catch(err => console.error('Error fetching projects:', err))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const associated = useMemo(() => {
    const sid = Number(siteId);
    if (!Array.isArray(projects)) return [];
    return projects.filter(p => Array.isArray(p.site_ids) && p.site_ids.includes(sid));
  }, [projects, siteId]);

  return (
    <div className="card" style={{ marginBottom: '16px' }}>
      {loading ? (
        <div>
          <div className="skeleton sk-line" style={{ width: '40%', marginBottom: 8 }} />
          <div className="skeleton sk-line" style={{ width: '60%', marginBottom: 8 }} />
        </div>
      ) : associated.length === 0 ? (
        <p>No associated projects.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ddd' }}>Project</th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Description</th>
              <th style={{ borderBottom: '1px solid #ddd', width: 240 }}>Site Actions</th>
            </tr>
          </thead>
          <tbody>
            {associated.map(p => (
              <ProjectRow key={p.id} project={p} siteId={siteId} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
