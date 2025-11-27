import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { updateSite, deleteSite, getBills, createBill, updateBill, deleteBill, getSiteMetrics } from "../api";
import axios from "axios";
import EquipmentSection from "../components/EquipmentSection";

const SiteDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [site, setSite] = useState(null);
    const [formData, setFormData] = useState({});
    const [editing, setEditing] = useState(false);
    const [bills, setBills] = useState([]);
    const [billsLoading, setBillsLoading] = useState(false);
    const [newBill, setNewBill] = useState({ year: "", month: "", energy_usage: "", max_power: "" });
    const [billEditingId, setBillEditingId] = useState(null);
    const [billEditData, setBillEditData] = useState({});
    const [metrics, setMetrics] = useState(null);
    const [metricsLoading, setMetricsLoading] = useState(false);

    useEffect(() => {
        axios.get(`http://localhost:5000/api/sites/${id}`)
            .then(res => {
                setSite(res.data);
                const { bills, ...rest } = res.data || {};
                setFormData(rest);
            })
            .catch(err => console.error("Error fetching site:", err));
        setBillsLoading(true);
        getBills(id)
            .then(res => setBills(res.data))
            .catch(err => console.error("Error fetching bills:", err))
            .finally(() => setBillsLoading(false));
        setMetricsLoading(true);
        getSiteMetrics(id)
            .then(res => setMetrics(res.data))
            .catch(err => console.error("Error fetching metrics:", err))
            .finally(() => setMetricsLoading(false));
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

    const handleNewBillChange = (e) => setNewBill({ ...newBill, [e.target.name]: e.target.value });

    const handleCreateBill = () => {
        if (!newBill.year || !newBill.month) { alert("Year and month required"); return; }
        const payload = {
            year: parseInt(newBill.year, 10),
            month: parseInt(newBill.month, 10),
            energy_usage: newBill.energy_usage ? parseFloat(newBill.energy_usage) : null,
            max_power: newBill.max_power ? parseFloat(newBill.max_power) : null
        };
        createBill(id, payload)
            .then(res => { setBills([res.data, ...bills]); setNewBill({ year: "", month: "", energy_usage: "", max_power: "" }); })
            .catch(err => { console.error("Error creating bill:", err); alert("Failed to create bill"); });
    };

    const startEditBill = (bill) => {
        setBillEditingId(bill.id);
        setBillEditData({
            year: bill.year,
            month: bill.month,
            energy_usage: bill.energy_usage,
            max_power: bill.max_power
        });
    };
    const handleBillEditChange = (e) => setBillEditData({ ...billEditData, [e.target.name]: e.target.value });

    const handleSaveBill = () => {
        const payload = {
            year: parseInt(billEditData.year, 10),
            month: parseInt(billEditData.month, 10),
            energy_usage: billEditData.energy_usage !== "" ? parseFloat(billEditData.energy_usage) : null,
            max_power: billEditData.max_power !== "" ? parseFloat(billEditData.max_power) : null
        };
        updateBill(billEditingId, payload)
            .then(res => { setBills(bills.map(b => b.id === billEditingId ? res.data : b)); setBillEditingId(null); setBillEditData({}); })
            .catch(err => { console.error("Error updating bill:", err); alert("Failed to update bill"); });
    };

    const handleDeleteBill = (billId) => {
        if (!window.confirm("Delete this bill?")) return;
        deleteBill(billId)
            .then(() => setBills(bills.filter(b => b.id !== billId)))
            .catch(err => { console.error("Error deleting bill:", err); alert("Failed to delete bill"); });
    };

    if (!site) return <p>Loading...</p>;

    return (
        <div className="container">
            <h2 className="page-header">Site Details</h2>
            <div className="flex-row gap-sm" style={{ marginBottom:'12px' }}>
                <button className="btn btn-secondary" onClick={() => navigate(`/?focus=${id}`)}>View on Map</button>
                <button className="btn btn-secondary" onClick={() => navigate('/')}>Home</button>
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
                        </div>
                    )}
                    <button className="btn" onClick={() => setEditing(true)}>Edit</button>
                </div>
            )}
            <button className="btn btn-danger" onClick={handleDelete}>Delete Site</button>

            <hr />
            <h3 style={{ marginTop: '32px' }}>Utility Bills</h3>
            <div className="card">
                <h4 style={{ marginTop: 0 }}>Add Bill</h4>
                <div className="flex-row gap-sm" style={{ flexWrap: 'wrap' }}>
                    <input className="input" name="year" placeholder="Year" value={newBill.year} onChange={handleNewBillChange} style={{ width: '90px' }} />
                    <input className="input" name="month" placeholder="Month" value={newBill.month} onChange={handleNewBillChange} style={{ width: '70px' }} />
                    <input className="input" name="energy_usage" placeholder="Energy kWh" value={newBill.energy_usage} onChange={handleNewBillChange} style={{ width: '140px' }} />
                    <input className="input" name="max_power" placeholder="Max kW" value={newBill.max_power} onChange={handleNewBillChange} style={{ width: '110px' }} />
                    <button className="btn" onClick={handleCreateBill}>Add</button>
                </div>
            </div>

            {billsLoading ? (
                <table className="table">
                    <tbody>
                        {[...Array(3)].map((_, i) => (
                            <tr className="sk-table-row" key={i}>
                                <td><div className="skeleton sk-line" style={{ width: '40%' }} /></td>
                                <td><div className="skeleton sk-line" /></td>
                                <td><div className="skeleton sk-line" /></td>
                                <td><div className="skeleton sk-line short" /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : bills.length === 0 ? (
                <p>No bills yet.</p>
            ) : (
                <table className="table">
                    <thead>
                        <tr>
                            <th style={{ borderBottom: '1px solid #ddd' }}>Period</th>
                            <th style={{ borderBottom: '1px solid #ddd' }}>Energy (kWh)</th>
                            <th style={{ borderBottom: '1px solid #ddd' }}>Max Power (kW)</th>
                            <th style={{ borderBottom: '1px solid #ddd' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bills.map(bill => (
                            <tr key={bill.id}>
                                <td>{bill.year}-{String(bill.month).padStart(2, '0')}</td>
                                {billEditingId === bill.id ? (
                                    <>
                                        <td><input className="input" name="energy_usage" value={billEditData.energy_usage ?? ''} onChange={handleBillEditChange} style={{ width: '100px' }} /></td>
                                        <td><input className="input" name="max_power" value={billEditData.max_power ?? ''} onChange={handleBillEditChange} style={{ width: '90px' }} /></td>
                                        <td>
                                            <button className="btn" onClick={handleSaveBill}>Save</button>
                                            <button className="btn btn-secondary" onClick={() => setBillEditingId(null)}>Cancel</button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td>{bill.energy_usage ?? '—'}</td>
                                        <td>{bill.max_power ?? '—'}</td>
                                        <td>
                                            <button className="btn btn-secondary" onClick={() => startEditBill(bill)}>Edit</button>
                                            <button className="btn btn-danger" onClick={() => handleDeleteBill(bill.id)}>Delete</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Equipment Section */}
            <EquipmentSection siteId={id} />
        </div>
    );
};

export default SiteDetails;
