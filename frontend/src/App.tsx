/**
 * App - root component.
 *
 * Manages two modes:
 *   live    - WebSocket feed drives the map, status panel visible
 *   history - history panel visible, clicking items highlights on map
 *
 * The live feed is always running in the background; switching to history
 * mode simply shows the panel and allows selecting historical points.
 */

import React, { useState } from "react";
import LiveMap from "./components/LiveMap";
import type { HighlightLocation } from "./components/LiveMap";
import StatusPanel from "./components/StatusPanel";
import ModeToggle from "./components/ModeToggle";
import type { AppMode } from "./components/ModeToggle";
import HistoryPanel from "./components/HistoryPanel";
import AlertsPanel from "./components/AlertsPanel";
import EventDetailDrawer from "./components/EventDetailDrawer";
import { useLiveFeed, isAircraftFeature } from "./hooks/useLiveFeed";
import { useFilteredHistory } from "./hooks/useFilteredHistory";
import { useHistoryFeed } from "./hooks/useHistoryFeed";
import { useAlerts, type AlertRecord } from "./hooks/useAlerts";
import type {
  SelectedAlertDetail,
  SelectedEventDetail,
} from "./types/selectedEvent";

const App: React.FC = () => {
  const { data, status, lastUpdate } = useLiveFeed();
  const [mode, setMode] = useState<AppMode>("live");
  const [selectedEvent, setSelectedEvent] = useState<SelectedEventDetail | null>(
    null
  );
  const [highlight, setHighlight] = useState<HighlightLocation | null>(null);

  const historyFilters = useFilteredHistory();
  const historyFeed = useHistoryFeed(mode === "history", historyFilters.filters);
  const alertsState = useAlerts(true);

  const aircraftCount = data?.features.filter(isAircraftFeature).length ?? 0;
  const detectionCount =
    data?.features.filter((feature) => !isAircraftFeature(feature)).length ?? 0;

  function clearSelection() {
    setSelectedEvent(null);
    setHighlight(null);
  }

  function handleModeChange(next: AppMode) {
    setMode(next);
    if (next === "live") {
      clearSelection();
    }
  }

  function handleSelectEvent(event: SelectedEventDetail | null) {
    if (!event) {
      clearSelection();
      return;
    }

    setSelectedEvent(event);
    setHighlight({
      lat: event.latitude,
      lon: event.longitude,
      label: event.label,
    });
  }

  function handleSelectAlert(alert: AlertRecord) {
    const detail: SelectedAlertDetail = {
      kind: "alert",
      id: alert.id,
      label: alert.title,
      category: alert.category,
      severity: alert.severity,
      status: alert.status,
      timestamp: alert.timestamp,
      latitude: alert.latitude,
      longitude: alert.longitude,
      source: alert.source,
      cameraId: alert.camera_id,
      featureIds: alert.feature_ids,
    };

    handleSelectEvent(detail);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="logo" aria-hidden="true">
          World
        </span>
        <h1>WorldTraffic Control</h1>
        <div className="app-header__spacer" />
        <ModeToggle mode={mode} onModeChange={handleModeChange} />
      </header>

      <main className="app-content">
        <LiveMap data={data} highlightLocation={highlight} />

        <StatusPanel
          status={status}
          aircraftCount={aircraftCount}
          detectionCount={detectionCount}
          lastUpdate={lastUpdate}
        />

        <AlertsPanel
          alertsState={alertsState}
          onSelectAlert={handleSelectAlert}
          variant={mode === "live" ? "compact" : "full"}
          selectedAlertId={selectedEvent?.kind === "alert" ? selectedEvent.id : null}
        />

        <EventDetailDrawer selectedEvent={selectedEvent} onClose={clearSelection} />

        {mode === "history" && (
          <HistoryPanel
            feed={historyFeed}
            filters={historyFilters}
            onSelectEvent={handleSelectEvent}
            selectedEvent={selectedEvent}
          />
        )}
      </main>
    </div>
  );
};

export default App;
