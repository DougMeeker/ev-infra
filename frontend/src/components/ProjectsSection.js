import React from 'react';
import styles from '../pages/Status.module.css';
import { getStatusShade } from '../utils/statusShading';

export default function ProjectsSection({
  projects,
  selectedProjectId,
  latestStatuses,
  stepsCount,
  projectAverages,
  onSelectProject,
  onDeleteProject,
  editProject,
  setEditProject,
  onSaveEdit,
  loadingProjects,
}) {
  const list = Array.isArray(projects) ? projects : [];
  const safeEdit = editProject || { name: '', description: '' };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>Projects {loadingProjects && <small style={{ fontWeight:'normal' }}>Loading...</small>}</h3>
      <div className={styles.latestGrid}>
        {list.map((p) => {
          const isSelected = String(selectedProjectId) === String(p.id);
          const avgEntry = projectAverages ? projectAverages[p.id] : undefined;
          const avg = avgEntry?.avg ?? null;
          const shade = avg != null ? getStatusShade(avg) : null;
          return (
            <div
              key={p.id}
              className={styles.latestItemCard}
              style={(isSelected && shade) ? { borderColor: shade.border } : undefined}
            >
              <div
                className={`${styles.latestRow} ${isSelected ? styles.latestRowSelected : ''}`}
                onClick={() => onSelectProject(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectProject(p.id); }}
                style={(isSelected && shade) ? { background: shade.bg } : undefined}
              >
                <div className={styles.latestRowContent}>
                  <div className={styles.latestRowHeader}>
                    <span className={styles.siteName}>{p.name}</span>
                    <div className={styles.metaGrid}>
                      <span className={`${styles.token} ${styles.tokenNowrap}`}>ID: {p.id}</span>
                      <span className={`${styles.token} ${styles.tokenNowrap}`}>Steps: {typeof p.steps_count === 'number' ? p.steps_count : '—'}</span>
                      <span
                        className={`${styles.token} ${styles.tokenNowrap}`}
                        title={`Average progress across ${avgEntry?.count || 0} sites`}
                        style={shade ? { background: shade.bg, borderColor: shade.border } : undefined}
                      >
                        Avg: {avg != null ? Math.round(avg * 100) : '—'}%
                      </span>
                    </div>
                  </div>
                  {(p.description) && (
                    <div className={styles.latestRowDetails}>
                      <span className={styles.tokenMuted}>{p.description}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.latestRowToolbar}>
                <button
                  className={styles.miniBtn}
                  onClick={() => onSelectProject(p.id)}
                  title="Select Project"
                >
                  Select
                </button>
                <button
                  className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                  onClick={() => onDeleteProject(p.id)}
                  title="Delete Project"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {selectedProjectId && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4>Edit Project</h4>
          <form
            onSubmit={(e) => { e.preventDefault(); onSaveEdit(safeEdit); }}
            style={{ marginBottom: 12, display:'flex', alignItems:'flex-start', gap:8, flexWrap:'wrap' }}
          >
            <label style={{ display:'flex', flexDirection:'column' }}>
              <span className={styles.tokenMuted}>Name</span>
              <input className="input"
                placeholder="Project Name"
                value={safeEdit.name}
                onChange={(e) => setEditProject({ ...safeEdit, name: e.target.value })}
                style={{ width: 300 }}
              />
            </label>
            <label style={{ display:'flex', flexDirection:'column' }}>
              <span className={styles.tokenMuted}>Description</span>
              <textarea className="input"
                placeholder="Description"
                value={safeEdit.description}
                onChange={(e) => setEditProject({ ...safeEdit, description: e.target.value })}
                rows={1}
                style={{ width: 600, resize: 'vertical' }}
              />
            </label>
            <div style={{ width: '100%' }}>
              <button type="submit" className="btn">Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
 