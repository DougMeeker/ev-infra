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
  editingProjectId,
  setEditingProjectId,
  steps,
  newStep,
  setNewStep,
  handleCreateStep,
  handleUpdateStep,
  handleDeleteStep,
  showCreateForm,
  setShowCreateForm,
  newProject,
  setNewProject,
  onCreateProject,
}) {
  const list = Array.isArray(projects) ? projects : [];
  const safeEdit = editProject || { name: '', description: '' };
  const safeNewProject = newProject || { name: '', description: '' };
  
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Projects {loadingProjects && <small style={{ fontWeight:'normal' }}>Loading...</small>}</h3>
        <button 
          className="btn" 
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : '+ New Project'}
        </button>
      </div>
      
      {/* Create New Project Form */}
      {showCreateForm && (
        <div className="card" style={{ marginBottom: 16, backgroundColor: '#f0f8ff', borderLeft: '4px solid var(--primary)' }}>
          <h4 style={{ marginTop: 0 }}>Create New Project</h4>
          <form
            onSubmit={(e) => { 
              e.preventDefault(); 
              onCreateProject();
            }}
            style={{ display:'flex', flexDirection:'column', gap: 12 }}
          >
            <div style={{ display:'flex', gap: 12, flexWrap:'wrap' }}>
              <label style={{ display:'flex', flexDirection:'column', flex: '1 1 250px' }}>
                <span style={{ marginBottom: 4, fontWeight: 500 }}>Name *</span>
                <input 
                  className="input"
                  placeholder="Project Name"
                  value={safeNewProject.name}
                  onChange={(e) => setNewProject({ ...safeNewProject, name: e.target.value })}
                  required
                />
              </label>
              <label style={{ display:'flex', flexDirection:'column', flex: '2 1 400px' }}>
                <span style={{ marginBottom: 4, fontWeight: 500 }}>Description</span>
                <textarea 
                  className="input"
                  placeholder="Project description (optional)"
                  value={safeNewProject.description}
                  onChange={(e) => setNewProject({ ...safeNewProject, description: e.target.value })}
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn">Create Project</button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      
      <div className={styles.latestGrid}>
        {list.map((p) => {
          const isSelected = String(selectedProjectId) === String(p.id);
          const isEditing = String(editingProjectId) === String(p.id);
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
                  className={styles.miniBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isEditing) {
                      setEditingProjectId(null);
                    } else {
                      setEditingProjectId(p.id);
                      onSelectProject(p.id);
                    }
                  }}
                  title="Edit Project"
                >
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
                <button
                  className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                  onClick={() => onDeleteProject(p.id)}
                  title="Delete Project"
                >
                  Delete
                </button>
              </div>
              
              {/* Edit Form - shown inline when editing this project */}
              {isEditing && (
                <div className="card" style={{ marginTop: 12, backgroundColor: '#f9f9f9' }}>
                  <h4 style={{ marginTop: 0 }}>Edit Project</h4>
                  <form
                    onSubmit={(e) => { 
                      e.preventDefault(); 
                      onSaveEdit(p.id, safeEdit);
                      setEditingProjectId(null);
                    }}
                    style={{ display:'flex', flexDirection:'column', gap: 12 }}
                  >
                    <div style={{ display:'flex', gap: 12, flexWrap:'wrap' }}>
                      <label style={{ display:'flex', flexDirection:'column', flex: '1 1 250px' }}>
                        <span className={styles.tokenMuted} style={{ marginBottom: 4 }}>Name</span>
                        <input className="input"
                          placeholder="Project Name"
                          value={safeEdit.name}
                          onChange={(e) => setEditProject({ ...safeEdit, name: e.target.value })}
                        />
                      </label>
                      <label style={{ display:'flex', flexDirection:'column', flex: '2 1 400px' }}>
                        <span className={styles.tokenMuted} style={{ marginBottom: 4 }}>Description</span>
                        <textarea className="input"
                          placeholder="Description"
                          value={safeEdit.description}
                          onChange={(e) => setEditProject({ ...safeEdit, description: e.target.value })}
                          rows={2}
                          style={{ resize: 'vertical' }}
                        />
                      </label>
                    </div>
                    
                    {/* Project Steps Section */}
                    <div style={{ borderTop: '1px solid #ddd', paddingTop: 12 }}>
                      <h5 style={{ marginTop: 0, marginBottom: 12 }}>Project Steps ({steps.length})</h5>
                      {steps.length > 0 ? (
                        <ul style={{ listStyle:'none', padding:0, marginBottom: 12 }}>
                          {steps.map((st) => (
                            <li key={st.id} style={{ 
                              padding:'8px 12px', 
                              marginBottom: 8,
                              border:'1px solid #ddd', 
                              borderRadius: 4,
                              backgroundColor: '#fff'
                            }}>
                              <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 8 }}>
                                <strong style={{ minWidth: 40 }}>#{st.step_order}</strong>
                                <span style={{ flex: 1 }}>{st.title}</span>
                              </div>
                              <div style={{ display:'flex', gap: 8, flexWrap: 'wrap' }}>
                                <input 
                                  className="input"
                                  placeholder="Title" 
                                  defaultValue={st.title} 
                                  onBlur={(e)=>handleUpdateStep(st.id, { title: e.target.value })} 
                                  style={{ flex: '1 1 200px' }}
                                />
                                <input 
                                  className="input"
                                  type="number" 
                                  placeholder="Order" 
                                  defaultValue={st.step_order} 
                                  onBlur={(e)=>handleUpdateStep(st.id, { step_order: Number(e.target.value) })} 
                                  style={{ width: 90 }}
                                />
                                <input 
                                  className="input"
                                  placeholder="Description" 
                                  defaultValue={st.description || ''} 
                                  onBlur={(e)=>handleUpdateStep(st.id, { description: e.target.value })} 
                                  style={{ flex: '1 1 240px' }}
                                />
                                <button 
                                  type="button"
                                  className="btn btn-danger" 
                                  onClick={()=>handleDeleteStep(st.id)}
                                  style={{ padding: '4px 12px' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ color: '#888', fontSize: '14px', marginBottom: 12 }}>No steps defined yet.</p>
                      )}
                      
                      {/* Add New Step Form */}
                      <div style={{ 
                        padding: 12, 
                        backgroundColor: '#fff', 
                        border: '1px solid #ddd', 
                        borderRadius: 4 
                      }}>
                        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: 8 }}>Add New Step</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input 
                            className="input"
                            placeholder="Step Title" 
                            value={newStep.title} 
                            onChange={(e)=>setNewStep({ ...newStep, title: e.target.value })} 
                            style={{ flex: '1 1 200px' }}
                          />
                          <input 
                            className="input"
                            type="number" 
                            placeholder="Order" 
                            value={newStep.step_order} 
                            onChange={(e)=>setNewStep({ ...newStep, step_order: e.target.value })} 
                            style={{ width: 90 }}
                          />
                          <input 
                            className="input"
                            placeholder="Description" 
                            value={newStep.description} 
                            onChange={(e)=>setNewStep({ ...newStep, description: e.target.value })} 
                            style={{ flex: '1 1 240px' }}
                          />
                          <button 
                            type="button"
                            onClick={handleCreateStep} 
                            className="btn"
                            style={{ padding: '4px 16px' }}
                          >
                            Add Step
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="submit" className="btn">Save Changes</button>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => setEditingProjectId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
 