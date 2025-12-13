
import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { createSite } from "../api";
import { ratioFrom, getStatusShade } from "../utils/statusShading";
import StatusLegend from "./StatusLegend";

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const ClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
};

const FocusHelper = ({ focusSite, onClearFocus }) => {
  const map = useMap();
  useEffect(() => {
    if (focusSite && focusSite.latitude && focusSite.longitude) {
      map.flyTo([focusSite.latitude, focusSite.longitude], 13, { duration: 0.75 });
      // Clear focus after performing fly-to so it doesn't repeat on re-renders
      if (onClearFocus) {
        const t = setTimeout(() => {
          try { onClearFocus(); } catch(e) { /* noop */ }
        }, 800); // slightly longer than fly duration for smoothness
        return () => clearTimeout(t);
      }
    }
  }, [focusSite, map]);
  return null;
};

const MapView = ({ sites, focusSiteId, onClearFocus, enableAddSites, selectedProjectId, latestStatuses = [], project, colorMode = 'capacity' }) => {
  const center = [37.5, -120];
  const [newMarker, setNewMarker] = useState(null);
  const focusSite = focusSiteId ? sites.find(s => s.id === focusSiteId) : null;
  const navigate = useNavigate();

  const handleMapClick = async (latlng) => {
    const name = prompt("Enter site name:");
    if (!name) return;

    const newSite = {
      name,
      latitude: latlng.lat,
      longitude: latlng.lng,
    };

    try {
      const res = await createSite(newSite);
      setNewMarker(res.data); // Optional: show new marker immediately
      // Set focus param so Home page zooms to new site after reload
      try {
        navigate({ pathname: '/', search: `?focus=${res.data.id}` });
      } catch(e) { /* ignore */ }
      // Reload to refresh site lists and metrics, which drives FocusHelper
      window.location.reload();
    } catch (err) {
      console.error("Error saving site:", err);
      alert("Failed to save site.");
    }
  };

  // Helper to build an icon on-demand (retains leaflet base class; adds diagnostics)
  const buildIconForSite = (site) => {
    try {
      let bg = '#64748b';
      let cls = 'cap-unknown';
      if (colorMode === 'capacity') {
        const cap = site.available_capacity_kw;
        cls = typeof cap === 'number'
          ? (cap < 200 ? 'cap-low' : cap < 800 ? 'cap-mid' : 'cap-high')
          : 'cap-unknown';
        const capacityColors = {
          'cap-low': '#dc2626',
          'cap-mid': '#ca8a04',
          'cap-high': '#16a34a',
          'cap-unknown': '#64748b'
        };
        bg = capacityColors[cls] || '#64748b';
      } else if (colorMode === 'status') {
        const status = (latestStatuses || []).find(ls => String(ls.site_id) === String(site.id));
        const stepsCount = project && typeof project.steps_count === 'number' ? project.steps_count : undefined;
        const ratio = ratioFrom(status?.current_step, stepsCount);
        if (ratio === null) { bg = '#94a3b8'; cls = 'status-none'; }
        else { bg = getStatusShade(ratio).bg; cls = 'status-shade'; }
      }
      return L.divIcon({
        className: `leaflet-div-icon marker-mode-${colorMode} ${cls}`,
        html: `<span class="marker-outer" style="display:block;width:100%;height:100%;border-radius:50%;"><span style="background:${bg};display:block;width:100%;height:100%;border-radius:50%;"></span></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10]
      });
    } catch (e) {
      console.warn('Failed to build custom icon, falling back', e);
      return new L.Icon.Default();
    }
  };

  // Build a set of site IDs for the selected project (from latestStatuses payload)
  const projectSiteIdSet = new Set((latestStatuses || []).map(ls => ls.site_id));

  return (
    <MapContainer center={center} zoom={6} style={{ height: "500px", width: "100%", borderRadius: 'var(--radius)', border: '1px solid var(--card-border)' }}>
      <TileLayer
        attribution='&copy; https://www.openstreetmap.org/ contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

  {enableAddSites && <ClickHandler onMapClick={handleMapClick} />}
  <FocusHelper focusSite={focusSite} onClearFocus={onClearFocus} />

      {sites.filter(s => s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined)
            .filter(s => !selectedProjectId || projectSiteIdSet.has(s.id))
            .map(site => {
        const cap = site.available_capacity_kw;
        const capClass = typeof cap === 'number'
          ? (cap < 200 ? 'cap-low' : cap < 800 ? 'cap-mid' : 'cap-high')
          : 'cap-unknown';
        const status = (latestStatuses || []).find(ls => String(ls.site_id) === String(site.id));
        const stepsCount = project && typeof project.steps_count === 'number' ? project.steps_count : undefined;
        const ratio = ratioFrom(status?.current_step, stepsCount);
        const col = getStatusShade(ratio);
        const badgeStyle = {
          display:'inline-block',
          padding:'2px 6px',
          borderRadius:999,
          fontSize:'0.75rem',
          background: col.bg,
          border: '1px solid ' + col.border,
          color: '#0f172a'
        };
        const badgeText = ratio === null ? 'No Status' : `Step ${status?.current_step}`;
        return (
          <Marker
            key={site.id}
            position={[site.latitude, site.longitude]}
            icon={buildIconForSite(site)}
          >
            <Popup className={colorMode === 'capacity' ? capClass : 'status-shade'}>
              <div className="popup-site">
                <div className="popup-header">
                  <strong>{site.name}</strong>
                </div>
                <div className="popup-body">
                  <div><span className="popup-label">Available kW:</span> {cap ?? '—'}</div>
                  <div><span className="popup-label">Peak kW (Yr):</span> {site.last_year_peak_kw ?? '—'}</div>
                  <div><span className="popup-label">Capacity kW:</span> {site.theoretical_capacity_kw ?? '—'}</div>
                  <div><span className="popup-label">Utility:</span> {site.utility || '—'}</div>
                  <div><span className="popup-label">Vehicles:</span> {site.vehicle_count ?? 0}</div>
                  <div><span className="popup-label">Meter #:</span> {site.meter_number || '—'}</div>
                  <div><span className="popup-label">Contact:</span> {site.contact_name ? `${site.contact_name}${site.contact_phone ? ' ('+site.contact_phone+')' : ''}` : '—'}</div>
                  <div><span className="popup-label">Location:</span> {site.address ? `${site.address}${site.city ? ', '+site.city : ''}` : (site.city || '—')}</div>
                  {selectedProjectId && (
                    <div style={{ marginTop:6 }}>
                      <button className="btn btn-link" style={{ padding:0 }} onClick={() => navigate(`/projects/${selectedProjectId}/status/${site.id}`)}>
                        <span style={badgeStyle} title={status && status.status_date ? `As of ${new Date(status.status_date).toLocaleDateString()}` : ''}>{badgeText}</span>
                      </button>
                    </div>
                  )}
                  <div style={{ marginTop:6 }}>
                    <button className="btn btn-link" style={{ padding:0 }} onClick={() => navigate(`/site/${site.id}`)}>
                      View Site Details
                    </button>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {newMarker && (
        <Marker position={[newMarker.latitude, newMarker.longitude]}>
          <Popup>
            <strong>{newMarker.name}</strong><br />
            (Just added!)
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
};

export default MapView;
