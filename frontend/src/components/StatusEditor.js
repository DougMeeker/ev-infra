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
}) {
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
          <form onSubmit={onSubmitStatus} style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
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
            <input
              placeholder="Estimated Cost"
              type="number"
              value={statusForm.estimated_cost}
              onChange={(e) => setStatusForm({ ...statusForm, estimated_cost: e.target.value })}
              style={{ marginRight: 8 }}
              disabled={!selectedSiteId}
            />
            <input
              placeholder="Actual Cost"
              type="number"
              value={statusForm.actual_cost}
              onChange={(e) => setStatusForm({ ...statusForm, actual_cost: e.target.value })}
              style={{ marginRight: 8 }}
              disabled={!selectedSiteId}
            />
            <button type="submit" className="btn" disabled={!selectedSiteId}>Add Status</button>
          </form>
        </>
      )}
    </div>
  );
}
