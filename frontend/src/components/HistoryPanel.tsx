/**
 * HistoryPanel â€” right-side sliding panel for historical data.
 *
 * Tabs:
 *   Summary â€” aggregated statistics from /api/history/summary
 *   Detections â€” scrollable list of recent Gemini camera detections
 *   Aircraft â€” scrollable list of recent aircraft observations
 *
 * Clicking a detection or aircraft item calls onSelectLocation so the map
 * can fly to that coordinate.
 */

import React, { useEffect, useState } from "react";
import HistoryFilters from "./HistoryFilters";
import type { AircraftRecord, HistoryFeedState } from "../hooks/useHistoryFeed";
import { useFilteredHistory } from "../hooks/useFilteredHistory";

export interface SelectedLocation {
  lat: number;
  lon: number;
  label: string;
  featureId: string;
}

type HistoryTab = "summary" | "detections" | "aircraft";

interface HistoryPanelProps {
  feed: HistoryFeedState;
  onSelectLocation: (loc: SelectedLocation | null) => void;
  selectedFeatureId: string | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function confidencePct(c: number): string {
  return `${(c * 100).toFixed(0)}%`;
}

const CATEGORY_COLORS: Record<string, string> = {
  vehicle: "#f59e0b",
  pedestrian: "#3b82f6",
  aircraft: "#8b5cf6",
  infrastructure: "#6b7280",
  incident: "#ef4444",
  unknown: "#9ca3af",
};

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.unknown;
}

