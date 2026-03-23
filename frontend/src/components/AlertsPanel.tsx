import React, { useEffect, useMemo, useState } from "react";
import type { AlertRecord, AlertsState } from "../hooks/useAlerts";
import { downloadCsv } from "../utils/export";

interface AlertsPanelProps {
  alertsState: AlertsState;
  onSelectAlert: (alert: AlertRecord) => void;
  variant?: "full" | "compact";
  selectedAlertId?: string | null;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const AlertsPanel: React.FC<AlertsPanelProps> = ({
  alertsState,
  onSelectAlert,
  variant = "full",
  selectedAlertId = null,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const { alerts, summary, loading, error, acknowledge, resolve, newestAlertNotice } =
    alertsState;
  const filteredAlerts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return alerts;
    }

    return alerts.filter((alert) =>
      [
        alert.title,
        alert.category,
        alert.camera_id ?? "",
        alert.source,
        ...alert.feature_ids,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [alerts, searchQuery]);
  const visibleAlerts =
    variant === "compact" ? filteredAlerts.slice(0, 4) : filteredAlerts;

  useEffect(() => {
    if (variant === "compact" && searchQuery) {
      setSearchQuery("");
    }
  }, [searchQuery, variant]);

  function handleExport() {
    downloadCsv("worldtraffic-alerts.csv", filteredAlerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      category: alert.category,
      severity: alert.severity,
      status: alert.status,
      timestamp: alert.timestamp,
      source: alert.source,
      camera_id: alert.camera_id ?? "",
      latitude: alert.latitude,
      longitude: alert.longitude,
      feature_ids: alert.feature_ids.join(" | "),
    })));
  }

  return (
    <aside
      className={`alerts-panel${variant === "compact" ? " alerts-panel--compact" : ""}`}
      aria-label="Alerts panel"
    >
      <div className="alerts-panel__header">
        <div className="alerts-panel__heading">
          <span className="alerts-panel__title">
            {variant === "compact" ? "Live Alerts" : "Alerts"}
          </span>
          {variant === "compact" && (
            <span className="alerts-panel__subtitle">Current alert activity</span>
          )}
        </div>
        <button
          type="button"
          className="alerts-panel__refresh"
          onClick={alertsState.refresh}
          disabled={loading}
        >
          {loading ? "Syncing" : "Sync"}
        </button>
      </div>

      {variant === "full" && (
        <div className="panel-toolbar">
          <input
            type="text"
            className="panel-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search title, category, camera"
            aria-label="Search alerts"
          />
          <button
            type="button"
            className="panel-action"
            onClick={handleExport}
            disabled={filteredAlerts.length === 0}
          >
            Export CSV
          </button>
        </div>
      )}

      {newestAlertNotice && variant === "compact" && (
        <button
          type="button"
          className="alerts-toast"
          onClick={() => {
            onSelectAlert(newestAlertNotice);
            alertsState.dismissNewAlertNotice();
          }}
        >
          <span className="alerts-toast__label">New alert</span>
          <span className="alerts-toast__title">{newestAlertNotice.title}</span>
        </button>
      )}

      {summary && (
        <div className="alerts-summary">
          <div className="alerts-summary__stat">
            <span className="alerts-summary__value">{summary.total_open_alerts}</span>
            <span className="alerts-summary__label">Open alerts</span>
          </div>
          <div className="alerts-summary__group">
            {Object.entries(summary.alerts_by_severity).map(([severity, count]) => (
              <span key={severity} className="alerts-summary__chip">
                {severity}: {count}
              </span>
            ))}
          </div>
          {variant === "full" && (
            <div className="alerts-summary__group">
              {Object.entries(summary.alerts_by_category).map(([category, count]) => (
                <span key={category} className="alerts-summary__chip">
                  {category}: {count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && alerts.length === 0 && (
        <div className="alerts-panel__state">Loading alerts...</div>
      )}
      {error && <div className="alerts-panel__state alerts-panel__state--error">{error}</div>}

      {!loading && alerts.length === 0 && (
        <div className="alerts-panel__state">
          {variant === "compact"
            ? "No open alerts in the current live view."
            : "No active alerts are available for review yet."}
        </div>
      )}

      {!loading && alerts.length > 0 && filteredAlerts.length === 0 && (
        <div className="alerts-panel__state">
          No alerts match the current search.
        </div>
      )}

      <div className="alerts-list">
        {visibleAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`alert-card alert-card--${alert.severity} alert-card--status-${alert.status}${
              selectedAlertId === alert.id ? " alert-card--selected" : ""
            }`}
          >
            <button
              type="button"
              className="alert-card__body"
              onClick={() => onSelectAlert(alert)}
            >
              <div className="alert-card__title-row">
                <span className="alert-card__title">{alert.title}</span>
                <span className={`alert-card__status alert-card__status--${alert.status}`}>
                  {alert.status}
                </span>
              </div>
              <div className="alert-card__meta">
                {alert.category} / {alert.severity} / {formatTime(alert.timestamp)}
              </div>
              <div className="alert-card__meta">
                {alert.camera_id ?? "Camera unavailable"} / {alert.source}
              </div>
            </button>

            {variant === "full" && (
              <div className="alert-card__actions">
                <button
                  type="button"
                  className="alert-card__action"
                  onClick={() => void acknowledge(alert.id)}
                  disabled={alert.status !== "new"}
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  className="alert-card__action alert-card__action--primary"
                  onClick={() => void resolve(alert.id)}
                  disabled={alert.status === "resolved"}
                >
                  Resolve
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {variant === "compact" && filteredAlerts.length > visibleAlerts.length && (
        <div className="alerts-panel__footer">
          Showing {visibleAlerts.length} of {filteredAlerts.length} alerts
        </div>
      )}
    </aside>
  );
};

export default AlertsPanel;
