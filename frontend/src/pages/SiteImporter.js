import React, { useRef, useState } from 'react';
import { uploadSitesGeoJSON } from '../api';

const SiteImporter = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    setFile(e.target.files?.[0] || null);
  };

  const upload = () => {
    if (!file) { alert('Select a GeoJSON file first'); return; }
    setUploading(true);
    setLastResult(null);
    uploadSitesGeoJSON(file)
      .then(res => {
        setLastResult(res.data);
        const { added, updated, skipped } = res.data || {};
        alert(`Import complete. Added ${added || 0}, updated ${updated || 0}, skipped ${skipped || 0}.`);
      })
      .catch(err => {
        console.error('GeoJSON upload failed', err);
        alert(err.response?.data?.error || 'Upload failed');
      })
      .finally(() => {
        setUploading(false);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  return (
    <div className="container" style={{ paddingTop: '24px' }}>
      <h2 className="page-header">Site Importer</h2>
      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop:0 }}>Import from GeoJSON</h4>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            onClick={(e) => { e.target.value = ''; }}
            onChange={handleFileChange}
          />
          <button className="btn" disabled={uploading || !file} onClick={upload}>
            {uploading ? 'Uploading...' : (file ? `Upload ${file.name}` : 'Upload GeoJSON')}
          </button>
          <a className="btn btn-secondary" href="/" title="Go to map">Back to Home</a>
        </div>
        <small style={{ display:'block', marginTop:'8px' }}>
          Expects a GeoJSON FeatureCollection of Point features. Common property keys like
          name, address, city, utility, meter are mapped when present. Existing sites are
          matched by exact name.
        </small>
      </div>

      {lastResult && (
        <div className="card">
          <h4 style={{ marginTop:0 }}>Last Import Result</h4>
          <div className="flex-row gap-md" style={{ flexWrap:'wrap' }}>
            <div><strong>Added:</strong> {lastResult.added ?? 0}</div>
            <div><strong>Updated:</strong> {lastResult.updated ?? 0}</div>
            <div><strong>Skipped:</strong> {lastResult.skipped ?? 0}</div>
          </div>
          {Array.isArray(lastResult.errors) && lastResult.errors.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <strong>Errors (first {Math.min(10, lastResult.errors.length)}):</strong>
              <ul style={{ margin: '8px 0 0 16px' }}>
                {lastResult.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Feature #{(e.feature_index ?? i) + 1}: {String(e.error || 'Unknown error')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop:'10px' }}>
            <button className="btn" onClick={() => window.location.assign('/')}>View on Map</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SiteImporter;
