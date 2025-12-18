import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { updateSite, deleteSite, getSiteMetrics, getSite } from "../api";
import EquipmentSection from "../components/EquipmentSection";
import BillsSection from "../components/BillsSection";
import ProjectsSection from "../components/ProjectsSection";
import ChargersSection from "../components/ChargersSection";
const formatDate = (d) => {
    if (!d) return '';
    try {
      const s = typeof d === 'date' ? d : new Date(d).toISOString().split('T')[0];
      return s;
    } catch {
      return String(d);
    }
  };

const SiteDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [site, setSite] = useState(null);
    const [formData, setFormData] = useState({});
    const [editing, setEditing] = useState(false);
    const [billsTotalEnergyKwh, setBillsTotalEnergyKwh] = useState(0);
    const [metrics, setMetrics] = useState(null);
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [showProjects, setShowProjects] = useState(true);
    const [showChargers, setShowChargers] = useState(true);
    const [showEquipment, setShowEquipment] = useState(true);
    const [showBills, setShowBills] = useState(true);

    useEffect(() => {
        getSite(id)
            .then(res => {
                setSite(res.data);
                const { bills, ...rest } = res.data || {};
                setFormData(rest);
            })
            .catch(err => console.error("Error fetching site:", err));
        setMetricsLoading(true);
        getSiteMetrics(id)
            .then(res => setMetrics(res.data))
            .catch(err => console.error("Error fetching metrics:", err))
            .finally(() => setMetricsLoading(false));
        // Chargers and Projects are loaded within their respective sections now
    }, [id]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSave = () => {
        updateSite(id, formData)
            .then(res => { setSite(res.data); setEditing(false); })
            .catch(err => { console.error("Error updating site:", err); alert("Failed to update site."); });
    };

    const handleDelete = () => {
        if (!window.confirm("Delete this site?")) return;
        deleteSite(id)
            .then(() => { alert("Site deleted."); navigate("/"); })
            .catch(err => { console.error("Error deleting site:", err); alert("Failed to delete site."); });
    };

    const avgWorkdayEnergyKwh = billsTotalEnergyKwh / 260;

    if (!site) return <p>Loading...</p>;

    return (
        <div className="container">
            <h2 className="page-header">Site Details</h2>
            <div className="flex-row gap-sm" style={{ marginBottom:'12px' }}>
                <button className="btn btn-secondary" onClick={() => navigate(`/?focus=${id}`)}>View on Map</button>
                <button className="btn btn-secondary" onClick={() => navigate('/')}>Home</button>
                <button className="btn" onClick={() => navigate(`/chargers?siteId=${id}`)}>Manage Chargers</button>
            </div>
            {editing ? (
                <div className="card">
                    <div className="form-sections">
                        <div className="form-section">
                            <h4 className="form-section-title">Location</h4>
                            <div className="form-grid">
                                <div className="form-group"><label>Name</label><input className="input" name="name" value={formData.name || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Department ID</label><input className="input" name="department_id" value={formData.department_id || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Address</label><input className="input" name="address" value={formData.address || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>City</label><input className="input" name="city" value={formData.city || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Latitude</label><input className="input" name="latitude" value={formData.latitude || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Longitude</label><input className="input" name="longitude" value={formData.longitude || ""} onChange={handleChange} /></div>
                            </div>
                        </div>
                        <div className="form-section">
                            <h4 className="form-section-title">Utility</h4>
                            <div className="form-grid">
                                <div className="form-group"><label>Utility</label><input className="input" name="utility" value={formData.utility || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Account Name</label><input className="input" name="utility_name" value={formData.utility_name || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Account #</label><input className="input" name="utility_account" value={formData.utility_account || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Meter #</label><input className="input" name="meter_number" value={formData.meter_number || ""} onChange={handleChange} /></div>
                            </div>
                        </div>
                        <div className="form-section">
                            <h4 className="form-section-title">Contact</h4>
                            <div className="form-grid">
                                <div className="form-group"><label>Contact Name</label><input className="input" name="contact_name" value={formData.contact_name || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Contact Phone</label><input className="input" name="contact_phone" value={formData.contact_phone || ""} onChange={handleChange} /></div>
                            </div>
                        </div>
                        <div className="form-section">
                            <h4 className="form-section-title">Electrical Capacity</h4>
                            <div className="form-grid">
                                <div className="form-group"><label>Main Breaker Amps</label><input className="input" name="main_breaker_amps" value={formData.main_breaker_amps || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Voltage</label><input className="input" name="voltage" value={formData.voltage || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Phase Count</label><input className="input" name="phase_count" value={formData.phase_count || ""} onChange={handleChange} /></div>
                                <div className="form-group"><label>Power Factor</label><input className="input" name="power_factor" value={formData.power_factor || ""} onChange={handleChange} /></div>
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
                                <div><span>Name:</span><strong>{site.name}</strong></div>
                                <div><span>Department ID:</span><strong>{site.department_id || 'N/A'}</strong></div>
                                <div><span>Address:</span><strong>{site.address || 'N/A'}</strong></div>
                                <div><span>City:</span><strong>{site.city || 'N/A'}</strong></div>
                                <div><span>Latitude:</span><strong>{site.latitude}</strong></div>
                                <div><span>Longitude:</span><strong>{site.longitude}</strong></div>
                            </div>
                        </div>
                        <div className="details-section">
                            <h4>Utility</h4>
                            <div className="detail-pairs">
                                <div><span>Utility:</span><strong>{site.utility || 'N/A'}</strong></div>
                                <div><span>Account Name:</span><strong>{site.utility_name || 'N/A'}</strong></div>
                                <div><span>Account #:</span><strong>{site.utility_account || 'N/A'}</strong></div>
                                <div><span>Meter #:</span><strong>{site.meter_number || 'N/A'}</strong></div>
                            </div>
                        </div>
                        <div className="details-section">
                            <h4>Contact</h4>
                            <div className="detail-pairs">
                                <div><span>Name:</span><strong>{site.contact_name || 'N/A'}</strong></div>
                                <div><span>Phone:</span><strong>{site.contact_phone || 'N/A'}</strong></div>
                            </div>
                        </div>
                        <div className="details-section">
                            <h4>Electrical Capacity</h4>
                            <div className="detail-pairs">
                                <div><span>Main Breaker Amps:</span><strong>{site.main_breaker_amps || 'N/A'}</strong></div>
                                <div><span>Voltage:</span><strong>{site.voltage || 'N/A'}</strong></div>
                                <div><span>Phase Count:</span><strong>{site.phase_count || 'N/A'}</strong></div>
                                <div><span>Power Factor:</span><strong>{site.power_factor || '0.95'}</strong></div>
                            </div>
                        </div>
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
                        <div className="metrics-block">
                            <h4>Capacity Metrics</h4>
                            <p><strong>Last Year Peak (kW):</strong> {metrics.last_year_peak_kw}</p>
                            <p><strong>Theoretical Capacity (kW):</strong> {metrics.theoretical_capacity_kw ?? 'N/A'}</p>
                            <p><strong>Available Capacity (kW):</strong> {metrics.available_capacity_kw ?? 'N/A'}</p>
                            <p><strong>Power Factor Used:</strong> {metrics.power_factor}</p>
                            <p><strong>Total Energy (kWh):</strong> {Math.round(billsTotalEnergyKwh * 1000) / 1000}</p>
                            <p><strong>Avg Workday Energy (kWh/day):</strong> {Math.round(avgWorkdayEnergyKwh * 1000) / 1000}</p>
                        </div>
                    )}
                    <button className="btn" onClick={() => setEditing(true)}>Edit</button>
                </div>
            )}
            <button className="btn btn-danger" onClick={handleDelete}>Delete Site</button>

            {/* Projects Section */}
            <hr />
            <h3 style={{ marginTop: '32px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setShowProjects(v => !v)}>
                {showProjects ? '▼' : '▶'} Projects
            </h3>
            {showProjects && (<ProjectsSection siteId={id} />)}

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
                <BillsSection siteId={id} onTotalsChange={setBillsTotalEnergyKwh} />
            )}
        </div>
    );
};

export default SiteDetails;
