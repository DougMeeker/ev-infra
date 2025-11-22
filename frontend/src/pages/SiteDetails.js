import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { updateSite, deleteSite, getBills, createBill, updateBill, deleteBill, getSiteMetrics } from "../api";
import axios from "axios";
import { useNavigate } from "react-router-dom";


const SiteDetails = () => {
    const { id } = useParams();
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
    const navigate = useNavigate(); // For redirecting after delete


    useEffect(() => {
        // Fetch site details
        axios.get(`http://localhost:5000/api/sites/${id}`)
            .then((res) => {
                setSite(res.data);
                setFormData(res.data);
            })
            .catch((err) => console.error("Error fetching site:", err));
        // Fetch bills for site
        setBillsLoading(true);
        getBills(id)
            .then(res => setBills(res.data))
            .catch(err => console.error("Error fetching bills:", err))
            .finally(() => setBillsLoading(false));
        // Fetch metrics
        setMetricsLoading(true);
        getSiteMetrics(id)
            .then(res => setMetrics(res.data))
            .catch(err => console.error("Error fetching metrics:", err))
            .finally(() => setMetricsLoading(false));
    }, [id]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = () => {
        updateSite(id, formData)
            .then((res) => {
                setSite(res.data);
                setEditing(false);
                alert("Site updated!");
            })
            .catch((err) => {
                console.error("Error updating site:", err);
                alert("Failed to update site.");
            });
    };

    const handleDelete = () => {
        if (window.confirm("Are you sure you want to delete this site?")) {
            deleteSite(id)
                .then(() => {
                    alert("Site deleted.");
                    navigate("/"); // Redirect to home
                })
                .catch((err) => {
                    console.error("Error deleting site:", err);
                    alert("Failed to delete site.");
                });
        }
    };

    // -------- Utility Bills Handlers --------
    const handleNewBillChange = (e) => {
        setNewBill({ ...newBill, [e.target.name]: e.target.value });
    };

    const handleCreateBill = () => {
        if (!newBill.year || !newBill.month) {
            alert("Year and month required");
            return;
        }
        const payload = {
            year: parseInt(newBill.year, 10),
            month: parseInt(newBill.month, 10),
            energy_usage: newBill.energy_usage ? parseFloat(newBill.energy_usage) : null,
            max_power: newBill.max_power ? parseFloat(newBill.max_power) : null
        };
        createBill(id, payload)
            .then(res => {
                setBills([res.data, ...bills]);
                setNewBill({ year: "", month: "", energy_usage: "", max_power: "" });
                alert("Bill added");
            })
            .catch(err => {
                console.error("Error creating bill:", err);
                alert("Failed to create bill");
            });
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

    const handleBillEditChange = (e) => {
        setBillEditData({ ...billEditData, [e.target.name]: e.target.value });
    };

    const handleSaveBill = () => {
        const payload = {
            year: parseInt(billEditData.year, 10),
            month: parseInt(billEditData.month, 10),
            energy_usage: billEditData.energy_usage !== "" ? parseFloat(billEditData.energy_usage) : null,
            max_power: billEditData.max_power !== "" ? parseFloat(billEditData.max_power) : null
        };
        updateBill(billEditingId, payload)
            .then(res => {
                setBills(bills.map(b => b.id === billEditingId ? res.data : b));
                setBillEditingId(null);
                setBillEditData({});
            })
            .catch(err => {
                console.error("Error updating bill:", err);
                alert("Failed to update bill");
            });
    };

    const handleDeleteBill = (billId) => {
        if (!window.confirm("Delete this bill?")) return;
        deleteBill(billId)
            .then(() => {
                setBills(bills.filter(b => b.id !== billId));
            })
            .catch(err => {
                console.error("Error deleting bill:", err);
                alert("Failed to delete bill");
            });
    };


    if (!site) return <p>Loading...</p>;

    return (
        <div className="container">
            <h2 className="page-header">Site Details</h2>

            {editing ? (
                <div className="card">
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Name</label>
                            <input className="input" name="name" value={formData.name || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Meter Number</label>
                            <input className="input" name="meter_number" value={formData.meter_number || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Latitude</label>
                            <input className="input" name="latitude" value={formData.latitude || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Longitude</label>
                            <input className="input" name="longitude" value={formData.longitude || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Utility</label>
                            <input className="input" name="utility" value={formData.utility || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Utility Account Name</label>
                            <input className="input" name="utility_name" value={formData.utility_name || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Utility Account</label>
                            <input className="input" name="utility_account" value={formData.utility_account || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Contact Name</label>
                            <input className="input" name="contact_name" value={formData.contact_name || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Contact Phone</label>
                            <input className="input" name="contact_phone" value={formData.contact_phone || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Main Breaker Amps</label>
                            <input className="input" name="main_breaker_amps" value={formData.main_breaker_amps || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Voltage</label>
                            <input className="input" name="voltage" value={formData.voltage || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Phase Count</label>
                            <input className="input" name="phase_count" value={formData.phase_count || ""} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Power Factor</label>
                            <input className="input" name="power_factor" value={formData.power_factor || ""} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="flex-row gap-sm" style={{marginTop:'12px'}}>
                        <button className="btn" onClick={handleSave}>Save</button>
                        <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                </div>
            ) : (
                <div className="card">
                    <p><strong>Name:</strong> {site.name}</p>
                    <p><strong>Utility:</strong> {site.utility || "N/A"}</p>
                    <p><strong>Meter Number:</strong> {site.meter_number || "N/A"}</p>
                    <p><strong>Latitude:</strong> {site.latitude}</p>
                    <p><strong>Longitude:</strong> {site.longitude}</p>
                    <p><strong>Utility Name:</strong> {site.utility_name || "N/A"}</p>
                    <p><strong>Utility Account:</strong> {site.utility_account || "N/A"}</p>
                    <p><strong>Contact Name:</strong> {site.contact_name || "N/A"}</p>
                    <p><strong>Contact Phone:</strong> {site.contact_phone || "N/A"}</p>
                    <p><strong>Main Breaker Amps:</strong> {site.main_breaker_amps || "N/A"}</p>
                    <p><strong>Voltage:</strong> {site.voltage || "N/A"}</p>
                    <p><strong>Phase Count:</strong> {site.phase_count || "N/A"}</p>
                    <p><strong>Power Factor:</strong> {site.power_factor || "0.95"}</p>
                    {metricsLoading && (
                        <div className="metrics-block">
                            <h4>Capacity Metrics</h4>
                            <div className="skeleton sk-line" style={{width:'40%', marginBottom:8}} />
                            <div className="skeleton sk-line" style={{width:'60%', marginBottom:8}} />
                            <div className="skeleton sk-line" style={{width:'50%', marginBottom:8}} />
                        </div>
                    )}
                    {(!metricsLoading && metrics) && (
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
            <h3 style={{marginTop:'32px'}}>Utility Bills</h3>
            <div className="card">
                <h4 style={{marginTop:0}}>Add Bill</h4>
                <div className="flex-row gap-sm" style={{flexWrap:'wrap'}}>
                    <input className="input" name="year" placeholder="Year" value={newBill.year} onChange={handleNewBillChange} style={{ width: "90px" }} />
                    <input className="input" name="month" placeholder="Month" value={newBill.month} onChange={handleNewBillChange} style={{ width: "70px" }} />
                    <input className="input" name="energy_usage" placeholder="Energy kWh" value={newBill.energy_usage} onChange={handleNewBillChange} style={{ width: "140px" }} />
                    <input className="input" name="max_power" placeholder="Max kW" value={newBill.max_power} onChange={handleNewBillChange} style={{ width: "110px" }} />
                    <button className="btn" onClick={handleCreateBill}>Add</button>
                </div>
            </div>

            {billsLoading ? (
                <table className="table">
                    <tbody>
                        {[...Array(3)].map((_, i) => (
                            <tr className="sk-table-row" key={i}>
                                <td><div className="skeleton sk-line" style={{width:'40%'}} /></td>
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
                            <th style={{ borderBottom: "1px solid #ddd" }}>Period</th>
                            <th style={{ borderBottom: "1px solid #ddd" }}>Energy (kWh)</th>
                            <th style={{ borderBottom: "1px solid #ddd" }}>Max Power (kW)</th>
                            <th style={{ borderBottom: "1px solid #ddd" }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bills.map(bill => (
                            <tr key={bill.id}>
                                <td>{bill.year}-{String(bill.month).padStart(2, '0')}</td>
                                {billEditingId === bill.id ? (
                                    <>
                                        <td>
                                            <input className="input" name="energy_usage" value={billEditData.energy_usage ?? ''} onChange={handleBillEditChange} style={{ width: "100px" }} />
                                        </td>
                                        <td>
                                            <input className="input" name="max_power" value={billEditData.max_power ?? ''} onChange={handleBillEditChange} style={{ width: "90px" }} />
                                        </td>
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

        </div>
    );
};

export default SiteDetails;
