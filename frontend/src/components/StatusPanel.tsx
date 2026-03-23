/**
 * StatusPanel - floating overlay showing feed status and current live counts.
 */

import React from "react";
import type { WsStatus } from "../hooks/useLiveFeed";
import type { ServiceStatusResponse } from "../hooks/useServiceStatus";

interface StatusPanelProps {
  status: WsStatus;
  aircraftCount: number;
  detectionCount: number;
  lastUpdate: Date | null;
  serviceStatus: ServiceStatusResponse | null;
  serviceStatusLoading?: boolean;
  serviceStatusError?: string | null;
}

const STATUS_LABEL: Record<WsStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

const STATUS_CLASS: Record<WsStatus, string> = {
  connected: "ws-connected",
  connecting: "ws-connecting",
  disconnected: "ws-disconnected",
};

const DOT_CLASS: Record<WsStatus, string> = {
  connected: "status-dot status-dot--connected",
  connecting: "status-dot status-dot--connecting",
  disconnected: "status-dot status-dot--disconnected",
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const StatusPanel: React.FC<StatusPanelProps> = ({
  status,
  aircraftCount,
  detectionCount,
  lastUpdate,
  serviceStatus,
  serviceStatusLoading = false,
  serviceStatusError = null,
}) => {
  const providerLabel = serviceStatus?.simulated_mode
    ? "Simulated feed"
    : serviceStatus?.aircraft_provider === "opensky"
      ? serviceStatus.opensky_configured
        ? "OpenSky live feed"
        : "OpenSky live feed (anonymous)"
      : "Live feed";

  const visionLabel = serviceStatus?.gemini_enabled ? "Enabled" : "Optional / off";
  const environmentLabel =
    serviceStatus?.app_env === "production" ? "Production" : "Development";
  const fallbackNote =
    status === "disconnected"
      ? "Live updates are temporarily unavailable. Historical review and alerts remain available."
      : serviceStatusError
        ? "Live tracking is active, but backend status details are temporarily unavailable."
        : !serviceStatus
          ? "Loading provider and system readiness details."
      : serviceStatus?.simulated_mode
        ? "Running on the built-in simulated aircraft feed. Configure OpenSky when you want public live traffic."
        : !serviceStatus?.gemini_enabled
          ? "Camera vision is currently optional and not configured. Aircraft, alerts, and history remain available."
          : "Live tracking is healthy. Review history, alerts, and incidents from the side panels.";

  return (
    <div className="status-panel" role="status" aria-live="polite">
      <div className="status-panel__title">Live Operations</div>
      <div className="status-panel__subtitle">Current transport activity and service readiness</div>

      <div className="status-panel__row">
        <span className="status-panel__label">Feed</span>
        <span className={`status-panel__value ${STATUS_CLASS[status]}`}>
          <span className={DOT_CLASS[status]} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
      </div>

      <hr className="status-panel__divider" />

      <div className="status-panel__row">
        <span className="status-panel__label">Aircraft</span>
        <span className="status-panel__value">{aircraftCount}</span>
      </div>

      <div className="status-panel__row">
        <span className="status-panel__label">Detections</span>
        <span className="status-panel__value">{detectionCount}</span>
      </div>

      <div className="status-panel__row">
        <span className="status-panel__label">Last update</span>
        <span className="status-panel__value">
          {lastUpdate ? formatTime(lastUpdate) : "Awaiting live feed"}
        </span>
      </div>

      <hr className="status-panel__divider" />

      <div className="status-panel__row">
        <span className="status-panel__label">Provider</span>
        <span className="status-panel__value">{providerLabel}</span>
      </div>

      <div className="status-panel__row">
        <span className="status-panel__label">Vision</span>
        <span className="status-panel__value">{visionLabel}</span>
      </div>

      <div className="status-panel__row">
        <span className="status-panel__label">Environment</span>
        <span className="status-panel__value">{environmentLabel}</span>
      </div>

      {(serviceStatusLoading || serviceStatusError) && (
        <div className="status-panel__meta">
          {serviceStatusLoading ? "Refreshing system status..." : serviceStatusError}
        </div>
      )}

      <div className="status-panel__note">{fallbackNote}</div>
    </div>
  );
};

export default StatusPanel;
