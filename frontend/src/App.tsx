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

import React, { useEffect, useMemo, useState } from "react";
import LiveMap from "./components/LiveMap";
import type { HighlightLocation } from "./components/LiveMap";
import StatusPanel from "./components/StatusPanel";
import ModeToggle from "./components/ModeToggle";
import type { AppMode } from "./components/ModeToggle";
import HistoryPanel from "./components/HistoryPanel";
import AlertsPanel from "./components/AlertsPanel";
import EventDetailDrawer from "./components/EventDetailDrawer";
import IncidentsPanel from "./components/IncidentsPanel";
import LayerControls from "./components/LayerControls";
import { useLiveFeed, isAircraftFeature } from "./hooks/useLiveFeed";
import { useFilteredHistory } from "./hooks/useFilteredHistory";
import { useHistoryFeed } from "./hooks/useHistoryFeed";
import { useAlerts, type AlertRecord } from "./hooks/useAlerts";
import { useIncidents, type IncidentRecord } from "./hooks/useIncidents";
import { useMapLayers } from "./hooks/useMapLayers";
import { useServiceStatus } from "./hooks/useServiceStatus";
import type {
  SelectedAlertDetail,
  SelectedEventDetail,
  SelectedIncidentDetail,
} from "./types/selectedEvent";

