import React, { useEffect, useState } from 'react';
import { getSiteFiles, uploadFile, unassignFileSite, updateFile, fileDownloadUrl } from '../api';

const FilesSection = ({ siteId }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const [fileInput, setFileInput] = useState(null);

  const loadFiles = () => {
    getSiteFiles(siteId)
      .then(res => setFiles(res.data || []))
      .catch(err => console.error('Error loading files', err));
  };

  useEffect(() => { loadFiles(); }, [siteId, loadFiles]);

  const onUpload = async (e) => {
    e.preventDefault();
    if (!fileInput) return;
    setUploading(true);
    try {
      await uploadFile({ file: fileInput, description, siteIds: [Number(siteId)] });
      setDescription('');
      setFileInput(null);
      loadFiles();
    } catch (err) {
      console.error('Upload failed', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const onRemove = async (fileId) => {
    if (!window.confirm('Remove file from this site?')) return;
    try {
      await unassignFileSite(fileId, Number(siteId));
      loadFiles();
    } catch (err) {
      console.error('Unassign failed', err);
      alert('Failed to remove file');
    }
  };

  const onRename = async (file) => {
    const name = window.prompt('Enter new display name', file.original_name);
    if (!name || name === file.original_name) return;
    try {
      await updateFile(file.id, { original_name: name });
      loadFiles();
    } catch (err) {
      console.error('Rename failed', err);
      alert('Failed to rename file');
    }
  };

  return (
    <div className="card">
      <h4>Files</h4>
      <form onSubmit={onUpload} className="flex-row gap-sm" style={{marginBottom:'12px'}}>
        <input type="file" onChange={e => setFileInput(e.target.files[0] || null)} />
        <input className="input" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
        <button className="btn" disabled={uploading || !fileInput} type="submit">{uploading ? 'Uploading...' : 'Upload'}</button>
      </form>
      {files.length === 0 ? (
        <p>No files yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map(f => (
              <tr key={f.id}>
                <td>
                  <a href={fileDownloadUrl(f.id)} target="_blank" rel="noreferrer">{f.original_name}</a>
                  {String(f.content_type || '').startsWith('image/') && (
                    <div style={{marginTop:'6px'}}>
                      <img src={fileDownloadUrl(f.id)} alt={f.original_name} style={{maxWidth:'200px', maxHeight:'120px', border:'1px solid var(--card-border)'}} />
                    </div>
                  )}
                </td>
                <td>{f.description || ''}</td>
                <td>{f.size_bytes || 0}</td>
                <td>{f.uploaded_at ? String(f.uploaded_at).split('T')[0] : ''}</td>
                <td>
                  <button className="btn" onClick={() => onRename(f)}>Rename</button>
                  <button className="btn btn-secondary" onClick={() => onRemove(f.id)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default FilesSection;
