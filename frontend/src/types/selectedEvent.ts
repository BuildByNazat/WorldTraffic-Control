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

export type SelectedEventDetail = SelectedAlertDetail | SelectedHistoryDetail;