function isSameSelection(
  current: SelectedEventDetail | null,
  next: SelectedEventDetail
): boolean {
  if (!current || current.kind !== next.kind) return false;
  if (current.kind === "history" && next.kind === "history") {
    return current.eventKey === next.eventKey;
  }
  return current.id === next.id;
}

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
  const incidentsState = useIncidents(true);
  const mapLayers = useMapLayers();
  const serviceStatusState = useServiceStatus(true);

  const aircraftCount = data?.features.filter(isAircraftFeature).length ?? 0;
  const detectionCount =
    data?.features.filter((feature) => !isAircraftFeature(feature)).length ?? 0;

  const linkedIncident = useMemo(() => {
    if (selectedEvent?.kind === "alert") {
      return incidentsState.getIncidentByAlertId(selectedEvent.id);
    }
    if (selectedEvent?.kind === "incident") {
      return (
        incidentsState.incidents.find((incident) => incident.id === selectedEvent.id) ??
        null
      );
    }
    return null;
  }, [incidentsState, selectedEvent]);

  useEffect(() => {
    if (selectedEvent?.kind !== "incident") return;
    const nextIncident = incidentsState.incidents.find(
      (incident) => incident.id === selectedEvent.id
    );
    if (!nextIncident) {
      clearSelection();
      return;
    }
    if (
      selectedEvent.timestamp === nextIncident.updated_at &&
      selectedEvent.status === nextIncident.status &&
      selectedEvent.operatorNotes === nextIncident.operator_notes
    ) {
      return;
    }
    selectIncident(nextIncident, false);
  }, [incidentsState.incidents, selectedEvent]);

  useEffect(() => {
    if (selectedEvent?.kind !== "alert") return;
    const nextAlert = alertsState.alerts.find((alert) => alert.id === selectedEvent.id);
    if (!nextAlert) {
      clearSelection();
      return;
    }
    if (
      selectedEvent.timestamp === nextAlert.timestamp &&
      selectedEvent.status === nextAlert.status &&
      selectedEvent.severity === nextAlert.severity
    ) {
      return;
    }
    selectAlert(nextAlert, false);
  }, [alertsState.alerts, selectedEvent]);

  function clearSelection() {
    setSelectedEvent(null);
    setHighlight(null);
  }

  function applySelection(event: SelectedEventDetail) {
    setSelectedEvent(event);
    setHighlight({
      lat: event.latitude,
      lon: event.longitude,
      label: event.label,
    });
  }

  function handleModeChange(next: AppMode) {
    setMode(next);
    clearSelection();
  }

  function handleSelectEvent(event: SelectedEventDetail | null) {
    if (!event) {
      clearSelection();
      return;
    }

    applySelection(event);
  }

  function selectAlert(alert: AlertRecord, allowToggle = true) {
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

    if (allowToggle && isSameSelection(selectedEvent, detail)) {
      clearSelection();
      return;
    }

    applySelection(detail);
  }

  function selectIncident(incident: IncidentRecord, allowToggle = true) {
    const detail: SelectedIncidentDetail = {
      kind: "incident",
      id: incident.id,
      label: incident.title,
      sourceAlertId: incident.source_alert_id,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      timestamp: incident.updated_at,
      latitude: incident.latitude,
      longitude: incident.longitude,
      source: "incident_case",
      cameraId: incident.camera_id,
      featureIds: incident.related_feature_ids,
      operatorNotes: incident.operator_notes,
    };

    if (allowToggle && isSameSelection(selectedEvent, detail)) {
      clearSelection();
      return;
    }

    applySelection(detail);
  }

  async function handleCreateIncidentFromSelectedAlert() {
    if (selectedEvent?.kind !== "alert") return;
    const alert = alertsState.alerts.find((item) => item.id === selectedEvent.id);
    if (!alert) return;

    const incident = await incidentsState.createFromAlert(alert);
    if (incident) {
      selectIncident(incident, false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="logo" aria-hidden="true">
            WTC
          </span>
          <div className="app-header__titles">
            <h1>WorldTraffic Control</h1>
            <span className="app-header__tagline">
              Live operations, review, and situational awareness
            </span>
          </div>
        </div>
        <div className="app-header__spacer" />
        <nav className="app-header__links" aria-label="Product information">
          <a href="/about.html" target="_blank" rel="noreferrer">
            About
          </a>
          <a href="/privacy.html" target="_blank" rel="noreferrer">
            Privacy
          </a>
          <a href="/terms.html" target="_blank" rel="noreferrer">
            Terms
          </a>
        </nav>
        <ModeToggle mode={mode} onModeChange={handleModeChange} />
      </header>

      <main className="app-content">
        <LiveMap
          data={data}
          alerts={alertsState.alerts}
          layerState={mapLayers.layers}
          highlightLocation={highlight}
          highlightVariant={
            selectedEvent?.kind === "history"
              ? "replay"
              : selectedEvent?.kind === "alert" || selectedEvent?.kind === "incident"
                ? "selected"
                : null
          }
          selectedAlertId={selectedEvent?.kind === "alert" ? selectedEvent.id : null}
          onSelectAlert={selectAlert}
        />

        <StatusPanel
          status={status}
          aircraftCount={aircraftCount}
          detectionCount={detectionCount}
          lastUpdate={lastUpdate}
          serviceStatus={serviceStatusState.status}
          serviceStatusLoading={serviceStatusState.loading}
          serviceStatusError={serviceStatusState.error}
        />

        <LayerControls
          layers={mapLayers.layers}
          onToggleLayer={mapLayers.toggleLayer}
        />

        <AlertsPanel
          alertsState={alertsState}
          onSelectAlert={selectAlert}
          variant={mode === "live" ? "compact" : "full"}
          selectedAlertId={selectedEvent?.kind === "alert" ? selectedEvent.id : null}
        />

        <EventDetailDrawer
          selectedEvent={selectedEvent}
          onClose={clearSelection}
          linkedIncident={linkedIncident}
          onCreateIncidentFromAlert={() => {
            void handleCreateIncidentFromSelectedAlert();
          }}
          onOpenLinkedIncident={() => {
            if (linkedIncident) {
              selectIncident(linkedIncident, false);
            }
          }}
        />

        {mode === "history" && (
          <IncidentsPanel
            incidentsState={incidentsState}
            selectedIncidentId={
              selectedEvent?.kind === "incident" ? selectedEvent.id : null
            }
            onSelectIncident={selectIncident}
          />
        )}

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
