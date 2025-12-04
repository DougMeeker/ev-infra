import React, { useRef, useState } from 'react';
import { uploadSitesGeoJSON, importDgsProperties, previewFleetMatches, importFleet, previewDepartmentMapping, importDepartmentMapping } from '../api';

const SiteImporter = () => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [fleetPreview, setFleetPreview] = useState(null);
  const [fleetPreviewLoading, setFleetPreviewLoading] = useState(false);
  const [fleetImportLoading, setFleetImportLoading] = useState(false);
  const [fleetImportResult, setFleetImportResult] = useState(null);
  const [dgsLoading, setDgsLoading] = useState(false);
  const [dgsResult, setDgsResult] = useState(null);
  const [deptMinConf, setDeptMinConf] = useState(0.7);
  const [fleetMinConf, setFleetMinConf] = useState(0.7);
  const [deptPreview, setDeptPreview] = useState(null);
  const [deptPreviewLoading, setDeptPreviewLoading] = useState(false);
  const [deptImportLoading, setDeptImportLoading] = useState(false);
  const [deptImportResult, setDeptImportResult] = useState(null);
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

  const doPreviewFleet = async () => {
    setFleetPreview(null);
    setFleetImportResult(null);
    setFleetPreviewLoading(true);
    try {
      const res = await previewFleetMatches(clampConfidence(fleetMinConf));
      setFleetPreview(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Preview fleet failed', e);
      alert(e.response?.data?.error || 'Fleet preview failed');
    } finally {
      setFleetPreviewLoading(false);
    }
  };

  const doImportFleet = async () => {
    setFleetImportLoading(true);
    setFleetImportResult(null);
    try {
      const res = await importFleet(clampConfidence(fleetMinConf));
      setFleetImportResult(res.data);
      const { added = 0, updated = 0, skipped = 0 } = res.data || {};
      alert(`Fleet import complete. Added ${added}, updated ${updated}, skipped ${skipped}.`);
    } catch (e) {
      console.error('Import fleet failed', e);
      alert(e.response?.data?.error || 'Fleet import failed');
    } finally {
      setFleetImportLoading(false);
    }
  };

  const doImportDgs = async () => {
    setDgsLoading(true);
    setDgsResult(null);
    try {
      const res = await importDgsProperties();
      setDgsResult(res.data);
      const { added = 0, skipped = 0 } = res.data || {};
      alert(`DGS import complete. Added ${added}, skipped ${skipped}.`);
    } catch (e) {
      console.error('Import DGS failed', e);
      alert(e.response?.data?.error || 'DGS import failed');
    } finally {
      setDgsLoading(false);
    }
  };

  const clampConfidence = (v) => {
    const n = Number(v);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(1, n));
  };

  const doPreviewDepartments = async () => {
    const conf = clampConfidence(deptMinConf);
    setDeptPreviewLoading(true);
    setDeptPreview(null);
    setDeptImportResult(null);
    try {
      const res = await previewDepartmentMapping(conf);
      setDeptPreview(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Department preview failed', e);
      alert(e.response?.data?.error || 'Department preview failed');
    } finally {
      setDeptPreviewLoading(false);
    }
  };

  const doImportDepartments = async () => {
    const conf = clampConfidence(deptMinConf);
    setDeptImportLoading(true);
    setDeptImportResult(null);
    try {
      const res = await importDepartmentMapping(conf);
      setDeptImportResult(res.data);
      const { updated = 0, skipped = 0 } = res.data || {};
      alert(`Department mapping complete. Updated ${updated}, skipped ${skipped}.`);
    } catch (e) {
      console.error('Department import failed', e);
      alert(e.response?.data?.error || 'Department import failed');
    } finally {
      setDeptImportLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '24px' }}>
      <h2 className="page-header">Imports</h2>
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

      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop:0 }}>Department → Site Mapping</h4>
        <p style={{ marginTop: 0 }}>
          Reads <code>Department_Id.csv</code> from the workspace (server-side). Matches departments to existing Sites by proximity and/or name,
          then sets <code>Site.department_id</code> to the matched <code>DEPT_ID</code>. Use confidence to filter only strong matches.
        </p>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap', alignItems:'center' }}>
          <label htmlFor="deptMinConf"><strong>Min Confidence:</strong></label>
          <input
            id="deptMinConf"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={deptMinConf}
            onChange={(e) => setDeptMinConf(e.target.value)}
            className="input"
            style={{ width:'100px' }}
          />
          <button className="btn" onClick={doPreviewDepartments} disabled={deptPreviewLoading}>
            {deptPreviewLoading ? 'Previewing…' : 'Preview Mapping'}
          </button>
          <button className="btn btn-secondary" onClick={doImportDepartments} disabled={deptImportLoading}>
            {deptImportLoading ? 'Applying…' : 'Apply Mapping'}
          </button>
        </div>
        {Array.isArray(deptPreview) && deptPreview.length > 0 && (
          <div style={{ marginTop:'12px', overflowX:'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Dept ID</th>
                  <th>Dept Name</th>
                  <th>Matched Site</th>
                  <th>Rename To</th>
                  <th>Current Site Dept ID</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {deptPreview.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td>{r.dept_id}</td>
                    <td>{r.dept_name}</td>
                    <td>{r.matched_site_name || '—'}</td>
                    <td>{r.will_rename ? (r.proposed_site_name || '—') : '—'}</td>
                    <td>{r.current_department_id || '—'}</td>
                    <td>{(r.confidence != null) ? Number(r.confidence).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small>Showing first {Math.min(25, deptPreview.length)} of {deptPreview.length} rows.</small>
          </div>
        )}
        {deptImportResult && (
          <div style={{ marginTop:'8px' }}>
            <div className="flex-row gap-md" style={{ flexWrap:'wrap' }}>
              <div><strong>Updated:</strong> {deptImportResult.updated ?? 0}</div>
              <div><strong>Skipped:</strong> {deptImportResult.skipped ?? 0}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop:0 }}>DGS Properties (Add-Only)</h4>
        <p style={{ marginTop: 0 }}>Reads <code>DGS_DOT_Property.geojson</code> from the workspace (server-side). Matches existing sites by name or within 0.25 km; only inserts new sites.</p>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={doImportDgs} disabled={dgsLoading}>
            {dgsLoading ? 'Importing…' : 'Import DGS Properties'}
          </button>
        </div>
        {dgsResult && (
          <div style={{ marginTop: '8px' }}>
            <div className="flex-row gap-md" style={{ flexWrap:'wrap' }}>
              <div><strong>Added:</strong> {dgsResult.added ?? 0}</div>
              <div><strong>Skipped:</strong> {dgsResult.skipped ?? 0}</div>
            </div>
            {Array.isArray(dgsResult.new_sites) && dgsResult.new_sites.length > 0 && (
              <div style={{ marginTop:'8px' }}>
                <strong>New Sites (sample):</strong>
                <ul style={{ margin: '8px 0 0 16px' }}>
                  {dgsResult.new_sites.slice(0, 10).map((s, i) => (
                    <li key={i}>{s.temp_name} ({s.lat}, {s.lon})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <h4 style={{ marginTop:0 }}>Fleet Vehicles</h4>
        <p style={{ marginTop: 0 }}>Reads <code>FleetList.csv</code> from the workspace (server-side). Previews department-to-site matching and imports vehicles into the Equipment table.</p>
        <div className="flex-row gap-sm" style={{ flexWrap: 'wrap', alignItems:'center' }}>
          <label htmlFor="fleetMinConf"><strong>Min Confidence:</strong></label>
          <input
            id="fleetMinConf"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={fleetMinConf}
            onChange={(e) => setFleetMinConf(e.target.value)}
            className="input"
            style={{ width:'100px' }}
          />
          <button className="btn" onClick={doPreviewFleet} disabled={fleetPreviewLoading}>
            {fleetPreviewLoading ? 'Previewing…' : 'Preview Matches'}
          </button>
          <button className="btn btn-secondary" onClick={doImportFleet} disabled={fleetImportLoading}>
            {fleetImportLoading ? 'Importing…' : 'Import Fleet'}
          </button>
        </div>
        {Array.isArray(fleetPreview) && fleetPreview.length > 0 && (
          <div style={{ marginTop:'12px', overflowX:'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Eq ID</th>
                  <th>MC</th>
                  <th>MC Known</th>
                  <th>Department</th>
                  <th>District</th>
                  <th>Matched Site</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {fleetPreview.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td>{r.equipment_identifier}</td>
                    <td>{r.mc_code}</td>
                    <td>{r.mc_known ? 'Yes' : 'No'}</td>
                    <td>{r.department_name || r.department_id}</td>
                    <td>{r.district}</td>
                    <td>{r.matched_site_name || '—'}</td>
                    <td>{(r.confidence != null) ? r.confidence.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small>Showing first {Math.min(25, fleetPreview.length)} of {fleetPreview.length} rows.</small>
          </div>
        )}
        {fleetImportResult && (
          <div style={{ marginTop:'8px' }}>
            <div className="flex-row gap-md" style={{ flexWrap:'wrap' }}>
              <div><strong>Added:</strong> {fleetImportResult.added ?? 0}</div>
              <div><strong>Updated:</strong> {fleetImportResult.updated ?? 0}</div>
              <div><strong>Skipped:</strong> {fleetImportResult.skipped ?? 0}</div>
            </div>
          </div>
        )}
      </div>

      {lastResult && (
        <div className="card">
          <h4 style={{ marginTop:0 }}>Last Upload Result</h4>
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
