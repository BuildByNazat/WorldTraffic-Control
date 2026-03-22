import React from "react";
import type {
  AircraftSourceFilter,
  DetectionCategoryFilter,
  HistoryFiltersState,
  TimeRangeFilter,
} from "../hooks/useFilteredHistory";

interface HistoryFiltersProps {
  filters: HistoryFiltersState;
  availableCameraIds: string[];
  onDetectionCategoryChange: (value: DetectionCategoryFilter) => void;
  onMinConfidenceChange: (value: number) => void;
  onCameraIdChange: (value: string) => void;
  onAircraftSourceChange: (value: AircraftSourceFilter) => void;
  onCallsignQueryChange: (value: string) => void;
  onAltitudeOnlyChange: (value: boolean) => void;
  onTimeRangeChange: (value: TimeRangeFilter) => void;
  onReset: () => void;
  disabled?: boolean;
}

const detectionCategories: Array<{
  value: DetectionCategoryFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "vehicle", label: "Vehicle" },
  { value: "pedestrian", label: "Pedestrian" },
  { value: "aircraft", label: "Aircraft" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "incident", label: "Incident" },
];

const aircraftSources: Array<{
  value: AircraftSourceFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "opensky", label: "OpenSky" },
  { value: "simulated", label: "Simulated" },
];

const timeRanges: Array<{ value: TimeRangeFilter; label: string }> = [
  { value: "15m", label: "Last 15 min" },
  { value: "1h", label: "Last 1 hour" },
  { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "all", label: "All available" },
];

const HistoryFilters: React.FC<HistoryFiltersProps> = ({
  filters,
  availableCameraIds,
  onDetectionCategoryChange,
  onMinConfidenceChange,
  onCameraIdChange,
  onAircraftSourceChange,
  onCallsignQueryChange,
  onAltitudeOnlyChange,
  onTimeRangeChange,
  onReset,
  disabled = false,
}) => {
  return (
    <div className="history-filters" aria-label="History filters">
      <div className="history-filters__header">
        <span className="history-section-label">Filters</span>
        <button
          type="button"
          className="history-filters__reset"
          onClick={onReset}
          disabled={disabled}
        >
          Reset
        </button>
      </div>

      <div className="history-filters__grid">
        <label className="history-filter-field">
          <span className="history-filter-field__label">Time window</span>
          <select
            value={filters.timeRange}
            onChange={(event) =>
              onTimeRangeChange(event.target.value as TimeRangeFilter)
            }
            disabled={disabled}
          >
            {timeRanges.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="history-filter-field">
          <span className="history-filter-field__label">Detection category</span>
          <select
            value={filters.detectionCategory}
            onChange={(event) =>
              onDetectionCategoryChange(
                event.target.value as DetectionCategoryFilter
              )
            }
            disabled={disabled}
          >
            {detectionCategories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="history-filter-field">
          <span className="history-filter-field__label">
            Min confidence: {filters.minConfidence.toFixed(2)}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={filters.minConfidence}
            onChange={(event) =>
              onMinConfidenceChange(Number(event.target.value))
            }
            disabled={disabled}
          />
        </label>

        <label className="history-filter-field">
          <span className="history-filter-field__label">Camera</span>
          <select
            value={filters.cameraId}
            onChange={(event) => onCameraIdChange(event.target.value)}
            disabled={disabled || availableCameraIds.length === 0}
          >
            <option value="all">All cameras</option>
            {availableCameraIds.map((cameraId) => (
              <option key={cameraId} value={cameraId}>
                {cameraId}
              </option>
            ))}
          </select>
        </label>

        <label className="history-filter-field">
          <span className="history-filter-field__label">Aircraft source</span>
          <select
            value={filters.aircraftSource}
            onChange={(event) =>
              onAircraftSourceChange(event.target.value as AircraftSourceFilter)
            }
            disabled={disabled}
          >
            {aircraftSources.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="history-filter-field">
          <span className="history-filter-field__label">Callsign search</span>
          <input
            type="text"
            value={filters.callsignQuery}
            onChange={(event) => onCallsignQueryChange(event.target.value)}
            placeholder="Search callsign"
            disabled={disabled}
          />
        </label>
      </div>

      <label className="history-filter-checkbox">
        <input
          type="checkbox"
          checked={filters.altitudeOnly}
          onChange={(event) => onAltitudeOnlyChange(event.target.checked)}
          disabled={disabled}
        />
        <span>Only aircraft with altitude</span>
      </label>
    </div>
  );
};

export default HistoryFilters;
