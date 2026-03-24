/**
 * HistoryPanel - structured review workspace for history mode.
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
import { downloadCsv, downloadJson } from "../utils/export";

type HistoryTab = "analytics" | "summary" | "detections" | "aircraft";

interface HistoryPanelProps {
  feed: HistoryFeedState;
  filters: FilteredHistoryState;
  onSelectEvent: (event: SelectedEventDetail | null) => void;
  selectedEvent: SelectedEventDetail | null;
  onReplayStateChange?: (isPlaying: boolean) => void;
}

const TAB_META: Record<HistoryTab, { title: string; subtitle: string }> = {
  analytics: {
    title: "Analytics",
    subtitle: "Trend summaries shaped by the active review filters.",
  },
  summary: {
    title: "Overview",
    subtitle: "A compact readout of the currently loaded review window.",
  },
  detections: {
    title: "Detections",
    subtitle: "Camera-derived events ready for search, replay, and export.",
  },
  aircraft: {
    title: "Aircraft",
    subtitle: "Recorded live-position snapshots and callsign activity.",
  },
};

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
  if (!summary) {
    return (
      <div className="history-empty">
        No history is available yet.
        <br />
        <span className="history-empty__hint">
          Stay in live mode for a moment and the review timeline will begin to populate.
        </span>
      </div>
    );
  }

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
  loadedCount,
  totalCount,
  searchActive,
  onLoadMore,
  loadingMore,
}: {
  visibleCount: number;
  loadedCount: number;
  totalCount: number;
  searchActive: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  return (
    <div className="history-list__footer">
      <span className="history-list__count">
        {searchActive
          ? `Showing ${visibleCount.toLocaleString()} matching / ${loadedCount.toLocaleString()} loaded / ${totalCount.toLocaleString()} total`
          : `Showing ${visibleCount.toLocaleString()} of ${totalCount.toLocaleString()}`}
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
  detections,
  loadedCount,
  totalCount,
  hasMore,
  onLoadMore,
  loadingMore,
  loading,
  error,
  onSelectEvent,
  selectedReplayKey,
  hasActiveFilters,
  searchActive,
}: {
  detections: DetectionRecord[];
  loadedCount: number;
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  loading: boolean;
  error: string | null;
  onSelectEvent: (event: SelectedHistoryDetail) => void;
  selectedReplayKey: string | null;
  hasActiveFilters: boolean;
  searchActive: boolean;
}) {
  if (loading) return <div className="history-empty">Loading detections...</div>;
  if (error) return <div className="history-error">{error}</div>;
  if (detections.length === 0) {
    return (
      <div className="history-list history-list--empty">
        <div className="history-empty">
          {searchActive
            ? "No loaded detections match the current search."
            : hasActiveFilters
              ? "No detections match the current filters."
              : "No detections are available yet."}
          <br />
          <span className="history-empty__hint">
            {searchActive
              ? hasMore
                ? "Load more records or broaden the search terms."
                : "Try broadening the search terms."
              : hasActiveFilters
                ? "Try widening the time range or clearing a filter."
                : "Detections appear when camera analysis is available. Live aircraft review still works without Gemini."}
          </span>
        </div>
        {hasMore && (
          <LoadMoreFooter
            visibleCount={detections.length}
            loadedCount={loadedCount}
            totalCount={totalCount}
            searchActive={searchActive}
            onLoadMore={onLoadMore}
            loadingMore={loadingMore}
          />
        )}
      </div>
    );
  }

  return (
    <div className="history-list">
      {detections.map((detection) => {
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

      {hasMore && (
        <LoadMoreFooter
          visibleCount={detections.length}
          loadedCount={loadedCount}
          totalCount={totalCount}
          searchActive={searchActive}
          onLoadMore={onLoadMore}
          loadingMore={loadingMore}
        />
      )}
    </div>
  );
}

function AircraftTab({
  aircraft,
  loadedCount,
  totalCount,
  hasMore,
  onLoadMore,
  loadingMore,
  loading,
  error,
  onSelectEvent,
  selectedReplayKey,
  hasActiveFilters,
  searchActive,
}: {
  aircraft: AircraftRecord[];
  loadedCount: number;
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  loading: boolean;
  error: string | null;
  onSelectEvent: (event: SelectedHistoryDetail) => void;
  selectedReplayKey: string | null;
  hasActiveFilters: boolean;
  searchActive: boolean;
}) {
  if (loading) return <div className="history-empty">Loading aircraft...</div>;
  if (error) return <div className="history-error">{error}</div>;
  if (aircraft.length === 0) {
    return (
      <div className="history-list history-list--empty">
        <div className="history-empty">
          {searchActive
            ? "No loaded aircraft records match the current search."
            : hasActiveFilters
              ? "No aircraft records match the current filters."
              : "No aircraft observations are available yet."}
          <br />
          <span className="history-empty__hint">
            {searchActive
              ? hasMore
                ? "Load more records or broaden the search terms."
                : "Try broadening the search terms."
              : hasActiveFilters
                ? "Try widening the time range or clearing a filter."
                : "Aircraft observations appear as the live feed records positions from the active aviation provider, with fallback only when upstream data is unavailable."}
          </span>
        </div>
        {hasMore && (
          <LoadMoreFooter
            visibleCount={aircraft.length}
            loadedCount={loadedCount}
            totalCount={totalCount}
            searchActive={searchActive}
            onLoadMore={onLoadMore}
            loadingMore={loadingMore}
          />
        )}
      </div>
    );
  }

  return (
    <div className="history-list">
      {aircraft.map((record) => {
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

      {hasMore && (
        <LoadMoreFooter
          visibleCount={aircraft.length}
          loadedCount={loadedCount}
          totalCount={totalCount}
          searchActive={searchActive}
          onLoadMore={onLoadMore}
          loadingMore={loadingMore}
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
  onReplayStateChange,
}) => {
  const [tab, setTab] = useState<HistoryTab>("analytics");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const analytics = useAnalytics(true, filters.filters);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchedDetections = useMemo(() => {
    if (!normalizedSearchQuery) {
      return feed.detections;
    }

    return feed.detections.filter((detection) =>
      [
        detection.label,
        detection.category,
        detection.camera_id,
        detection.feature_id,
        detection.source,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearchQuery)
    );
  }, [feed.detections, normalizedSearchQuery]);
  const searchedAircraft = useMemo(() => {
    if (!normalizedSearchQuery) {
      return feed.aircraft;
    }

    return feed.aircraft.filter((record) =>
      [record.callsign ?? "", record.feature_id, record.source]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearchQuery)
    );
  }, [feed.aircraft, normalizedSearchQuery]);
  const replayEvents = useMemo(() => {
    const detectionEvents = searchedDetections.map((detection) => ({
      eventKey: `detection:${detection.id}`,
      featureId: detection.feature_id,
      timestamp: detection.detected_at,
      label: detection.label,
      typeLabel: "Detection" as const,
      lat: detection.latitude,
      lon: detection.longitude,
      detail: buildDetectionDetail(detection),
    }));

    const aircraftEvents = searchedAircraft.map((record) => ({
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
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((event, index, allEvents) => ({
        ...event,
        detail: {
          ...event.detail,
          replayIndex: index + 1,
          replayTotal: allEvents.length,
        },
      }));
  }, [searchedAircraft, searchedDetections]);

  const replay = useReplay(replayEvents);
  const selectedReplayKey =
    selectedEvent?.kind === "history" ? selectedEvent.eventKey : null;
  const reviewMeta = TAB_META[tab];
  const showSearchTools = tab === "detections" || tab === "aircraft";
  const showSummaryTools = tab === "summary";

  useEffect(() => {
    if (!showSearchTools && searchQuery) {
      setSearchQuery("");
    }
  }, [searchQuery, showSearchTools]);

  useEffect(() => {
    onReplayStateChange?.(replay.isPlaying);
  }, [replay.isPlaying, onReplayStateChange]);

  useEffect(() => {
    if (selectedEvent?.kind !== "history") return;

    const selectedFeatureId = selectedEvent.featureIds[0];
    const selectedStillVisible =
      searchedDetections.some((record) => record.feature_id === selectedFeatureId) ||
      searchedAircraft.some((record) => record.feature_id === selectedFeatureId);

    if (!selectedStillVisible) {
      replay.clearSelection();
      onSelectEvent(null);
    }
  }, [
    onSelectEvent,
    replay.clearSelection,
    searchedAircraft,
    searchedDetections,
    selectedEvent,
  ]);

  useEffect(() => {
    if (!replay.currentEvent) {
      if (selectedEvent?.kind === "history") {
        onSelectEvent(null);
      }
      return;
    }

    if (selectedEvent?.kind !== "history" && !replay.isPlaying) {
      return;
    }

    onSelectEvent(replay.currentEvent.detail);
  }, [onSelectEvent, replay.currentEvent, replay.isPlaying, selectedEvent]);

  function handleReplayListSelection(detail: SelectedHistoryDetail) {
    if (replay.currentEvent?.eventKey === detail.eventKey) {
      replay.clearSelection();
      onSelectEvent(null);
      return;
    }

    replay.selectEvent(detail.eventKey);
    onSelectEvent(detail);
  }

  function handleExportHistoryCsv() {
    downloadCsv("worldtraffic-history.csv", [
      ...searchedDetections.map((detection) => ({
        record_type: "detection",
        id: detection.id,
        feature_id: detection.feature_id,
        label: detection.label,
        category: detection.category,
        timestamp: detection.detected_at,
        source: detection.source,
        camera_id: detection.camera_id,
        confidence: detection.confidence,
        callsign: "",
        altitude: "",
        speed: "",
        latitude: detection.latitude,
        longitude: detection.longitude,
      })),
      ...searchedAircraft.map((record) => ({
        record_type: "aircraft",
        id: record.id,
        feature_id: record.feature_id,
        label: record.callsign ?? record.feature_id,
        category: "aircraft",
        timestamp: record.observed_at,
        source: record.source,
        camera_id: "",
        confidence: "",
        callsign: record.callsign ?? "",
        altitude: record.altitude ?? "",
        speed: record.speed ?? "",
        latitude: record.latitude,
        longitude: record.longitude,
      })),
    ]);
  }

  function handleExportHistoryJson() {
    downloadJson("worldtraffic-history.json", {
      filters: filters.filters,
      search_query: searchQuery,
      detections: searchedDetections,
      aircraft: searchedAircraft,
    });
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
        {(["analytics", "summary", "detections", "aircraft"] as HistoryTab[]).map(
          (nextTab) => (
            <button
              key={nextTab}
              className={`history-tab${tab === nextTab ? " history-tab--active" : ""}`}
              role="tab"
              aria-selected={tab === nextTab}
              onClick={() => setTab(nextTab)}
            >
              {TAB_META[nextTab].title}
            </button>
          )
        )}
      </div>

      <div className="history-workspace">
        <div className="history-workspace__hero">
          <div className="history-workspace__copy">
            <span className="history-workspace__eyebrow">{reviewMeta.title}</span>
            <h2 className="history-workspace__title">{reviewMeta.subtitle}</h2>
          </div>
          <div className="history-workspace__actions">
            <button
              type="button"
              className="history-workspace__toggle"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-pressed={filtersOpen}
            >
              {filtersOpen ? "Hide filters" : "Show filters"}
            </button>
            {filters.hasActiveFilters && (
              <span className="history-workspace__chip">Filters active</span>
            )}
          </div>
        </div>

        {filtersOpen && (
          <div className="history-workspace__filters">
            <HistoryFilters
              filters={filters.filters}
              availableCameraIds={feed.cameraIds}
              onDetectionCategoryChange={(value) =>
                filters.updateFilter("detectionCategory", value)
              }
              onMinConfidenceChange={(value) =>
                filters.updateFilter("minConfidence", value)
              }
              onCameraIdChange={(value) => filters.updateFilter("cameraId", value)}
              onAircraftSourceChange={(value) =>
                filters.updateFilter("aircraftSource", value)
              }
              onCallsignQueryChange={(value) =>
                filters.updateFilter("callsignQuery", value)
              }
              onAltitudeOnlyChange={(value) =>
                filters.updateFilter("altitudeOnly", value)
              }
              onTimeRangeChange={(value) => filters.updateFilter("timeRange", value)}
              onReset={filters.resetFilters}
              disabled={feed.loading}
            />
          </div>
        )}

        <div className="history-workspace__tools">
          <div className="history-workspace__card history-workspace__card--controls">
            <div className="history-workspace__card-header">
              <span className="history-section-label">Workspace</span>
              <span className="history-workspace__caption">
                {tab === "analytics"
                  ? "Dashboards follow the active history filters."
                  : tab === "summary"
                    ? "Export the currently loaded review window."
                    : "Search and export the loaded review set."}
              </span>
            </div>

            {showSearchTools && (
              <div className="panel-toolbar panel-toolbar--history">
                <input
                  type="text"
                  className="panel-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search label, category, camera, callsign"
                  aria-label="Search loaded history records"
                />
                <div className="panel-toolbar__actions">
                  <button
                    type="button"
                    className="panel-action"
                    onClick={handleExportHistoryCsv}
                    disabled={
                      searchedDetections.length === 0 && searchedAircraft.length === 0
                    }
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    className="panel-action"
                    onClick={handleExportHistoryJson}
                    disabled={
                      searchedDetections.length === 0 && searchedAircraft.length === 0
                    }
                  >
                    Export JSON
                  </button>
                </div>
              </div>
            )}

            {showSummaryTools && (
              <div className="history-workspace__summary-actions">
                <button
                  type="button"
                  className="panel-action"
                  onClick={handleExportHistoryCsv}
                  disabled={
                    searchedDetections.length === 0 && searchedAircraft.length === 0
                  }
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="panel-action"
                  onClick={handleExportHistoryJson}
                  disabled={
                    searchedDetections.length === 0 && searchedAircraft.length === 0
                  }
                >
                  Export JSON
                </button>
              </div>
            )}

            {tab === "analytics" && (
              <div className="history-workspace__note">
                Use the review filters to reshape the analytics view without leaving
                the drawer.
              </div>
            )}
          </div>

          <div className="history-workspace__card history-workspace__card--replay">
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
          </div>
        </div>

        <div className="history-workspace__body">
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
              detections={searchedDetections}
              loadedCount={feed.detections.length}
              totalCount={feed.detectionsTotal}
              hasMore={feed.hasMoreDetections}
              onLoadMore={feed.loadMoreDetections}
              loadingMore={feed.loadingMoreDetections}
              loading={feed.loading}
              error={feed.error}
              onSelectEvent={handleReplayListSelection}
              selectedReplayKey={selectedReplayKey}
              hasActiveFilters={filters.hasActiveFilters}
              searchActive={normalizedSearchQuery.length > 0}
            />
          )}
          {tab === "aircraft" && (
            <AircraftTab
              aircraft={searchedAircraft}
              loadedCount={feed.aircraft.length}
              totalCount={feed.aircraftTotal}
              hasMore={feed.hasMoreAircraft}
              onLoadMore={feed.loadMoreAircraft}
              loadingMore={feed.loadingMoreAircraft}
              loading={feed.loading}
              error={feed.error}
              onSelectEvent={handleReplayListSelection}
              selectedReplayKey={selectedReplayKey}
              hasActiveFilters={filters.hasActiveFilters}
              searchActive={normalizedSearchQuery.length > 0}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryPanel;
