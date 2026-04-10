import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { updateSite, deleteSite, getSiteMetrics, getSite, getEquipmentEnergy, getVehicleCountsBySite, getSiteDepartments, getSiteScore, getCostEstimates, createCostEstimate, updateCostEstimate, deleteCostEstimate, getProjects, getMilestones, initializeMilestones, updateMilestone } from "../api";
import EquipmentSection from "../components/EquipmentSection";
import BillsSection from "../components/BillsSection";
import SiteProjectsSection from "../components/SiteProjectsSection";
import ChargersSection from "../components/ChargersSection";
import FilesSection from "../components/FilesSection";
import ServicesSection from "../components/ServicesSection";
import SiteCostsSection from "../components/SiteCostsSection";
import ChargerCapacitySection from "../components/ChargerCapacitySection";

const SiteDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [site, setSite] = useState(null);
    const [formData, setFormData] = useState({});
    const [editing, setEditing] = useState(false);
    const [metrics, setMetrics] = useState(null);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [energySummary, setEnergySummary] = useState(null);
    const [vehicleCount, setVehicleCount] = useState(null);
    const [showProjects, setShowProjects] = useState(() => JSON.parse(localStorage.getItem("showProjects") ?? "true"));
    const [showChargers, setShowChargers] = useState(() => JSON.parse(localStorage.getItem("showChargers") ?? "true"));
    const [showEquipment, setShowEquipment] = useState(() => JSON.parse(localStorage.getItem("showEquipment") ?? "true"));
    const [showBills, setShowBills] = useState(() => JSON.parse(localStorage.getItem("showBills") ?? "true"));
    const [showFiles, setShowFiles] = useState(() => JSON.parse(localStorage.getItem("showFiles") ?? "true"));
    const [showServices, setShowServices] = useState(() => JSON.parse(localStorage.getItem("showServices") ?? "true"));
    const [showDepartments, setShowDepartments] = useState(() => JSON.parse(localStorage.getItem("showDepartments") ?? "true"));
    const [departments, setDepartments] = useState([]);
    const [priorityScore, setPriorityScore] = useState(null);
    const [showCosts, setShowCosts] = useState(() => JSON.parse(localStorage.getItem("showCosts") ?? "false"));

    useEffect(() => {
        getSite(id)
            .then(res => {
                setSite(res.data);
                const { bills, ...rest } = res.data || {};
                // Ensure leased has a default value
                setFormData({ ...rest, leased: rest.leased || false });
            })
            .catch(err => console.error("Error fetching site:", err));
        getSiteDepartments(id)
            .then(res => setDepartments((res.data && res.data.items) || []))
            .catch(() => setDepartments([]));
        getSiteScore(id)
            .then(res => setPriorityScore(res.data))
            .catch(() => setPriorityScore(null));
        setMetricsLoading(true);
        Promise.all([
            getSiteMetrics(id),
            getEquipmentEnergy(id),
            getVehicleCountsBySite(id)
        ])
            .then(([metricsRes, energyRes, vehicleCountRes]) => {
                setMetrics(metricsRes.data);
                setEnergySummary(energyRes.data);
                setVehicleCount(vehicleCountRes.data);
            })
            .catch(err => console.error("Error fetching metrics:", err))
            .finally(() => setMetricsLoading(false));
        // Chargers and Projects are loaded within their respective sections now
    }, [id]);

    // Persist section visibility to localStorage
    useEffect(() => {
        localStorage.setItem("showProjects", JSON.stringify(showProjects));
    }, [showProjects]);

    useEffect(() => {
        localStorage.setItem("showChargers", JSON.stringify(showChargers));
    }, [showChargers]);

    useEffect(() => {
        localStorage.setItem("showEquipment", JSON.stringify(showEquipment));
    }, [showEquipment]);

    useEffect(() => {
        localStorage.setItem("showBills", JSON.stringify(showBills));
    }, [showBills]);

    useEffect(() => {
        localStorage.setItem("showFiles", JSON.stringify(showFiles));
    }, [showFiles]);

    useEffect(() => {
        localStorage.setItem("showServices", JSON.stringify(showServices));
    }, [showServices]);

    useEffect(() => {
        localStorage.setItem("showDepartments", JSON.stringify(showDepartments));
    }, [showDepartments]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSave = () => {
        // Ensure leased is always included in the payload
        const payload = { ...formData, leased: formData.leased || false };
        updateSite(id, payload)
            .then(res => { setSite(res.data); setEditing(false); })
            .catch(err => { console.error("Error updating site:", err); alert("Failed to update site."); });
    };

    const handleDelete = () => {
        if (!window.confirm("Delete this site?")) return;
        deleteSite(id)
            .then(() => { alert("Site deleted."); navigate("/"); })
            .catch(err => { console.error("Error deleting site:", err); alert("Failed to delete site."); });
    };

    if (!site) return <p>Loading...</p>;

    return (
        <div className="container">
            <h2 className="page-header">{site.name ?? "Site Details"}</h2>
            <div className="flex-row gap-sm" style={{ marginBottom: '12px' }}>
                <button className="btn" onClick={() => navigate(`/?focus=${id}`)}>View on Map</button>
            </div>
            {priorityScore && priorityScore.needs_survey && (
                <div style={{ padding: '10px 14px', marginBottom: 12, background: '#fff3e0', border: '1px solid #ffe0b2', borderRadius: 6 }}>
                    <strong>⚠️ Site Survey Needed:</strong> This site has vehicles assigned but no electrical service data. Schedule a site visit to collect service information.
                </div>
            )}
            {priorityScore && (
                <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <strong>Data Completeness:</strong>
                        <div style={{ background: '#e0e0e0', borderRadius: 4, height: 14, width: 150, position: 'relative' }}>
                            <div style={{ background: priorityScore.data_completeness_score >= 75 ? '#4caf50' : priorityScore.data_completeness_score >= 40 ? '#ff9800' : '#f44336', width: `${priorityScore.data_completeness_score}%`, height: '100%', borderRadius: 4 }} />
                        </div>
                        <span>{priorityScore.data_completeness_score?.toFixed(0)}%</span>
                        <span style={{ color: '#888', fontSize: 12 }}>
                            {priorityScore.data_completeness_score < 25 && '(Missing: service data)'}
                            {priorityScore.data_completeness_score >= 25 && priorityScore.data_completeness_score < 60 && '(Missing: utility bills or usage data)'}
                            {priorityScore.data_completeness_score >= 60 && priorityScore.data_completeness_score < 100 && '(Partially complete)'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>Priority Score: <strong>{priorityScore.composite_score?.toFixed(1)}</strong></span>
                    </div>
                </div>
            )}
            {energySummary && 
                <div className="card">
                    <div className="form-grid">
                    {energySummary && (
                                    <ChargerCapacitySection 
                                        siteId={id} 
                                        peakConcurrentKwh={energySummary.site_peak_concurrent_kwh}
                                        vehicleCount={vehicleCount?.["counts"] != null ? vehicleCount["counts"]?.[id] != null ? vehicleCount["counts"][id]: null : null}
                                        hours={8}
                                    />
                                )}
                                {energySummary && (
                                    <ChargerCapacitySection 
                                        siteId={id} 
                                        peakConcurrentKwh={energySummary.site_peak_concurrent_kwh} 
                                        vehicleCount={vehicleCount?.["counts"] != null ? vehicleCount["counts"]?.[id] != null ? vehicleCount["counts"][id]: null : null}
                                        hours={2}
                                    />
                                )}
                    </div></div>
            }
            {editing ? (
                <div className="card">
                    <div className="form-sections">
                        <div className="form-section">
                            <h4 className="form-section-title">Location</h4>
                            <div className="form-grid">
                                <div className="form-group"><label>Name</label><input className="input" name="name" value={formData.name || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Address</label><input className="input" name="address" value={formData.address || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>City</label><input className="input" name="city" value={formData.city || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Latitude</label><input className="input" name="latitude" value={formData.latitude || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Longitude</label><input className="input" name="longitude" value={formData.longitude || ""} onChange={handleChange} /></div>
                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ margin: 0 }}>Leased Property</label>
                                    <input type="checkbox" checked={formData.leased || false} onChange={(e) => setFormData({ ...formData, leased: e.target.checked })} style={{ transform: 'scale(1.2)', margin: 0 }} />
                                </div>
                            </div>
                        </div>
                        <div className="form-section">
                            <h4 className="form-section-title">Details</h4>
                            <div className="form-grid">
                                <div className="form-group"><label>Contact Name</label><input className="input" name="contact_name" value={formData.contact_name || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Contact Phone</label><input className="input" name="contact_phone" value={formData.contact_phone || ""} onChange={handleChange} /></div>
                            </div>
                        </div>
                    </div>
                    <div className="flex-row gap-sm" style={{ marginTop: '12px' }}>
                        <button className="btn" onClick={handleSave}>Save</button>
                        <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="card">
                    <div className="details-grid">
                        <div className="details-section">
                            <h4>Location</h4>
                            <div className="detail-pairs">
                                <div><span>Address:</span><strong>{site.address || 'N/A'}</strong></div>
                                <div><span>City:</span><strong>{site.city || 'N/A'}</strong></div>
                                <div><span>Latitude:</span><strong>{site.latitude}</strong></div>
                                <div><span>Longitude:</span><strong>{site.longitude}</strong></div>
                                <div><span>Leased:</span><strong>{site.leased ? 'Yes' : 'No'}</strong></div>
                            </div>
                        </div>
                        <div className="details-section">
                            <h4>Details</h4>
                            <div className="detail-pairs">
                                <div><span>Name:</span><strong>{site.contact_name || 'N/A'}</strong></div>
                                <div><span>Phone:</span><strong>{site.contact_phone || 'N/A'}</strong></div>
                            </div>
                        </div>
                        {metricsLoading && (
                            <div className="details-section">
                                <h4>Capacity Metrics</h4>
                                <div className="skeleton sk-line" style={{ width: '40%', marginBottom: 8 }} />
                                <div className="skeleton sk-line" style={{ width: '60%', marginBottom: 8 }} />
                                <div className="skeleton sk-line" style={{ width: '50%', marginBottom: 8 }} />
                            </div>
                        )}
                        {!metricsLoading && metrics && (
                            <>
                                <div className="details-section">
                                    <h4>Capacity Metrics (kW)</h4>
                                    <div className="detail-pairs">
                                        <div><span>Service:</span><strong> {metrics.theoretical_capacity_kw ?? 'N/A'}</strong></div>
                                        <div><span></span><strong>-</strong></div>
                                        <div><span>Peak Demand:</span><strong> {metrics.bill_count === 0 ? 'Unknown (no bills)' : metrics.last_year_peak_kw}</strong></div>
                                        <div><span></span><strong>=</strong></div>
                                        <div><span>Available:</span><strong> {
                                            metrics.bill_count === 0 ? 'Unknown (no bills)' :
                                                metrics.available_capacity_kw !== null && metrics.available_capacity_kw !== undefined
                                                    ? metrics.available_capacity_kw
                                                    : 'N/A'
                                        }</strong></div></div>
                                </div>
                                {energySummary && (
                                    <div className="details-section" >
                                        <h4>Equipment Energy ({energySummary.period_label || energySummary.year})</h4>
                                        <div className="detail-pairs">
                                            <div><span>Vehicles:</span><strong> {vehicleCount?.["counts"] != null ? vehicleCount["counts"]?.[id] != null ? vehicleCount["counts"][id]: "—" : "—"}</strong></div>
                                            <div><span>Total Miles:</span><strong> {energySummary.total_miles != null ? Number(energySummary.total_miles).toLocaleString(undefined) : '—'}</strong></div>
                                            <div><span>Daily Avg kWh:</span><strong> {energySummary.site_daily_avg_kwh != null ? Number(energySummary.site_daily_avg_kwh).toFixed(2) : '—'}</strong></div>
                                            <div><span title="Sum of each vehicle's peak-month daily energy — conservative basis for charger capacity sizing">Peak Concurrent kWh:</span><strong> {energySummary.site_peak_concurrent_kwh != null ? Number(energySummary.site_peak_concurrent_kwh).toFixed(2) : '—'}</strong></div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div>
                        <br />
                        <div style={{ display: 'flex', gap: '8px' }}>  
                            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
                            <button className="btn btn-danger" onClick={handleDelete}>Delete Site</button>
                        </div>
                    </div>
                </div>
            )}
            

            {/* Departments Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowDepartments(v => !v)}>
                {showDepartments ? '▼' : '▶'} Departments
            </h3>
            {showDepartments && (
                <div className="card">
                    {departments.length === 0 ? (
                        <p style={{ color: '#888', margin: 0 }}>No departments linked to this site.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
                                    <th style={{ padding: '6px 10px' }}>Code</th>
                                    <th style={{ padding: '6px 10px' }}>District</th>
                                    <th style={{ padding: '6px 10px' }}>Unit</th>
                                    <th style={{ padding: '6px 10px' }}>Unit Name</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departments.map(d => (
                                    <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{d.code}</td>
                                        <td style={{ padding: '6px 10px' }}>{d.district}</td>
                                        <td style={{ padding: '6px 10px' }}>{d.unit}</td>
                                        <td style={{ padding: '6px 10px' }}>{d.unit_name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Services/Meters Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowServices(v => !v)}>
                {showServices ? '▼' : '▶'} Services / Meters
            </h3>
            {showServices && (<ServicesSection siteId={id} />)}

            {/* Projects Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowProjects(v => !v)}>
                {showProjects ? '▼' : '▶'} Projects
            </h3>
            {showProjects && (<SiteProjectsSection siteId={id} />)}

            {/* Chargers Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowChargers(v => !v)}>
                {showChargers ? '▼' : '▶'} Chargers
            </h3>
            {showChargers && (<ChargersSection siteId={id} />)}

            {/* Equipment Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowEquipment(v => !v)}>
                {showEquipment ? '▼' : '▶'} Equipment
            </h3>
            {showEquipment && (
                <EquipmentSection siteId={id} />
            )}

            {/* Bills Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowBills(v => !v)}>
                {showBills ? '▼' : '▶'} Utility Bills
            </h3>
            {showBills && (
                <BillsSection siteId={id} />
            )}

            {/* Files Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowFiles(v => !v)}>
                {showFiles ? '▼' : '▶'} Files
            </h3>
            {showFiles && (
                <FilesSection siteId={id} />
            )}

            {/* Cost Estimates & Milestones Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => { setShowCosts(v => !v); localStorage.setItem('showCosts', JSON.stringify(!showCosts)); }}>
                {showCosts ? '▼' : '▶'} Cost Estimates &amp; Milestones
            </h3>
            {showCosts && (
                <SiteCostsSection siteId={id} />
            )}
        </div>
    );
};

export default SiteDetails;
