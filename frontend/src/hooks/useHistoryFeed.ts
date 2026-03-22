/**
 * useHistoryFeed â€” fetches history data from the backend REST API.
 *
 * Provides:
 *   - summary: aggregated statistics from /api/history/summary
 *   - detections: recent detections from /api/history/detections
 *   - aircraft: recent aircraft observations from /api/history/aircraft
 *   - loading / error states for each
 *   - refresh() to manually re-fetch all data
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../config";

export interface HistorySummary {
  total_aircraft_observations: number;
  total_detections: number;
  detections_by_category: Record<string, number>;
  latest_aircraft_observed_at: string | null;
  latest_detection_detected_at: string | null;
}

export interface DetectionRecord {
  id: number;
  feature_id: string;
  category: string;
  label: string;
  confidence: number;
  latitude: number;
  longitude: number;
  source: string;
  camera_id: string;
  detected_at: string;
}

export interface AircraftRecord {
  id: number;
  feature_id: string;
  callsign: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  source: string;
  observed_at: string;
}

export interface HistoryFeedState {
  summary: HistorySummary | null;
  detections: DetectionRecord[];
  aircraft: AircraftRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const HISTORY_RECORD_LIMIT = 250;

export function useHistoryFeed(enabled: boolean): HistoryFeedState {
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [detections, setDetections] = useState<DetectionRecord[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, detectionsRes, aircraftRes] = await Promise.all([
        fetch(`${API_BASE}/api/history/summary`),
        fetch(`${API_BASE}/api/history/detections?limit=${HISTORY_RECORD_LIMIT}`),
        fetch(`${API_BASE}/api/history/aircraft?limit=${HISTORY_RECORD_LIMIT}`),
      ]);

      if (!summaryRes.ok || !detectionsRes.ok || !aircraftRes.ok) {
        throw new Error("One or more history API requests failed.");
      }

      const [summaryData, detectionsData, aircraftData] = await Promise.all([
        summaryRes.json() as Promise<HistorySummary>,
        detectionsRes.json() as Promise<{ count: number; records: DetectionRecord[] }>,
        aircraftRes.json() as Promise<{ count: number; records: AircraftRecord[] }>,
      ]);

      if (!isMounted.current) return;
      setSummary(summaryData);
      setDetections(detectionsData.records);
      setAircraft(aircraftData.records);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load history.");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      fetchAll();
    }
  }, [enabled, fetchAll]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return { summary, detections, aircraft, loading, error, refresh: fetchAll };
}
