/**
 * useHistoryFeed - fetches filtered history data from the backend REST API.
 *
 * Provides:
 *   - summary: filtered aggregate statistics from /api/history/summary
 *   - detections: paginated filtered detections from /api/history/detections
 *   - aircraft: paginated filtered aircraft observations from /api/history/aircraft
 *   - cameraIds: available camera ids for the filter UI
 *   - loading / error states
 *   - refresh() and per-list load-more helpers
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../config";
import type { HistoryFiltersState, TimeRangeFilter } from "./useFilteredHistory";

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

interface CameraMetadata {
  id: string;
}

interface PaginatedHistoryResponse<T> {
  count: number;
  total: number;
  limit: number;
  offset: number;
  records: T[];
}

export interface HistoryFeedState {
  summary: HistorySummary | null;
  detections: DetectionRecord[];
  aircraft: AircraftRecord[];
  cameraIds: string[];
  detectionsTotal: number;
  aircraftTotal: number;
  loading: boolean;
  loadingMoreDetections: boolean;
  loadingMoreAircraft: boolean;
  error: string | null;
  hasMoreDetections: boolean;
  hasMoreAircraft: boolean;
  refresh: () => void;
  loadMoreDetections: () => void;
  loadMoreAircraft: () => void;
}

const HISTORY_PAGE_SIZE = 25;

const TIME_RANGE_MS: Record<Exclude<TimeRangeFilter, "all">, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

function applyTimeRange(
  params: URLSearchParams,
  timeRange: TimeRangeFilter,
  anchor: Date
) {
  if (timeRange === "all") return;

  const until = anchor;
  const since = new Date(anchor.getTime() - TIME_RANGE_MS[timeRange]);
  params.set("since", since.toISOString());
  params.set("until", until.toISOString());
}

function buildDetectionParams(
  filters: HistoryFiltersState,
  limit: number,
  offset: number,
  anchor: Date
): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (filters.detectionCategory !== "all") {
    params.set("category", filters.detectionCategory);
  }
  if (filters.cameraId !== "all") {
    params.set("camera_id", filters.cameraId);
  }
  if (filters.minConfidence > 0) {
    params.set("min_confidence", filters.minConfidence.toString());
  }

  applyTimeRange(params, filters.timeRange, anchor);
  return params;
}

function buildAircraftParams(
  filters: HistoryFiltersState,
  limit: number,
  offset: number,
  anchor: Date
): URLSearchParams {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (filters.aircraftSource !== "all") {
    params.set("source", filters.aircraftSource);
  }
  if (filters.callsignQuery.trim()) {
    params.set("callsign", filters.callsignQuery.trim());
  }
  if (filters.altitudeOnly) {
    params.set("altitude_only", "true");
  }

  applyTimeRange(params, filters.timeRange, anchor);
  return params;
}

function buildSummaryParams(
  filters: HistoryFiltersState,
  anchor: Date
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.detectionCategory !== "all") {
    params.set("category", filters.detectionCategory);
  }
  if (filters.cameraId !== "all") {
    params.set("camera_id", filters.cameraId);
  }
  if (filters.minConfidence > 0) {
    params.set("min_confidence", filters.minConfidence.toString());
  }
  if (filters.aircraftSource !== "all") {
    params.set("source", filters.aircraftSource);
  }
  if (filters.callsignQuery.trim()) {
    params.set("callsign", filters.callsignQuery.trim());
  }
  if (filters.altitudeOnly) {
    params.set("altitude_only", "true");
  }

  applyTimeRange(params, filters.timeRange, anchor);
  return params;
}

export function useHistoryFeed(
  enabled: boolean,
  filters: HistoryFiltersState
): HistoryFeedState {
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [detections, setDetections] = useState<DetectionRecord[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [cameraIds, setCameraIds] = useState<string[]>([]);
  const [detectionsTotal, setDetectionsTotal] = useState(0);
  const [aircraftTotal, setAircraftTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMoreDetections, setLoadingMoreDetections] = useState(false);
  const [loadingMoreAircraft, setLoadingMoreAircraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);
  const requestVersionRef = useRef(0);
  const queryAnchorRef = useRef(new Date());

  const filtersKey = useMemo(
    () => JSON.stringify(filters),
    [filters]
  );

  const refresh = useCallback(async () => {
    if (!enabled || !isMounted.current) return;

    const requestVersion = ++requestVersionRef.current;
    const anchor = new Date();
    queryAnchorRef.current = anchor;

    setLoading(true);
    setError(null);

    try {
      const summaryParams = buildSummaryParams(filters, anchor);
      const detectionParams = buildDetectionParams(filters, HISTORY_PAGE_SIZE, 0, anchor);
      const aircraftParams = buildAircraftParams(filters, HISTORY_PAGE_SIZE, 0, anchor);

      const [summaryRes, detectionsRes, aircraftRes, camerasRes] = await Promise.all([
        fetch(`${API_BASE}/api/history/summary?${summaryParams.toString()}`),
        fetch(`${API_BASE}/api/history/detections?${detectionParams.toString()}`),
        fetch(`${API_BASE}/api/history/aircraft?${aircraftParams.toString()}`),
        fetch(`${API_BASE}/api/cameras`),
      ]);

      if (!summaryRes.ok || !detectionsRes.ok || !aircraftRes.ok || !camerasRes.ok) {
        throw new Error("One or more history API requests failed.");
      }

      const [summaryData, detectionsData, aircraftData, camerasData] =
        await Promise.all([
          summaryRes.json() as Promise<HistorySummary>,
          detectionsRes.json() as Promise<PaginatedHistoryResponse<DetectionRecord>>,
          aircraftRes.json() as Promise<PaginatedHistoryResponse<AircraftRecord>>,
          camerasRes.json() as Promise<{ cameras: CameraMetadata[] }>,
        ]);

      if (!isMounted.current || requestVersion !== requestVersionRef.current) return;

      setSummary(summaryData);
      setDetections(detectionsData.records);
      setAircraft(aircraftData.records);
      setDetectionsTotal(detectionsData.total);
      setAircraftTotal(aircraftData.total);
      setCameraIds(
        camerasData.cameras
          .map((camera) => camera.id)
          .filter((cameraId) => cameraId.trim().length > 0)
      );
    } catch (err) {
      if (!isMounted.current || requestVersion !== requestVersionRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load history.");
    } finally {
      if (isMounted.current && requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, filters]);

  useEffect(() => {
    if (enabled) {
      void refresh();
    }
  }, [enabled, filtersKey, refresh]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const loadMoreDetections = useCallback(async () => {
    if (
      !enabled ||
      loading ||
      loadingMoreDetections ||
      detections.length >= detectionsTotal
    ) {
      return;
    }

    const requestVersion = requestVersionRef.current;
    setLoadingMoreDetections(true);
    setError(null);

    try {
      const params = buildDetectionParams(
        filters,
        HISTORY_PAGE_SIZE,
        detections.length,
        queryAnchorRef.current
      );
      const response = await fetch(`${API_BASE}/api/history/detections?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Detection history request failed.");
      }

      const data =
        (await response.json()) as PaginatedHistoryResponse<DetectionRecord>;

      if (!isMounted.current || requestVersion !== requestVersionRef.current) return;

      setDetections((current) => [...current, ...data.records]);
      setDetectionsTotal(data.total);
    } catch (err) {
      if (!isMounted.current || requestVersion !== requestVersionRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load more detections.");
    } finally {
      if (isMounted.current && requestVersion === requestVersionRef.current) {
        setLoadingMoreDetections(false);
      }
    }
  }, [
    enabled,
    loading,
    loadingMoreDetections,
    detections.length,
    detectionsTotal,
    filters,
  ]);

  const loadMoreAircraft = useCallback(async () => {
    if (
      !enabled ||
      loading ||
      loadingMoreAircraft ||
      aircraft.length >= aircraftTotal
    ) {
      return;
    }

    const requestVersion = requestVersionRef.current;
    setLoadingMoreAircraft(true);
    setError(null);

    try {
      const params = buildAircraftParams(
        filters,
        HISTORY_PAGE_SIZE,
        aircraft.length,
        queryAnchorRef.current
      );
      const response = await fetch(`${API_BASE}/api/history/aircraft?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Aircraft history request failed.");
      }

      const data = (await response.json()) as PaginatedHistoryResponse<AircraftRecord>;

      if (!isMounted.current || requestVersion !== requestVersionRef.current) return;

      setAircraft((current) => [...current, ...data.records]);
      setAircraftTotal(data.total);
    } catch (err) {
      if (!isMounted.current || requestVersion !== requestVersionRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load more aircraft.");
    } finally {
      if (isMounted.current && requestVersion === requestVersionRef.current) {
        setLoadingMoreAircraft(false);
      }
    }
  }, [
    enabled,
    loading,
    loadingMoreAircraft,
    aircraft.length,
    aircraftTotal,
    filters,
  ]);

  return {
    summary,
    detections,
    aircraft,
    cameraIds,
    detectionsTotal,
    aircraftTotal,
    loading,
    loadingMoreDetections,
    loadingMoreAircraft,
    error,
    hasMoreDetections: detections.length < detectionsTotal,
    hasMoreAircraft: aircraft.length < aircraftTotal,
    refresh,
    loadMoreDetections,
    loadMoreAircraft,
  };
}
