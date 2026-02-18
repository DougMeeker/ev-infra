import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { updateSite, deleteSite, getSiteMetrics, getSite, getEquipmentEnergy } from "../api";
import EquipmentSection from "../components/EquipmentSection";
import BillsSection from "../components/BillsSection";
import SiteProjectsSection from "../components/SiteProjectsSection";
import ChargersSection from "../components/ChargersSection";
import FilesSection from "../components/FilesSection";
import ServicesSection from "../components/ServicesSection";

const SiteDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [site, setSite] = useState(null);
    const [formData, setFormData] = useState({});
    const [editing, setEditing] = useState(false);
    const [metrics, setMetrics] = useState(null);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [energySummary, setEnergySummary] = useState(null);
    const [showProjects, setShowProjects] = useState(() => JSON.parse(localStorage.getItem("showProjects") ?? "true"));
    const [showChargers, setShowChargers] = useState(() => JSON.parse(localStorage.getItem("showChargers") ?? "true"));
    const [showEquipment, setShowEquipment] = useState(() => JSON.parse(localStorage.getItem("showEquipment") ?? "true"));
    const [showBills, setShowBills] = useState(() => JSON.parse(localStorage.getItem("showBills") ?? "true"));
    const [showFiles, setShowFiles] = useState(() => JSON.parse(localStorage.getItem("showFiles") ?? "true"));
    const [showServices, setShowServices] = useState(() => JSON.parse(localStorage.getItem("showServices") ?? "true"));

    useEffect(() => {
        getSite(id)
            .then(res => {
                setSite(res.data);
                const { bills, ...rest } = res.data || {};
                // Ensure leased has a default value
                setFormData({ ...rest, leased: rest.leased || false });
            })
            .catch(err => console.error("Error fetching site:", err));
        setMetricsLoading(true);
        Promise.all([
            getSiteMetrics(id),
            getEquipmentEnergy(id)
        ])
            .then(([metricsRes, energyRes]) => {
                setMetrics(metricsRes.data);
                setEnergySummary(energyRes.data);
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
                                <div className="form-group"><label>Department ID</label><input className="input" name="department_id" value={formData.department_id || ""} onChange={handleChange} /></div>
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
                                <div><span>Department ID:</span><strong>{site.department_id || 'N/A'}</strong></div>
                            </div>
                        </div>
                    </div>
                    <div>
                        <br />
                        <button className="btn" onClick={() => setEditing(true)}>Edit</button>
                    </div>
                    {metricsLoading && (
                        <div className="metrics-block">
                            <h4>Capacity Metrics</h4>
                            <div className="skeleton sk-line" style={{ width: '40%', marginBottom: 8 }} />
                            <div className="skeleton sk-line" style={{ width: '60%', marginBottom: 8 }} />
                            <div className="skeleton sk-line" style={{ width: '50%', marginBottom: 8 }} />
                        </div>
                    )}
                    {!metricsLoading && metrics && (
                        <>
                            <div className="metrics-block">
                                <h4>Capacity Metrics</h4>
                                <p><strong>Service Capacity (kW):</strong> {metrics.theoretical_capacity_kw ?? 'N/A'} <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>(from electrical service specs)</span></p>
                                <p><strong>Peak Demand (kW):</strong> {metrics.bill_count === 0 ? 'Unknown (no bills)' : metrics.last_year_peak_kw} <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>(from utility bills)</span></p>
                                <p><strong>Available Capacity (kW):</strong> {
                                    metrics.bill_count === 0 ? 'Unknown (no bills)' :
                                        metrics.available_capacity_kw !== null && metrics.available_capacity_kw !== undefined
                                            ? metrics.available_capacity_kw
                                            : 'N/A'
                                } <span style={{ fontSize: '0.85em', color: 'var(--muted)' }}>(service capacity - peak demand)</span></p>
                            </div>
                            {energySummary && (
                                <div className="metrics-block" style={{ marginTop: '16px' }}>
                                    <h4>Equipment Energy Summary ({energySummary.year})</h4>
                                    <p><strong>Total Miles:</strong> {energySummary.total_miles != null ? Number(energySummary.total_miles).toLocaleString(undefined) : '—'}</p>
                                    <p><strong>Daily Avg kWh:</strong> {energySummary.site_daily_avg_kwh != null ? Number(energySummary.site_daily_avg_kwh).toFixed(2) : '—'}</p>
                                    <p><strong>Daily Max kWh:</strong> <span title="Max daily energy in any single month across vehicles">{energySummary.site_daily_max_kwh != null ? Number(energySummary.site_daily_max_kwh).toFixed(2) : '—'}</span></p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            <button className="btn btn-danger" onClick={handleDelete}>Delete Site</button>

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
        </div>
    );
};

export default SiteDetails;
