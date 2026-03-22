/**
 * StatusPanel — floating overlay showing WebSocket status, aircraft count,
 * camera detection count, and last update time.
 */

import React from "react";
import type { WsStatus } from "../hooks/useLiveFeed";

interface StatusPanelProps {
  status: WsStatus;
  aircraftCount: number;
  detectionCount: number;
  lastUpdate: Date | null;
}

const STATUS_LABEL: Record<WsStatus, string> = {
  connected: "Connected",
  connecting: "Connecting…",
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
}) => {
  return (
    <div className="status-panel" role="status" aria-live="polite">
      <div className="status-panel__title">Live Feed</div>

      {/* WebSocket connection status */}
      <div className="status-panel__row">
        <span className="status-panel__label">WebSocket</span>
        <span className={`status-panel__value ${STATUS_CLASS[status]}`}>
          <span className={DOT_CLASS[status]} aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
      </div>

      <hr className="status-panel__divider" />

      {/* Aircraft tracked (excludes camera detections) */}
      <div className="status-panel__row">
        <span className="status-panel__label">Aircraft</span>
        <span className="status-panel__value">{aircraftCount}</span>
      </div>

      {/* Gemini camera detections */}
      <div className="status-panel__row">
        <span className="status-panel__label">Detections</span>
        <span className="status-panel__value">
          {detectionCount > 0 ? detectionCount : "—"}
        </span>
      </div>

      {/* Last data update time */}
      <div className="status-panel__row">
        <span className="status-panel__label">Last update</span>
        <span className="status-panel__value">
          {lastUpdate ? formatTime(lastUpdate) : "—"}
        </span>
      </div>
    </div>
  );
};

export default StatusPanel;
