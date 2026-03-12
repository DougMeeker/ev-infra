import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getBills, createBill, updateBill, deleteBill, getServices } from '../api';

export default function BillsSection({ siteId, onTotalsChange }) {
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [services, setServices] = useState([]);
  const [newBill, setNewBill] = useState({ service_id: '', year: '', month: '', energy_usage: '', max_power: '' });
  const [billEditingId, setBillEditingId] = useState(null);
  const [billEditData, setBillEditData] = useState({});
  const [sortColumn, setSortColumn] = useState('period');
  const [sortDirection, setSortDirection] = useState('desc');

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

  const loadServices = useCallback(async () => {
    if (!siteId) return;
    try {
      const { data } = await getServices(siteId);
      setServices(data || []);
      // Auto-select first service if only one exists
      if (data && data.length === 1) {
        setNewBill(prev => ({ ...prev, service_id: data[0].id }));
      }
    } catch (err) {
      console.error('Error loading services:', err);
    }
  }, [siteId]);

  useEffect(() => { loadBills(); }, [loadBills]);
  useEffect(() => { loadServices(); }, [loadServices]);

  // Refresh services when bills are loaded (in case new services were added)
  const handleRefreshServices = () => {
    loadServices();
  };

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
    if (!newBill.service_id) { alert('Please select a service/meter'); return; }
    if (!newBill.year || !newBill.month) { alert('Year and month required'); return; }
    const payload = {
      year: parseInt(newBill.year, 10),
      month: parseInt(newBill.month, 10),
      energy_usage: newBill.energy_usage ? parseFloat(newBill.energy_usage) : null,
      max_power: newBill.max_power ? parseFloat(newBill.max_power) : null,
    };
    try {
      const { data } = await createBill(newBill.service_id, payload);
      setBills(prev => [data, ...prev]);
      setNewBill({ service_id: newBill.service_id, year: '', month: '', energy_usage: '', max_power: '' });
    } catch (err) {
      console.error('Error creating bill:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to create bill';
      alert(`Failed to create bill: ${errorMsg}`);
    }
  };

  const startEditBill = (bill) => {
    if (!bill) { setBillEditingId(null); setBillEditData({}); return; }
    setBillEditingId(bill.id);
    setBillEditData({
      service_id: bill.service_id,
      year: bill.year,
      month: bill.month,
      energy_usage: bill.energy_usage,
      max_power: bill.max_power,
    });
  };
  const handleBillEditChange = (e) => setBillEditData({ ...billEditData, [e.target.name]: e.target.value });
  const handleSaveBill = async () => {
    const payload = {
      service_id: parseInt(billEditData.service_id, 10),
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

  const getService = (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    if (!service) return `Service #${serviceId}`;
    return service;
  };

  // Handle column sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sort bills based on current sort column and direction
  const sortedBills = useMemo(() => {
    const sorted = [...bills].sort((a, b) => {
      let aVal, bVal;

      switch (sortColumn) {
        case 'meter':
          const aService = getService(a.service_id);
          const bService = getService(b.service_id);
          aVal = (aService.meter_number || aService.utility || '').toLowerCase();
          bVal = (bService.meter_number || bService.utility || '').toLowerCase();
          break;
        case 'account':
          const aServiceAcc = getService(a.service_id);
          const bServiceAcc = getService(b.service_id);
          aVal = (aServiceAcc.utility_account || '').toLowerCase();
          bVal = (bServiceAcc.utility_account || '').toLowerCase();
          break;
        case 'period':
          // Sort by year then month
          aVal = a.year * 100 + (a.month || 0);
          bVal = b.year * 100 + (b.month || 0);
          break;
        case 'energy':
          aVal = parseFloat(a.energy_usage) || 0;
          bVal = parseFloat(b.energy_usage) || 0;
          break;
        case 'power':
          aVal = parseFloat(a.max_power) || 0;
          bVal = parseFloat(b.max_power) || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [bills, sortColumn, sortDirection, services]);

  // Render sort indicator
  const SortIndicator = ({ column }) => {
    if (sortColumn !== column) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // Calculate summary statistics by meter
  const meterSummaries = useMemo(() => {
    const summaryMap = {};
    
    bills.forEach(bill => {
      if (!summaryMap[bill.service_id]) {
        summaryMap[bill.service_id] = {
          serviceId: bill.service_id,
          totalEnergy: 0,
          billCount: 0,
          maxPower: 0,
          years: new Set(),
        };
      }
      
      const summary = summaryMap[bill.service_id];
      
      // Add energy usage
      if (bill.energy_usage != null) {
        summary.totalEnergy += parseFloat(bill.energy_usage) || 0;
      }
      
      // Track maximum power
      if (bill.max_power != null) {
        const power = parseFloat(bill.max_power) || 0;
        summary.maxPower = Math.max(summary.maxPower, power);
        summary.billCount += 1;
      }
      
      // Track years for averaging
      if (bill.year) {
        summary.years.add(bill.year);
      }
    });
    
    // Calculate average energy per year for each meter
    return Object.values(summaryMap).map(summary => {
      const yearCount = summary.years.size || 1;
      return {
        serviceId: summary.serviceId,
        averageEnergyPerYear: summary.totalEnergy / yearCount,
        maxPower: summary.maxPower,
        billCount: summary.billCount,
      };
    });
  }, [bills]);

  return (
    <>
      {services.length === 0 && (
        <div className="card" style={{ backgroundColor: '#fff3cd', borderLeft: '4px solid #ffc107' }}>
          <p style={{ margin: 0 }}><strong>Note:</strong> You need to add at least one service/meter before you can add bills. Please configure services in the Services/Meters section above.</p>
        </div>
      )}

      {meterSummaries.length > 0 && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Summary by Meter</h4>
          <table className="table">
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ddd' }}>Meter</th>
                <th style={{ borderBottom: '1px solid #ddd' }}>Avg Energy/Year (kWh)</th>
                <th style={{ borderBottom: '1px solid #ddd' }}>Max Power (kW)</th>
                <th style={{ borderBottom: '1px solid #ddd' }}>Bills</th>
              </tr>
            </thead>
            <tbody>
              {meterSummaries.map(summary => (
                <tr key={summary.serviceId}>
                  <td><strong>{getService(summary.serviceId).meter_number || getService(summary.serviceId).utility || `Service #${summary.serviceId}`}</strong></td>
                  <td>{summary.averageEnergyPerYear.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>{summary.maxPower > 0 ? summary.maxPower.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</td>
                  <td>{summary.billCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

            {services.length > 0 && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>Add Bill</h4>
          <div className="flex-row gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="input" name="service_id" value={newBill.service_id} onChange={handleNewBillChange} style={{ width: '180px' }}>
              <option value="">Select Meter...</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>
                  {s.meter_number || s.utility || `Service #${s.id}`}
                </option>
              ))}
            </select>
            <button 
              className="btn btn-secondary" 
              onClick={handleRefreshServices} 
              title="Refresh meter list"
              style={{ padding: '6px 12px', fontSize: '14px' }}
            >
              ↻
            </button>
            <input className="input" name="year" placeholder="Year" value={newBill.year} onChange={handleNewBillChange} style={{ width: '90px' }} />
            <input className="input" name="month" placeholder="Month" value={newBill.month} onChange={handleNewBillChange} style={{ width: '70px' }} />
            <input className="input" name="energy_usage" placeholder="Energy kWh" value={newBill.energy_usage} onChange={handleNewBillChange} style={{ width: '140px' }} />
            <input className="input" name="max_power" placeholder="Max kW" value={newBill.max_power} onChange={handleNewBillChange} style={{ width: '110px' }} />
            <button className="btn" onClick={handleCreateBill}>Add</button>
          </div>
        </div>
      )}

      {billsLoading ? (
        <table className="table">
          <tbody>
            {[...Array(3)].map((_, i) => (
              <tr className="sk-table-row" key={i}>
                <td><div className="skeleton sk-line" style={{ width: '40%' }} /></td>
                <td><div className="skeleton sk-line" /></td>
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
              <th 
                style={{ borderBottom: '1px solid #ddd', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSort('meter')}
              >
                Meter<SortIndicator column="meter" />
              </th>
              <th 
                style={{ borderBottom: '1px solid #ddd', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSort('account')}
              >
                Account<SortIndicator column="account" />
              </th>
              <th 
                style={{ borderBottom: '1px solid #ddd', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSort('period')}
              >
                Period<SortIndicator column="period" />
              </th>
              <th 
                style={{ borderBottom: '1px solid #ddd', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSort('energy')}
              >
                Energy (kWh)<SortIndicator column="energy" />
              </th>
              <th 
                style={{ borderBottom: '1px solid #ddd', cursor: 'pointer', userSelect: 'none' }} 
                onClick={() => handleSort('power')}
              >
                Max Power (kW)<SortIndicator column="power" />
              </th>
              <th style={{ borderBottom: '1px solid #ddd' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedBills.map(bill => (
              <tr key={bill.id}>
                {billEditingId === bill.id ? (
                  <>
                    <td>
                      <select className="input" name="service_id" value={billEditData.service_id} onChange={handleBillEditChange}>
                        {services.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.meter_number || s.utility || `Service #${s.id}`}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{getService(bill.service_id).utility_account || `Account #${bill.service_id}`}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input className="input" name="year" placeholder="Year" value={billEditData.year ?? ''} onChange={handleBillEditChange} style={{ width: '70px' }} />
                        <span>-</span>
                        <input className="input" name="month" placeholder="Mo" value={billEditData.month ?? ''} onChange={handleBillEditChange} style={{ width: '50px' }} />
                      </div>
                    </td>
                    <td><input className="input" name="energy_usage" value={billEditData.energy_usage ?? ''} onChange={handleBillEditChange} style={{ width: '100px' }} /></td>
                    <td><input className="input" name="max_power" value={billEditData.max_power ?? ''} onChange={handleBillEditChange} style={{ width: '90px' }} /></td>
                    <td>
                      <button className="btn" onClick={handleSaveBill}>Save</button>
                      <button className="btn btn-secondary" onClick={() => startEditBill(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{getService(bill.service_id).meter_number || getService(bill.service_id).utility || `Service #${bill.service_id}`}</td>
                    <td>{getService(bill.service_id).utility_account || `Account #${bill.service_id}`}</td>
                    <td>{bill.year}-{String(bill.month).padStart(2, '0')}</td>
                    <td>{bill.energy_usage ?? '—'}</td>
                    <td>{bill.max_power ?? '—'}</td>
                    <td style={{ display: 'flex', gap: '8px' }}>
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
