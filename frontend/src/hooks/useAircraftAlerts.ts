import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../config";

export type AircraftAlertType = "visible" | "not_visible" | "movement";
export type AircraftAlertStatus = "triggered" | "waiting" | "unavailable" | "disabled";

export interface AircraftAlertRule {
  id: number;
  aircraft_id: string;
  watchlist_entry_id: number;
  callsign: string | null;
  flight_identifier: string | null;
  source: string;
  provider_name: string | null;
  alert_type: AircraftAlertType;
  enabled: boolean;
  movement_nm_threshold: number | null;
  baseline_latitude: number | null;
  baseline_longitude: number | null;
  baseline_observed_at: string | null;
  created_at: string;
  updated_at: string;
  status: AircraftAlertStatus;
  status_message: string;
  currently_visible: boolean;
  current_latitude: number | null;
  current_longitude: number | null;
  current_observed_at: string | null;
  distance_nm: number | null;
}

interface AircraftAlertsResponse {
  count: number;
  items: AircraftAlertRule[];
}

function getErrorMessage(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }
  return "Aircraft alerts request failed.";
}

async function aircraftAlertsRequest(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<AircraftAlertsResponse> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const payload = (await response.json()) as AircraftAlertsResponse | { detail?: string };
  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }
  return payload as AircraftAlertsResponse;
}

export function useAircraftAlerts(token: string | null) {
  const [items, setItems] = useState<AircraftAlertRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await aircraftAlertsRequest("/api/aircraft-alerts", token);
      setItems(payload.items);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load aircraft alerts."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createAlert = useCallback(
    async (
      aircraftId: string,
      alertType: AircraftAlertType,
      movementNmThreshold?: number
    ) => {
      if (!token) {
        throw new Error("Sign in to manage aircraft alerts.");
      }
      setSaving(true);
      setError(null);
      try {
        const payload = await aircraftAlertsRequest("/api/aircraft-alerts", token, {
          method: "POST",
          body: JSON.stringify({
            aircraft_id: aircraftId,
            alert_type: alertType,
            movement_nm_threshold: movementNmThreshold ?? null,
          }),
        });
        setItems(payload.items);
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Unable to create aircraft alert.";
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [token]
  );

  const setAlertEnabled = useCallback(
    async (alertId: number, enabled: boolean) => {
      if (!token) {
        throw new Error("Sign in to manage aircraft alerts.");
      }
      setSaving(true);
      setError(null);
      try {
        const payload = await aircraftAlertsRequest(
          `/api/aircraft-alerts/${alertId}`,
          token,
          {
            method: "PATCH",
            body: JSON.stringify({ enabled }),
          }
        );
        setItems(payload.items);
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Unable to update aircraft alert.";
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [token]
  );

  const removeAlert = useCallback(
    async (alertId: number) => {
      if (!token) {
        throw new Error("Sign in to manage aircraft alerts.");
      }
      setSaving(true);
      setError(null);
      try {
        const payload = await aircraftAlertsRequest(
          `/api/aircraft-alerts/${alertId}`,
          token,
          { method: "DELETE" }
        );
        setItems(payload.items);
      } catch (nextError) {
        const message =
          nextError instanceof Error
            ? nextError.message
            : "Unable to remove aircraft alert.";
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [token]
  );

  return {
    items,
    loading,
    saving,
    error,
    refresh,
    createAlert,
    setAlertEnabled,
    removeAlert,
  };
}
