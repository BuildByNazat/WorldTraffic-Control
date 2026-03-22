import React from "react";
import type { SelectedEventDetail } from "../types/selectedEvent";

interface EventDetailDrawerProps {
  selectedEvent: SelectedEventDetail | null;
  onClose: () => void;
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

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="event-detail__row">
      <span className="event-detail__label">{label}</span>
      <span className="event-detail__value">{value}</span>
    </div>
  );
}

const EventDetailDrawer: React.FC<EventDetailDrawerProps> = ({
  selectedEvent,
  onClose,
}) => {
  if (!selectedEvent) {
    return null;
  }

  const title =
    selectedEvent.kind === "alert" ? selectedEvent.label : selectedEvent.label;

  return (
    <aside className="event-detail" aria-label="Event details">
      <div className="event-detail__header">
        <div className="event-detail__heading">
          <span className="event-detail__eyebrow">
            {selectedEvent.kind === "alert" ? "Alert Detail" : "Event Detail"}
          </span>
          <span className="event-detail__title">{title}</span>
        </div>
        <button
          type="button"
          className="event-detail__close"
          onClick={onClose}
          aria-label="Close event details"
        >
          ×
        </button>
      </div>

      <div className="event-detail__content">
        {selectedEvent.kind === "alert" ? (
          <>
            <DetailRow label="Category" value={selectedEvent.category} />
            <DetailRow label="Severity" value={selectedEvent.severity} />
            <DetailRow label="Status" value={selectedEvent.status} />
            <DetailRow label="Timestamp" value={formatTime(selectedEvent.timestamp)} />
            <DetailRow label="Source" value={selectedEvent.source} />
            <DetailRow
              label="Camera"
              value={selectedEvent.cameraId ?? "Not available"}
            />
            <DetailRow
              label="Location"
              value={`${formatCoordinate(selectedEvent.latitude)}, ${formatCoordinate(selectedEvent.longitude)}`}
            />
            <DetailRow
              label="Feature IDs"
              value={
                selectedEvent.featureIds.length > 0
                  ? selectedEvent.featureIds.join(", ")
                  : "Not available"
              }
            />
          </>
        ) : (
          <>
            <DetailRow
              label="Type"
              value={
                selectedEvent.eventType === "detection"
                  ? "Detection"
                  : "Aircraft"
              }
            />
            <DetailRow label="Timestamp" value={formatTime(selectedEvent.timestamp)} />
            <DetailRow label="Source" value={selectedEvent.source} />
            <DetailRow
              label="Location"
              value={`${formatCoordinate(selectedEvent.latitude)}, ${formatCoordinate(selectedEvent.longitude)}`}
            />
            <DetailRow
              label="Camera"
              value={selectedEvent.cameraId ?? "Not available"}
            />
            {selectedEvent.eventType === "detection" && (
              <DetailRow
                label="Confidence"
                value={
                  selectedEvent.confidence != null
                    ? `${(selectedEvent.confidence * 100).toFixed(0)}%`
                    : "Not available"
                }
              />
            )}
            {selectedEvent.eventType === "aircraft" && (
              <>
                <DetailRow
                  label="Callsign"
                  value={selectedEvent.callsign ?? "Not available"}
                />
                <DetailRow
                  label="Altitude"
                  value={
                    selectedEvent.altitude != null
                      ? `${selectedEvent.altitude.toLocaleString()} ft`
                      : "Not available"
                  }
                />
                <DetailRow
                  label="Speed"
                  value={
                    selectedEvent.speed != null
                      ? `${selectedEvent.speed.toLocaleString()} kt`
                      : "Not available"
                  }
                />
              </>
            )}
            <DetailRow
              label="Feature ID"
              value={selectedEvent.featureIds[0] ?? "Not available"}
            />
            <DetailRow
              label="Replay"
              value={
                selectedEvent.replayIndex != null &&
                selectedEvent.replayTotal != null
                  ? `${selectedEvent.replayIndex} / ${selectedEvent.replayTotal}`
                  : "Loaded event"
              }
            />
          </>
        )}
      </div>
    </aside>
  );
};

export default EventDetailDrawer;
