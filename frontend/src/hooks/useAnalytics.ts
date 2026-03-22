import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../config";
import type { HistoryFiltersState, TimeRangeFilter } from "./useFilteredHistory";

export interface AnalyticsOverview {
  total_detections: number;
  total_aircraft_observations: number;
  open_alerts_count: number;
  incidents_by_status: Record<string, number>;
  detections_by_category: Record<string, number>;
}

export interface AnalyticsTimeseriesPoint {
  bucket_start: string;
  label: string;
  detections: number;
  incidents: number;
}

export interface AnalyticsTimeseriesResponse {
  bucket_unit: "hour" | "day";
  points: AnalyticsTimeseriesPoint[];
}

export interface AnalyticsState {
  overview: AnalyticsOverview | null;
  timeseries: AnalyticsTimeseriesResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

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

function buildAnalyticsParams(
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

export function useAnalytics(
  enabled: boolean,
  filters: HistoryFiltersState
): AnalyticsState {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [timeseries, setTimeseries] = useState<AnalyticsTimeseriesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  const refresh = useCallback(async () => {
    if (!enabled || !isMounted.current) return;

    setLoading(true);
    setError(null);

    try {
      const anchor = new Date();
      const params = buildAnalyticsParams(filters, anchor);
      const query = params.toString();

      const [overviewRes, timeseriesRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/overview?${query}`),
        fetch(`${API_BASE}/api/analytics/timeseries?${query}`),
      ]);

      if (!overviewRes.ok || !timeseriesRes.ok) {
        throw new Error("Failed to load analytics.");
      }

      const [overviewData, timeseriesData] = await Promise.all([
        overviewRes.json() as Promise<AnalyticsOverview>,
        timeseriesRes.json() as Promise<AnalyticsTimeseriesResponse>,
      ]);

      if (!isMounted.current) return;

      setOverview(overviewData);
      setTimeseries(timeseriesData);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load analytics.");
    } finally {
      if (isMounted.current) {
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

  return {
    overview,
    timeseries,
    loading,
    error,
    refresh,
  };
}
