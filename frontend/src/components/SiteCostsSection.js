import React, { useEffect, useState, useCallback } from "react";
import {
    getCostEstimates, createCostEstimate, updateCostEstimate, deleteCostEstimate,
    getMilestones, initializeMilestones, updateMilestone, getMilestoneTypes, getProjects
} from "../api";

const fmt$ = (v) =>
    v == null ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const EMPTY_ESTIMATE = {
    project_id: "",
    design_cost: "",
    permitting_cost: "",
    equipment_cost: "",
    installation_cost: "",
    utility_cost: "",
    other_cost: "",
    notes: ""
};

// ─── Cost Estimates Sub-section ──────────────────────────────────────────────

const CostEstimatesPanel = ({ siteId, projects, canEdit = false }) => {
    const [estimates, setEstimates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // estimate id or 'new'
    const [form, setForm] = useState({});

    const load = useCallback(() => {
        setLoading(true);
        getCostEstimates({ siteId })
            .then(res => setEstimates(res.data || []))
            .catch(err => console.error("Error loading cost estimates:", err))
            .finally(() => setLoading(false));
    }, [siteId]);

    useEffect(() => { load(); }, [load]);

    const startNew = () => {
        setEditing("new");
        setForm({ ...EMPTY_ESTIMATE });
    };

    const startEdit = (est) => {
        setEditing(est.id);
        setForm({
            project_id: est.project_id ?? "",
            design_cost: est.design_cost ?? "",
            permitting_cost: est.permitting_cost ?? "",
            equipment_cost: est.equipment_cost ?? "",
            installation_cost: est.installation_cost ?? "",
            utility_cost: est.utility_cost ?? "",
            other_cost: est.other_cost ?? "",
            notes: est.notes ?? ""
        });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(f => ({ ...f, [name]: value }));
    };

    const handleSave = () => {
        const payload = {
            site_id: Number(siteId),
            project_id: form.project_id ? Number(form.project_id) : null,
            design_cost: form.design_cost !== "" ? Number(form.design_cost) : null,
            permitting_cost: form.permitting_cost !== "" ? Number(form.permitting_cost) : null,
            equipment_cost: form.equipment_cost !== "" ? Number(form.equipment_cost) : null,
            installation_cost: form.installation_cost !== "" ? Number(form.installation_cost) : null,
            utility_cost: form.utility_cost !== "" ? Number(form.utility_cost) : null,
            other_cost: form.other_cost !== "" ? Number(form.other_cost) : null,
            notes: form.notes || null
        };

        const action = editing === "new"
            ? createCostEstimate(payload)
            : updateCostEstimate(editing, payload);

        action
            .then(() => { setEditing(null); load(); })
            .catch(err => console.error("Error saving cost estimate:", err));
    };

    const handleDelete = (id) => {
        if (!window.confirm("Delete this cost estimate?")) return;
        deleteCostEstimate(id)
            .then(() => load())
            .catch(err => console.error("Error deleting cost estimate:", err));
    };

    const moneyFields = [
        { key: "design_cost", label: "Design" },
        { key: "permitting_cost", label: "Permitting" },
        { key: "equipment_cost", label: "Equipment" },
        { key: "installation_cost", label: "Installation" },
        { key: "utility_cost", label: "Utility" },
        { key: "other_cost", label: "Other" }
    ];

    const projectName = (pid) => {
        if (!pid) return "— No Project —";
        const p = projects.find(p => p.id === pid);
        return p ? p.name : `Project #${pid}`;
    };

    if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading cost estimates…</p>;

    return (
        <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h4 style={{ margin: 0 }}>Cost Estimates</h4>
                {canEdit && editing !== "new" && (
                    <button className="btn btn-sm btn-primary" onClick={startNew}>+ Add Estimate</button>
                )}
            </div>

            {editing === "new" && (
                <EstimateForm
                    form={form}
                    projects={projects}
                    onChange={handleChange}
                    onSave={handleSave}
                    onCancel={() => setEditing(null)}
                    moneyFields={moneyFields}
                    isNew
                />
            )}

            {estimates.length === 0 && editing !== "new" && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No cost estimates for this site yet.</p>
            )}

            {estimates.length > 0 && (
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Project</th>
                                {moneyFields.map(f => <th key={f.key}>{f.label}</th>)}
                                <th>Total</th>
                                <th>Notes</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {estimates.map(est => (
                                editing === est.id ? (
                                    <tr key={est.id}>
                                        <td colSpan={moneyFields.length + 4}>
                                            <EstimateForm
                                                form={form}
                                                projects={projects}
                                                onChange={handleChange}
                                                onSave={handleSave}
                                                onCancel={() => setEditing(null)}
                                                moneyFields={moneyFields}
                                            />
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key={est.id}>
                                        <td>{projectName(est.project_id)}</td>
                                        {moneyFields.map(f => <td key={f.key}>{fmt$(est[f.key])}</td>)}
                                        <td><strong>{fmt$(est.total)}</strong></td>
                                        <td style={{ maxWidth: "160px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{est.notes || "—"}</td>
                                        <td>
                                            {canEdit && <button className="btn btn-sm" onClick={() => startEdit(est)} style={{ marginRight: "4px" }}>Edit</button>}
                                            {canEdit && <button className="btn btn-sm btn-danger" onClick={() => handleDelete(est.id)}>Delete</button>}
                                        </td>
                                    </tr>
                                )
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const EstimateForm = ({ form, projects, onChange, onSave, onCancel, moneyFields, isNew }) => (
    <div className="card" style={{ padding: "16px", marginBottom: "8px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <div>
                <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>Project</label>
                <select name="project_id" value={form.project_id} onChange={onChange} className="form-control" style={{ width: "100%" }}>
                    <option value="">— No Project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
            </div>
            {moneyFields.map(f => (
                <div key={f.key}>
                    <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>{f.label} ($)</label>
                    <input
                        type="number"
                        name={f.key}
                        value={form[f.key]}
                        onChange={onChange}
                        placeholder="0"
                        className="form-control"
                        style={{ width: "100%" }}
                    />
                </div>
            ))}
            <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>Notes</label>
                <input
                    type="text"
                    name="notes"
                    value={form.notes}
                    onChange={onChange}
                    placeholder="Optional notes…"
                    className="form-control"
                    style={{ width: "100%" }}
                />
            </div>
        </div>
        <div>
            <button className="btn btn-sm btn-primary" onClick={onSave} style={{ marginRight: "8px" }}>
                {isNew ? "Add Estimate" : "Save Changes"}
            </button>
            <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        </div>
    </div>
);

// ─── Milestones Sub-section ───────────────────────────────────────────────────

const MilestonesPanel = ({ siteId, projects, canEdit = false }) => {
    const [milestones, setMilestones] = useState([]);
    const [milestoneTypes, setMilestoneTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [initProjectId, setInitProjectId] = useState("");
    const [initBusy, setInitBusy] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});

    const load = useCallback(() => {
        setLoading(true);
        Promise.all([
            getMilestones({ siteId }),
            getMilestoneTypes()
        ])
            .then(([mRes, tRes]) => {
                setMilestones(mRes.data || []);
                setMilestoneTypes(tRes.data || []);
            })
            .catch(err => console.error("Error loading milestones:", err))
            .finally(() => setLoading(false));
    }, [siteId]);

    useEffect(() => { load(); }, [load]);

    const handleInitialize = () => {
        if (!initProjectId) { alert("Please select a project first."); return; }
        setInitBusy(true);
        initializeMilestones(Number(initProjectId), Number(siteId))
            .then(() => { setInitProjectId(""); load(); })
            .catch(err => console.error("Error initializing milestones:", err))
            .finally(() => setInitBusy(false));
    };

    const startEdit = (m) => {
        setEditingId(m.id);
        setEditForm({
            target_date: m.target_date || "",
            actual_date: m.actual_date || "",
            notes: m.notes || ""
        });
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditForm(f => ({ ...f, [name]: value }));
    };

    const handleSave = (id) => {
        const payload = {
            target_date: editForm.target_date || null,
            actual_date: editForm.actual_date || null,
            notes: editForm.notes || null
        };
        updateMilestone(id, payload)
            .then(() => { setEditingId(null); load(); })
            .catch(err => console.error("Error updating milestone:", err));
    };

    // Group milestones by project
    const byProject = milestones.reduce((acc, m) => {
        const key = m.project_id ?? "none";
        if (!acc[key]) acc[key] = { name: m.project_name || "— No Project —", items: [] };
        acc[key].items.push(m);
        return acc;
    }, {});

    const milestoneOrder = milestoneTypes.reduce((acc, t, i) => { acc[t] = i; return acc; }, {});
    const sortMilestones = (items) =>
        [...items].sort((a, b) => (milestoneOrder[a.milestone_type] ?? 99) - (milestoneOrder[b.milestone_type] ?? 99));

    const today = new Date().toISOString().slice(0, 10);
    const rowStyle = (m) => {
        if (m.actual_date) return { backgroundColor: "rgba(40,167,69,0.08)" };
        if (m.target_date && m.target_date < today) return { backgroundColor: "rgba(220,53,69,0.08)" };
        return {};
    };

    if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading milestones…</p>;

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h4 style={{ margin: 0 }}>Construction Milestones</h4>
            </div>

            {/* Initialize standard milestones for a project */}
            {canEdit && (
            <div className="card" style={{ padding: "12px", marginBottom: "16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Initialize standard milestones for:</span>
                <select
                    value={initProjectId}
                    onChange={e => setInitProjectId(e.target.value)}
                    className="form-control"
                    style={{ width: "220px" }}
                >
                    <option value="">— Select project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                    className="btn btn-sm btn-primary"
                    onClick={handleInitialize}
                    disabled={initBusy || !initProjectId}
                >
                    {initBusy ? "Initializing…" : "Initialize"}
                </button>
            </div>
            )}

            {Object.keys(byProject).length === 0 && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>No milestones for this site yet. Use the Initialize button above.</p>
            )}

            {Object.entries(byProject).map(([pid, group]) => (
                <div key={pid} style={{ marginBottom: "20px" }}>
                    <div style={{ fontWeight: "600", marginBottom: "6px", color: "var(--link)" }}>{group.name}</div>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Milestone</th>
                                    <th>Target Date</th>
                                    <th>Actual Date</th>
                                    <th>Status</th>
                                    <th>Notes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortMilestones(group.items).map(m => (
                                    editingId === m.id ? (
                                        <tr key={m.id}>
                                            <td>{m.milestone_type}</td>
                                            <td>
                                                <input
                                                    type="date"
                                                    name="target_date"
                                                    value={editForm.target_date}
                                                    onChange={handleEditChange}
                                                    className="form-control"
                                                    style={{ width: "140px" }}
                                                />
                                            </td>
                                            <td>
                                                <input
                                                    type="date"
                                                    name="actual_date"
                                                    value={editForm.actual_date}
                                                    onChange={handleEditChange}
                                                    className="form-control"
                                                    style={{ width: "140px" }}
                                                />
                                            </td>
                                            <td>—</td>
                                            <td>
                                                <input
                                                    type="text"
                                                    name="notes"
                                                    value={editForm.notes}
                                                    onChange={handleEditChange}
                                                    placeholder="Notes…"
                                                    className="form-control"
                                                    style={{ width: "160px" }}
                                                />
                                            </td>
                                            <td>
                                                <button className="btn btn-sm btn-primary" onClick={() => handleSave(m.id)} style={{ marginRight: "4px" }}>Save</button>
                                                <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={m.id} style={rowStyle(m)}>
                                            <td>{m.milestone_type}</td>
                                            <td>{m.target_date || "—"}</td>
                                            <td>{m.actual_date || "—"}</td>
                                            <td>
                                                {m.actual_date
                                                    ? <span style={{ color: "var(--success, #28a745)", fontWeight: "bold" }}>✓ Complete</span>
                                                    : m.target_date && m.target_date < today
                                                        ? <span style={{ color: "var(--danger, #dc3545)", fontWeight: "bold" }}>! Past Due</span>
                                                        : <span style={{ color: "var(--text-secondary)" }}>○ Pending</span>
                                                }
                                            </td>
                                            <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{m.notes || "—"}</td>
                                            <td>
                                                {canEdit && <button className="btn btn-sm" onClick={() => startEdit(m)}>Edit</button>}
                                            </td>
                                        </tr>
                                    )
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ─── Main Export ──────────────────────────────────────────────────────────────

const SiteCostsSection = ({ siteId, canEdit = false }) => {
    const [projects, setProjects] = useState([]);

    useEffect(() => {
        getProjects()
            .then(res => setProjects(res.data || []))
            .catch(err => console.error("Error loading projects:", err));
    }, []);

    return (
        <div style={{ marginTop: "8px" }}>
            <CostEstimatesPanel siteId={siteId} projects={projects} canEdit={canEdit} />
            <hr />
            <MilestonesPanel siteId={siteId} projects={projects} canEdit={canEdit} />
        </div>
    );
};

export default SiteCostsSection;
