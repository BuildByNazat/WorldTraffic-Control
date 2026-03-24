import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../config";
import type { SelectedAircraftDetail } from "../types/selectedEvent";

export interface WatchlistItem {
  id: number;
  aircraft_id: string;
  callsign: string | null;
  flight_identifier: string | null;
  source: string;
  provider_name: string | null;
  route_origin: string | null;
  route_destination: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  observed_at: string | null;
  created_at: string;
}

interface WatchlistResponse {
  count: number;
  items: WatchlistItem[];
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
  return "Watchlist request failed.";
}

async function watchlistRequest(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<WatchlistResponse> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const payload = (await response.json()) as WatchlistResponse | { detail?: string };
  if (!response.ok) {
    throw new Error(getErrorMessage(payload));
  }
  return payload as WatchlistResponse;
}

export function useWatchlist(token: string | null) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
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
      const payload = await watchlistRequest("/api/watchlist", token);
      setItems(payload.items);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load watchlist.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addAircraft = useCallback(
    async (aircraft: SelectedAircraftDetail) => {
      if (!token) {
        throw new Error("Sign in to save aircraft.");
      }

      setSaving(true);
      setError(null);
      try {
        const payload = await watchlistRequest("/api/watchlist", token, {
          method: "POST",
          body: JSON.stringify({
            aircraft_id: aircraft.id,
            callsign: aircraft.callsign ?? null,
            flight_identifier: aircraft.flightIdentifier ?? null,
            source: aircraft.source,
            provider_name: aircraft.providerName ?? null,
            route_origin: aircraft.routeOrigin ?? null,
            route_destination: aircraft.routeDestination ?? null,
            latitude: aircraft.latitude,
            longitude: aircraft.longitude,
            altitude: aircraft.altitude ?? null,
            speed: aircraft.speed ?? null,
            heading: aircraft.heading ?? null,
            observed_at: aircraft.timestamp || null,
          }),
        });
        setItems(payload.items);
      } catch (nextError) {
        const message =
          nextError instanceof Error ? nextError.message : "Unable to save aircraft.";
        setError(message);
        throw new Error(message);
      } finally {
        setSaving(false);
      }
    },
    [token]
  );

  const removeAircraft = useCallback(
    async (aircraftId: string) => {
      if (!token) {
        throw new Error("Sign in to manage the watchlist.");
      }

      setSaving(true);
      setError(null);
      try {
        const payload = await watchlistRequest(
          `/api/watchlist/${encodeURIComponent(aircraftId)}`,
          token,
          { method: "DELETE" }
        );
        setItems(payload.items);
      } catch (nextError) {
        const message =
          nextError instanceof Error ? nextError.message : "Unable to remove aircraft.";
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
    addAircraft,
    removeAircraft,
  };
}
