/**
 * App - root product shell.
 *
 * The map remains the primary experience while workspace panels move into a
 * collapsible left rail and an optional right-side review panel.
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

type WorkspaceSection = "operations" | "alerts" | "incidents";

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

const WORKSPACE_LABELS: Record<WorkspaceSection, string> = {
  operations: "Operations",
  alerts: "Alerts",
  incidents: "Incidents",
};

const WORKSPACE_SHORT_LABELS: Record<WorkspaceSection, string> = {
  operations: "Ops",
  alerts: "Alt",
  incidents: "Inc",
};

const App: React.FC = () => {
  const { data, status, lastUpdate } = useLiveFeed();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<AppMode>("live");
  const [selectedEvent, setSelectedEvent] = useState<SelectedEventDetail | null>(
    null
  );
  const [highlight, setHighlight] = useState<HighlightLocation | null>(null);
  const [workspaceSection, setWorkspaceSection] =
    useState<WorkspaceSection>("operations");
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

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
      ? `${aircraftCount.toLocaleString()} aircraft and ${openAlertsCount.toLocaleString()} open alerts in the active view`
      : `${historyFeed.aircraftTotal.toLocaleString()} aircraft records and ${historyFeed.detectionsTotal.toLocaleString()} detections in review`;

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
    if (mode === "history") {
      setHistoryOpen(true);
    } else {
      setHistoryOpen(false);
    }
  }, [mode]);

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

    setWorkspaceSection("alerts");
    setWorkspaceOpen(true);
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

    setWorkspaceSection("incidents");
    setWorkspaceOpen(true);
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
              Unified map-based tracking where live position data is available
            </span>
          </div>
        </div>

        <div className="app-header__spacer" />

        <div className="app-header__controls">
          <button
            type="button"
            className="app-header__button"
            onClick={() => setWorkspaceOpen((current) => !current)}
          >
            {workspaceOpen ? "Hide workspace" : "Show workspace"}
          </button>

          {mode === "history" && (
            <button
              type="button"
              className="app-header__button"
              onClick={() => setHistoryOpen((current) => !current)}
            >
              {historyOpen ? "Hide review" : "Show review"}
            </button>
          )}

          <button
            type="button"
            className="app-header__button app-header__button--theme"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>

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
        </div>
      </header>

      <main className={`app-layout app-layout--${mode}`}>
        <aside
          className={`app-sidebar${workspaceOpen ? "" : " app-sidebar--collapsed"}`}
          aria-label="Workspace panel"
        >
          <div className="app-sidebar__nav">
            {(["operations", "alerts", "incidents"] as WorkspaceSection[]).map(
              (section) => (
                <button
                  key={section}
                  type="button"
                  className={`app-sidebar__tab${
                    workspaceSection === section ? " app-sidebar__tab--active" : ""
                  }`}
                  onClick={() => {
                    setWorkspaceSection(section);
                    setWorkspaceOpen(true);
                  }}
                  title={WORKSPACE_LABELS[section]}
                >
                  <span className="app-sidebar__tab-short">
                    {WORKSPACE_SHORT_LABELS[section]}
                  </span>
                  {workspaceOpen && (
                    <>
                      <span className="app-sidebar__tab-label">
                        {WORKSPACE_LABELS[section]}
                      </span>
                      {section === "alerts" && openAlertsCount > 0 && (
                        <span className="app-sidebar__tab-count">{openAlertsCount}</span>
                      )}
                      {section === "incidents" && openIncidentsCount > 0 && (
                        <span className="app-sidebar__tab-count">
                          {openIncidentsCount}
                        </span>
                      )}
                    </>
                  )}
                </button>
              )
            )}
          </div>

          {workspaceOpen && (
            <div className="app-sidebar__content">
              <div className="app-sidebar__panel-header">
                <div className="app-sidebar__panel-copy">
                  <span className="app-sidebar__panel-eyebrow">Workspace</span>
                  <span className="app-sidebar__panel-title">
                    {WORKSPACE_LABELS[workspaceSection]}
                  </span>
                  <span className="app-sidebar__panel-subtitle">
                    {workspaceSection === "operations"
                      ? "System status, layers, and live-readiness controls"
                      : workspaceSection === "alerts"
                        ? "Active alert review and operator triage"
                        : "Promoted incidents and case follow-up"}
                  </span>
                </div>
                <button
                  type="button"
                  className="app-sidebar__collapse"
                  onClick={() => setWorkspaceOpen(false)}
                >
                  Collapse
                </button>
              </div>

              {workspaceSection === "operations" && (
                <div className="app-sidebar__stack">
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
                </div>
              )}

              {workspaceSection === "alerts" && (
                <AlertsPanel
                  alertsState={alertsState}
                  onSelectAlert={selectAlert}
                  variant="full"
                  selectedAlertId={selectedEvent?.kind === "alert" ? selectedEvent.id : null}
                />
              )}

              {workspaceSection === "incidents" && (
                <IncidentsPanel
                  incidentsState={incidentsState}
                  selectedIncidentId={
                    selectedEvent?.kind === "incident" ? selectedEvent.id : null
                  }
                  onSelectIncident={selectIncident}
                />
              )}
            </div>
          )}
        </aside>

        <section className="app-map-shell">
          <div className="app-map-toolbar">
            <div className="app-map-toolbar__text">
              <span className="app-map-toolbar__eyebrow">
                {mode === "live" ? "Live tracking" : "Recorded review"}
              </span>
              <span className="app-map-toolbar__title">
                Unified map-first tracking where panels stay contextual and secondary.
              </span>
            </div>
            <div className="app-map-toolbar__metrics" aria-label="Tracking overview">
              <div className="app-map-toolbar__metric">
                <span className="app-map-toolbar__metric-value">
                  {mode === "live"
                    ? aircraftCount.toLocaleString()
                    : historyFeed.aircraftTotal.toLocaleString()}
                </span>
                <span className="app-map-toolbar__metric-label">
                  {mode === "live" ? "Tracked aircraft" : "Aircraft records"}
                </span>
              </div>
              <div className="app-map-toolbar__metric">
                <span className="app-map-toolbar__metric-value">
                  {mode === "live"
                    ? openAlertsCount.toLocaleString()
                    : historyFeed.detectionsTotal.toLocaleString()}
                </span>
                <span className="app-map-toolbar__metric-label">
                  {mode === "live" ? "Open alerts" : "Detections"}
                </span>
              </div>
            </div>
            <div className="app-map-toolbar__actions">
              {!workspaceOpen && (
                <button
                  type="button"
                  className="app-map-toolbar__button"
                  onClick={() => setWorkspaceOpen(true)}
                >
                  Open workspace
                </button>
              )}
              {mode === "history" && !historyOpen && (
                <button
                  type="button"
                  className="app-map-toolbar__button"
                  onClick={() => setHistoryOpen(true)}
                >
                  Open review
                </button>
              )}
            </div>
          </div>

          <div className="app-map-stage">
            <div className="app-map-stage__status">
              <span className="app-map-stage__status-dot" aria-hidden="true" />
              <span>{mapSummaryLabel}</span>
            </div>
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
          </div>
        </section>

        {mode === "history" && historyOpen && (
          <section className="app-history-shell">
            <HistoryPanel
              feed={historyFeed}
              filters={historyFilters}
              onSelectEvent={handleSelectEvent}
              selectedEvent={selectedEvent}
            />
          </section>
        )}
      </main>
    </div>
  );
};

export default App;
