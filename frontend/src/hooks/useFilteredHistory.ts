import { useCallback, useState } from "react";

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
  hasActiveFilters: boolean;
}

export const DEFAULT_HISTORY_FILTERS: HistoryFiltersState = {
  detectionCategory: "all",
  minConfidence: 0,
  cameraId: "all",
  aircraftSource: "all",
  callsignQuery: "",
  altitudeOnly: false,
  timeRange: "all",
};

export function useFilteredHistory(): FilteredHistoryState {
  const [filters, setFilters] = useState<HistoryFiltersState>(DEFAULT_HISTORY_FILTERS);

  const hasActiveFilters =
    filters.detectionCategory !== DEFAULT_HISTORY_FILTERS.detectionCategory ||
    filters.minConfidence !== DEFAULT_HISTORY_FILTERS.minConfidence ||
    filters.cameraId !== DEFAULT_HISTORY_FILTERS.cameraId ||
    filters.aircraftSource !== DEFAULT_HISTORY_FILTERS.aircraftSource ||
    filters.callsignQuery.trim().length > 0 ||
    filters.altitudeOnly !== DEFAULT_HISTORY_FILTERS.altitudeOnly ||
    filters.timeRange !== DEFAULT_HISTORY_FILTERS.timeRange;

  const updateFilter = useCallback(
    <K extends keyof HistoryFiltersState>(key: K, value: HistoryFiltersState[K]) => {
      setFilters((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_HISTORY_FILTERS);
  }, []);

  return {
    filters,
    updateFilter,
    resetFilters,
    hasActiveFilters,
  };
}
