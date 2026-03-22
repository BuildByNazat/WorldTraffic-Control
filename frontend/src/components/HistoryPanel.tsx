/**
 * HistoryPanel - right-side sliding panel for historical data.
 */

import React, { useEffect, useMemo, useState } from "react";
import AnalyticsDashboard from "./AnalyticsDashboard";
import HistoryFilters from "./HistoryFilters";
import ReplayControls from "./ReplayControls";
import { useAnalytics } from "../hooks/useAnalytics";
import type {
  AircraftRecord,
  DetectionRecord,
  HistoryFeedState,
} from "../hooks/useHistoryFeed";
import type { FilteredHistoryState } from "../hooks/useFilteredHistory";
import { useReplay } from "../hooks/useReplay";
import type { SelectedEventDetail, SelectedHistoryDetail } from "../types/selectedEvent";

type HistoryTab = "analytics" | "summary" | "detections" | "aircraft";

interface HistoryPanelProps {
  feed: HistoryFeedState;
  filters: FilteredHistoryState;
  onSelectEvent: (event: SelectedEventDetail | null) => void;
  selectedEvent: SelectedEventDetail | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function confidencePct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

const CATEGORY_COLORS: Record<string, string> = {
  vehicle: "#f59e0b",
  pedestrian: "#3b82f6",
  aircraft: "#8b5cf6",
  infrastructure: "#6b7280",
  incident: "#ef4444",
  unknown: "#9ca3af",
};

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.unknown;
}

function buildDetectionDetail(
  detection: DetectionRecord,
  replayIndex?: number,
  replayTotal?: number
): SelectedHistoryDetail {
  return {
    kind: "history",
    id: `detection:${detection.id}`,
    eventKey: `detection:${detection.id}`,
    label: detection.label,
    timestamp: detection.detected_at,
    latitude: detection.latitude,
    longitude: detection.longitude,
    source: detection.source,
    cameraId: detection.camera_id,
    featureIds: [detection.feature_id],
    eventType: "detection",
    confidence: detection.confidence,
    replayIndex: replayIndex ?? null,
    replayTotal: replayTotal ?? null,
  };
}

