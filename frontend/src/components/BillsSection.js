import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getBills, createBill, updateBill, deleteBill } from '../api';

export default function BillsSection({ siteId, onTotalsChange }) {
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [newBill, setNewBill] = useState({ year: '', month: '', energy_usage: '', max_power: '' });
  const [billEditingId, setBillEditingId] = useState(null);
  const [billEditData, setBillEditData] = useState({});

  const loadBills = useCallback(async () => {
    if (!siteId) return;
    setBillsLoading(true);
    try {
      const { data } = await getBills(siteId);
      setBills(data || []);
    } finally {
      setBillsLoading(false);
    }
  }, [siteId]);

  useEffect(() => { loadBills(); }, [loadBills]);

  // Compute totals and notify parent
  const totalEnergyKwh = useMemo(() => {
    return bills.reduce((sum, b) => {
      const n = typeof b?.energy_usage === 'number' ? b.energy_usage : parseFloat(b?.energy_usage);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [bills]);

  useEffect(() => {
    if (typeof onTotalsChange === 'function') onTotalsChange(totalEnergyKwh);
  }, [totalEnergyKwh, onTotalsChange]);

  const handleNewBillChange = (e) => setNewBill({ ...newBill, [e.target.name]: e.target.value });
  const handleCreateBill = async () => {
    if (!newBill.year || !newBill.month) { alert('Year and month required'); return; }
    const payload = {
      year: parseInt(newBill.year, 10),
      month: parseInt(newBill.month, 10),
      energy_usage: newBill.energy_usage ? parseFloat(newBill.energy_usage) : null,
      max_power: newBill.max_power ? parseFloat(newBill.max_power) : null,
    };
    try {
      const { data } = await createBill(siteId, payload);
      setBills(prev => [data, ...prev]);
      setNewBill({ year: '', month: '', energy_usage: '', max_power: '' });
    } catch (err) {
      console.error('Error creating bill:', err);
      alert('Failed to create bill');
    }
  };

  const startEditBill = (bill) => {
    if (!bill) { setBillEditingId(null); setBillEditData({}); return; }
    setBillEditingId(bill.id);
    setBillEditData({
      year: bill.year,
      month: bill.month,
      energy_usage: bill.energy_usage,
      max_power: bill.max_power,
    });
  };
  const handleBillEditChange = (e) => setBillEditData({ ...billEditData, [e.target.name]: e.target.value });
  const handleSaveBill = async () => {
    const payload = {
      year: parseInt(billEditData.year, 10),
      month: parseInt(billEditData.month, 10),
      energy_usage: billEditData.energy_usage !== '' ? parseFloat(billEditData.energy_usage) : null,
      max_power: billEditData.max_power !== '' ? parseFloat(billEditData.max_power) : null,
    };
    try {
      const { data } = await updateBill(billEditingId, payload);
      setBills(prev => prev.map(b => (b.id === billEditingId ? data : b)));
      setBillEditingId(null);
      setBillEditData({});
    } catch (err) {
      console.error('Error updating bill:', err);
      alert('Failed to update bill');
    }
  };

  const handleDeleteBill = async (billId) => {
    if (!window.confirm('Delete this bill?')) return;
    try {
      await deleteBill(billId);
      setBills(prev => prev.filter(b => b.id !== billId));
    } catch (err) {
      console.error('Error deleting bill:', err);
      alert('Failed to delete bill');
    }
  };

  return (
    <>
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
                      <button className="btn btn-secondary" onClick={() => startEditBill(null)}>Cancel</button>
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
    </>
  );
}
