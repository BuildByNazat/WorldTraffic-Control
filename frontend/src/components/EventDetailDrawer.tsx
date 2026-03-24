import React from "react";
import type { IncidentRecord } from "../hooks/useIncidents";
import type { SelectedEventDetail } from "../types/selectedEvent";

interface EventDetailDrawerProps {
  selectedEvent: SelectedEventDetail | null;
  onClose: () => void;
  linkedIncident: IncidentRecord | null;
  onCreateIncidentFromAlert: () => void;
  onOpenLinkedIncident: () => void;
  isAuthenticated: boolean;
  watchlistedAircraftIds: string[];
  watchlistBusy?: boolean;
  watchlistMessage?: string | null;
  onToggleAircraftWatchlist: (aircraft: Extract<SelectedEventDetail, { kind: "aircraft" }>) => void;
}

function formatTime(value: string): string {
  if (!value) return "Timestamp unavailable from current provider";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Timestamp unavailable from current provider";
  }
  return date.toLocaleString(undefined, {
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

function formatFreshness(value: number | null | undefined): string {
  if (value == null) return "Freshness unavailable from current provider";
  if (value < 60) return `${Math.round(value)} sec old`;
  const minutes = value / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} min old`;
  return `${(minutes / 60).toFixed(1)} hr old`;
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
  linkedIncident,
  onCreateIncidentFromAlert,
  onOpenLinkedIncident,
  isAuthenticated,
  watchlistedAircraftIds,
  watchlistBusy = false,
  watchlistMessage = null,
  onToggleAircraftWatchlist,
}) => {
  if (!selectedEvent) {
    return null;
  }

  const isWatchlisted =
    selectedEvent.kind === "aircraft" &&
    watchlistedAircraftIds.includes(selectedEvent.id);

  return (
    <aside className="event-detail" aria-label="Event details">
      <div className="event-detail__header">
        <div className="event-detail__heading">
          <span className="event-detail__eyebrow">
            {selectedEvent.kind === "alert"
              ? "Alert Detail"
              : selectedEvent.kind === "aircraft"
                ? "Aircraft Detail"
              : selectedEvent.kind === "incident"
                ? "Incident Detail"
                : "Selection Detail"}
          </span>
          <span className="event-detail__title">{selectedEvent.label}</span>
        </div>
        <button
          type="button"
          className="event-detail__close"
          onClick={onClose}
          aria-label="Close event details"
        >
          Close
        </button>
      </div>

      <div className="event-detail__content">
        {selectedEvent.kind === "alert" && (
          <>
            <DetailRow label="Category" value={selectedEvent.category} />
            <DetailRow label="Severity" value={selectedEvent.severity} />
            <DetailRow label="Status" value={selectedEvent.status} />
            <DetailRow label="Observed" value={formatTime(selectedEvent.timestamp)} />
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
            <DetailRow
              label="Incident"
              value={linkedIncident ? linkedIncident.id : "Not created"}
            />
            <div className="event-detail__actions">
              {linkedIncident ? (
                <button
                  type="button"
                  className="event-detail__action"
                  onClick={onOpenLinkedIncident}
                >
                  Open incident
                </button>
              ) : (
                <button
                  type="button"
                  className="event-detail__action event-detail__action--primary"
                  onClick={onCreateIncidentFromAlert}
                >
                  Create incident
                </button>
              )}
            </div>
          </>
        )}

        {selectedEvent.kind === "aircraft" && (
          <>
            <DetailRow
              label="Callsign"
              value={selectedEvent.callsign ?? "Not available from current provider"}
            />
            <DetailRow
              label="Identifier"
              value={
                selectedEvent.flightIdentifier ??
                selectedEvent.callsign ??
                selectedEvent.id
              }
            />
            <DetailRow label="Observed" value={formatTime(selectedEvent.timestamp)} />
            <DetailRow
              label="Position"
              value={`${formatCoordinate(selectedEvent.latitude)}, ${formatCoordinate(selectedEvent.longitude)}`}
            />
            <DetailRow
              label="Altitude"
              value={
                selectedEvent.altitude != null
                  ? `${selectedEvent.altitude.toLocaleString()} ft`
                  : "Altitude unavailable from current provider"
              }
            />
            <DetailRow
              label="Speed"
              value={
                selectedEvent.speed != null
                  ? `${selectedEvent.speed.toLocaleString()} kt`
                  : "Speed unavailable from current provider"
              }
            />
            <DetailRow
              label="Heading"
              value={
                selectedEvent.heading != null
                  ? `${selectedEvent.heading.toFixed(1)} deg`
                  : "Heading unavailable from current provider"
              }
            />
            <DetailRow
              label="Provider"
              value={selectedEvent.providerName ?? selectedEvent.source}
            />
            <DetailRow
              label="Visibility"
              value={
                selectedEvent.currentlyVisible === false
                  ? selectedEvent.availabilityNote ?? "Not currently visible in the active provider snapshot"
                  : "Currently visible"
              }
            />
            <DetailRow
              label="Freshness"
              value={
                selectedEvent.stale
                  ? `${formatFreshness(selectedEvent.freshnessSeconds)} (stale)`
                  : formatFreshness(selectedEvent.freshnessSeconds)
              }
            />
            <DetailRow
              label="Origin"
              value={selectedEvent.routeOrigin ?? "Route unavailable from current provider"}
            />
            <DetailRow
              label="Destination"
              value={
                selectedEvent.routeDestination ??
                "Route unavailable from current provider"
              }
            />
            <DetailRow label="Aircraft ID" value={selectedEvent.id} />
            {watchlistMessage && (
              <div className="event-detail__note">{watchlistMessage}</div>
            )}
            <div className="event-detail__actions event-detail__actions--split">
              <button
                type="button"
                className="event-detail__action"
                onClick={() => onToggleAircraftWatchlist(selectedEvent)}
                disabled={!isAuthenticated || watchlistBusy}
              >
                {isWatchlisted ? "Remove from watchlist" : "Save to watchlist"}
              </button>
              {!isAuthenticated && (
                <span className="event-detail__helper">Sign in to save aircraft</span>
              )}
            </div>
          </>
        )}

        {selectedEvent.kind === "history" && (
          <>
            <DetailRow
              label="Type"
              value={
                selectedEvent.eventType === "detection" ? "Detection" : "Aircraft"
              }
            />
            <DetailRow label="Observed" value={formatTime(selectedEvent.timestamp)} />
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

        {selectedEvent.kind === "incident" && (
          <>
            <DetailRow label="Category" value={selectedEvent.category} />
            <DetailRow label="Severity" value={selectedEvent.severity} />
            <DetailRow label="Status" value={selectedEvent.status} />
            <DetailRow label="Updated" value={formatTime(selectedEvent.timestamp)} />
            <DetailRow label="Source alert" value={selectedEvent.sourceAlertId} />
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
            <DetailRow
              label="Notes"
              value={selectedEvent.operatorNotes || "No notes entered"}
            />
          </>
        )}
      </div>
    </aside>
  );
};

export default EventDetailDrawer;
