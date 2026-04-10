import React, { useEffect, useState } from 'react';
import { getChargers } from '../api';

/**
 * ChargerCapacitySection
 * 
 * Analyzes charger capacity readiness by comparing available/planned charger kW
 * against peak concurrent energy demand for a specific charging timeframe.
 */
export default function ChargerCapacitySection({ 
  siteId, 
  peakConcurrentKwh, 
  vehicleCount,
  hours = 8, 
  title, 
  description 
}) {
  const [chargers, setChargers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Default titles and descriptions based on hours
  const defaultTitle = hours === 8 
    ? '(Overnight, 6.7-19 kW chargers)'
    : hours === 2 
    ? '(Fast, 150-350 kW chargers)'
    : `${hours}-Hour Charging`;
  
  const displayTitle = title || defaultTitle;
  const displayDescription = description || `* ${hours}-hour scenario assumes ${hours === 8 ? 'one charger per vehicle overnight' : 'fast charging turnover'}.`;

  useEffect(() => {
    if (!siteId) return;
    
    setLoading(true);
    getChargers(siteId)
      .then(res => setChargers(res.data || []))
      .catch(err => console.error("Error fetching chargers:", err))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="details-section">
        <h4>{hours} Hr Charger Capacity Analysis</h4>
        <div className="skeleton sk-line" style={{ width: '60%', marginBottom: 8 }} />
        <div className="skeleton sk-line" style={{ width: '80%', marginBottom: 8 }} />
      </div>
    );
  }

  if (peakConcurrentKwh == null) {
    return (
      <div className="details-section">
        <h4>{hours} Hr Charger Capacity Analysis</h4>
        <p style={{ color: '#888', margin: 0 }}>Peak concurrent energy data not available.</p>
      </div>
    );
  }

  // Calculate charger totals
  // Filter chargers based on charging scenario:
  // 8-hour (overnight): <= 19 kW chargers
  // 2-hour (fast): > 19 kW chargers
  const relevantChargers = hours === 8 
    ? chargers.filter(c => typeof c.kw === 'number' && c.kw <= 19)
    : hours === 2
    ? chargers.filter(c => typeof c.kw === 'number' && c.kw > 19)
    : chargers;
  
  const totalPlannedKw = relevantChargers.reduce((sum, c) => sum + (typeof c.kw === 'number' ? c.kw : 0), 0);
  const installedKw = relevantChargers.reduce((sum, c) => sum + (c.date_installed ? (typeof c.kw === 'number' ? c.kw : 0) : 0), 0);
  
  // Calculate charger counts (considering port_count if available)
  const totalChargerPorts = relevantChargers.reduce((sum, c) => sum + (c.port_count || 1), 0);
  const installedChargerPorts = relevantChargers.reduce((sum, c) => sum + (c.date_installed ? (c.port_count || 1) : 0), 0);

  // Calculate required capacity for the specified timeframe
  const peakKwh = Number(peakConcurrentKwh);
  const requiredKw = peakKwh / hours;
  
  // Calculate gaps/surplus
  const gapInstalled = installedKw - requiredKw;
  const gapPlanned = totalPlannedKw - requiredKw;

  // Progress percentages
  const progressInstalled = requiredKw > 0 ? Math.min((installedKw / requiredKw) * 100, 100) : 0;
  const progressPlanned = requiredKw > 0 ? Math.min((totalPlannedKw / requiredKw) * 100, 100) : 0;

  // Helper function to format gap/surplus display
  const formatGap = (gap) => {
    const absGap = Math.abs(gap);
    const formatted = absGap.toFixed(1);
    if (gap >= 0) {
      return { text: `+${formatted} kW surplus`, color: '#28a745' };
    } else {
      return { text: `${formatted} kW needed`, color: '#dc3545' };
    }
  };

  const gapInstalledDisplay = formatGap(gapInstalled);
  const gapPlannedDisplay = formatGap(gapPlanned);

  return (
    <div className="details-section">
      <h4>{hours} Hr Charger Capacity Analysis</h4>
      <h5 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: '600' }}>
          {displayTitle}
      </h5>
      <div style={{ fontSize: '0.9rem', marginBottom: '16px' }}>
        <div style={{ marginBottom: '4px' }}>
          <strong>Peak Concurrent Energy:</strong> {peakKwh.toFixed(2)} kWh
        </div>
        {vehicleCount != null && vehicleCount > 0 && (
          <>
            <div style={{ marginBottom: '4px' }}>
              <strong>Installed Charger Ports:</strong> {installedChargerPorts} / {vehicleCount} 
              <span style={{ color: '#6c757d', marginLeft: '8px' }}>({(installedChargerPorts / vehicleCount).toFixed(2)} per vehicle)</span>
            </div>
            {totalChargerPorts > installedChargerPorts && (
              <div style={{ marginBottom: '4px' }}>
                <strong>Planned Charger Ports:</strong> {totalChargerPorts} / {vehicleCount} 
                <span style={{ color: '#6c757d', marginLeft: '8px' }}>({(totalChargerPorts / vehicleCount).toFixed(2)} per vehicle)</span>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <div className="detail-pairs" style={{ fontSize: '0.9rem' }}>
          <div><span>Required Capacity:</span><strong>{requiredKw.toFixed(1)} kW</strong></div>
          <div><span>Installed:</span><strong>{installedKw.toFixed(1)} kW ({progressInstalled.toFixed(0)}%)</strong></div>
          <div><span></span><strong style={{ color: gapInstalledDisplay.color }}>{gapInstalledDisplay.text}</strong></div>
          <div><span>Planned Total:</span><strong>{totalPlannedKw.toFixed(1)} kW ({progressPlanned.toFixed(0)}%)</strong></div>
          <div><span></span><strong style={{ color: gapPlannedDisplay.color }}>{gapPlannedDisplay.text}</strong></div>
        </div>
        {/* Progress bar for installed */}
        <div style={{ marginTop: '8px' }}>
          <div style={{ 
            height: '8px', 
            backgroundColor: '#e9ecef', 
            borderRadius: '4px', 
            overflow: 'hidden' 
          }}>
            <div style={{ 
              width: `${progressInstalled}%`, 
              height: '100%', 
              backgroundColor: progressInstalled >= 100 ? '#28a745' : '#ffc107',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '4px' }}>
            Installed capacity progress
          </div>
        </div>
      </div>

      <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#6c757d', fontStyle: 'italic' }}>
        {displayDescription}
      </div>
    </div>
  );
}
