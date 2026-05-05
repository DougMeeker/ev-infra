import React, { useEffect, useState } from 'react';
import { getSiteFiles, uploadFile, unassignFileSite, updateFile, fileDownloadUrl, fileViewUrl } from '../api';
import heic2any from 'heic2any';

const FilesSection = ({ siteId, canEdit = false }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const [fileInputs, setFileInputs] = useState([]);
  const [editingFileId, setEditingFileId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [sortColumn, setSortColumn] = useState('uploaded_at');
  const [sortDirection, setSortDirection] = useState('desc');

  // Helper function to check if file is HEIC format
  const isHeicFile = (file) => {
    const extension = file.name.toLowerCase().split('.').pop();
    return extension === 'heic' || extension === 'heif' || file.type === 'image/heic' || file.type === 'image/heif';
  };

  // Convert HEIC to JPG
  const convertHeicToJpg = async (file) => {
    try {
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9
      });
      
      // heic2any can return an array if multiple images, we'll take the first one
      const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
      
      // Create a new File object from the blob
      const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
      return new File([blob], newFileName, { type: 'image/jpeg' });
    } catch (error) {
      console.error('HEIC conversion failed:', error);
      throw new Error('Failed to convert HEIC image. Please try a different format.');
    }
  };

  const loadFiles = () => {
    getSiteFiles(siteId)
      .then(res => setFiles(res.data || []))
      .catch(err => console.error('Error loading files', err));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFiles(); }, [siteId]);

  const onUpload = async (e) => {
    e.preventDefault();
    if (fileInputs.length === 0) return;
    setUploading(true);
    
    const errors = [];
    let successCount = 0;
    
    try {
      // Process each file
      for (let i = 0; i < fileInputs.length; i++) {
        const file = fileInputs[i];
        try {
          let fileToUpload = file;
          
          // Convert HEIC to JPG if needed
          if (isHeicFile(file)) {
            try {
              fileToUpload = await convertHeicToJpg(file);
            } catch (conversionError) {
              errors.push(`${file.name}: ${conversionError.message}`);
              continue;
            }
          }
          
          await uploadFile({ file: fileToUpload, description, siteIds: [Number(siteId)] });
          successCount++;
        } catch (err) {
          console.error(`Upload failed for ${file.name}`, err);
          errors.push(`${file.name}: Upload failed`);
        }
      }
      
      // Show results
      if (errors.length > 0) {
        alert(`Uploaded ${successCount} file(s).\n\nFailed:\n${errors.join('\n')}`);
      } else {
        // Optional success message for multiple files
        if (successCount > 1) {
          alert(`Successfully uploaded ${successCount} files.`);
        }
      }
      
      setDescription('');
      setFileInputs([]);
      // Reset the file input element
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = '';
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

  const startEditing = (file) => {
    setEditingFileId(file.id);
    setEditName(file.original_name || '');
    setEditDescription(file.description || '');
  };

  const cancelEditing = () => {
    setEditingFileId(null);
    setEditName('');
    setEditDescription('');
  };

  const saveEdit = async (fileId) => {
    try {
      await updateFile(fileId, { 
        original_name: editName,
        description: editDescription 
      });
      cancelEditing();
      loadFiles();
    } catch (err) {
      console.error('Update failed', err);
      alert('Failed to update file');
    }
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedFiles = [...files].sort((a, b) => {
    let aVal = a[sortColumn];
    let bVal = b[sortColumn];

    // Handle null/undefined values
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';

    // Convert to comparable values
    if (sortColumn === 'size_bytes') {
      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
    } else if (sortColumn === 'uploaded_at' || sortColumn === 'file_created_at') {
      aVal = new Date(aVal || 0);
      bVal = new Date(bVal || 0);
    } else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="card">
      {canEdit && (
        <form onSubmit={onUpload} className="flex-row gap-sm" style={{marginBottom:'12px'}}>
          <input 
            type="file" 
            multiple
            accept="image/*,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx" 
            onChange={e => setFileInputs(Array.from(e.target.files || []))} 
          />
          <input className="input" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
          <button className="btn" disabled={uploading || fileInputs.length === 0} type="submit">
            {uploading ? 'Uploading...' : (fileInputs.length > 1 ? `Upload ${fileInputs.length} files` : 'Upload')}
          </button>
        </form>
      )}
      {canEdit && fileInputs.length > 0 && (
        <div style={{marginBottom:'12px', padding:'8px', background:'var(--bg-secondary, #f5f5f5)', borderRadius:'4px'}}>
          <strong>Selected files ({fileInputs.length}):</strong>
          <ul style={{margin:'4px 0 0 0', paddingLeft:'20px'}}>
            {fileInputs.map((f, idx) => (
              <li key={idx}>
                {f.name} {isHeicFile(f) && <span style={{color:'#666', fontSize:'0.9em'}}>(will be converted to JPG)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {files.length === 0 ? (
        <p>No files yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th style={{cursor:'pointer'}} onClick={() => handleSort('original_name')}>
                Name {sortColumn === 'original_name' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{cursor:'pointer'}} onClick={() => handleSort('description')}>
                Description {sortColumn === 'description' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{cursor:'pointer'}} onClick={() => handleSort('size_bytes')}>
                Size {sortColumn === 'size_bytes' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{cursor:'pointer'}} onClick={() => handleSort('file_created_at')}>
                Date Taken {sortColumn === 'file_created_at' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
              <th style={{cursor:'pointer'}} onClick={() => handleSort('uploaded_at')}>
                Uploaded {sortColumn === 'uploaded_at' && (sortDirection === 'asc' ? '▲' : '▼')}
              </th>
              <th>Actions</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {sortedFiles.map(f => (
              <tr key={f.id}>
                <td>
                  {editingFileId === f.id ? (
                    <input 
                      className="input" 
                      value={editName} 
                      onChange={e => setEditName(e.target.value)}
                      style={{width:'100%', marginBottom:'6px'}}
                    />
                  ) : (
                    <a href={fileDownloadUrl(f.id)} target="_blank" rel="noreferrer">{f.original_name}</a>
                  )}
                </td>
                <td>
                  {editingFileId === f.id ? (
                    <input 
                      className="input" 
                      value={editDescription} 
                      onChange={e => setEditDescription(e.target.value)}
                      placeholder="Description (optional)"
                      style={{width:'100%'}}
                    />
                  ) : (
                    f.description || ''
                  )}
                </td>
                <td>{formatBytes(f.size_bytes)}</td>
                <td>{formatDate(f.file_created_at)}</td>
                <td>{formatDate(f.uploaded_at)}</td>
                <td>
                  <div style={{ display: 'flex', gap: '8px'}}>
                    {canEdit && editingFileId === f.id ? (
                      <>
                        <button className="btn" onClick={() => saveEdit(f.id)}>Save</button>
                        <button className="btn" onClick={cancelEditing}>Cancel</button>
                      </>
                    ) : canEdit ? (
                      <>
                        <button className="btn" onClick={() => startEditing(f)}>Edit</button>
                        <button className="btn btn-danger" onClick={() => onRemove(f.id)}>Remove</button>
                      </>
                    ) : null}
                  </div>
                </td>
                <td>
                  {editingFileId !== f.id && (
                    <>
                      {String(f.content_type || '').startsWith('image/') && (
                        <div style={{marginTop:'6px'}}>
                          <img src={fileViewUrl(f.id)} alt={f.original_name} style={{maxWidth:'200px', maxHeight:'120px', border:'1px solid var(--card-border)'}} />
                        </div>
                      )}
                      {String(f.content_type || '').startsWith('application/pdf') && (
                        <div style={{marginTop:'6px'}}>
                          <iframe 
                            src={fileViewUrl(f.id)} 
                            title={f.original_name}
                            style={{width:'300px', height:'200px', border:'1px solid var(--card-border)'}}
                          />
                        </div>
                      )}
                    </>
                  )}
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
