import React from "react";
import type { AlertRecord, AlertsState } from "../hooks/useAlerts";

interface AlertsPanelProps {
  alertsState: AlertsState;
  onSelectAlert: (alert: AlertRecord) => void;
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

const AlertsPanel: React.FC<AlertsPanelProps> = ({ alertsState, onSelectAlert }) => {
  const { alerts, summary, loading, error, acknowledge, resolve } = alertsState;

  return (
    <aside className="alerts-panel" aria-label="Alerts panel">
      <div className="alerts-panel__header">
        <span className="alerts-panel__title">Alerts</span>
        <button
          type="button"
          className="alerts-panel__refresh"
          onClick={alertsState.refresh}
          disabled={loading}
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {summary && (
        <div className="alerts-summary">
          <div className="alerts-summary__stat">
            <span className="alerts-summary__value">{summary.total_open_alerts}</span>
            <span className="alerts-summary__label">Open</span>
          </div>
          <div className="alerts-summary__group">
            {Object.entries(summary.alerts_by_severity).map(([severity, count]) => (
              <span key={severity} className="alerts-summary__chip">
                {severity}: {count}
              </span>
            ))}
          </div>
          <div className="alerts-summary__group">
            {Object.entries(summary.alerts_by_category).map(([category, count]) => (
              <span key={category} className="alerts-summary__chip">
                {category}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <div className="alerts-panel__error">{error}</div>}

      {!loading && alerts.length === 0 && (
        <div className="alerts-panel__empty">No active alerts derived from recent detections.</div>
      )}

      <div className="alerts-list">
        {alerts.map((alert) => (
          <div key={alert.id} className={`alert-card alert-card--${alert.severity}`}>
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
                {alert.category} · {alert.severity} · {formatTime(alert.timestamp)}
              </div>
              <div className="alert-card__meta">
                {alert.camera_id ?? "Unknown camera"} · {alert.source}
              </div>
            </button>

            <div className="alert-card__actions">
              <button
                type="button"
                className="alert-card__action"
                onClick={() => void acknowledge(alert.id)}
                disabled={alert.status !== "new"}
              >
                Ack
              </button>
              <button
                type="button"
                className="alert-card__action"
                onClick={() => void resolve(alert.id)}
                disabled={alert.status === "resolved"}
              >
                Resolve
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default AlertsPanel;
