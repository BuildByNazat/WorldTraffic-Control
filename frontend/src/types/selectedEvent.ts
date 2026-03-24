import type { AlertRecord } from "../hooks/useAlerts";

export interface SelectedEventBase {
  id: string;
  label: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  source: string;
  cameraId: string | null;
  featureIds: string[];
}

export interface SelectedAlertDetail extends SelectedEventBase {
  kind: "alert";
  category: string;
  severity: AlertRecord["severity"];
  status: AlertRecord["status"];
}

export interface SelectedHistoryDetail extends SelectedEventBase {
  kind: "history";
  eventKey: string;
  eventType: "detection" | "aircraft";
  confidence?: number | null;
  callsign?: string | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  replayIndex?: number | null;
  replayTotal?: number | null;
}

export interface SelectedAircraftDetail extends SelectedEventBase {
  kind: "aircraft";
  callsign?: string | null;
  flightIdentifier?: string | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  providerName?: string | null;
  routeOrigin?: string | null;
  routeDestination?: string | null;
  freshnessSeconds?: number | null;
  stale?: boolean;
  currentlyVisible?: boolean;
  availabilityNote?: string | null;
  watchlistSavedAt?: string | null;
}

export interface SelectedIncidentDetail extends SelectedEventBase {
  kind: "incident";
  sourceAlertId: string;
  category: string;
  severity: "high" | "medium" | "low";
  status: "open" | "under_review" | "closed";
  operatorNotes: string;
}

export type SelectedEventDetail =
  | SelectedAlertDetail
  | SelectedAircraftDetail
  | SelectedHistoryDetail
  | SelectedIncidentDetail;
