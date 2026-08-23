import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Wrench, X } from "lucide-react";

// Point Leaflet's default icon paths at the CDN so they work under bundlers.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom red wrench pin using a DivIcon so we don't depend on extra assets.
const mechIcon = L.divIcon({
  className: "mech-map-pin",
  html: `<div style="width:34px;height:34px;transform:translate(-50%,-100%);display:flex;align-items:center;justify-content:center;border-radius:50% 50% 50% 0;background:#ef4444;border:2px solid #fff;box-shadow:0 6px 14px rgba(239,68,68,0.55);transform-origin:bottom center;rotate:-45deg;">
     <div style="rotate:45deg;color:#fff;font-weight:900;font-size:16px;line-height:1;">🔧</div>
   </div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -34],
});

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [map, points]);
  return null;
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function MechanicalMiniMap({ messages, onDismiss }) {
  const activeAll = useMemo(() => {
    return messages
      .filter((m) => m.system && m.mechanical && !m.resolved && m.mechanical.lat != null && m.mechanical.lng != null);
  }, [messages]);
  // Show pins for the most recent 6 to keep the map readable, but display the
  // real total in the count pill so nothing feels hidden.
  const active = activeAll.slice(-6);

  const containerRef = useRef(null);
  // Force leaflet to invalidate size on mount (parent may size after paint).
  useEffect(() => {
    if (!containerRef.current) return undefined;
    const timer = setTimeout(() => {
      const mapEl = containerRef.current && containerRef.current.querySelector(".leaflet-container");
      const mapInstance = mapEl && mapEl["_leaflet_map"];
      if (mapInstance && mapInstance.invalidateSize) mapInstance.invalidateSize();
    }, 60);
    return () => clearTimeout(timer);
  }, [active.length]);

  if (!active.length) return null;

  const center = [active[0].mechanical.lat, active[0].mechanical.lng];

  return (
    <div
      ref={containerRef}
      className="relative border-b border-status-cant/30 bg-status-cant/5"
      data-testid="mechanical-mini-map"
    >
      <div className="flex items-center justify-between px-4 py-1.5 text-status-cant">
        <div className="text-[10px] font-mono-stat uppercase tracking-widest font-bold inline-flex items-center gap-1.5" data-testid="mechanical-mini-map-count">
          <Wrench className="w-3 h-3" />
          {activeAll.length} open mechanical{activeAll.length === 1 ? "" : "s"}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded-full hover:bg-status-cant/10 active:scale-95"
            data-testid="mechanical-mini-map-close"
            aria-label="Hide mechanical map"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div style={{ height: 160 }} className="w-full">
        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom={false}
          zoomControl={false}
          attributionControl={false}
          style={{ height: "100%", width: "100%", background: "#111" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
          <FitBounds points={active.map((m) => ({ lat: m.mechanical.lat, lng: m.mechanical.lng }))} />
          {active.map((m) => (
            <Marker
              key={m.id}
              position={[m.mechanical.lat, m.mechanical.lng]}
              icon={mechIcon}
            >
              <Popup>
                <div className="font-heading text-[13px] font-black uppercase tracking-widest text-status-cant">
                  🔧 {m.name}
                </div>
                <div className="text-[11px] text-neutral-600 font-mono-stat tracking-wide">
                  {timeAgo(m.created_at)}
                </div>
                <a
                  href={m.mechanical.maps_link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] font-bold underline underline-offset-2 text-status-cant"
                  data-testid={`mechanical-mini-map-open-${m.id}`}
                >
                  Open in Google Maps ↗
                </a>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
