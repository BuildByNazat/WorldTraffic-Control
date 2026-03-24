/**
 * App - map-first product shell.
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
import {
  useLiveFeed,
  isAircraftFeature,
  type AircraftFeature,
} from "./hooks/useLiveFeed";
import { useFilteredHistory } from "./hooks/useFilteredHistory";
import { useHistoryFeed } from "./hooks/useHistoryFeed";
import {
  useAircraftSearch,
  type AircraftSearchResult,
} from "./hooks/useAircraftSearch";
import { useAlerts, type AlertRecord } from "./hooks/useAlerts";
import { useIncidents, type IncidentRecord } from "./hooks/useIncidents";
import { useMapLayers } from "./hooks/useMapLayers";
import { useServiceStatus } from "./hooks/useServiceStatus";
import { useTheme } from "./hooks/useTheme";
import type {
  SelectedAircraftDetail,
  SelectedAlertDetail,
  SelectedEventDetail,
  SelectedIncidentDetail,
} from "./types/selectedEvent";

type RailPanel = "operations" | "alerts" | "incidents" | "layers";

const PANEL_LABELS: Record<RailPanel, string> = {
  operations: "Operations",
  alerts: "Alerts",
  incidents: "Incidents",
  layers: "Layers",
};

const RAIL_ICONS: Record<RailPanel, string> = {
  operations: "OP",
  alerts: "AL",
  incidents: "IN",
  layers: "LY",
};

function buildAircraftSelectionFromFeature(feature: AircraftFeature): SelectedAircraftDetail {
  return {
    kind: "aircraft",
    id: feature.properties.id,
    label:
      feature.properties.callsign ??
      feature.properties.flight_identifier ??
      feature.properties.id,
    timestamp: feature.properties.observed_at ?? "",
    latitude: feature.geometry.coordinates[1],
    longitude: feature.geometry.coordinates[0],
    source: feature.properties.source,
    cameraId: null,
    featureIds: [feature.properties.id],
    callsign: feature.properties.callsign,
    flightIdentifier:
      feature.properties.flight_identifier ?? feature.properties.callsign ?? null,
    altitude: feature.properties.altitude,
    speed: feature.properties.speed,
    heading: feature.properties.heading,
    providerName: feature.properties.provider_name ?? null,
    routeOrigin: feature.properties.route_origin ?? null,
    routeDestination: feature.properties.route_destination ?? null,
    freshnessSeconds: feature.properties.freshness_seconds ?? null,
    stale: feature.properties.stale ?? false,
  };
}

function buildAircraftSelectionFromSearchResult(
  result: AircraftSearchResult
): SelectedAircraftDetail {
  return {
    kind: "aircraft",
    id: result.id,
    label: result.callsign ?? result.flight_identifier ?? result.id,
    timestamp: result.observed_at ?? "",
    latitude: result.latitude,
    longitude: result.longitude,
    source: result.source,
    cameraId: null,
    featureIds: [result.id],
    callsign: result.callsign,
    flightIdentifier: result.flight_identifier ?? result.callsign,
    altitude: result.altitude,
    speed: result.speed,
    heading: result.heading,
    providerName: result.provider_name,
    routeOrigin: result.route_origin,
    routeDestination: result.route_destination,
    freshnessSeconds: result.freshness_seconds,
    stale: result.stale,
  };
}

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
  const [aircraftQuery, setAircraftQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const historyFilters = useFilteredHistory();
  const historyFeed = useHistoryFeed(mode === "history", historyFilters.filters);
  const aircraftSearch = useAircraftSearch(aircraftQuery, mode === "live");
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
      ? `${aircraftCount.toLocaleString()} aircraft / ${openAlertsCount.toLocaleString()} alerts`
      : `${historyFeed.aircraftTotal.toLocaleString()} records / ${historyFeed.detectionsTotal.toLocaleString()} detections`;

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
      setActiveDrawer(null);
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

  useEffect(() => {
    if (selectedEvent?.kind !== "aircraft") return;

    const nextAircraft = data?.features.find(
      (feature): feature is AircraftFeature =>
        isAircraftFeature(feature) && feature.properties.id === selectedEvent.id
    );
    if (!nextAircraft) return;

    const nextSelection = buildAircraftSelectionFromFeature(nextAircraft);
    if (
      selectedEvent.timestamp === nextSelection.timestamp &&
      selectedEvent.altitude === nextSelection.altitude &&
      selectedEvent.speed === nextSelection.speed &&
      selectedEvent.heading === nextSelection.heading &&
      selectedEvent.latitude === nextSelection.latitude &&
      selectedEvent.longitude === nextSelection.longitude
    ) {
      return;
    }

    applySelection(nextSelection);
  }, [data, selectedEvent]);

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
      setHistoryOpen((prev) => !prev);
      return;
    }

    setMode(next);
    setAircraftQuery("");
    setSearchOpen(false);
    clearSelection();
  }

  function handleSelectEvent(event: SelectedEventDetail | null) {
    if (!event) {
      clearSelection();
      return;
    }
    applySelection(event);
  }

  function selectAircraft(detail: SelectedAircraftDetail, allowToggle = true) {
    if (allowToggle && isSameSelection(selectedEvent, detail)) {
      clearSelection();
      return;
    }

    setSearchOpen(false);
    applySelection(detail);
  }

  function handleSelectAircraftFromMap(feature: AircraftFeature) {
    selectAircraft(buildAircraftSelectionFromFeature(feature));
  }

  function handleSelectAircraftFromSearch(result: AircraftSearchResult) {
    setAircraftQuery(result.callsign ?? result.flight_identifier ?? result.id);
    selectAircraft(buildAircraftSelectionFromSearchResult(result), false);
  }

  function toggleDrawer(panel: RailPanel) {
    setActiveDrawer((current) => {
      if (current === panel) return null;
      setHistoryOpen(false);
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

  const isLeftDrawer = activeDrawer !== null;
  const isRightDrawer = historyOpen;
  const hideEventDetail = isReplayPlaying;

  const statusClasses = [
    "app-map-stage__status",
    isLeftDrawer ? "app-map-stage__status--left-open" : "",
    isRightDrawer ? "app-map-stage__status--right-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="app-shell">
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
            {theme === "dark" ? "Dark" : "Light"}
          </button>
          <ModeToggle mode={mode} onModeChange={handleModeChange} />
        </div>
      </header>

      <main className="app-main">
        {mode === "live" && (
          <div className="app-flight-search">
            <label className="app-flight-search__field">
              <span className="app-flight-search__label">Find Flight</span>
              <input
                type="search"
                value={aircraftQuery}
                onChange={(event) => {
                  setAircraftQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Callsign, aircraft id, or provider"
                aria-label="Search flights or aircraft"
              />
            </label>

            {searchOpen && aircraftQuery.trim().length >= 2 && (
              <div className="app-flight-search__results" role="listbox">
                {aircraftSearch.loading && (
                  <div className="app-flight-search__state">Searching active aircraft...</div>
                )}
                {!aircraftSearch.loading && aircraftSearch.error && (
                  <div className="app-flight-search__state">{aircraftSearch.error}</div>
                )}
                {!aircraftSearch.loading &&
                  !aircraftSearch.error &&
                  aircraftSearch.results.length === 0 && (
                    <div className="app-flight-search__state">
                      No active aircraft matched the current query.
                    </div>
                  )}
                {!aircraftSearch.loading &&
                  aircraftSearch.results.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className="app-flight-search__result"
                      onClick={() => handleSelectAircraftFromSearch(result)}
                    >
                      <span className="app-flight-search__result-title">
                        {result.callsign ?? result.flight_identifier ?? result.id}
                      </span>
                      <span className="app-flight-search__result-meta">
                        {result.id} / {result.provider_name ?? result.source}
                        {result.stale ? " / stale" : ""}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

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
                    selectedEvent?.kind === "aircraft" ||
                    selectedEvent?.kind === "incident"
                  ? "selected"
                  : null
            }
            selectedAlertId={selectedEvent?.kind === "alert" ? selectedEvent.id : null}
            selectedAircraftId={
              selectedEvent?.kind === "aircraft" ? selectedEvent.id : null
            }
            onSelectAlert={selectAlert}
            onSelectAircraft={handleSelectAircraftFromMap}
          />
        </div>

        <div className={statusClasses}>
          <span className="app-map-stage__status-dot" aria-hidden="true" />
          <span>{mapSummaryLabel}</span>
        </div>

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
                {"<"}
              </button>
            </div>
            <div
              className={`drawer__body${
                activeDrawer === "operations" || activeDrawer === "layers"
                  ? " drawer__body--padded"
                  : ""
              }`}
            >
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

        {isRightDrawer && (
          <aside className="drawer drawer--right" aria-label="History and review">
            <div className="drawer__header">
              <span className="drawer__title">History &amp; Review</span>
              <button
                type="button"
                className="drawer__close"
                onClick={() => setHistoryOpen(false)}
                aria-label="Hide review"
              >
                {">"}
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

        {mode === "history" && !historyOpen && (
          <button
            type="button"
            className="drawer-edge-handle"
            onClick={() => setHistoryOpen(true)}
            aria-label="Show review"
          >
            {"<"}
          </button>
        )}

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
