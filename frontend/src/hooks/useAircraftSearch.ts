import { useEffect, useState } from "react";
import { API_BASE } from "../config";

export interface AircraftSearchResult {
  id: string;
  callsign: string | null;
  flight_identifier: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  source: string;
  provider_name: string | null;
  observed_at: string | null;
  route_origin: string | null;
  route_destination: string | null;
  freshness_seconds: number | null;
  stale: boolean;
}

interface SearchResponse {
  query: string;
  count: number;
  results: AircraftSearchResult[];
}

export function useAircraftSearch(query: string, enabled = true) {
  const [results, setResults] = useState<AircraftSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!enabled || trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          limit: "8",
        });
        const response = await fetch(
          `${API_BASE}/api/aviation/search?${params.toString()}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error(`Search failed (${response.status})`);
        }

        const payload = (await response.json()) as SearchResponse;
        setResults(payload.results);
      } catch (nextError) {
        if ((nextError as Error).name === "AbortError") {
          return;
        }
        setResults([]);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to search aircraft right now."
        );
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [enabled, query]);

  return { results, loading, error };
}
