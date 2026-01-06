import React from 'react';
import AsyncCombo from './AsyncCombo';
import LatestStatusBox from './LatestStatusBox';
import styles from '../pages/Status.module.css';

export default function SitesSection({
  selectedProjectId,
  assignment,
  setAssignment,
  loadSiteOptions,
  onAssign,
  sortMode,
  setSortMode,
  siteSearch,
  setSiteSearch,
  sortedProjectSites,
  sitesPage,
  setSitesPage,
  sitesPageSize,
  setSitesPageSize,
  totalPages,
  pageSizeOptions,
  latestStatuses,
  stepsCount,
  selectedSiteId,
  setSelectedSiteId,
  onOpenSite,
  onOpenDetails,
  onRemove,
  sitesTotal,
  gridRef,
  showSitesSection,
  setShowSitesSection,
}) {
  const sps = Array.isArray(sortedProjectSites) ? sortedProjectSites : [];
  const latest = Array.isArray(latestStatuses) ? latestStatuses : [];
  const pageOpts = Array.isArray(pageSizeOptions) ? pageSizeOptions : [];
  const effectiveTotalPages = sortMode==='status' ? Math.max(1, Math.ceil(sps.length / sitesPageSize)) : (totalPages || 1);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="flex-row justify-between align-center" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Sites in Project ({sitesTotal})</h3>
        <div className="flex-row gap-sm">
          <button className="btn btn-secondary" onClick={() => setShowSitesSection(v => !v)}>{showSitesSection ? 'Collapse' : 'Expand'}</button>
        </div>
      </div>
      {selectedProjectId ? (
        showSitesSection ? (
          <>
            <form onSubmit={onAssign} style={{ marginBottom: 12, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <div style={{ marginRight: 30 }}>
                <AsyncCombo
                  value={assignment.siteName || ''}
                  onChangeOption={(opt) => setAssignment({ siteId: opt.id, siteName: opt.name })}
                  onInputChange={(text) => {
                    const trimmed = (text || '').trim();
                    const selectedLabel = (assignment.siteName || '').trim();
                    if (trimmed !== selectedLabel) setAssignment(a => ({ ...a, siteId: '' }));
                  }}
                  loadOptions={loadSiteOptions}
                  placeholder="Select a site to add"
                  disabled={!selectedProjectId}
                />
              </div>
              <button type="submit" className="btn" disabled={!assignment.siteId}>Add to Project</button>
            </form>

            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span>Sort:</span>
              <label>
                <input type="radio" name="sortMode" value="name" checked={sortMode==='name'} onChange={() => setSortMode('name')} /> Name
              </label>
              <label>
                <input type="radio" name="sortMode" value="status" checked={sortMode==='status'} onChange={() => setSortMode('status')} /> Status
              </label>
              <span style={{ marginLeft:12 }}>Filter:</span>
              <input
                className="input"
                placeholder="Filter sites..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                style={{ width: 240 }}
              />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <span>Page:</span>
              <button className="btn" disabled={sitesPage<=1} onClick={()=>setSitesPage(1)}>First</button>
              <button className="btn" disabled={sitesPage<=1} onClick={()=>setSitesPage(p=>Math.max(1,p-1))}>Prev</button>
              <span>{sitesPage} / {effectiveTotalPages}</span>
              <button className="btn" disabled={sitesPage>=effectiveTotalPages} onClick={()=>setSitesPage(p=>p+1)}>Next</button>
              <button className="btn" disabled={sitesPage>=effectiveTotalPages} onClick={()=>setSitesPage(effectiveTotalPages)}>Last</button>
              <span style={{ marginLeft:12 }}>Per page:</span>
              <select className="input" value={sitesPageSize} onChange={(e)=>{ setSitesPageSize(Number(e.target.value)); setSitesPage(1); }}>
                {(!pageOpts.includes(sitesPageSize)) && (
                  <option value={sitesPageSize}>{sitesPageSize}</option>
                )}
                {pageOpts.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
              <div ref={gridRef} className={styles.latestGrid}>
              {(sortMode === 'status' ? sps.slice((sitesPage-1)*sitesPageSize, (sitesPage-1)*sitesPageSize + sitesPageSize) : sps).map((s) => {
                const status = latest.find(ls => String(ls.site_id) === String(s.id));
                const item = status ? status : {
                  id: null,
                  project_id: Number(selectedProjectId),
                  site_id: s.id,
                  site_name: s.name || `Site ${s.id}`,
                  current_step: null,
                  status_date: null,
                };
                return (
                  <div key={s.id} className={styles.latestItemCard}>
                    <LatestStatusBox
                      item={item}
                      stepsCount={stepsCount}
                      isSelected={String(selectedSiteId) === String(s.id)}
                      onUpdate={(siteId, currentStep) => onOpenSite(siteId, currentStep)}
                    />
                    <div className={styles.latestRowToolbar}>
                      <button
                        className={`${styles.miniBtn}`}
                        onClick={() => onOpenSite(s.id)}
                        title="Open Status"
                      >
                        Status
                      </button>
                      <button
                        className={`${styles.miniBtn}`}
                        onClick={() => onOpenDetails(s.id)}
                        title="Open Site Details"
                      >
                        Site Details
                      </button>
                      <button
                        className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                        onClick={() => onRemove(s.id)}
                        title="Remove from project"
                      >
                        Remove From Project
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p style={{ color:'var(--muted)' }}>
            {sitesTotal} sites assigned. Sort: {sortMode}. Page {sitesPage}.
          </p>
        )
      ) : (
        <p>Select a project to manage site assignments.</p>
      )}
    </div>
  );
}
