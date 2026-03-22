import { useCallback, useMemo, useState } from "react";
import type {
  AircraftRecord,
  DetectionRecord,
  HistoryFeedState,
  HistorySummary,
} from "./useHistoryFeed";

export type DetectionCategoryFilter =
  | "all"
  | "vehicle"
  | "pedestrian"
  | "aircraft"
  | "infrastructure"
  | "incident";

export type AircraftSourceFilter = "all" | "opensky" | "simulated";
export type TimeRangeFilter = "15m" | "1h" | "6h" | "24h" | "all";

export interface HistoryFiltersState {
  detectionCategory: DetectionCategoryFilter;
  minConfidence: number;
  cameraId: string;
  aircraftSource: AircraftSourceFilter;
  callsignQuery: string;
  altitudeOnly: boolean;
  timeRange: TimeRangeFilter;
}

export interface FilteredHistoryState {
  filters: HistoryFiltersState;
  updateFilter: <K extends keyof HistoryFiltersState>(
    key: K,
    value: HistoryFiltersState[K]
  ) => void;
  resetFilters: () => void;
  filteredDetections: DetectionRecord[];
  filteredAircraft: AircraftRecord[];
  summary: HistorySummary;
  availableCameraIds: string[];
  hasActiveFilters: boolean;
}

const DEFAULT_FILTERS: HistoryFiltersState = {
  detectionCategory: "all",
  minConfidence: 0,
  cameraId: "all",
  aircraftSource: "all",
  callsignQuery: "",
  altitudeOnly: false,
  timeRange: "all",
};

const TIME_RANGE_MS: Record<Exclude<TimeRangeFilter, "all">, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

function isWithinTimeRange(iso: string, timeRange: TimeRangeFilter): boolean {
  if (timeRange === "all") return true;

  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return false;

  return Date.now() - timestamp <= TIME_RANGE_MS[timeRange];
}

function buildFilteredSummary(
  sourceSummary: HistorySummary | null,
  detections: DetectionRecord[],
  aircraft: AircraftRecord[],
  hasActiveFilters: boolean
): HistorySummary {
  if (!hasActiveFilters && sourceSummary) {
    return sourceSummary;
  }

  const detectionsByCategory = detections.reduce<Record<string, number>>(
    (acc, record) => {
      acc[record.category] = (acc[record.category] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return {
    total_aircraft_observations: aircraft.length,
    total_detections: detections.length,
    detections_by_category: detectionsByCategory,
    latest_aircraft_observed_at: aircraft[0]?.observed_at ?? null,
    latest_detection_detected_at: detections[0]?.detected_at ?? null,
  };
}

export function useFilteredHistory(feed: HistoryFeedState): FilteredHistoryState {
  const [filters, setFilters] = useState<HistoryFiltersState>(DEFAULT_FILTERS);

  const availableCameraIds = useMemo(
    () =>
      Array.from(
        new Set(
          feed.detections
            .map((record) => record.camera_id)
            .filter((cameraId) => cameraId.trim().length > 0)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [feed.detections]
  );

  const filteredDetections = useMemo(() => {
    return feed.detections.filter((record) => {
      if (
        filters.detectionCategory !== "all" &&
        record.category !== filters.detectionCategory
      ) {
        return false;
      }

      if (record.confidence < filters.minConfidence) {
        return false;
      }

      if (filters.cameraId !== "all" && record.camera_id !== filters.cameraId) {
        return false;
      }

      return isWithinTimeRange(record.detected_at, filters.timeRange);
    });
  }, [feed.detections, filters]);

  const filteredAircraft = useMemo(() => {
    const normalizedQuery = filters.callsignQuery.trim().toLowerCase();

    return feed.aircraft.filter((record) => {
      if (filters.aircraftSource !== "all" && record.source !== filters.aircraftSource) {
        return false;
      }

      if (normalizedQuery) {
        const callsign = (record.callsign ?? "").toLowerCase();
        if (!callsign.includes(normalizedQuery)) {
          return false;
        }
      }

      if (filters.altitudeOnly && record.altitude == null) {
        return false;
      }

      return isWithinTimeRange(record.observed_at, filters.timeRange);
    });
  }, [feed.aircraft, filters]);

  const hasActiveFilters =
    filters.detectionCategory !== DEFAULT_FILTERS.detectionCategory ||
    filters.minConfidence !== DEFAULT_FILTERS.minConfidence ||
    filters.cameraId !== DEFAULT_FILTERS.cameraId ||
    filters.aircraftSource !== DEFAULT_FILTERS.aircraftSource ||
    filters.callsignQuery.trim().length > 0 ||
    filters.altitudeOnly !== DEFAULT_FILTERS.altitudeOnly ||
    filters.timeRange !== DEFAULT_FILTERS.timeRange;

  const summary = useMemo(
    () =>
      buildFilteredSummary(
        feed.summary,
        filteredDetections,
        filteredAircraft,
        hasActiveFilters
      ),
    [feed.summary, filteredDetections, filteredAircraft, hasActiveFilters]
  );

  const updateFilter = useCallback(
    <K extends keyof HistoryFiltersState>(key: K, value: HistoryFiltersState[K]) => {
      setFilters((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return {
    filters,
    updateFilter,
    resetFilters,
    filteredDetections,
    filteredAircraft,
    summary,
    availableCameraIds,
    hasActiveFilters,
  };
}
