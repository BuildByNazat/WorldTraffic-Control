import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../config";

export interface ServiceStatusResponse {
  status: "ok";
  app_env: "development" | "production" | string;
  aircraft_provider: string;
  aviation_data_mode: string;
  aviation_provider: string;
  aviation_provider_label: string;
  aviation_active_source: string;
  aviation_provider_healthy: boolean;
  aviation_provider_degraded: boolean;
  aviation_provider_message: string | null;
  aviation_last_snapshot_at: string | null;
  simulated_mode: boolean;
  opensky_configured: boolean;
  broadcast_interval_seconds: number;
  camera_fetch_interval_seconds: number;
  camera_count: number;
  active_ws_connections: number;
  gemini_enabled: boolean;
  public_base_url: string | null;
  db_path: string;
}

interface UseServiceStatusState {
  status: ServiceStatusResponse | null;
  loading: boolean;
  error: string | null;
}

const STATUS_REFRESH_MS = 30_000;

export function useServiceStatus(enabled: boolean): UseServiceStatusState {
  const [status, setStatus] = useState<ServiceStatusResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      hasLoadedRef.current = false;
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchStatus() {
      if (!isMounted) return;
      if (!hasLoadedRef.current) {
        setLoading(true);
      }

      try {
        const response = await fetch(`${API_BASE}/api/status`);
        if (!response.ok) {
          throw new Error("Status request failed.");
        }
        const nextStatus = (await response.json()) as ServiceStatusResponse;
        if (!isMounted) return;
        setStatus(nextStatus);
        setError(null);
        hasLoadedRef.current = true;
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Unable to load service status.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchStatus();
    const timer = window.setInterval(() => {
      void fetchStatus();
    }, STATUS_REFRESH_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return { status, loading, error };
}
