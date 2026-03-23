/**
 * App — map-first product shell.
 *
 * Full-bleed map with a slim icon rail on the left edge.
 * Panels open as slide-out drawers overlaying the map.
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
import { useTheme } from "./hooks/useTheme";
import type {
  SelectedAlertDetail,
  SelectedEventDetail,
  SelectedIncidentDetail,
} from "./types/selectedEvent";

/* ── Rail panel identifiers (left-side operational tools only) ── */
type RailPanel = "operations" | "alerts" | "incidents" | "layers";

const PANEL_LABELS: Record<RailPanel, string> = {
  operations: "Operations",
  alerts: "Alerts",
  incidents: "Incidents",
  layers: "Layers",
};

const RAIL_ICONS: Record<RailPanel, string> = {
  operations: "⚙",
  alerts: "🔔",
  incidents: "📋",
  layers: "◈",
};

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
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<AppMode>("live");
  const [selectedEvent, setSelectedEvent] = useState<SelectedEventDetail | null>(
    null
  );
  const [highlight, setHighlight] = useState<HighlightLocation | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<RailPanel | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);

  const historyFilters = useFilteredHistory();
  const historyFeed = useHistoryFeed(mode === "history", historyFilters.filters);
  const alertsState = useAlerts(true);
  const incidentsState = useIncidents(true);
  const mapLayers = useMapLayers();
  const serviceStatusState = useServiceStatus(true);

  const aircraftCount = data?.features.filter(isAircraftFeature).length ?? 0;
  const detectionCount =
    data?.features.filter((feature) => !isAircraftFeature(feature)).length ?? 0;

  const openAlertsCount =
    alertsState.summary?.total_open_alerts ??
    alertsState.alerts.filter((alert) => alert.status !== "resolved").length;
  const openIncidentsCount = incidentsState.incidents.filter(
    (incident) => incident.status !== "closed"
  ).length;

  const mapSummaryLabel =
    mode === "live"
      ? `${aircraftCount.toLocaleString()} aircraft · ${openAlertsCount.toLocaleString()} alerts`
      : `${historyFeed.aircraftTotal.toLocaleString()} records · ${historyFeed.detectionsTotal.toLocaleString()} detections`;

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

  /* History drawer is mode-driven: opens when entering history mode */
  useEffect(() => {
    if (mode === "history") {
      setHistoryOpen(true);
      setActiveDrawer(null); // close any left drawer
    } else {
      setHistoryOpen(false);
    }
  }, [mode]);

  /* Keep incident selection in sync */
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

  /* Keep alert selection in sync */
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
    if (next === mode && next === "history") {
      // Re-clicking Review while already in history mode: reopen the drawer
      setHistoryOpen(true);
      return;
    }
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

  function toggleDrawer(panel: RailPanel) {
    setActiveDrawer((current) => {
      if (current === panel) return null; // close if already open
      setHistoryOpen(false); // close history when opening a left drawer
      return panel;
    });
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

    setActiveDrawer("alerts");
    setHistoryOpen(false);
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

    setActiveDrawer("incidents");
    setHistoryOpen(false);
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

  /* Drawer visibility */
  const isLeftDrawer = activeDrawer !== null;
  const isRightDrawer = historyOpen;
  const hideEventDetail = isReplayPlaying;

  /* Status chip position class */
  const statusClasses = [
    "app-map-stage__status",
    isLeftDrawer ? "app-map-stage__status--left-open" : "",
    isRightDrawer ? "app-map-stage__status--right-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header__brand">
          <span className="logo" aria-hidden="true">
            WTC
          </span>
          <div className="app-header__titles">
            <h1>WorldTraffic Control</h1>
          </div>
        </div>

        <div className="app-header__spacer" />

        <div className="app-header__controls">
          <button
            type="button"
            className="app-header__button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <ModeToggle mode={mode} onModeChange={handleModeChange} />
        </div>
      </header>

      {/* ── Main: full-bleed map + overlays ── */}
      <main className="app-main">
        {/* Map fills entire area */}
        <div className="app-map-stage">
          <LiveMap
            data={data}
            alerts={alertsState.alerts}
            layerState={mapLayers.layers}
            theme={theme}
            highlightLocation={highlight}
            highlightVariant={
              selectedEvent?.kind === "history"
                ? "replay"
                : selectedEvent?.kind === "alert" ||
                    selectedEvent?.kind === "incident"
                  ? "selected"
                  : null
            }
            selectedAlertId={selectedEvent?.kind === "alert" ? selectedEvent.id : null}
            onSelectAlert={selectAlert}
          />
        </div>

        {/* Status pill */}
        <div className={statusClasses}>
          <span className="app-map-stage__status-dot" aria-hidden="true" />
          <span>{mapSummaryLabel}</span>
        </div>

        {/* ── Icon rail ── */}
        <nav className="rail" aria-label="Tools">
          {(["operations", "alerts", "incidents", "layers"] as RailPanel[]).map(
            (panel) => (
              <button
                key={panel}
                type="button"
                className={`rail__btn${activeDrawer === panel ? " rail__btn--active" : ""}`}
                onClick={() => toggleDrawer(panel)}
                title={PANEL_LABELS[panel]}
                aria-label={PANEL_LABELS[panel]}
              >
                {RAIL_ICONS[panel]}
                {panel === "alerts" && openAlertsCount > 0 && (
                  <span className="rail__btn-badge">{openAlertsCount}</span>
                )}
                {panel === "incidents" && openIncidentsCount > 0 && (
                  <span className="rail__btn-badge">{openIncidentsCount}</span>
                )}
              </button>
            )
          )}
        </nav>

        {/* ── Left drawer (operations / alerts / incidents / layers) ── */}
        {isLeftDrawer && (
          <aside className="drawer" aria-label={PANEL_LABELS[activeDrawer!]}>
            <div className="drawer__header">
              <span className="drawer__title">{PANEL_LABELS[activeDrawer!]}</span>
              <button
                type="button"
                className="drawer__close"
                onClick={() => setActiveDrawer(null)}
                aria-label="Hide panel"
              >
                ◂
              </button>
            </div>
            <div className={`drawer__body${activeDrawer === "operations" || activeDrawer === "layers" ? " drawer__body--padded" : ""}`}>
              {activeDrawer === "operations" && (
                <StatusPanel
                  status={status}
                  aircraftCount={aircraftCount}
                  detectionCount={detectionCount}
                  lastUpdate={lastUpdate}
                  serviceStatus={serviceStatusState.status}
                  serviceStatusLoading={serviceStatusState.loading}
                  serviceStatusError={serviceStatusState.error}
                />
              )}
              {activeDrawer === "alerts" && (
                <AlertsPanel
                  alertsState={alertsState}
                  onSelectAlert={selectAlert}
                  variant="full"
                  selectedAlertId={
                    selectedEvent?.kind === "alert" ? selectedEvent.id : null
                  }
                />
              )}
              {activeDrawer === "incidents" && (
                <IncidentsPanel
                  incidentsState={incidentsState}
                  selectedIncidentId={
                    selectedEvent?.kind === "incident" ? selectedEvent.id : null
                  }
                  onSelectIncident={selectIncident}
                />
              )}
              {activeDrawer === "layers" && (
                <LayerControls
                  layers={mapLayers.layers}
                  onToggleLayer={mapLayers.toggleLayer}
                />
              )}
            </div>
          </aside>
        )}

        {/* ── Right drawer (history) ── */}
        {isRightDrawer && (
          <aside className="drawer drawer--right" aria-label="History & Review">
            <div className="drawer__header">
              <span className="drawer__title">History &amp; Review</span>
              <button
                type="button"
                className="drawer__close"
                onClick={() => setHistoryOpen(false)}
                aria-label="Hide review"
              >
                ▸
              </button>
            </div>
            <div className="drawer__body">
              <HistoryPanel
                feed={historyFeed}
                filters={historyFilters}
                onSelectEvent={handleSelectEvent}
                selectedEvent={selectedEvent}
                onReplayStateChange={setIsReplayPlaying}
              />
            </div>
          </aside>
        )}

        {/* ── Event detail ── */}
        {!hideEventDetail && (
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
        )}
      </main>
    </div>
  );
};

export default App;