function buildAircraftDetail(
  record: AircraftRecord,
  replayIndex?: number,
  replayTotal?: number
): SelectedHistoryDetail {
  return {
    kind: "history",
    id: `aircraft:${record.id}`,
    eventKey: `aircraft:${record.id}`,
    label: record.callsign ?? record.feature_id,
    timestamp: record.observed_at,
    latitude: record.latitude,
    longitude: record.longitude,
    source: record.source,
    cameraId: null,
    featureIds: [record.feature_id],
    eventType: "aircraft",
    callsign: record.callsign,
    altitude: record.altitude,
    speed: record.speed,
    heading: record.heading,
    replayIndex: replayIndex ?? null,
    replayTotal: replayTotal ?? null,
  };
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
  if (loading) return <div className="history-empty">Loading summary...</div>;
  if (error) return <div className="history-error">{error}</div>;
  if (!summary) return <div className="history-empty">No history is available yet.</div>;

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
          <span className="history-stat__label">Aircraft observations</span>
        </div>
        <div className="history-stat">
          <span className="history-stat__value">
            {summary.total_detections.toLocaleString()}
          </span>
          <span className="history-stat__label">Detections logged</span>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="history-summary__note">
          Summary reflects the active history filters.
        </div>
      )}

      {categories.length > 0 && (
        <>
          <div className="history-section-label">By Category</div>
          <div className="history-category-list">
            {categories.map(([category, count]) => (
              <div key={category} className="history-category-row">
                <span
                  className="history-category-dot"
                  style={{ background: categoryColor(category) }}
                  aria-hidden="true"
                />
                <span className="history-category-name">{category}</span>
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
        {loadingMore ? "Loading..." : "Load more"}
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
  onSelectEvent: (event: SelectedHistoryDetail) => void;
  selectedReplayKey: string | null;
  hasActiveFilters: boolean;
}) {
  if (feed.loading) return <div className="history-empty">Loading detections...</div>;
  if (feed.error) return <div className="history-error">{feed.error}</div>;
  if (feed.detections.length === 0) {
    return (
      <div className="history-empty">
        {hasActiveFilters
          ? "No detections match the current filters."
          : "No detections are available yet."}
        <br />
        <span className="history-empty__hint">
          {hasActiveFilters
            ? "Try widening the time range or clearing a filter."
            : "Detections appear when the camera analysis pipeline records a result."}
        </span>
      </div>
    );
  }

  return (
    <div className="history-list">
      {feed.detections.map((detection) => {
        const detail = buildDetectionDetail(detection);
        const isSelected = selectedReplayKey === detail.eventKey;

        return (
          <button
            key={detection.id}
            className={`history-item${isSelected ? " history-item--selected" : ""}`}
            onClick={() => onSelectEvent(detail)}
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
                {detection.category} / {confidencePct(detection.confidence)} /{" "}
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
  onSelectEvent: (event: SelectedHistoryDetail) => void;
  selectedReplayKey: string | null;
  hasActiveFilters: boolean;
}) {
  if (feed.loading) return <div className="history-empty">Loading aircraft...</div>;
  if (feed.error) return <div className="history-error">{feed.error}</div>;
  if (feed.aircraft.length === 0) {
    return (
      <div className="history-empty">
        {hasActiveFilters
          ? "No aircraft records match the current filters."
          : "No aircraft observations are available yet."}
        <br />
        <span className="history-empty__hint">
          {hasActiveFilters
            ? "Try widening the time range or clearing a filter."
            : "Aircraft observations appear when the live feed records a position."}
        </span>
      </div>
    );
  }

  return (
    <div className="history-list">
      {feed.aircraft.map((record) => {
        const detail = buildAircraftDetail(record);
        const isSelected = selectedReplayKey === detail.eventKey;

        return (
          <button
            key={record.id}
            className={`history-item${isSelected ? " history-item--selected" : ""}`}
            onClick={() => onSelectEvent(detail)}
            aria-pressed={isSelected}
          >
            <span className="history-item__badge" aria-hidden="true">
              AC
            </span>
            <div className="history-item__body">
              <span className="history-item__title">{detail.label}</span>
              <span className="history-item__meta">
                {record.altitude != null
                  ? `${record.altitude.toLocaleString()} ft`
                  : "-"}{" "}
                / {record.source} / {formatTime(record.observed_at)}
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
  onSelectEvent,
  selectedEvent,
}) => {
  const [tab, setTab] = useState<HistoryTab>("analytics");
  const analytics = useAnalytics(true, filters.filters);
  const replayEvents = useMemo(() => {
    const detectionEvents = feed.detections.map((detection) => ({
      eventKey: `detection:${detection.id}`,
      featureId: detection.feature_id,
      timestamp: detection.detected_at,
      label: detection.label,
      typeLabel: "Detection" as const,
      lat: detection.latitude,
      lon: detection.longitude,
      detail: buildDetectionDetail(detection),
    }));

    const aircraftEvents = feed.aircraft.map((record) => ({
      eventKey: `aircraft:${record.id}`,
      featureId: record.feature_id,
      timestamp: record.observed_at,
      label: record.callsign ?? record.feature_id,
      typeLabel: "Aircraft" as const,
      lat: record.latitude,
      lon: record.longitude,
      detail: buildAircraftDetail(record),
    }));

    return [...detectionEvents, ...aircraftEvents]
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      .map((event, index, allEvents) => ({
        ...event,
        detail: {
          ...event.detail,
          replayIndex: index + 1,
          replayTotal: allEvents.length,
        },
      }));
  }, [feed.aircraft, feed.detections]);

  const replay = useReplay(replayEvents);
  const selectedReplayKey =
    selectedEvent?.kind === "history" ? selectedEvent.eventKey : null;

  useEffect(() => {
    if (selectedEvent?.kind !== "history") return;

    const selectedFeatureId = selectedEvent.featureIds[0];
    const selectedStillVisible =
      feed.detections.some((record) => record.feature_id === selectedFeatureId) ||
      feed.aircraft.some((record) => record.feature_id === selectedFeatureId);

    if (!selectedStillVisible) {
      replay.clearSelection();
      onSelectEvent(null);
    }
  }, [
    feed.aircraft,
    feed.detections,
    onSelectEvent,
    replay.clearSelection,
    selectedEvent,
  ]);

  useEffect(() => {
    if (!replay.currentEvent) {
      if (selectedEvent?.kind === "history") {
        onSelectEvent(null);
      }
      return;
    }

    onSelectEvent(replay.currentEvent.detail);
  }, [onSelectEvent, replay.currentEvent]);

  function handleReplayListSelection(detail: SelectedHistoryDetail) {
    if (replay.currentEvent?.eventKey === detail.eventKey) {
      replay.clearSelection();
      onSelectEvent(null);
      return;
    }

    replay.selectEvent(detail.eventKey);
    onSelectEvent(detail);
  }

  return (
    <div className="history-panel" role="complementary" aria-label="History panel">
      <div className="history-panel__header">
        <div className="history-panel__heading">
          <span className="history-panel__title">History</span>
          <span className="history-panel__subtitle">Filtered timeline review</span>
        </div>
        <button
          className="history-panel__refresh"
          onClick={() => {
            feed.refresh();
            analytics.refresh();
          }}
          disabled={feed.loading}
          title="Refresh history data"
          aria-label="Refresh history"
        >
          {feed.loading ? "Syncing" : "Sync"}
        </button>
      </div>

      <div className="history-tabs" role="tablist">
        {(["analytics", "summary", "detections", "aircraft"] as HistoryTab[]).map((nextTab) => (
          <button
            key={nextTab}
            className={`history-tab${tab === nextTab ? " history-tab--active" : ""}`}
            role="tab"
            aria-selected={tab === nextTab}
            onClick={() => setTab(nextTab)}
          >
            {nextTab === "analytics"
              ? "Analytics"
              : nextTab === "summary"
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
        {tab === "analytics" && <AnalyticsDashboard analytics={analytics} />}
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
            selectedReplayKey={selectedReplayKey}
            hasActiveFilters={filters.hasActiveFilters}
          />
        )}
        {tab === "aircraft" && (
          <AircraftTab
            feed={feed}
            onSelectEvent={handleReplayListSelection}
            selectedReplayKey={selectedReplayKey}
            hasActiveFilters={filters.hasActiveFilters}
          />
        )}
      </div>
    </div>
  );
};

export default HistoryPanel;
