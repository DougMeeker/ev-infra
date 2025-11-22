
import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import { createSite } from "../api";

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

const FocusHelper = ({ focusSite }) => {
  const map = useMap();
  useEffect(() => {
    if (focusSite && focusSite.latitude && focusSite.longitude) {
      map.flyTo([focusSite.latitude, focusSite.longitude], 13, { duration: 0.75 });
    }
  }, [focusSite, map]);
  return null;
};

const MapView = ({ sites, focusSiteId }) => {
  const center = [37.5, -120];
  const [newMarker, setNewMarker] = useState(null);
  const focusSite = focusSiteId ? sites.find(s => s.id === focusSiteId) : null;

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
      alert("Site saved!");
      window.location.reload(); // Or trigger a state update instead
    } catch (err) {
      console.error("Error saving site:", err);
      alert("Failed to save site.");
    }
  };

  return (
    <MapContainer center={center} zoom={6} style={{ height: "500px", width: "100%", borderRadius: 'var(--radius)', border: '1px solid var(--card-border)' }}>
      <TileLayer
        attribution='&copy; https://www.openstreetmap.org/ contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

  <ClickHandler onMapClick={handleMapClick} />
  <FocusHelper focusSite={focusSite} />

      {sites.map((site) => (
        <Marker key={site.id} position={[site.latitude, site.longitude]}>
          <Popup>
            <strong>{site.name}</strong><br />
            Utility: {site.utility}<br />
            Meter #: {site.meter_number}
          </Popup>
        </Marker>
      ))}

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
