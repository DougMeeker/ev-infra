import React, { useState, useEffect } from 'react';

const empty = {
  kw: '', breaker_size: '', input_voltage: '', output_voltage: '', port_count: '',
  handle_type: '', manufacturer: '', model_number: '', serial_number: '', date_installed: '', project_id: '', fleet: false
};

export default function ChargerForm({ initial, onCancel, onSubmit, projects = [] }) {
  const [form, setForm] = useState(empty);
  useEffect(() => {
    setForm(initial ? { ...empty, ...initial } : empty);
  }, [initial]);

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    // normalize numbers
    ['kw','breaker_size','input_voltage','output_voltage','port_count','project_id'].forEach(k => {
      if (payload[k] === '') payload[k] = null;
      else if (payload[k] != null) {
        const n = k === 'kw' ? parseFloat(payload[k]) : parseInt(payload[k], 10);
        if (!Number.isNaN(n)) payload[k] = n;
      }
    });
    if (payload.date_installed === '') payload.date_installed = null;
    onSubmit?.(payload);
  };

  return (
    <form onSubmit={submit} className="card">
      {/* Grouped power/voltage/amps */}
      <fieldset style={{border:'1px solid var(--card-border)', padding:12, marginBottom:12}}>
        <legend>Power & Electrical</legend>
        <div className="grid" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
          <label>kW<input className="input" value={form.kw} onChange={e=>update('kw', e.target.value)} /></label>
          <label>Breaker (A)<input className="input" value={form.breaker_size} onChange={e=>update('breaker_size', e.target.value)} /></label>
          <label>Input Voltage<input className="input" value={form.input_voltage} onChange={e=>update('input_voltage', e.target.value)} /></label>
          <label>Output Voltage<input className="input" value={form.output_voltage} onChange={e=>update('output_voltage', e.target.value)} /></label>
        </div>
      </fieldset>
      <fieldset style={{border:'1px solid var(--card-border)', padding:12, marginBottom:12}}>
        <legend>Hardware</legend>
        <div className="grid" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12}}>
          <label>Port Count<input className="input" value={form.port_count} onChange={e=>update('port_count', e.target.value)} /></label>
          <label>Handle Type<select className="input" value={form.handle_type} onChange={e=>update('handle_type', e.target.value)}>
            <option value="">Select</option>
            <option value="J1772">J1772</option>
            <option value="CCS1">CCS1</option>
            <option value="NACS">NACS</option>
            <option value="Both">Both DC</option>
          </select></label>
          <label>Date Installed<input className="input" type="date" value={form.date_installed || ''} onChange={e=>update('date_installed', e.target.value)} /></label>
          <label>Manufacturer
            <select className="input" value={form.manufacturer || ''} onChange={e=>update('manufacturer', e.target.value)}>
              <option value="">Select</option>
              {['KemPower','ABB','ChargePoint','Enphase/Clipper Creek','XOS','ChargePodX','BTC','Other'].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
              {form.manufacturer && !['KemPower','ABB','ChargePoint','Enphase/Clipper Creek','XOS','ChargePodX','BTC','Other'].includes(form.manufacturer) && (
                <option value={form.manufacturer}>{form.manufacturer}</option>
              )}
            </select>
          </label>
          <label>Model Number<input className="input" value={form.model_number} onChange={e=>update('model_number', e.target.value)} /></label>
          <label>Serial Number<input className="input" value={form.serial_number} onChange={e=>update('serial_number', e.target.value)} /></label>
        </div>
      </fieldset>
      <fieldset style={{border:'1px solid var(--card-border)', padding:12}}>
        <legend>Project</legend>
        <label>Project
          <select className="input" value={form.project_id || ''} onChange={e=>update('project_id', e.target.value)}>
            <option value="">None</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </fieldset>
      <fieldset style={{border:'1px solid var(--card-border)', padding:12, marginTop:12}}>
        <legend>Options</legend>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={form.fleet || false} 
            onChange={e=>update('fleet', e.target.checked)}
            style={{ transform: 'scale(1.2)', margin: 0 }}
          />
          <span>Fleet Charger</span>
        </label>
      </fieldset>
      <div className="flex-row gap-sm" style={{marginTop:12}}>
        <button type="submit" className="btn">Save</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
