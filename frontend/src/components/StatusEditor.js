import React from 'react';
import styles from '../pages/Status.module.css';

export default function StatusEditor({
  steps,
  statusForm,
  setStatusForm,
  showStatusEditor,
  setShowStatusEditor,
  selectedProjectId,
  selectedSiteId,
  onSubmitStatus,
  selectedSiteName,
  statusHistory = [],
  editingStatusId,
  setEditingStatusId,
  editForm,
  setEditForm,
  onUpdateStatus,
  onDeleteStatus,
  error,
  setError,
  canEdit = false,
}) {
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="flex-row justify-between align-center" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>
          Choose Step {selectedSiteId ? `— ${selectedSiteName || `Site ${selectedSiteId}`}` : ''}
        </h3>
        <div className="flex-row gap-sm">
          <button className="btn btn-secondary" onClick={() => setShowStatusEditor(v => !v)}>{showStatusEditor ? 'Collapse' : 'Expand'}</button>
        </div>
      </div>
      {showStatusEditor && (
        <>
          {/* Error Display */}
          {error && (
            <div style={{ 
              padding: '12px', 
              marginBottom: '12px',
              backgroundColor: '#fee',
              border: '1px solid #c00',
              borderRadius: '4px',
              color: '#c00',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{error}</span>
              <button 
                onClick={() => setError(null)}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#c00', 
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  padding: '0 8px'
                }}
              >
                ×
              </button>
            </div>
          )}
          <div className={styles.stepButtons}>
            {steps.map(st => {
              const active = Number(statusForm.current_step) === Number(st.step_order);
              return (
                <button
                  key={st.id}
                  type="button"
                  disabled={!selectedProjectId || !selectedSiteId}
                  className={`btn ${styles.stepButton} ${active ? styles.stepButtonActive : ''}`}
                  onClick={() => setStatusForm({ ...statusForm, current_step: st.step_order })}
                >
                  {st.step_order}. {st.title}
                </button>
              );
            })}
          </div>
          {canEdit && (
          <form onSubmit={onSubmitStatus} style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom: 16 }}>
            <input
              placeholder="Status Message"
              value={statusForm.status_message}
              onChange={(e) => setStatusForm({ ...statusForm, status_message: e.target.value })}
              style={{ marginRight: 8, width: 300 }}
              disabled={!selectedSiteId}
            />
            <input
              type="date"
              value={statusForm.status_date}
              onChange={(e) => setStatusForm({ ...statusForm, status_date: e.target.value })}
              style={{ marginRight: 8 }}
              disabled={!selectedSiteId}
            />
            <button type="submit" className="btn" disabled={!selectedSiteId}>Add Status</button>
          </form>
          )}

          {/* Status History */}
          {selectedSiteId && statusHistory.length > 0 && (
            <div style={{ marginTop: 16, borderTop: '1px solid #ddd', paddingTop: 16 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Status History</h4>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {statusHistory.map((status, idx) => {
                  const step = steps.find(s => s.step_order === status.current_step);
                  const isEditing = editingStatusId === status.id;
                  
                  if (isEditing) {
                    // Edit mode
                    return (
                      <div 
                        key={status.id || idx} 
                        style={{ 
                          padding: '12px', 
                          marginBottom: '8px',
                          backgroundColor: '#fff3cd',
                          border: '2px solid #ffc107',
                          borderRadius: '4px'
                        }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: 12 }}>Edit Status</div>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            onUpdateStatus(status.id, editForm);
                          }}
                          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                        >
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', flex: '0 0 120px' }}>
                              <span style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>Step</span>
                              <select 
                                className="input"
                                value={editForm.current_step}
                                onChange={(e) => setEditForm({ ...editForm, current_step: e.target.value })}
                              >
                                {steps.map(st => (
                                  <option key={st.id} value={st.step_order}>
                                    {st.step_order}. {st.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', flex: '1 1 200px' }}>
                              <span style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>Status Message</span>
                              <input 
                                className="input"
                                value={editForm.status_message}
                                onChange={(e) => setEditForm({ ...editForm, status_message: e.target.value })}
                                placeholder="Status message"
                              />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', flex: '0 0 140px' }}>
                              <span style={{ fontSize: '12px', color: '#666', marginBottom: 4 }}>Date</span>
                              <input 
                                className="input"
                                type="date"
                                value={editForm.status_date}
                                onChange={(e) => setEditForm({ ...editForm, status_date: e.target.value })}
                              />
                            </label>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button type="submit" className="btn" style={{ padding: '4px 16px' }}>Save</button>
                            <button 
                              type="button" 
                              className="btn btn-secondary" 
                              onClick={() => setEditingStatusId(null)}
                              style={{ padding: '4px 16px' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    );
                  }
                  
                  // Display mode
                  return (
                    <div 
                      key={status.id || idx} 
                      style={{ 
                        padding: '12px', 
                        marginBottom: '8px',
                        backgroundColor: idx === 0 ? '#f0f7ff' : '#f9f9f9',
                        border: idx === 0 ? '2px solid #2196F3' : '1px solid #ddd',
                        borderRadius: '4px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ 
                            fontWeight: 'bold', 
                            fontSize: '14px',
                            padding: '2px 8px',
                            backgroundColor: idx === 0 ? '#2196F3' : '#666',
                            color: 'white',
                            borderRadius: '3px'
                          }}>
                            Step {status.current_step}
                          </span>
                          {step && (
                            <span style={{ fontSize: '14px', color: '#666' }}>{step.title}</span>
                          )}
                          {idx === 0 && (
                            <span style={{ 
                              fontSize: '12px', 
                              fontWeight: 'bold',
                              color: '#2196F3',
                              padding: '2px 6px',
                              backgroundColor: '#e3f2fd',
                              borderRadius: '3px'
                            }}>
                              Current
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '13px', color: '#888' }}>
                            {formatDate(status.status_date)}
                          </span>
                          {canEdit && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setEditingStatusId(status.id);
                              // Parse the date properly to YYYY-MM-DD format
                              let dateValue = '';
                              if (status.status_date) {
                                try {
                                  const date = new Date(status.status_date);
                                  dateValue = date.toISOString().split('T')[0];
                                } catch (e) {
                                  console.error('Error parsing date:', e);
                                  dateValue = '';
                                }
                              }
                              setEditForm({
                                current_step: status.current_step,
                                status_message: status.status_message || '',
                                status_date: dateValue,
                                estimated_cost: status.estimated_cost || '',
                                actual_cost: status.actual_cost || ''
                              });
                            }}
                            style={{ padding: '2px 8px', fontSize: '12px' }}
                          >
                            Edit
                          </button>
                          )}
                          {canEdit && (
                          <button
                            className="btn btn-danger"
                            onClick={() => {
                              if (window.confirm('Delete this status entry?')) {
                                onDeleteStatus(status.id);
                              }
                            }}
                            style={{ padding: '2px 8px', fontSize: '12px' }}
                          >
                            Delete
                          </button>
                          )}
                        </div>
                      </div>
                      {status.status_message && (
                        <div style={{ 
                          fontSize: '14px', 
                          color: '#333',
                          marginBottom: 8,
                          lineHeight: '1.5'
                        }}>
                          {status.status_message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
