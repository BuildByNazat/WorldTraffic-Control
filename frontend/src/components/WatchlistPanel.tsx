import React from "react";
import type {
  AircraftAlertRule,
  AircraftAlertType,
} from "../hooks/useAircraftAlerts";
import type { WatchlistItem } from "../hooks/useWatchlist";

interface WatchlistPanelProps {
  isAuthenticated: boolean;
  userEmail: string | null;
  items: WatchlistItem[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  alertsLoading: boolean;
  alertsSaving: boolean;
  alertsError: string | null;
  alertsByAircraftId: Record<string, AircraftAlertRule[]>;
  visibleAircraftIds: Set<string>;
  selectedAircraftId: string | null;
  onSelectItem: (item: WatchlistItem) => void;
  onRemoveItem: (aircraftId: string) => void;
  onCreateAlert: (aircraftId: string, alertType: AircraftAlertType) => void;
  onToggleAlertEnabled: (alertId: number, enabled: boolean) => void;
  onRemoveAlert: (alertId: number) => void;
}

function formatObservedAt(value: string | null): string {
  if (!value) return "Observation unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Observation unavailable";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatAlertLabel(alert: AircraftAlertRule): string {
  if (alert.alert_type === "visible") return "Appears";
  if (alert.alert_type === "not_visible") return "Missing";
  return `Moves ${Math.round(alert.movement_nm_threshold ?? 25)} NM`;
}

const WatchlistPanel: React.FC<WatchlistPanelProps> = ({
  isAuthenticated,
  userEmail,
  items,
  loading,
  saving,
  error,
  alertsLoading,
  alertsSaving,
  alertsError,
  alertsByAircraftId,
  visibleAircraftIds,
  selectedAircraftId,
  onSelectItem,
  onRemoveItem,
  onCreateAlert,
  onToggleAlertEnabled,
  onRemoveAlert,
}) => {
  return (
    <section className="watchlist-panel">
      <div className="watchlist-panel__header">
        <span className="watchlist-panel__title">Saved Aircraft</span>
        <span className="watchlist-panel__meta">
          {isAuthenticated ? userEmail : "Account required"}
        </span>
      </div>

      {!isAuthenticated && (
        <div className="watchlist-panel__state">
          Sign in to save aircraft and revisit them from your watchlist.
        </div>
      )}

      {isAuthenticated && loading && (
        <div className="watchlist-panel__state">Loading saved aircraft...</div>
      )}

      {isAuthenticated && !loading && alertsLoading && (
        <div className="watchlist-panel__state">Loading aircraft alerts...</div>
      )}

      {isAuthenticated && !loading && error && (
        <div className="watchlist-panel__state watchlist-panel__state--error">
          {error}
        </div>
      )}

      {isAuthenticated && !loading && !error && alertsError && (
        <div className="watchlist-panel__state watchlist-panel__state--error">
          {alertsError}
        </div>
      )}

      {isAuthenticated && !loading && !error && items.length === 0 && (
        <div className="watchlist-panel__state">
          No aircraft saved yet. Select an aircraft on the map or in search, then save it from the detail drawer.
        </div>
      )}

      {isAuthenticated && items.length > 0 && (
        <div className="watchlist-panel__list">
          {items.map((item) => (
            (() => {
              const alerts = alertsByAircraftId[item.aircraft_id] ?? [];
              const hasVisibleAlert = alerts.some((alert) => alert.alert_type === "visible");
              const hasMissingAlert = alerts.some(
                (alert) => alert.alert_type === "not_visible"
              );
              const hasMovementAlert = alerts.some((alert) => alert.alert_type === "movement");
              const currentlyVisible = visibleAircraftIds.has(item.aircraft_id);

              return (
                <article
                  key={item.aircraft_id}
                  className={`watchlist-item${
                    selectedAircraftId === item.aircraft_id ? " watchlist-item--selected" : ""
                  }`}
                >
                  <div className="watchlist-item__header">
                    <button
                      type="button"
                      className="watchlist-item__main"
                      onClick={() => onSelectItem(item)}
                    >
                      <span className="watchlist-item__title">
                        {item.callsign ?? item.flight_identifier ?? item.aircraft_id}
                      </span>
                      <span className="watchlist-item__meta">
                        {item.aircraft_id} / {item.provider_name ?? item.source}
                      </span>
                      <span className="watchlist-item__meta">
                        Last seen {formatObservedAt(item.observed_at)}
                      </span>
                      <span
                        className={`watchlist-item__visibility${
                          currentlyVisible
                            ? " watchlist-item__visibility--visible"
                            : " watchlist-item__visibility--hidden"
                        }`}
                      >
                        {currentlyVisible
                          ? "Currently visible"
                          : "Not currently visible"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="watchlist-item__remove"
                      onClick={() => onRemoveItem(item.aircraft_id)}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="watchlist-item__alerts">
                    <div className="watchlist-item__alerts-header">
                      <span className="watchlist-item__alerts-title">Alerts</span>
                      <div className="watchlist-item__alerts-actions">
                        {!hasVisibleAlert && (
                          <button
                            type="button"
                            className="watchlist-item__alert-action"
                            onClick={() => onCreateAlert(item.aircraft_id, "visible")}
                            disabled={alertsSaving}
                          >
                            Appears
                          </button>
                        )}
                        {!hasMissingAlert && (
                          <button
                            type="button"
                            className="watchlist-item__alert-action"
                            onClick={() => onCreateAlert(item.aircraft_id, "not_visible")}
                            disabled={alertsSaving}
                          >
                            Missing
                          </button>
                        )}
                        {!hasMovementAlert && (
                          <button
                            type="button"
                            className="watchlist-item__alert-action"
                            onClick={() => onCreateAlert(item.aircraft_id, "movement")}
                            disabled={alertsSaving}
                          >
                            Move 25 NM
                          </button>
                        )}
                      </div>
                    </div>

                    {alerts.length === 0 && (
                      <div className="watchlist-item__alert-empty">
                        No alert rules yet.
                      </div>
                    )}

                    {alerts.map((alert) => (
                      <div key={alert.id} className="watchlist-item__alert-row">
                        <div className="watchlist-item__alert-copy">
                          <span className="watchlist-item__alert-title">
                            {formatAlertLabel(alert)}
                          </span>
                          <span className="watchlist-item__alert-meta">
                            {alert.status_message}
                          </span>
                        </div>
                        <span
                          className={`watchlist-item__alert-status watchlist-item__alert-status--${alert.status}`}
                        >
                          {alert.enabled ? alert.status : "disabled"}
                        </span>
                        <button
                          type="button"
                          className="watchlist-item__alert-toggle"
                          onClick={() => onToggleAlertEnabled(alert.id, !alert.enabled)}
                          disabled={alertsSaving}
                        >
                          {alert.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="watchlist-item__alert-remove"
                          onClick={() => onRemoveAlert(alert.id)}
                          disabled={alertsSaving}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })()
          ))}
        </div>
      )}
    </section>
  );
};

export default WatchlistPanel;
