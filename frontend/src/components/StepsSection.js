import React from 'react';

export default function StepsSection({
  selectedProjectId,
  steps,
  showStepsSection,
  setShowStepsSection,
  handleUpdateStep,
  handleDeleteStep,
  newStep,
  setNewStep,
  handleCreateStep,
}) {
  return (
    <div className="card">
      <div className="flex-row justify-between align-center" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Project Steps ({steps.length})</h3>
        <div className="flex-row gap-sm">
          <button className="btn btn-secondary" onClick={() => setShowStepsSection(v => !v)}>{showStepsSection ? 'Collapse' : 'Expand'}</button>
        </div>
      </div>
      {selectedProjectId ? (
        showStepsSection ? (
          <>
            <ul style={{ listStyle:'none', padding:0 }}>
              {steps.map((st) => (
                <li key={st.id} style={{ padding:'6px 8px', borderBottom:'1px solid var(--card-border)', display:'flex', alignItems:'center', gap:8 }}>
                  <strong>#{st.step_order}</strong> {st.title}
                  {st.due_date && <span style={{ marginLeft:8, color:'var(--muted)' }}>Due: {st.due_date}</span>}
                  <div style={{ marginTop:6 }}>
                    <input placeholder="Title" defaultValue={st.title} onBlur={(e)=>handleUpdateStep(st.id, { title: e.target.value })} style={{ marginRight:8 }} />
                    <input type="number" placeholder="Order" defaultValue={st.step_order} onBlur={(e)=>handleUpdateStep(st.id, { step_order: Number(e.target.value) })} style={{ width:90, marginRight:8 }} />
                    <button className="btn-danger" onClick={()=>handleDeleteStep(st.id)}>Delete</button>
                  </div>
                  {st.description && <div style={{ marginTop:4, fontSize:'0.85rem', color:'var(--muted)' }}>{st.description}</div>}
                </li>
              ))}
            </ul>
            <form onSubmit={handleCreateStep} style={{ marginTop:12 }}>
              <input placeholder="Step Title" value={newStep.title} onChange={(e)=>setNewStep({ ...newStep, title: e.target.value })} style={{ marginRight:8 }} />
              <input type="number" placeholder="Order" value={newStep.step_order} onChange={(e)=>setNewStep({ ...newStep, step_order: e.target.value })} style={{ width:90, marginRight:8 }} />
              <input placeholder="Description" value={newStep.description} onChange={(e)=>setNewStep({ ...newStep, description: e.target.value })} style={{ width:240, marginRight:8 }} />
              <button type="submit" className="btn">Add Step</button>
            </form>
          </>
        ) : (
          <p style={{ color:'var(--muted)' }}>{steps.length} steps defined.</p>
        )
      ) : (
        <p>Select a project to manage steps.</p>
      )}
    </div>
  );
}
