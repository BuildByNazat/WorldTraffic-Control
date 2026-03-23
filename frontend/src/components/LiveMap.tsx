/**
 * LiveMap - Leaflet map rendering live aircraft, detections, alerts, and selection highlights.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import {
  type CombinedFeatureCollection,
  type AnyFeature,
  isAircraftFeature,
} from "../hooks/useLiveFeed";
import type { AlertRecord } from "../hooks/useAlerts";
import type { MapLayerState } from "../hooks/useMapLayers";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function createAircraftIcon(heading: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="aircraft-icon"><span style="transform: rotate(${heading}deg)">&#9992;</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const DETECTION_COLORS: Record<string, string> = {
  vehicle: "#f59e0b",
  pedestrian: "#3b82f6",
  aircraft: "#8b5cf6",
  infrastructure: "#6b7280",
  incident: "#ef4444",
  unknown: "#9ca3af",
};

function createDetectionIcon(category: string): L.DivIcon {
  const color = DETECTION_COLORS[category] ?? DETECTION_COLORS.unknown;
  return L.divIcon({
    className: "",
    html: `<div class="detection-icon" style="background:${color}" title="${category}"><span></span></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function createAlertIcon(
  severity: AlertRecord["severity"],
  selected: boolean
): L.DivIcon {
  const color =
    severity === "high"
      ? "#f85149"
      : severity === "medium"
        ? "#d29922"
        : "#58a6ff";

  return L.divIcon({
    className: "",
    html: `<div class="alert-marker${
      selected ? " alert-marker--selected" : ""
    }" style="--alert-color:${color}"><span></span></div>`,
    iconSize: selected ? [20, 20] : [16, 16],
    iconAnchor: selected ? [10, 10] : [8, 8],
    popupAnchor: [0, -10],
  });
}

function buildAircraftPopup(feature: AnyFeature): string {
  if (!isAircraftFeature(feature)) return "";
  const properties = feature.properties;
  return `
    <div class="aircraft-popup">
      <h3>${properties.callsign}</h3>
      <table>
        <tr><td>ID</td><td>${properties.id}</td></tr>
        <tr><td>Altitude</td><td>${properties.altitude.toLocaleString()} ft</td></tr>
        <tr><td>Heading</td><td>${properties.heading} deg</td></tr>
        <tr><td>Speed</td><td>${properties.speed} kt</td></tr>
        <tr><td>Source</td><td>${properties.source}</td></tr>
      </table>
    </div>
  `;
}

function buildDetectionPopup(feature: AnyFeature): string {
  if (isAircraftFeature(feature)) return "";
  const properties = feature.properties;
  const confidence = (properties.confidence * 100).toFixed(0);
  const time = properties.detected_at
    ? new Date(properties.detected_at).toLocaleTimeString()
    : "-";
  return `
    <div class="detection-popup">
      <h3>${properties.label}</h3>
      <table>
        <tr><td>Category</td><td>${properties.category}</td></tr>
        <tr><td>Confidence</td><td>${confidence}%</td></tr>
        <tr><td>Camera</td><td>${properties.camera_id}</td></tr>
        <tr><td>Observed</td><td>${time}</td></tr>
      </table>
      <p class="detection-popup__note">Position is approximate to the camera location.</p>
    </div>
  `;
}

function buildAlertPopup(alert: AlertRecord): string {
  return `
    <div class="aircraft-popup">
      <h3>${alert.title}</h3>
      <table>
        <tr><td>Category</td><td>${alert.category}</td></tr>
        <tr><td>Severity</td><td>${alert.severity}</td></tr>
        <tr><td>Status</td><td>${alert.status}</td></tr>
        <tr><td>Camera</td><td>${alert.camera_id ?? "-"}</td></tr>
      </table>
    </div>
  `;
}

interface LiveMarkersLayerProps {
  data: CombinedFeatureCollection | null;
  layers: MapLayerState;
}

function LiveMarkersLayer({ data, layers }: LiveMarkersLayerProps) {
  const map = useMap();
  const markerMap = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    const visibleFeatures =
      data?.features.filter((feature) =>
        isAircraftFeature(feature) ? layers.showAircraft : layers.showDetections
      ) ?? [];

    const incoming = new Set(
      visibleFeatures.map((feature) =>
        `${isAircraftFeature(feature) ? "aircraft" : "detection"}:${feature.properties.id}`
      )
    );

    markerMap.current.forEach((marker, id) => {
      if (!incoming.has(id)) {
        marker.remove();
        markerMap.current.delete(id);
      }
    });

    visibleFeatures.forEach((feature) => {
      const markerId = `${isAircraftFeature(feature) ? "aircraft" : "detection"}:${feature.properties.id}`;
      const [lon, lat] = feature.geometry.coordinates;

      const icon = isAircraftFeature(feature)
        ? createAircraftIcon(feature.properties.heading)
        : createDetectionIcon(feature.properties.category);

      const popup = isAircraftFeature(feature)
        ? buildAircraftPopup(feature)
        : buildDetectionPopup(feature);

      const existing = markerMap.current.get(markerId);
      if (existing) {
        existing.setLatLng([lat, lon]);
        existing.setIcon(icon);
        existing.setPopupContent(popup);
      } else {
        const marker = L.marker([lat, lon], { icon }).addTo(map).bindPopup(popup);
        markerMap.current.set(markerId, marker);
      }
    });
  }, [data, layers.showAircraft, layers.showDetections, map]);

  useEffect(() => {
    return () => {
      markerMap.current.forEach((marker) => marker.remove());
      markerMap.current.clear();
    };
  }, []);

  return null;
}

interface AlertMarkersLayerProps {
  alerts: AlertRecord[];
  layers: MapLayerState;
  selectedAlertId: string | null;
  onSelectAlert: (alert: AlertRecord) => void;
}

function AlertMarkersLayer({
  alerts,
  layers,
  selectedAlertId,
  onSelectAlert,
}: AlertMarkersLayerProps) {
  const map = useMap();
  const markerMap = useRef<Map<string, L.Marker>>(new Map());

  const visibleAlerts = useMemo(() => {
    if (!layers.showAlerts) return [];
    return alerts.filter((alert) =>
      layers.openAlertsOnly ? alert.status !== "resolved" : true
    );
  }, [alerts, layers.openAlertsOnly, layers.showAlerts]);

  useEffect(() => {
    const incoming = new Set(visibleAlerts.map((alert) => alert.id));

    markerMap.current.forEach((marker, id) => {
      if (!incoming.has(id)) {
        marker.remove();
        markerMap.current.delete(id);
      }
    });

    visibleAlerts.forEach((alert) => {
      const icon = createAlertIcon(alert.severity, selectedAlertId === alert.id);
      const existing = markerMap.current.get(alert.id);
      if (existing) {
        existing.setLatLng([alert.latitude, alert.longitude]);
        existing.setIcon(icon);
        existing.setPopupContent(buildAlertPopup(alert));
      } else {
        const marker = L.marker([alert.latitude, alert.longitude], { icon })
          .addTo(map)
          .bindPopup(buildAlertPopup(alert));
        marker.on("click", () => onSelectAlert(alert));
        markerMap.current.set(alert.id, marker);
      }
    });
  }, [map, onSelectAlert, selectedAlertId, visibleAlerts]);

  useEffect(() => {
    return () => {
      markerMap.current.forEach((marker) => marker.remove());
      markerMap.current.clear();
    };
  }, []);

  return null;
}

export interface HighlightLocation {
  lat: number;
  lon: number;
  label: string;
}

type HighlightVariant = "replay" | "selected" | null;

interface HighlightLayerProps {
  location: HighlightLocation | null;
  variant: HighlightVariant;
  enabled: boolean;
}

function HighlightLayer({ location, variant, enabled }: HighlightLayerProps) {
  const map = useMap();
  const circleRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (!location || !variant || !enabled) return;

    const color = variant === "replay" ? "#38bdf8" : "#facc15";
    const subtitle = variant === "replay" ? "Replay selection" : "Selected item";

    const circle = L.circleMarker([location.lat, location.lon], {
      radius: variant === "replay" ? 13 : 14,
      color,
      weight: 3,
      opacity: 1,
      fillColor: color,
      fillOpacity: 0.18,
      className: "highlight-ring",
    })
      .addTo(map)
      .bindPopup(
        `<div class="aircraft-popup"><h3>${location.label}</h3><p style="font-size:0.75rem;color:#8b949e;margin-top:4px">${subtitle}</p></div>`
      )
      .openPopup();

    circleRef.current = circle;
    map.flyTo([location.lat, location.lon], Math.max(map.getZoom(), 7), {
      duration: 1.2,
    });

    return () => {
      circle.remove();
      circleRef.current = null;
    };
  }, [enabled, location, map, variant]);

  return null;
}

export interface LiveMapProps {
  data: CombinedFeatureCollection | null;
  alerts: AlertRecord[];
  layerState: MapLayerState;
  highlightLocation?: HighlightLocation | null;
  highlightVariant?: HighlightVariant;
  selectedAlertId?: string | null;
  onSelectAlert: (alert: AlertRecord) => void;
}

const LiveMap: React.FC<LiveMapProps> = ({
  data,
  alerts,
  layerState,
  highlightLocation,
  highlightVariant = null,
  selectedAlertId = null,
  onSelectAlert,
}) => {
  const highlightEnabled =
    highlightVariant === "replay"
      ? layerState.showReplayHighlight
      : highlightVariant === "selected"
        ? layerState.showSelectedHighlight
        : false;

  return (
    <MapContainer
      className="map-container map-container--dark"
      center={[20, 0]}
      zoom={3}
      minZoom={2}
      maxZoom={18}
      worldCopyJump
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <LiveMarkersLayer data={data} layers={layerState} />
      <AlertMarkersLayer
        alerts={alerts}
        layers={layerState}
        selectedAlertId={selectedAlertId}
        onSelectAlert={onSelectAlert}
      />
      <HighlightLayer
        location={highlightLocation ?? null}
        variant={highlightVariant}
        enabled={highlightEnabled}
      />
    </MapContainer>
  );
};

export default LiveMap;
