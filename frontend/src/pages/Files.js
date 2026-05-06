import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { listFiles, assignFileSites, deleteFile, updateFile, fileDownloadUrl, fileViewUrl } from '../api';
import SiteMultiSelect from '../components/SiteMultiSelect';
import { useAuth } from '../AuthProvider';

const FilesPage = () => {
  const { isAuthenticated, role } = useAuth();
  const canEdit = useMemo(() => isAuthenticated && (role === 'admin' || role === 'hq'), [isAuthenticated, role]);
  const [files, setFiles] = useState([]);
  const [q, setQ] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);

  const loadFiles = () => {
    listFiles({ q })
      .then(res => setFiles(res.data || []))
      .catch(err => console.error('Error listing files', err));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFiles(); }, [q]);

  const onAssign = async () => {
    if (!selectedFile || selectedSiteIds.length === 0) return;
    try {
      await assignFileSites(selectedFile.id, selectedSiteIds);
      setSelectedSiteIds([]);
      setSelectedFile(null);
      loadFiles();
    } catch (err) {
      console.error('Assignment failed', err);
      alert('Failed to assign file to sites');
    }
  };

  const onDelete = async (fileId) => {
    if (!window.confirm('Delete this file?')) return;
    try { await deleteFile(fileId); loadFiles(); } catch (err) { console.error(err); alert('Failed to delete'); }
  };

  const onRename = async (file) => {
    const name = window.prompt('Enter new display name', file.original_name);
    if (!name || name === file.original_name) return;
    try { await updateFile(file.id, { original_name: name }); loadFiles(); }
    catch (err) { console.error(err); alert('Failed to rename'); }
  };

  return (
    <div className="container">
      <h2 className="page-header">Files</h2>
      <div className="card">
        <div className="flex-row gap-sm" style={{ marginBottom: '12px' }}>
          <input className="input" placeholder="Search name" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn" onClick={loadFiles}>Refresh</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Linked Sites</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map(f => (
              <tr key={f.id} className={selectedFile && selectedFile.id === f.id ? 'selected-row' : ''}>
                <td>
                  <a href={fileDownloadUrl(f.id)} target="_blank" rel="noreferrer">{f.original_name}</a>
                  {String(f.content_type || '').startsWith('image/') && (
                    <div style={{ marginTop: '6px' }}>
                      <img src={fileViewUrl(f.id)} alt={f.original_name} style={{ maxWidth: '160px', maxHeight: '100px', border: '1px solid var(--card-border)' }} />
                    </div>
                  )}
                </td>
                <td>{f.description || ''}</td>
                <td>
                  {(f.sites && f.sites.length > 0) ? (
                    f.sites.map((s, idx) => (
                      <span key={s.id}>
                        <Link to={`/site/${s.id}`}>{s.name || s.id}</Link>{idx < f.sites.length - 1 ? ', ' : ''}
                      </span>
                    ))
                  ) : (
                    (f.site_ids || []).map((id, idx) => (
                      <span key={id}>
                        <Link to={`/site/${id}`}>{id}</Link>{idx < (f.site_ids || []).length - 1 ? ', ' : ''}
                      </span>
                    ))
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px'}}>
                    {canEdit && <button className="btn" onClick={() => onRename(f)}>Rename</button>}
                    {canEdit && <button className="btn btn-secondary" onClick={() => setSelectedFile(f)}>Assign to sites</button>}
                    {canEdit && <button className="btn btn-danger" onClick={() => onDelete(f.id)}>Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedFile && (
        <div className="card" style={{ marginTop: '16px' }}>
          <h4>Assign "{selectedFile.original_name}" to sites</h4>
          <SiteMultiSelect
            key={selectedFile.id}
            initialSelectedIds={selectedFile.site_ids || []}
            onChange={(ids) => setSelectedSiteIds(ids)}
          />
          <div className="flex-row gap-sm" style={{ marginTop: '12px' }}>
            <button className="btn" onClick={onAssign} disabled={selectedSiteIds.length === 0}>Assign</button>
            <button className="btn btn-secondary" onClick={() => { setSelectedFile(null); setSelectedSiteIds([]); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilesPage;