function SummaryTab({
  summary,
  loading,
  error,
  hasActiveFilters,
}: {
  summary: HistoryFeedState["summary"];
  loading: boolean;
  error: string | null;
  hasActiveFilters: boolean;
}) {
  if (loading) return <div className="history-empty">Loading summary…</div>;
  if (error) return <div className="history-error">{error}</div>;
  if (!summary) return <div className="history-empty">No data yet.</div>;

  const categories = Object.entries(summary.detections_by_category).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div className="history-summary">
      <div className="history-stat-grid">
        <div className="history-stat">
          <span className="history-stat__value">
            {summary.total_aircraft_observations.toLocaleString()}
          </span>
          <span className="history-stat__label">Aircraft Observed</span>
        </div>
        <div className="history-stat">
          <span className="history-stat__value">
            {summary.total_detections.toLocaleString()}
          </span>
          <span className="history-stat__label">Detections Logged</span>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="history-summary__note">
          Summary reflects the current filtered view of loaded history records.
        </div>
      )}

      {categories.length > 0 && (
        <>
          <div className="history-section-label">By Category</div>
          <div className="history-category-list">
            {categories.map(([cat, count]) => (
              <div key={cat} className="history-category-row">
                <span
                  className="history-category-dot"
                  style={{ background: categoryColor(cat) }}
                  aria-hidden="true"
                />
                <span className="history-category-name">{cat}</span>
                <span className="history-category-count">{count}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="history-section-label">Latest Events</div>
      <div className="history-meta-list">
        <div className="history-meta-row">
          <span className="history-meta-label">Aircraft</span>
          <span className="history-meta-value">
            {formatTime(summary.latest_aircraft_observed_at)}
          </span>
        </div>
        <div className="history-meta-row">
          <span className="history-meta-label">Detection</span>
          <span className="history-meta-value">
            {formatTime(summary.latest_detection_detected_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DetectionsTab({
  detections,
  loading,
  error,
  onSelect,
  selectedId,
  hasActiveFilters,
}: {
  detections: HistoryFeedState["detections"];
  loading: boolean;
  error: string | null;
  onSelect: (loc: SelectedLocation | null) => void;
  selectedId: string | null;
  hasActiveFilters: boolean;
}) {
  if (loading) return <div className="history-empty">Loading detections…</div>;
  if (error) return <div className="history-error">{error}</div>;
  if (detections.length === 0) {
    return (
      <div className="history-empty">
        {hasActiveFilters
          ? "No detections match the current filters."
          : "No detections logged yet."}
        <br />
        <span className="history-empty__hint">
          {hasActiveFilters
            ? "Try widening the time window or resetting the filters."
            : "Detections appear when Gemini analyses a camera image."}
        </span>
      </div>
    );
  }

  return (
    <div className="history-list">
      {detections.map((detection) => {
        const isSelected = selectedId === detection.feature_id;

        return (
          <button
            key={detection.id}
            className={`history-item${isSelected ? " history-item--selected" : ""}`}
            onClick={() =>
              onSelect(
                isSelected
                  ? null
                  : {
                      lat: detection.latitude,
                      lon: detection.longitude,
                      label: detection.label,
                      featureId: detection.feature_id,
                    }
              )
            }
            aria-pressed={isSelected}
          >
            <span
              className="history-item__dot"
              style={{ background: categoryColor(detection.category) }}
              aria-hidden="true"
            />
            <div className="history-item__body">
              <span className="history-item__title">{detection.label}</span>
              <span className="history-item__meta">
                {detection.category} · {confidencePct(detection.confidence)} ·{" "}
                {formatTime(detection.detected_at)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function AircraftTab({
  aircraft,
  loading,
  error,
  onSelect,
  selectedId,
  hasActiveFilters,
}: {
  aircraft: HistoryFeedState["aircraft"];
  loading: boolean;
  error: string | null;
  onSelect: (loc: SelectedLocation | null) => void;
  selectedId: string | null;
  hasActiveFilters: boolean;
}) {
  if (loading) return <div className="history-empty">Loading aircraft logs…</div>;
  if (error) return <div className="history-error">{error}</div>;
  if (aircraft.length === 0) {
    return (
      <div className="history-empty">
        {hasActiveFilters
          ? "No aircraft records match the current filters."
          : "No aircraft observations logged yet."}
        <br />
        <span className="history-empty__hint">
          {hasActiveFilters
            ? "Try clearing the source, callsign, altitude, or time filters."
            : "Aircraft are logged whenever a live feed snapshot is broadcast."}
        </span>
      </div>
    );
  }

  return (
    <div className="history-list">
      {aircraft.map((record: AircraftRecord) => {
        const isSelected = selectedId === record.feature_id;
        const label = record.callsign ?? record.feature_id;

        return (
          <button
            key={record.id}
            className={`history-item${isSelected ? " history-item--selected" : ""}`}
            onClick={() =>
              onSelect(
                isSelected
                  ? null
                  : {
                      lat: record.latitude,
                      lon: record.longitude,
                      label,
                      featureId: record.feature_id,
                    }
              )
            }
            aria-pressed={isSelected}
          >
            <span className="history-item__icon" aria-hidden="true">
              ✈
            </span>
            <div className="history-item__body">
              <span className="history-item__title">{label}</span>
              <span className="history-item__meta">
                {record.altitude != null
                  ? `${record.altitude.toLocaleString()} ft`
                  : "—"}{" "}
                · {record.source} · {formatTime(record.observed_at)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({
  feed,
  onSelectLocation,
  selectedFeatureId,
}) => {
  const [tab, setTab] = useState<HistoryTab>("summary");
  const filteredHistory = useFilteredHistory(feed);

  useEffect(() => {
    if (!selectedFeatureId) return;

    const selectedStillVisible =
      filteredHistory.filteredDetections.some(
        (record) => record.feature_id === selectedFeatureId
      ) ||
      filteredHistory.filteredAircraft.some(
        (record) => record.feature_id === selectedFeatureId
      );

    if (!selectedStillVisible) {
      onSelectLocation(null);
    }
  }, [
    filteredHistory.filteredAircraft,
    filteredHistory.filteredDetections,
    onSelectLocation,
    selectedFeatureId,
  ]);

  return (
    <div className="history-panel" role="complementary" aria-label="History panel">
      <div className="history-panel__header">
        <span className="history-panel__title">History</span>
        <button
          className="history-panel__refresh"
          onClick={feed.refresh}
          disabled={feed.loading}
          title="Refresh history data"
          aria-label="Refresh history"
        >
          {feed.loading ? "…" : "↻"}
        </button>
      </div>

      <div className="history-tabs" role="tablist">
        {(["summary", "detections", "aircraft"] as HistoryTab[]).map((nextTab) => (
          <button
            key={nextTab}
            className={`history-tab${tab === nextTab ? " history-tab--active" : ""}`}
            role="tab"
            aria-selected={tab === nextTab}
            onClick={() => setTab(nextTab)}
          >
            {nextTab === "summary"
              ? "Summary"
              : nextTab === "detections"
                ? "Detections"
                : "Aircraft"}
          </button>
        ))}
      </div>

      <HistoryFilters
        filters={filteredHistory.filters}
        availableCameraIds={filteredHistory.availableCameraIds}
        onDetectionCategoryChange={(value) =>
          filteredHistory.updateFilter("detectionCategory", value)
        }
        onMinConfidenceChange={(value) =>
          filteredHistory.updateFilter("minConfidence", value)
        }
        onCameraIdChange={(value) => filteredHistory.updateFilter("cameraId", value)}
        onAircraftSourceChange={(value) =>
          filteredHistory.updateFilter("aircraftSource", value)
        }
        onCallsignQueryChange={(value) =>
          filteredHistory.updateFilter("callsignQuery", value)
        }
        onAltitudeOnlyChange={(value) =>
          filteredHistory.updateFilter("altitudeOnly", value)
        }
        onTimeRangeChange={(value) => filteredHistory.updateFilter("timeRange", value)}
        onReset={filteredHistory.resetFilters}
        disabled={feed.loading}
      />

      <div className="history-panel__content">
        {tab === "summary" && (
          <SummaryTab
            summary={filteredHistory.summary}
            loading={feed.loading}
            error={feed.error}
            hasActiveFilters={filteredHistory.hasActiveFilters}
          />
        )}
        {tab === "detections" && (
          <DetectionsTab
            detections={filteredHistory.filteredDetections}
            loading={feed.loading}
            error={feed.error}
            onSelect={onSelectLocation}
            selectedId={selectedFeatureId}
            hasActiveFilters={filteredHistory.hasActiveFilters}
          />
        )}
        {tab === "aircraft" && (
          <AircraftTab
            aircraft={filteredHistory.filteredAircraft}
            loading={feed.loading}
            error={feed.error}
            onSelect={onSelectLocation}
            selectedId={selectedFeatureId}
            hasActiveFilters={filteredHistory.hasActiveFilters}
          />
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;
