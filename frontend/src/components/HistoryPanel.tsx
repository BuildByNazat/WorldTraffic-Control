/**
 * HistoryPanel - right-side sliding panel for historical data.
 *
 * Tabs:
 *   Summary - aggregated statistics from /api/history/summary
 *   Detections - scrollable list of recent Gemini camera detections
 *   Aircraft - scrollable list of recent aircraft observations
 *
 * Clicking a detection or aircraft item calls onSelectLocation so the map
 * can fly to that coordinate.
 */

import React, { useEffect, useMemo, useState } from "react";
import HistoryFilters from "./HistoryFilters";
import ReplayControls from "./ReplayControls";
import type { AircraftRecord, HistoryFeedState } from "../hooks/useHistoryFeed";
import type { FilteredHistoryState } from "../hooks/useFilteredHistory";
import { useReplay } from "../hooks/useReplay";

export interface SelectedLocation {
  lat: number;
  lon: number;
  label: string;
  featureId: string;
}

type HistoryTab = "summary" | "detections" | "aircraft";

interface HistoryPanelProps {
  feed: HistoryFeedState;
  filters: FilteredHistoryState;
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
          Summary reflects the current backend filter state.
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

function LoadMoreFooter({
  visibleCount,
  totalCount,
  onLoadMore,
  loadingMore,
}: {
  visibleCount: number;
  totalCount: number;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  return (
    <div className="history-list__footer">
      <span className="history-list__count">
        Showing {visibleCount.toLocaleString()} of {totalCount.toLocaleString()}
      </span>
      <button
        type="button"
        className="history-load-more"
        onClick={onLoadMore}
        disabled={loadingMore}
      >
        {loadingMore ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}

function DetectionsTab({
  feed,
  onSelectEvent,
  selectedReplayKey,
  hasActiveFilters,
}: {
  feed: HistoryFeedState;
  onSelectEvent: (eventKey: string, loc: SelectedLocation) => void;
  selectedReplayKey: string | null;
  hasActiveFilters: boolean;
}) {
  if (feed.loading) return <div className="history-empty">Loading detections…</div>;
  if (feed.error) return <div className="history-error">{feed.error}</div>;
  if (feed.detections.length === 0) {
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
      {feed.detections.map((detection) => {
        const replayKey = `detection:${detection.id}`;
        const isSelected = selectedReplayKey === replayKey;

        return (
          <button
            key={detection.id}
            className={`history-item${isSelected ? " history-item--selected" : ""}`}
            onClick={() =>
              onSelectEvent(replayKey, {
                lat: detection.latitude,
                lon: detection.longitude,
                label: detection.label,
                featureId: detection.feature_id,
              })
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

      {feed.hasMoreDetections && (
        <LoadMoreFooter
          visibleCount={feed.detections.length}
          totalCount={feed.detectionsTotal}
          onLoadMore={feed.loadMoreDetections}
          loadingMore={feed.loadingMoreDetections}
        />
      )}
    </div>
  );
}

function AircraftTab({
  feed,
  onSelectEvent,
  selectedReplayKey,
  hasActiveFilters,
}: {
  feed: HistoryFeedState;
  onSelectEvent: (eventKey: string, loc: SelectedLocation) => void;
  selectedReplayKey: string | null;
  hasActiveFilters: boolean;
}) {
  if (feed.loading) return <div className="history-empty">Loading aircraft logs…</div>;
  if (feed.error) return <div className="history-error">{feed.error}</div>;
  if (feed.aircraft.length === 0) {
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
      {feed.aircraft.map((record: AircraftRecord) => {
        const replayKey = `aircraft:${record.id}`;
        const isSelected = selectedReplayKey === replayKey;
        const label = record.callsign ?? record.feature_id;

        return (
          <button
            key={record.id}
            className={`history-item${isSelected ? " history-item--selected" : ""}`}
            onClick={() =>
              onSelectEvent(replayKey, {
                lat: record.latitude,
                lon: record.longitude,
                label,
                featureId: record.feature_id,
              })
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

      {feed.hasMoreAircraft && (
        <LoadMoreFooter
          visibleCount={feed.aircraft.length}
          totalCount={feed.aircraftTotal}
          onLoadMore={feed.loadMoreAircraft}
          loadingMore={feed.loadingMoreAircraft}
        />
      )}
    </div>
  );
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({
  feed,
  filters,
  onSelectLocation,
  selectedFeatureId,
}) => {
  const [tab, setTab] = useState<HistoryTab>("summary");
  const replayEvents = useMemo(() => {
    const detectionEvents = feed.detections.map((detection) => ({
      eventKey: `detection:${detection.id}`,
      featureId: detection.feature_id,
      timestamp: detection.detected_at,
      label: detection.label,
      typeLabel: "Detection" as const,
      lat: detection.latitude,
      lon: detection.longitude,
    }));

    const aircraftEvents = feed.aircraft.map((record) => ({
      eventKey: `aircraft:${record.id}`,
      featureId: record.feature_id,
      timestamp: record.observed_at,
      label: record.callsign ?? record.feature_id,
      typeLabel: "Aircraft" as const,
      lat: record.latitude,
      lon: record.longitude,
    }));

    return [...detectionEvents, ...aircraftEvents].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [feed.aircraft, feed.detections]);

  const replay = useReplay(replayEvents);

  useEffect(() => {
    if (!selectedFeatureId) return;

    const selectedStillVisible =
      feed.detections.some((record) => record.feature_id === selectedFeatureId) ||
      feed.aircraft.some((record) => record.feature_id === selectedFeatureId);

    if (!selectedStillVisible) {
      onSelectLocation(null);
    }
  }, [feed.aircraft, feed.detections, onSelectLocation, selectedFeatureId]);

  useEffect(() => {
    if (!replay.currentEvent) {
      onSelectLocation(null);
      return;
    }

    onSelectLocation({
      lat: replay.currentEvent.lat,
      lon: replay.currentEvent.lon,
      label: replay.currentEvent.label,
      featureId: replay.currentEvent.featureId,
    });
  }, [onSelectLocation, replay.currentEvent]);

  function handleReplayListSelection(eventKey: string, loc: SelectedLocation) {
    if (replay.currentEvent?.eventKey === eventKey) {
      replay.clearSelection();
      return;
    }

    replay.selectEvent(eventKey);
    onSelectLocation(loc);
  }

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
        filters={filters.filters}
        availableCameraIds={feed.cameraIds}
        onDetectionCategoryChange={(value) =>
          filters.updateFilter("detectionCategory", value)
        }
        onMinConfidenceChange={(value) => filters.updateFilter("minConfidence", value)}
        onCameraIdChange={(value) => filters.updateFilter("cameraId", value)}
        onAircraftSourceChange={(value) => filters.updateFilter("aircraftSource", value)}
        onCallsignQueryChange={(value) => filters.updateFilter("callsignQuery", value)}
        onAltitudeOnlyChange={(value) => filters.updateFilter("altitudeOnly", value)}
        onTimeRangeChange={(value) => filters.updateFilter("timeRange", value)}
        onReset={filters.resetFilters}
        disabled={feed.loading}
      />

      <ReplayControls
        hasEvents={replay.hasEvents}
        isPlaying={replay.isPlaying}
        currentIndex={replay.currentIndex}
        totalEvents={replayEvents.length}
        currentEvent={replay.currentEvent}
        playbackSpeed={replay.playbackSpeed}
        onTogglePlayback={replay.togglePlayback}
        onPrevious={replay.goToPrevious}
        onNext={replay.goToNext}
        onScrub={replay.scrubTo}
        onPlaybackSpeedChange={replay.setPlaybackSpeed}
      />

      <div className="history-panel__content">
        {tab === "summary" && (
          <SummaryTab
            summary={feed.summary}
            loading={feed.loading}
            error={feed.error}
            hasActiveFilters={filters.hasActiveFilters}
          />
        )}
        {tab === "detections" && (
          <DetectionsTab
            feed={feed}
            onSelectEvent={handleReplayListSelection}
            selectedReplayKey={replay.currentEvent?.eventKey ?? null}
            hasActiveFilters={filters.hasActiveFilters}
          />
        )}
        {tab === "aircraft" && (
          <AircraftTab
            feed={feed}
            onSelectEvent={handleReplayListSelection}
            selectedReplayKey={replay.currentEvent?.eventKey ?? null}
            hasActiveFilters={filters.hasActiveFilters}
          />
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;
