/**
 * useLiveFeed — manages the WebSocket connection and returns live feed data.
 *
 * Payload: CombinedFeatureCollection
 *   features[] contains both aircraft and camera detection features.
 *   Distinguish via properties.category:
 *     - "aircraft"           → aircraft marker (rotated ✈)
 *     - "vehicle" | "pedestrian" | "incident" | etc. → detection dot
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL, WS_RECONNECT_DELAY_MS } from "../config";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AircraftProperties {
  id: string;
  callsign: string | null;
  flight_identifier?: string | null;
  altitude: number;
  heading: number;
  speed: number;
  source: string;
  category: "aircraft";
  observed_at?: string | null;
  route_origin?: string | null;
  route_destination?: string | null;
  provider_name?: string | null;
  freshness_seconds?: number | null;
  stale?: boolean;
}

export interface DetectionProperties {
  id: string;
  category: string; // vehicle | pedestrian | aircraft | infrastructure | incident | unknown
  label: string;
  confidence: number;
  latitude: number;
  longitude: number;
  source: "gemini_camera";
  camera_id: string;
  detected_at: string | null;
}

export interface AircraftFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: AircraftProperties;
}

export interface DetectionFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: DetectionProperties;
}

export type AnyFeature = AircraftFeature | DetectionFeature;

export interface CombinedFeatureCollection {
  type: "FeatureCollection";
  features: AnyFeature[];
}

export type WsStatus = "connecting" | "connected" | "disconnected";

export interface LiveFeedState {
  data: CombinedFeatureCollection | null;
  status: WsStatus;
  lastUpdate: Date | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns true if a feature is an aircraft (for type narrowing in components). */
export function isAircraftFeature(f: AnyFeature): f is AircraftFeature {
  return f.properties.category === "aircraft";
}

/** Type guard: ensures the incoming payload is a valid FeatureCollection shape. */
function isCombinedCollection(value: unknown): value is CombinedFeatureCollection {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as CombinedFeatureCollection).type === "FeatureCollection" &&
    Array.isArray((value as CombinedFeatureCollection).features)
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useLiveFeed(): LiveFeedState {
  const [data, setData] = useState<CombinedFeatureCollection | null>(null);
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  const connect = useCallback(() => {
    if (!isMounted.current) return;
    setStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isMounted.current) setStatus("connected");
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      if (!isMounted.current) return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (isCombinedCollection(parsed)) {
          setData(parsed);
          setLastUpdate(new Date());
        } else {
          console.warn("[useLiveFeed] Unexpected payload shape:", parsed);
        }
      } catch {
        console.warn("[useLiveFeed] Failed to parse message:", event.data);
      }
    };

    ws.onerror = () => {
      console.warn("[useLiveFeed] WebSocket error. Will attempt reconnect.");
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      setStatus("disconnected");
      reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY_MS);
    };
  }, []);

  useEffect(() => {
    isMounted.current = true;
    connect();
    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { data, status, lastUpdate };
}
