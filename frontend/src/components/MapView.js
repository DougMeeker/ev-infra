
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import { createSite, getSite, getSiteMetrics, getChargers } from "../api";
import { ratioFrom, getStatusShade } from "../utils/statusShading";
import "./MapView.css";

const BASE_LAYERS = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  {
    id: 'esri-streets',
    name: 'ESRI Streets (Route #s)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom',
    maxZoom: 20,
  },
  {
    id: 'carto-voyager',
    name: 'Carto Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  },
  {
    id: 'esri-topo',
    name: 'ESRI Topo',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), swisstopo',
    maxZoom: 18,
  },
];

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

const LocationButton = () => {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);

  const handleLocationRequest = async () => {
    setLocating(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setLocating(false);
      return;
    }

    // Check permission status first (if available)
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        console.log('Geolocation permission state:', permissionStatus.state);
        
        if (permissionStatus.state === 'denied') {
          setError("Location blocked. Please enable location in your browser settings and reload the page.");
          setLocating(false);
          return;
        }
      }
    } catch (permErr) {
      // Permissions API not fully supported (older Safari), continue anyway
      console.log('Permissions API not available:', permErr);
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        map.flyTo([latitude, longitude], 13, { duration: 0.75 });
        setLocating(false);
      },
      (err) => {
        console.error("Geolocation error:", err.code, err.message);
        let errorMessage = "Unable to retrieve your location";
        
        switch(err.code) {
          case 1: // PERMISSION_DENIED
            errorMessage = "Location access denied. Please tap the 📍 icon in your browser's address bar to allow location access, then try again.";
            break;
          case 2: // POSITION_UNAVAILABLE
            errorMessage = "Location unavailable. Please enable location services in your device settings.";
            break;
          case 3: // TIMEOUT
            errorMessage = "Location request timed out. Please try again.";
            break;
          default:
            errorMessage = `Unable to get location: ${err.message || 'Unknown error'}`;
        }
        
        setError(errorMessage);
        setLocating(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  };

  useEffect(() => {
    const locationControl = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom location-control');
    locationControl.innerHTML = `
      <button 
        class="location-button" 
        title="Go to my location"
        aria-label="Go to my location"
      >
        𖦏
      </button>
    `;
    
    locationControl.onclick = handleLocationRequest;
    
    const controlContainer = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function() {
        return locationControl;
      }
    });
    
    const control = new controlContainer();
    control.addTo(map);
    
    return () => {
      try {
        map.removeControl(control);
      } catch (e) {
        // Control already removed
      }
    };
  }, [map]);

  // Show error notification if any
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000); // Increased to 5 seconds for longer messages
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <>
      {locating && (
        <div className="location-loading">
          Getting your location...
        </div>
      )}
      {error && (
        <div className="location-error">
          {error}
        </div>
      )}
    </>
  );
};

