import React, { useEffect, useState } from "react";
import { getServices, createService, updateService, deleteService } from "../api";

const ServicesSection = ({ siteId }) => {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // service id being edited, or 'new'
    const [formData, setFormData] = useState({});

    useEffect(() => {
        loadServices();
    }, [siteId]);

    const loadServices = () => {
        setLoading(true);
        getServices(siteId)
            .then(res => setServices(res.data || []))
            .catch(err => console.error("Error loading services:", err))
            .finally(() => setLoading(false));
    };

    const handleAdd = () => {
        setEditing('new');
        setFormData({
            utility: '',
            utility_account: '',
            utility_name: '',
            meter_number: '',
            main_breaker_amps: '',
            voltage: '',
            phase_count: '',
            power_factor: '0.95',
            notes: ''
        });
    };

    const handleEdit = (service) => {
        setEditing(service.id);
        setFormData({
            utility: service.utility || '',
            utility_account: service.utility_account || '',
            utility_name: service.utility_name || '',
            meter_number: service.meter_number || '',
            main_breaker_amps: service.main_breaker_amps || '',
            voltage: service.voltage || '',
            phase_count: service.phase_count || '',
            power_factor: service.power_factor || '0.95',
            notes: service.notes || ''
        });
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = () => {
        const payload = {
            ...formData,
            main_breaker_amps: formData.main_breaker_amps ? parseInt(formData.main_breaker_amps) : null,
            voltage: formData.voltage ? parseInt(formData.voltage) : null,
            phase_count: formData.phase_count ? parseInt(formData.phase_count) : null,
            power_factor: formData.power_factor ? parseFloat(formData.power_factor) : 0.95
        };

        if (editing === 'new') {
            createService(siteId, payload)
                .then(() => {
                    loadServices();
                    setEditing(null);
                })
                .catch(err => {
                    console.error("Error creating service:", err);
                    alert("Failed to create service");
                });
        } else {
            updateService(editing, payload)
                .then(() => {
                    loadServices();
                    setEditing(null);
                })
                .catch(err => {
                    console.error("Error updating service:", err);
                    alert("Failed to update service");
                });
        }
    };

    const handleDelete = (serviceId) => {
        if (!window.confirm("Delete this service/meter? This will also delete all associated bills.")) return;
        deleteService(serviceId)
            .then(() => loadServices())
            .catch(err => {
                console.error("Error deleting service:", err);
                alert("Failed to delete service");
            });
    };

    const calculateCapacity = (service) => {
        if (!service.main_breaker_amps || !service.voltage || !service.phase_count) return null;
        const amps = service.main_breaker_amps;
        const volts = service.voltage;
        const pf = service.power_factor || 0.95;
        const phases = service.phase_count;
        
        if (phases === 3) {
            return (amps * volts * Math.sqrt(3) * pf / 1000).toFixed(2);
        } else {
            return (amps * volts * pf / 1000).toFixed(2);
        }
    };

    if (loading) return <p>Loading services...</p>;

    return (
        <div className="services-section">
            <div className="flex-row gap-sm" style={{ marginBottom: '12px' }}>
                <button className="btn" onClick={handleAdd}>Add Service/Meter</button>
            </div>

            {services.length === 0 && !editing && (
                <p>No services/meters configured. Click "Add Service/Meter" to add one.</p>
            )}

            {editing && (
                <div className="card" style={{ marginBottom: '16px', backgroundColor: '#f9f9f9' }}>
                    <h4>{editing === 'new' ? 'New Service/Meter' : 'Edit Service/Meter'}</h4>
                    <div className="form-sections">
                        <div className="form-section">
                            <h5 className="form-section-title">Utility Information</h5>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Utility</label>
                                    <input className="input" name="utility" value={formData.utility} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Account Name</label>
                                    <input className="input" name="utility_name" value={formData.utility_name} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Account #</label>
                                    <input className="input" name="utility_account" value={formData.utility_account} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Meter #</label>
                                    <input className="input" name="meter_number" value={formData.meter_number} onChange={handleChange} />
                                </div>
                            </div>
                        </div>
                        <div className="form-section">
                            <h5 className="form-section-title">Notes</h5>
                            <div className="form-grid">
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>Description / Notes</label>
                                    <textarea className="input" name="notes" value={formData.notes} onChange={handleChange} rows="2" placeholder="Brief note to differentiate this service/meter..." />
                                </div>
                            </div>
                        </div>
                        <div className="form-section">
                            <h5 className="form-section-title">Electrical Capacity</h5>
                            <div className="form-grid">
                                <div className="form-group">
                                    <label>Main Breaker Amps</label>
                                    <input className="input" type="number" name="main_breaker_amps" value={formData.main_breaker_amps} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Voltage</label>
                                    <input className="input" type="number" name="voltage" value={formData.voltage} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Phase Count</label>
                                    <input className="input" type="number" name="phase_count" value={formData.phase_count} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Power Factor</label>
                                    <input className="input" type="number" step="0.01" name="power_factor" value={formData.power_factor} onChange={handleChange} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex-row gap-sm" style={{ marginTop: '12px' }}>
                        <button className="btn" onClick={handleSave}>Save</button>
                        <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {services.map(service => (
                <div key={service.id} className="card" style={{ marginBottom: '12px' }}>
                    {service.notes && (
                        <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '14px', fontStyle: 'italic' }}>
                            {service.notes}
                        </div>
                    )}
                    <div className="details-grid">
                        <div className="details-section">
                            <h4>Utility Information</h4>
                            <div className="detail-pairs">
                                <div><span>Utility:</span><strong>{service.utility || 'N/A'}</strong></div>
                                <div><span>Account Name:</span><strong>{service.utility_name || 'N/A'}</strong></div>
                                <div><span>Account #:</span><strong>{service.utility_account || 'N/A'}</strong></div>
                                <div><span>Meter #:</span><strong>{service.meter_number || 'N/A'}</strong></div>
                            </div>
                        </div>
                        <div className="details-section">
                            <h4>Electrical Capacity</h4>
                            <div className="detail-pairs">
                                <div><span>Main Breaker Amps:</span><strong>{service.main_breaker_amps || 'N/A'}</strong></div>
                                <div><span>Voltage:</span><strong>{service.voltage || 'N/A'}</strong></div>
                                <div><span>Phase Count:</span><strong>{service.phase_count || 'N/A'}</strong></div>
                                <div><span>Power Factor:</span><strong>{service.power_factor || '0.95'}</strong></div>
                                {calculateCapacity(service) && (
                                    <div><span>Theoretical Capacity:</span><strong>{calculateCapacity(service)} kW</strong></div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex-row gap-sm" style={{ marginTop: '12px' }}>
                        <button className="btn btn-secondary" onClick={() => handleEdit(service)}>Edit</button>
                        <button className="btn btn-danger" onClick={() => handleDelete(service.id)}>Delete</button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ServicesSection;
