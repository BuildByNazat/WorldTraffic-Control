/**
 * LiveMap — Leaflet map rendering live aircraft positions and camera detections.
 *
 * Features:
 *   - Aircraft: rotated ✈ icon, coloured by source (simulated vs. OpenSky)
 *   - Detections: small coloured dot with category label, from Gemini analysis
 *   - Efficient in-place marker updates (no full re-render on each tick)
 *   - Clickable popups for both marker types
 *   - Optional highlightLocation: pulsing ring for history-mode selection
 *
 * Detection coordinates are APPROXIMATE (camera lat/lon + small jitter).
 * This is clearly noted in each detection popup.
 */

import React, { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  type CombinedFeatureCollection,
  type AnyFeature,
  isAircraftFeature,
} from "../hooks/useLiveFeed";

// ── Fix Leaflet's default icon path broken by bundlers ────────────────────
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ---------------------------------------------------------------------------
// Icon factories
// ---------------------------------------------------------------------------

function createAircraftIcon(heading: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="aircraft-icon" style="transform: rotate(${heading}deg)">✈</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

/** Colour map for detection categories. */
const DETECTION_COLORS: Record<string, string> = {
  vehicle: "#f59e0b",
  pedestrian: "#3b82f6",
  aircraft: "#8b5cf6",
  infrastructure: "#6b7280",
  incident: "#ef4444",
  unknown: "#9ca3af",
};

function createDetectionIcon(category: string): L.DivIcon {
  const colour = DETECTION_COLORS[category] ?? DETECTION_COLORS.unknown;
  return L.divIcon({
    className: "",
    html: `<div class="detection-icon" style="background:${colour}" title="${category}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

// ---------------------------------------------------------------------------
// Popup builders
// ---------------------------------------------------------------------------

function buildAircraftPopup(f: AnyFeature): string {
  if (!isAircraftFeature(f)) return "";
  const p = f.properties;
  return `
    <div class="aircraft-popup">
      <h3>✈ ${p.callsign}</h3>
      <table>
        <tr><td>ID</td><td>${p.id}</td></tr>
        <tr><td>Altitude</td><td>${p.altitude.toLocaleString()} ft</td></tr>
        <tr><td>Heading</td><td>${p.heading}°</td></tr>
        <tr><td>Speed</td><td>${p.speed} kts</td></tr>
        <tr><td>Source</td><td>${p.source}</td></tr>
      </table>
    </div>
  `;
}

function buildDetectionPopup(f: AnyFeature): string {
  if (isAircraftFeature(f)) return "";
  const p = f.properties;
  const confidence = (p.confidence * 100).toFixed(0);
  const time = p.detected_at
    ? new Date(p.detected_at).toLocaleTimeString()
    : "—";
  return `
    <div class="detection-popup">
      <h3>📷 ${p.label}</h3>
      <table>
        <tr><td>Category</td><td>${p.category}</td></tr>
        <tr><td>Confidence</td><td>${confidence}%</td></tr>
        <tr><td>Camera</td><td>${p.camera_id}</td></tr>
        <tr><td>Detected at</td><td>${time}</td></tr>
      </table>
      <p class="detection-popup__note">
        ⚠️ Position is approximate (camera location only)
      </p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Inner component: syncs live markers
// ---------------------------------------------------------------------------

interface MarkersLayerProps {
  data: CombinedFeatureCollection | null;
}

function MarkersLayer({ data }: MarkersLayerProps) {
  const map = useMap();
  const markerMap = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!data) return;

    const incoming = new Set(data.features.map((f) => f.properties.id));

    // Remove stale markers
    markerMap.current.forEach((marker, id) => {
      if (!incoming.has(id)) {
        marker.remove();
        markerMap.current.delete(id);
      }
    });

    // Add or update markers
    data.features.forEach((feature) => {
      const id = feature.properties.id;
      const [lon, lat] = feature.geometry.coordinates;

      const icon = isAircraftFeature(feature)
        ? createAircraftIcon(feature.properties.heading)
        : createDetectionIcon(feature.properties.category);

      const popup = isAircraftFeature(feature)
        ? buildAircraftPopup(feature)
        : buildDetectionPopup(feature);

      const existing = markerMap.current.get(id);
      if (existing) {
        existing.setLatLng([lat, lon]);
        existing.setIcon(icon);
        existing.setPopupContent(popup);
      } else {
        const marker = L.marker([lat, lon], { icon })
          .addTo(map)
          .bindPopup(popup);
        markerMap.current.set(id, marker);
      }
    });
  }, [data, map]);

  useEffect(() => {
    return () => {
      markerMap.current.forEach((m) => m.remove());
      markerMap.current.clear();
    };
  }, []);

  return null;
}

// ---------------------------------------------------------------------------
// Inner component: history highlight marker (pulsing yellow ring)
// ---------------------------------------------------------------------------

export interface HighlightLocation {
  lat: number;
  lon: number;
  label: string;
}

interface HighlightLayerProps {
  location: HighlightLocation | null;
}

function HighlightLayer({ location }: HighlightLayerProps) {
  const map = useMap();
  const circleRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    // Remove previous highlight
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (!location) return;

    const { lat, lon, label } = location;

    const circle = L.circleMarker([lat, lon], {
      radius: 14,
      color: "#facc15",
      weight: 3,
      opacity: 1,
      fillColor: "#facc15",
      fillOpacity: 0.18,
      className: "highlight-ring",
    })
      .addTo(map)
      .bindPopup(
        `<div class="aircraft-popup"><h3>${label}</h3>` +
          `<p style="font-size:0.75rem;color:#8b949e;margin-top:4px">History selection</p></div>`
      )
      .openPopup();

    circleRef.current = circle;

    // Fly to the selected point
    map.flyTo([lat, lon], Math.max(map.getZoom(), 7), { duration: 1.2 });

    return () => {
      circle.remove();
      circleRef.current = null;
    };
  }, [location, map]);

  return null;
}

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

export interface LiveMapProps {
  data: CombinedFeatureCollection | null;
  /** When set, drops a yellow highlight ring on this coordinate (history mode). */
  highlightLocation?: HighlightLocation | null;
}

const LiveMap: React.FC<LiveMapProps> = ({ data, highlightLocation }) => {
  return (
    <MapContainer
      className="map-container"
      center={[20, 0]}
      zoom={3}
      minZoom={2}
      maxZoom={18}
      worldCopyJump
    >
      {/* OpenStreetMap tiles — free, no API key required */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkersLayer data={data} />
      <HighlightLayer location={highlightLocation ?? null} />
    </MapContainer>
  );
};

export default LiveMap;