const LayerSelectorControl = ({ selectedLayer, onLayerChange }) => {
  const map = useMap();
  const [isOpen, setIsOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState(null);

  useEffect(() => {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control layer-selector-control');
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const ControlClass = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: () => container,
    });
    const control = new ControlClass();
    control.addTo(map);
    setPortalContainer(container);

    return () => {
      try { map.removeControl(control); } catch (e) { /* already removed */ }
      setPortalContainer(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  if (!portalContainer) return null;

  return createPortal(
    <div className="layer-selector-inner">
      <button
        className="layer-selector-toggle"
        title="Switch base map"
        aria-label="Switch base map"
        onClick={() => setIsOpen(o => !o)}
      >
        &#9783;
      </button>
      {isOpen && (
        <div className="layer-selector-dropdown">
          <div className="layer-selector-title">Base Map</div>
          {BASE_LAYERS.map(layer => (
            <button
              key={layer.id}
              className={`layer-option${selectedLayer.id === layer.id ? ' active' : ''}`}
              onClick={() => { onLayerChange(layer); setIsOpen(false); }}
            >
              {layer.name}
            </button>
          ))}
        </div>
      )}
    </div>,
    portalContainer
  );
};

const MapView = ({ sites = [], focusSiteId, onClearFocus, enableAddSites, selectedProjectId, latestStatuses = [], project, colorMode = 'capacity' }) => {
  const center = [37.5, -120];
  const [selectedLayer, setSelectedLayer] = useState(() => {
    try {
      const saved = localStorage.getItem('mapBaseLayer');
      return BASE_LAYERS.find(l => l.id === saved) || BASE_LAYERS[0];
    } catch {
      return BASE_LAYERS[0];
    }
  });

  useEffect(() => {
    try { localStorage.setItem('mapBaseLayer', selectedLayer.id); } catch { /* ignore */ }
  }, [selectedLayer]);
  const [newMarker, setNewMarker] = useState(null);
  const [popupDetails, setPopupDetails] = useState({}); // Cache for site details: { siteId: data }
  const [loadingPopup, setLoadingPopup] = useState(null); // Track which site is loading
  const list = Array.isArray(sites) ? sites : [];
  const focusSite = focusSiteId ? list.find(s => s.id === focusSiteId) : null;
  const navigate = useNavigate();

  // Determine missing info (contact/location fields and service-level electrical capacity data)
  const missingFieldsForSite = (details) => {
    if (!details) return [];
    const missing = [];
    // Check service-level electrical capacity data (now stored in services, not sites)
    if (details.theoretical_capacity_kw === null || details.theoretical_capacity_kw === undefined) {
      missing.push('Service Electrical Info (Amps/Volts/Phase)');
    }
    if (!details.address) missing.push('Address');
    if (!details.city) missing.push('City');
    if (!details.contact_name) missing.push('Contact');
    if (!details.contact_phone) missing.push('Phone');
    return missing;
  };

  // Load site details when popup opens
  const loadSiteDetails = async (siteId) => {
    if (popupDetails[siteId]) return; // Already loaded
    
    setLoadingPopup(siteId);
    try {
      // Fetch site info, metrics, and chargers in parallel
      const [siteRes, metricsRes, chargersRes] = await Promise.all([
        getSite(siteId),
        getSiteMetrics(siteId),
        getChargers(siteId)
      ]);
      
      const siteData = siteRes.data;
      const metricsData = metricsRes.data;
      const chargersData = chargersRes.data || [];
      
      // Merge site info with metrics
      const mergedData = {
        ...siteData,
        available_capacity_kw: metricsData.available_capacity_kw,
        theoretical_capacity_kw: metricsData.theoretical_capacity_kw,
        last_year_peak_kw: metricsData.last_year_peak_kw,
        bill_count: metricsData.bill_count || 0,
        // Get utility and meter from first service if available
        utility: metricsData.services?.[0]?.utility || null,
        meter_number: metricsData.services?.[0]?.meter_number || null,
        // Vehicle and charger counts
        vehicle_count: metricsData.vehicle_count || 0,
        charger_count: chargersData.length,
        installed_charger_kw: chargersData.reduce((sum, c) => sum + (c.kw || 0), 0).toFixed(1)
      };
      
      setPopupDetails(prev => ({ ...prev, [siteId]: mergedData }));
    } catch (err) {
      console.error('Error loading site details:', err);
    } finally {
      setLoadingPopup(null);
    }
  };

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
      let bg = '#F16A22'; // Caltrans Orange
      let cls = 'neutral';
      
      if (colorMode === 'status' && selectedProjectId) {
        const status = (latestStatuses || []).find(ls => String(ls.site_id) === String(site.id));
        const stepsCount = project && typeof project.steps_count === 'number' ? project.steps_count : undefined;
        const ratio = ratioFrom(status?.current_step, stepsCount);
        if (ratio === null) { bg = '#94a3b8'; cls = 'status-none'; }
        else { bg = getStatusShade(ratio).bg; cls = 'status-shade'; }
      }
      
      return L.divIcon({
        className: `leaflet-div-icon marker-mode-${colorMode} ${cls}`,
        html: `<span class="marker-outer" style="display:block;width:100%;height:100%;border-radius:50%;"><span class="marker-inner" style="background:${bg};display:block;width:100%;height:100%;border-radius:50%;"></span></span>`,
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
        key={selectedLayer.id}
        attribution={selectedLayer.attribution}
        url={selectedLayer.url}
        maxZoom={selectedLayer.maxZoom}
      />

  {enableAddSites && <ClickHandler onMapClick={handleMapClick} />}
  <FocusHelper focusSite={focusSite} onClearFocus={onClearFocus} />
  <LocationButton />
  <LayerSelectorControl selectedLayer={selectedLayer} onLayerChange={setSelectedLayer} />

      {list.filter(s => s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined)
            .filter(s => !selectedProjectId || projectSiteIdSet.has(s.id))
            .map(site => {
        const details = popupDetails[site.id]; // May be undefined initially
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
            icon={buildIconForSite(details || site)}
            eventHandlers={{
              popupopen: () => loadSiteDetails(site.id)
            }}
          >
            <Popup className={colorMode === 'status' ? 'status-shade' : 'neutral'}>
              <div className="popup-site">
                <div className="popup-header">
                  <strong>{site.name}</strong>
                </div>
                {loadingPopup === site.id ? (
                  <div className="popup-body">Loading details...</div>
                ) : details ? (
                  <div className="popup-body">
                    <div style={{ marginBottom: 4 }}>
                      {missingFieldsForSite(details).length ? (
                        <span className="missing-icon" aria-label="Missing info" role="img" title={`Missing: ${missingFieldsForSite(details).join(', ')}`}>⚠ Missing info</span>
                      ) : (
                        <span className="ok-icon" aria-label="Complete" role="img">✔ Complete</span>
                      )}
                    </div>
                    <div><span className="popup-label">Available kW:</span> {
                      details.available_capacity_kw !== null && details.available_capacity_kw !== undefined
                        ? details.available_capacity_kw
                        : (details.bill_count === 0 ? 'Unknown (no bills)' : '—')
                    }</div>
                    <div><span className="popup-label">Peak kW:</span> {details.bill_count === 0 ? 'Unknown (no bills)' : details.last_year_peak_kw}</div>
                    <div><span className="popup-label">Capacity kW:</span> {details.theoretical_capacity_kw ?? '—'}</div>
                    <div><span className="popup-label">Utility:</span> {details.utility || '—'}</div>
                    <div><span className="popup-label">Chargers:</span> {details.charger_count ?? 0}</div>
                    <div><span className="popup-label">Chargers kW:</span> {details.installed_charger_kw ?? 0}</div>
                    <div><span className="popup-label">Vehicles:</span> {details.vehicle_count ?? 0}</div>
                    <div><span className="popup-label">Contact:</span> {details.contact_name ? `${details.contact_name}${details.contact_phone ? ' ('+details.contact_phone+')' : ''}` : '—'}</div>
                    <div><span className="popup-label">Location:</span> {details.address ? `${details.address}${details.city ? ', '+details.city : ''}` : (details.city || '—')}</div>
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
                ) : (
                  <div className="popup-body">
                    <button className="btn btn-secondary" onClick={() => loadSiteDetails(site.id)}>Load Details</button>
                  </div>
                )}
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
